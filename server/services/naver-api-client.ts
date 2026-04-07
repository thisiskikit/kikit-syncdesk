import { channelSettingsStore } from "./channel-settings-store";
import { recordExternalRequestEvent } from "./logs/service";
import { issueNaverAccessToken } from "./naver-auth";
import { sleep } from "./shared/async-control";

const NAVER_API_BASE_URL =
  process.env.NAVER_COMMERCE_API_BASE_URL || "https://api.commerce.naver.com/external";
const NAVER_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const NAVER_MAX_RETRIES = readIntegerEnv("NAVER_REQUEST_MAX_RETRIES", 3, 0, 5);
const NAVER_MAX_CONCURRENCY = readIntegerEnv("NAVER_REQUEST_MAX_CONCURRENCY", 2, 1, 4);
const NAVER_MIN_REQUEST_GAP_MS = readIntegerEnv("NAVER_REQUEST_MIN_GAP_MS", 250, 0, 2_000);
const NAVER_REQUEST_TIMEOUT_MS = readIntegerEnv("NAVER_REQUEST_TIMEOUT_MS", 20_000, 1_000, 120_000);
const NAVER_QUEUE_STATE_TTL_MS = 60_000;

type StoredNaverStore = NonNullable<Awaited<ReturnType<typeof channelSettingsStore.getStore>>>;
type RequestSchedulerState = {
  activeCount: number;
  queue: Array<() => void>;
  nextAvailableAt: number;
  blockedUntil: number;
  lastUsedAt: number;
};

export type NaverRequestContext = {
  store: StoredNaverStore;
  authorization: string;
};
const requestSchedulers = new Map<string, RequestSchedulerState>();

export class NaverApiError extends Error {
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
    this.name = "NaverApiError";
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

export function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return null;
}

export function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function asBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
}

export function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function getNestedValue(input: Record<string, unknown> | null, path: string[]) {
  let current: unknown = input;

  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export function firstString(input: Record<string, unknown> | null, paths: string[][]) {
  for (const path of paths) {
    const value = asString(getNestedValue(input, path));
    if (value) {
      return value;
    }
  }

  return null;
}

export function firstNumber(input: Record<string, unknown> | null, paths: string[][]) {
  for (const path of paths) {
    const value = asNumber(getNestedValue(input, path));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function isHtmlPayload(text: string, contentType: string | null) {
  const normalized = text.trim().toLowerCase();

  return (
    (contentType || "").toLowerCase().includes("text/html") ||
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.startsWith("<body")
  );
}

function summarizePayload(text: string, maxLength = 200) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function extractErrorMessage(payload: unknown, fallbackStatus: number) {
  if (!payload || typeof payload !== "object") {
    return `NAVER API request failed (${fallbackStatus}).`;
  }

  const message =
    ("message" in payload && typeof payload.message === "string" && payload.message) ||
    ("error_description" in payload &&
      typeof payload.error_description === "string" &&
      payload.error_description) ||
    ("error" in payload && typeof payload.error === "string" && payload.error) ||
    ("code" in payload && typeof payload.code === "string" && payload.code) ||
    null;

  return message || `NAVER API request failed (${fallbackStatus}).`;
}

function extractErrorCode(payload: unknown, status: number) {
  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    typeof payload.code === "string" &&
    payload.code.trim()
  ) {
    return payload.code;
  }

  if (status === 429) {
    return "NAVER_RATE_LIMITED";
  }

  if (NAVER_RETRYABLE_STATUSES.has(status)) {
    return "NAVER_API_TEMPORARY_FAILURE";
  }

  return "NAVER_API_REQUEST_FAILED";
}

function isRetryableStatus(status: number) {
  return NAVER_RETRYABLE_STATUSES.has(status);
}

function isRetryableNetworkError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      /network|fetch|timeout|socket|econnreset|etimedout/i.test(error.message))
  );
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

