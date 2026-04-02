import type { Response } from "express";
import { isApiCacheState, type ApiCacheState, type ApiErrorShape, type ApiResponseMeta } from "@shared/api";

type ApiErrorLike = Partial<ApiErrorShape> & {
  status?: number;
  statusCode?: number;
  details?: unknown;
  cause?: unknown;
};

type NormalizeErrorOptions = {
  fallbackCode: string;
  fallbackMessage: string;
  fallbackStatus?: number;
};

const DEFAULT_FRESH_CACHE_MAX_AGE_MS = 5 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getFetchedAtAgeMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Date.now() - timestamp;
}

function resolveCacheState(data: Record<string, unknown>): ApiCacheState | null {
  if (isApiCacheState(data.cacheState)) {
    return data.cacheState;
  }

  if (data.servedFromFallback === true || data.source === "fallback") {
    return "stale-cache";
  }

  if (data.servedFromCache === true) {
    const ageMs = getFetchedAtAgeMs(data.fetchedAt);
    if (ageMs !== null && ageMs > DEFAULT_FRESH_CACHE_MAX_AGE_MS) {
      return "stale-cache";
    }

    return "fresh-cache";
  }

  if (typeof data.fetchedAt === "string" && data.fetchedAt.trim()) {
    return "live";
  }

  return null;
}

function annotateFreshness<T>(data: T): T {
  if (!isRecord(data)) {
    return data;
  }

  const cacheState = resolveCacheState(data);
  if (!cacheState) {
    return data;
  }

  if (data.cacheState === cacheState) {
    return data;
  }

  return {
    ...data,
    cacheState,
  } as T;
}

export class ApiRouteError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(input: {
    code: string;
    message: string;
    status?: number;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "ApiRouteError";
    this.code = input.code;
    this.status = input.status ?? 500;
    this.details = input.details;
  }
}

function resolveStatus(value: unknown, fallbackStatus: number) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599) {
    return value;
  }

  return fallbackStatus;
}

export function normalizeUnknownError(
  error: unknown,
  options: NormalizeErrorOptions,
): { status: number; error: ApiErrorShape } {
  if (error instanceof ApiRouteError) {
    return {
      status: resolveStatus(error.status, options.fallbackStatus ?? 500),
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  if (error instanceof Error) {
    const apiError = error as Error & ApiErrorLike;
    const details =
      apiError.details ??
      (apiError.cause && typeof apiError.cause === "object" ? apiError.cause : undefined);

    return {
      status: resolveStatus(apiError.status ?? apiError.statusCode, options.fallbackStatus ?? 500),
      error: {
        code:
          typeof apiError.code === "string" && apiError.code.trim().length > 0
            ? apiError.code
            : options.fallbackCode,
        message: apiError.message || options.fallbackMessage,
        details,
      },
    };
  }

  if (error && typeof error === "object") {
    const apiError = error as ApiErrorLike;
    return {
      status: resolveStatus(apiError.status ?? apiError.statusCode, options.fallbackStatus ?? 500),
      error: {
        code:
          typeof apiError.code === "string" && apiError.code.trim().length > 0
            ? apiError.code
            : options.fallbackCode,
        message:
          typeof apiError.message === "string" && apiError.message.trim().length > 0
            ? apiError.message
            : options.fallbackMessage,
        details: apiError.details,
      },
    };
  }

  return {
    status: options.fallbackStatus ?? 500,
    error: {
      code: options.fallbackCode,
      message: options.fallbackMessage,
    },
  };
}

export function sendData<T>(res: Response, data: T, meta?: ApiResponseMeta) {
  res.json({
    success: true,
    data: annotateFreshness(data),
    error: null,
    meta,
  });
}

export function sendCreated<T>(res: Response, data: T, meta?: ApiResponseMeta) {
  res.status(201).json({
    success: true,
    data: annotateFreshness(data),
    error: null,
    meta,
  });
}

export function sendError(
  res: Response,
  status: number,
  error: ApiErrorShape,
  meta?: ApiResponseMeta,
) {
  res.status(status).json({
    success: false,
    data: null,
    error,
    meta,
  });
}

export function sendNormalizedError(
  res: Response,
  error: unknown,
  options: NormalizeErrorOptions,
  meta?: ApiResponseMeta,
) {
  const normalized = normalizeUnknownError(error, options);
  sendError(res, normalized.status, normalized.error, meta);
}
