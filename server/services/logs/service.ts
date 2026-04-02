import { normalizeUnknownError } from "../shared/api-response";
import { logStore } from "./store";

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

function clampString(value: string, maxLength = 280) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function sanitizeMeta(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return clampString(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) =>
      depth >= 2 ? clampString(String(item)) : sanitizeMeta(item, depth + 1),
    );
  }

  if (!value || typeof value !== "object") {
    return clampString(String(value));
  }

  if (depth >= 2) {
    try {
      return clampString(JSON.stringify(value));
    } catch {
      return clampString(String(value));
    }
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 16)
      .map(([key, nestedValue]) => [key, sanitizeMeta(nestedValue, depth + 1)]),
  );
}

const LOG_SLOW_API_MS = readIntegerEnv("LOG_SLOW_API_MS", 800, 50, 60_000);
const LOG_SLOW_EXTERNAL_MS = readIntegerEnv("LOG_SLOW_EXTERNAL_MS", 1_000, 50, 60_000);

async function safeCreateEvent(input: Parameters<typeof logStore.createEvent>[0]) {
  if (
    process.env.LOG_SERVICE_FORCE_WRITE !== "true" &&
    (process.env.NODE_ENV === "test" || process.env.VITEST === "true")
  ) {
    return null;
  }

  try {
    return await logStore.createEvent(input);
  } catch (error) {
    console.error("Failed to write log event.", error);
    return null;
  }
}

export function summarizeLogMeta(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return sanitizeMeta(value) as Record<string, unknown>;
}

export async function recordApiRequestEvent(input: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestBodyBytes?: number | null;
  responseContentLength?: string | null;
}) {
  const slow = input.durationMs >= LOG_SLOW_API_MS;
  const failed = input.statusCode >= 400;

  if (!slow && !failed) {
    return null;
  }

  if (
    input.path.startsWith("/api/logs") ||
    input.path.startsWith("/api/operations") ||
    input.path.startsWith("/api/ui-state")
  ) {
    return null;
  }

  const status =
    input.statusCode >= 500 ? "error" : input.statusCode >= 400 || slow ? "warning" : "success";
  const level = status === "error" ? "error" : status === "warning" ? "warning" : "info";

  return safeCreateEvent({
    channel: "system",
    eventType: "api",
    level,
    status,
    message: `${input.method} ${input.path} ${input.statusCode} ${Math.round(input.durationMs)}ms`,
    menuKey: "system.api",
    actionKey: input.method.toUpperCase(),
    startedAt: new Date(Date.now() - input.durationMs).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: input.durationMs,
    meta: summarizeLogMeta({
      method: input.method.toUpperCase(),
      path: input.path,
      statusCode: input.statusCode,
      durationMs: Math.round(input.durationMs),
      slow,
      requestBodyBytes: input.requestBodyBytes ?? null,
      responseContentLength: input.responseContentLength ?? null,
    }),
  });
}

export async function recordExternalRequestEvent(input: {
  provider: "naver" | "coupang";
  method: string;
  path: string;
  durationMs: number;
  statusCode?: number | null;
  retryCount?: number;
  error?: unknown;
  storeId?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  const retryCount = Math.max(0, input.retryCount ?? 0);
  const slow = input.durationMs >= LOG_SLOW_EXTERNAL_MS;
  const failed = Boolean(input.error) || (input.statusCode ?? 0) >= 400;

  if (!slow && !failed && retryCount === 0) {
    return null;
  }

  const normalizedError = input.error
    ? normalizeUnknownError(input.error, {
        fallbackCode: "EXTERNAL_REQUEST_FAILED",
        fallbackMessage: "External request failed.",
        fallbackStatus: 500,
      }).error
    : null;

  const status =
    normalizedError || (input.statusCode ?? 0) >= 500
      ? "error"
      : (input.statusCode ?? 0) >= 400 || retryCount > 0 || slow
        ? "warning"
        : "success";
  const level = status === "error" ? "error" : status === "warning" ? "warning" : "info";
  const suffix = input.statusCode ? `${input.statusCode}` : normalizedError?.code ?? "NETWORK_ERROR";
  const message = `${input.provider.toUpperCase()} ${input.method.toUpperCase()} ${input.path} ${suffix} ${Math.round(input.durationMs)}ms`;

  return safeCreateEvent({
    channel: input.provider,
    eventType: "external",
    level,
    status,
    message,
    menuKey: `${input.provider}.external`,
    actionKey: input.method.toUpperCase(),
    startedAt: new Date(Date.now() - input.durationMs).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: input.durationMs,
    meta: summarizeLogMeta({
      provider: input.provider,
      method: input.method.toUpperCase(),
      path: input.path,
      statusCode: input.statusCode ?? null,
      retryCount,
      slow,
      storeId: input.storeId ?? null,
      errorCode: normalizedError?.code ?? null,
      errorMessage: normalizedError?.message ?? null,
      ...input.meta,
    }),
  });
}

export async function recordStartupEvent(input: {
  step: string;
  durationMs: number;
  status: "success" | "error";
  message?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  return safeCreateEvent({
    channel: "system",
    eventType: "startup",
    level: input.status === "error" ? "error" : "info",
    status: input.status,
    message:
      input.message ??
      `${input.step} ${input.status === "error" ? "failed" : "completed"} in ${Math.round(input.durationMs)}ms`,
    menuKey: "system.startup",
    actionKey: input.step,
    startedAt: new Date(Date.now() - input.durationMs).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: input.durationMs,
    meta: summarizeLogMeta({
      step: input.step,
      durationMs: Math.round(input.durationMs),
      ...input.meta,
    }),
  });
}

export async function recordSystemErrorEvent(input: {
  source: string;
  error: unknown;
  channel?: "naver" | "coupang" | "draft" | "shared" | "system";
  meta?: Record<string, unknown> | null;
}) {
  const normalized = normalizeUnknownError(input.error, {
    fallbackCode: "SYSTEM_ERROR",
    fallbackMessage: "System error.",
    fallbackStatus: 500,
  });

  return safeCreateEvent({
    channel: input.channel ?? "system",
    eventType: "system-error",
    level: "error",
    status: "error",
    message: normalized.error.message,
    menuKey: "system.error",
    actionKey: input.source,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    meta: summarizeLogMeta({
      source: input.source,
      code: normalized.error.code,
      details: normalized.error.details,
      ...input.meta,
    }),
  });
}
