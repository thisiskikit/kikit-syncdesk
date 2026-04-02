import { isApiCacheState, type ApiCacheState } from "@shared/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function getResponseCacheState(data: unknown): ApiCacheState | null {
  if (!isRecord(data)) {
    return null;
  }

  if (isApiCacheState(data.cacheState)) {
    return data.cacheState;
  }

  if (data.servedFromFallback === true || data.source === "fallback") {
    return "stale-cache";
  }

  if (data.servedFromCache === true) {
    return "fresh-cache";
  }

  if (typeof data.fetchedAt === "string" && data.fetchedAt.trim()) {
    return "live";
  }

  return null;
}

export function isCachedResponse(data: unknown) {
  const cacheState = getResponseCacheState(data);
  return cacheState === "fresh-cache" || cacheState === "stale-cache";
}

export function isStaleCachedResponse(data: unknown) {
  return getResponseCacheState(data) === "stale-cache";
}
