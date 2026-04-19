import { COUPANG_DEFAULT_BASE_URL } from "@shared/coupang";
import { recordExternalRequestEvent } from "../logs/service";
import { sleep } from "../shared/async-control";
import { createCoupangAuthorization } from "./auth";

export type CoupangRequestCredentials = {
  accessKey: string;
  secretKey: string;
  baseUrl: string;
};

export type CoupangRequestSchedulerRuntimeStatus = {
  channel: "coupang";
  schedulerCount: number;
  activeRequestCount: number;
  queuedRequestCount: number;
  concurrencyLimit: number;
  minRequestGapMs: number;
  coolingDownSchedulerCount: number;
  cooldownRemainingMs: number;
  latestBlockedUntil: string | null;
  latestNextAvailableAt: string | null;
  fetchedAt: string;
};

type RequestSchedulerState = {
  activeCount: number;
  queue: Array<() => void>;
  nextAvailableAt: number;
  blockedUntil: number;
  lastUsedAt: number;
};

const COUPANG_RETRYABLE_STATUSES = new Set([429, 503, 504]);
const COUPANG_MAX_RETRIES = readIntegerEnv("COUPANG_REQUEST_MAX_RETRIES", 3, 0, 5);
const COUPANG_MAX_CONCURRENCY = readIntegerEnv(
  "COUPANG_REQUEST_MAX_CONCURRENCY",
  4,
  1,
  4,
);
const COUPANG_MIN_REQUEST_GAP_MS = readIntegerEnv(
  "COUPANG_REQUEST_MIN_GAP_MS",
  100,
  0,
  2_000,
);
const COUPANG_QUEUE_STATE_TTL_MS = 60_000;
const requestSchedulers = new Map<string, RequestSchedulerState>();

export class CoupangApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterMs: number | null;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(input: {
    message: string;
    status: number;
    code: string;
    retryAfterMs?: number | null;
    retryable?: boolean;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "CoupangApiError";
    this.status = input.status;
    this.code = input.code;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.retryable = input.retryable ?? false;
    this.details = input.details;
  }
}

function readIntegerEnv(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw?.trim()) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function summarizePayload(text: string, maxLength = 200) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function isHtmlPayload(text: string, contentType: string | null) {
  const normalized = text.trim().toLowerCase();
  return (
    (contentType || "").toLowerCase().includes("text/html") ||
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html")
  );
}

function isRetryableNetworkError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      /network|fetch|timeout/i.test(error.message))
  );
}

function isRetryableStatus(status: number) {
  return COUPANG_RETRYABLE_STATUSES.has(status);
}

function extractRetryAfterMs(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const retryDate = new Date(value);
  if (Number.isNaN(retryDate.getTime())) {
    return null;
  }

  return Math.max(0, retryDate.getTime() - Date.now());
}

function buildBackoffDelayMs(attempt: number, retryAfterMs: number | null) {
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }

  const exponential = 400 * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(5_000, exponential + jitter);
}

function getSchedulerKey(credentials: CoupangRequestCredentials) {
  const baseUrl = credentials.baseUrl || COUPANG_DEFAULT_BASE_URL;
  return `${baseUrl}::${credentials.accessKey}`;
}

function getSchedulerState(key: string) {
  const existing = requestSchedulers.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing;
  }

  const created: RequestSchedulerState = {
    activeCount: 0,
    queue: [],
    nextAvailableAt: 0,
    blockedUntil: 0,
    lastUsedAt: Date.now(),
  };
  requestSchedulers.set(key, created);
  return created;
}

function toIsoTimestamp(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(value).toISOString();
}

function tryCleanupScheduler(key: string, state: RequestSchedulerState) {
  if (state.activeCount || state.queue.length) {
    return;
  }

  if (Date.now() - state.lastUsedAt >= COUPANG_QUEUE_STATE_TTL_MS) {
    requestSchedulers.delete(key);
  }
}

async function waitForSchedulerWindow(state: RequestSchedulerState) {
  while (true) {
    const waitMs = Math.max(state.nextAvailableAt, state.blockedUntil) - Date.now();
    if (waitMs <= 0) {
      state.nextAvailableAt = Date.now() + COUPANG_MIN_REQUEST_GAP_MS;
      return;
    }

    await sleep(waitMs);
  }
}

function pumpSchedulerQueue(key: string, state: RequestSchedulerState) {
  while (state.activeCount < COUPANG_MAX_CONCURRENCY && state.queue.length) {
    const nextTask = state.queue.shift();
    if (!nextTask) {
      break;
    }

    nextTask();
  }

  tryCleanupScheduler(key, state);
}

export function getCoupangRequestSchedulerRuntimeStatus(
  now = Date.now(),
): CoupangRequestSchedulerRuntimeStatus {
  const states = Array.from(requestSchedulers.values());
  const activeRequestCount = states.reduce((sum, state) => sum + state.activeCount, 0);
  const queuedRequestCount = states.reduce((sum, state) => sum + state.queue.length, 0);
  const latestBlockedUntilMs = states.reduce(
    (maxValue, state) => Math.max(maxValue, state.blockedUntil),
    0,
  );
  const latestNextAvailableAtMs = states.reduce(
    (maxValue, state) => Math.max(maxValue, state.nextAvailableAt),
    0,
  );
  const coolingDownSchedulerCount = states.filter((state) => state.blockedUntil > now).length;

  return {
    channel: "coupang",
    schedulerCount: states.length,
    activeRequestCount,
    queuedRequestCount,
    concurrencyLimit: COUPANG_MAX_CONCURRENCY,
    minRequestGapMs: COUPANG_MIN_REQUEST_GAP_MS,
    coolingDownSchedulerCount,
    cooldownRemainingMs: Math.max(0, latestBlockedUntilMs - now),
    latestBlockedUntil: toIsoTimestamp(latestBlockedUntilMs),
    latestNextAvailableAt: toIsoTimestamp(latestNextAvailableAtMs),
    fetchedAt: new Date(now).toISOString(),
  };
}

