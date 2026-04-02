export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export const apiCacheStates = ["live", "fresh-cache", "stale-cache"] as const;
export type ApiCacheState = (typeof apiCacheStates)[number];

export function isApiCacheState(value: unknown): value is ApiCacheState {
  return typeof value === "string" && (apiCacheStates as readonly string[]).includes(value);
}

export interface ApiFreshnessMetadata {
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
}

export interface ApiResponseMeta {
  requestId?: string;
  menuKey?: string;
  actionKey?: string;
  [key: string]: unknown;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  error: null;
  meta?: ApiResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  data: null;
  error: ApiErrorShape;
  meta?: ApiResponseMeta;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function isApiResponseEnvelope(value: unknown): value is ApiResponse<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "success" in value &&
      typeof (value as { success?: unknown }).success === "boolean" &&
      "data" in value &&
      "error" in value,
  );
}