function getSchedulerKey(context: NaverRequestContext) {
  return context.store.id;
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

function tryCleanupScheduler(key: string, state: RequestSchedulerState) {
  if (state.activeCount || state.queue.length) {
    return;
  }

  if (Date.now() - state.lastUsedAt >= NAVER_QUEUE_STATE_TTL_MS) {
    requestSchedulers.delete(key);
  }
}

async function waitForSchedulerWindow(state: RequestSchedulerState) {
  while (true) {
    const waitMs = Math.max(state.nextAvailableAt, state.blockedUntil) - Date.now();
    if (waitMs <= 0) {
      state.nextAvailableAt = Date.now() + NAVER_MIN_REQUEST_GAP_MS;
      return;
    }

    await sleep(waitMs);
  }
}

function pumpSchedulerQueue(key: string, state: RequestSchedulerState) {
  while (state.activeCount < NAVER_MAX_CONCURRENCY && state.queue.length) {
    const nextTask = state.queue.shift();
    if (!nextTask) {
      break;
    }

    nextTask();
  }

  tryCleanupScheduler(key, state);
}

async function scheduleNaverRequest<T>(
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

function wrapNetworkError(error: unknown, retryable: boolean) {
  if (error instanceof NaverApiError) {
    return error;
  }

  const message =
    error instanceof Error && error.message
      ? error.message
      : "NAVER API request failed before a response was received.";
  const status =
    error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
      ? 504
      : 502;

  return new NaverApiError({
    status,
    code:
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
        ? "NAVER_REQUEST_TIMEOUT"
        : "NAVER_NETWORK_ERROR",
    message,
    retryable,
    details:
      error instanceof Error
        ? {
            name: error.name,
            message: summarizePayload(error.message, 160),
          }
        : undefined,
  });
}

async function getNaverStoreOrThrow(storeId: string) {
  const store = await channelSettingsStore.getStore(storeId);

  if (!store) {
    throw new Error("NAVER store settings not found.");
  }

  if (store.channel !== "naver") {
    throw new Error("Selected store is not a NAVER store.");
  }

  return store as StoredNaverStore;
}

export async function createNaverRequestContext(storeId: string): Promise<NaverRequestContext> {
  const store = await getNaverStoreOrThrow(storeId);
  const token = await issueNaverAccessToken({
    clientId: store.credentials.clientId,
    clientSecret: store.credentials.clientSecret,
  });

  return {
    store,
    authorization: `${token.tokenType} ${token.accessToken}`,
  };
}

export async function requestNaverJsonWithContext<T>(input: {
  context: NaverRequestContext;
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
}) {
  const startedAt = Date.now();
  let retryCount = 0;
  let lastRetryAfterMs: number | null = null;
  const schedulerKey = getSchedulerKey(input.context);

  try {
    const result = await scheduleNaverRequest(schedulerKey, async ({ applyCooldown }) => {
      let attempt = 0;

      while (true) {
        let response: Response;

        try {
          response = await fetch(`${NAVER_API_BASE_URL}${input.path}`, {
            method: input.method,
            headers: {
              Accept: "application/json",
              Authorization: input.context.authorization,
              ...(input.body !== undefined ? { "Content-Type": "application/json" } : {}),
            },
            body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
            signal: AbortSignal.timeout(NAVER_REQUEST_TIMEOUT_MS),
          });
        } catch (error) {
          const canRetry = isRetryableNetworkError(error) && attempt < NAVER_MAX_RETRIES;
          if (!canRetry) {
            throw wrapNetworkError(error, isRetryableNetworkError(error));
          }

          attempt += 1;
          retryCount = attempt;
          const delayMs = buildBackoffDelayMs(attempt, null);
          lastRetryAfterMs = null;
          applyCooldown(delayMs);
          await sleep(delayMs);
          continue;
        }

        const text = await response.text();
        let payload: unknown = null;

        if (text) {
          if (isHtmlPayload(text, response.headers.get("content-type"))) {
            throw new NaverApiError({
              status: response.status || 502,
              code: "NAVER_HTML_RESPONSE",
              message: `Expected JSON from NAVER Commerce API ${input.path}, but received HTML. Check NAVER_COMMERCE_API_BASE_URL and NAVER credentials.`,
              retryable: false,
              details: {
                path: input.path,
                bodySummary: summarizePayload(text),
              },
            });
          }

          try {
            payload = JSON.parse(text) as unknown;
          } catch {
            payload = { message: text };
          }
        }

        if (!response.ok) {
          const retryAfterMs = extractRetryAfterMs(response.headers.get("retry-after"));
          const canRetry = isRetryableStatus(response.status) && attempt < NAVER_MAX_RETRIES;
          if (canRetry) {
            attempt += 1;
            retryCount = attempt;
            lastRetryAfterMs = retryAfterMs;
            const delayMs = buildBackoffDelayMs(attempt, retryAfterMs);
            applyCooldown(delayMs);
            await sleep(delayMs);
            continue;
          }

          throw new NaverApiError({
            status: response.status,
            code: extractErrorCode(payload, response.status),
            message: extractErrorMessage(payload, response.status),
            retryAfterMs,
            retryable: isRetryableStatus(response.status),
            details: payload,
          });
        }

        return {
          statusCode: response.status,
          payload: (payload ?? null) as T,
        };
      }
    });

    void recordExternalRequestEvent({
      provider: "naver",
      method: input.method,
      path: input.path,
      statusCode: result.statusCode,
      durationMs: Date.now() - startedAt,
      retryCount,
      storeId: input.context.store.id,
      meta: lastRetryAfterMs === null ? null : { retryAfterMs: lastRetryAfterMs },
    });

    return {
      store: input.context.store,
      payload: result.payload,
    };
  } catch (error) {
    const normalizedError = wrapNetworkError(
      error,
      error instanceof NaverApiError ? error.retryable : isRetryableNetworkError(error),
    );

    void recordExternalRequestEvent({
      provider: "naver",
      method: input.method,
      path: input.path,
      statusCode: normalizedError.status ?? null,
      durationMs: Date.now() - startedAt,
      retryCount,
      storeId: input.context.store.id,
      error: normalizedError,
      meta: lastRetryAfterMs === null ? null : { retryAfterMs: lastRetryAfterMs },
    });
    throw normalizedError;
  }
}

export async function requestNaverJson<T>(input: {
  storeId: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
}) {
  const context = await createNaverRequestContext(input.storeId);
  return requestNaverJsonWithContext<T>({
    context,
    method: input.method,
    path: input.path,
    body: input.body,
  });
}

export function normalizeDateOnly(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("A valid date is required.");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("A valid date is required.");
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toSeoulDateTime(value: string, mode: "start" | "end") {
  const date = normalizeDateOnly(value);
  return `${date}T${mode === "end" ? "23:59:59" : "00:00:00"}+09:00`;
}

export function toSummedValue(values: Array<number | null | undefined>): number {
  return values.reduce<number>(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0,
  );
}

export function __resetNaverRequestSchedulerForTests() {
  requestSchedulers.clear();
}