async function scheduleCoupangRequest<T>(
  key: string,
  task: (controller: { applyCooldown: (delayMs: number) => void }) => Promise<T>,
) {
  const state = getSchedulerState(key);

  return new Promise<T>((resolve, reject) => {
    const run = () => {
      state.activeCount += 1;
      state.lastUsedAt = Date.now();

      void (async () => {
        try {
          await waitForSchedulerWindow(state);
          const result = await task({
            applyCooldown: (delayMs) => {
              if (!Number.isFinite(delayMs) || delayMs <= 0) {
                return;
              }

              const cooldownUntil = Date.now() + delayMs;
              state.blockedUntil = Math.max(state.blockedUntil, cooldownUntil);
              state.nextAvailableAt = Math.max(state.nextAvailableAt, cooldownUntil);
            },
          });
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          state.activeCount -= 1;
          state.lastUsedAt = Date.now();
          pumpSchedulerQueue(key, state);
        }
      })();
    };

    state.queue.push(run);
    pumpSchedulerQueue(key, state);
  });
}

function parsePayload(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: summarizePayload(text) };
  }
}

function extractErrorMessage(payload: unknown, status: number) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message
  ) {
    return payload.message;
  }

  return `Coupang API request failed (${status}).`;
}

function extractErrorCode(payload: unknown, status: number) {
  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    typeof payload.code === "string" &&
    payload.code
  ) {
    return payload.code;
  }

  return status === 429 ? "COUPANG_RATE_LIMITED" : "COUPANG_API_REQUEST_FAILED";
}

export function __resetCoupangRequestSchedulerForTests() {
  requestSchedulers.clear();
}

export async function requestCoupangJson<T>(input: {
  credentials: CoupangRequestCredentials;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: URLSearchParams | string;
  body?: Record<string, unknown> | string;
  timeoutMs?: number;
}) {
  const query =
    typeof input.query === "string"
      ? input.query
      : input.query instanceof URLSearchParams
        ? input.query.toString()
        : "";

  const baseUrl = input.credentials.baseUrl || COUPANG_DEFAULT_BASE_URL;
  const url = `${baseUrl}${input.path}${query ? `?${query}` : ""}`;
  const serializedBody =
    typeof input.body === "string"
      ? input.body
      : input.body
        ? JSON.stringify(input.body)
        : undefined;
  const schedulerKey = getSchedulerKey(input.credentials);
  const startedAt = Date.now();
  let retryCount = 0;

  try {
    const result = await scheduleCoupangRequest(schedulerKey, async ({ applyCooldown }) => {
    let attempt = 0;

    while (true) {
      let response: Response;

      try {
        const { authorization } = createCoupangAuthorization({
          accessKey: input.credentials.accessKey,
          secretKey: input.credentials.secretKey,
          method: input.method,
          path: input.path,
          query,
        });

        response = await fetch(url, {
          method: input.method,
          headers: {
            Accept: "application/json",
            Authorization: authorization,
            "Content-Type": serializedBody
              ? "application/json;charset=UTF-8"
              : "application/json",
            "X-EXTENDED-TIMEOUT": "90000",
          },
          body: serializedBody,
          signal: AbortSignal.timeout(input.timeoutMs ?? 20_000),
        });
      } catch (error) {
        if (isRetryableNetworkError(error) && attempt < COUPANG_MAX_RETRIES) {
          attempt += 1;
          retryCount = attempt;
          const delayMs = buildBackoffDelayMs(attempt, null);
          applyCooldown(delayMs);
          await sleep(delayMs);
          continue;
        }

        throw error;
      }

      const text = await response.text();

      if (text && isHtmlPayload(text, response.headers.get("content-type"))) {
        throw new CoupangApiError({
          status: response.status || 502,
          code: "COUPANG_HTML_RESPONSE",
          message: `Expected JSON from Coupang API ${input.path}, but received HTML. Check base URL and credentials.`,
          retryable: false,
          details: { path: input.path },
        });
      }

      const payload = parsePayload(text);

      if (!response.ok) {
        const retryAfterMs = extractRetryAfterMs(response.headers.get("retry-after"));
        if (isRetryableStatus(response.status) && attempt < COUPANG_MAX_RETRIES) {
          attempt += 1;
          retryCount = attempt;
          const delayMs = buildBackoffDelayMs(attempt, retryAfterMs);
          applyCooldown(delayMs);
          await sleep(delayMs);
          continue;
        }

        throw new CoupangApiError({
          status: response.status,
          code: extractErrorCode(payload, response.status),
          message: extractErrorMessage(payload, response.status),
          retryAfterMs,
          retryable: isRetryableStatus(response.status),
          details: payload,
        });
      }

      return (payload ?? {}) as T;
    }
    });

    void recordExternalRequestEvent({
      provider: "coupang",
      method: input.method,
      path: input.path,
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      retryCount,
      meta: query
        ? {
            query,
          }
        : null,
    });

    return result;
  } catch (error) {
    void recordExternalRequestEvent({
      provider: "coupang",
      method: input.method,
      path: input.path,
      statusCode: error instanceof CoupangApiError ? error.status : null,
      durationMs: Date.now() - startedAt,
      retryCount,
      error,
      meta: query
        ? {
            query,
          }
        : null,
    });
    throw error;
  }
}
