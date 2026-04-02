import { channelSettingsStore } from "./channel-settings-store";
import { recordExternalRequestEvent } from "./logs/service";
import { issueNaverAccessToken } from "./naver-auth";

const NAVER_API_BASE_URL =
  process.env.NAVER_COMMERCE_API_BASE_URL || "https://api.commerce.naver.com/external";

type StoredNaverStore = NonNullable<Awaited<ReturnType<typeof channelSettingsStore.getStore>>>;

export type NaverRequestContext = {
  store: StoredNaverStore;
  authorization: string;
};

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
  let response: Response | null = null;

  try {
    response = await fetch(`${NAVER_API_BASE_URL}${input.path}`, {
      method: input.method,
      headers: {
        Accept: "application/json",
        Authorization: input.context.authorization,
        ...(input.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      if (isHtmlPayload(text, response.headers.get("content-type"))) {
        throw new Error(
          `Expected JSON from NAVER Commerce API ${input.path}, but received HTML. Check NAVER_COMMERCE_API_BASE_URL and NAVER credentials.`,
        );
      }

      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, response.status));
    }

    void recordExternalRequestEvent({
      provider: "naver",
      method: input.method,
      path: input.path,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      storeId: input.context.store.id,
    });

    return {
      store: input.context.store,
      payload: (payload ?? null) as T,
    };
  } catch (error) {
    void recordExternalRequestEvent({
      provider: "naver",
      method: input.method,
      path: input.path,
      statusCode: response?.status ?? null,
      durationMs: Date.now() - startedAt,
      storeId: input.context.store.id,
      error,
    });
    throw error;
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
