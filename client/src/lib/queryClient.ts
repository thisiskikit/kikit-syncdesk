import { QueryClient, keepPreviousData, type QueryKey } from "@tanstack/react-query";
import { isApiResponseEnvelope, type ApiResponse } from "@shared/api";
import { getConfiguredApiBaseUrl, resolveApiUrl } from "./api-url";

const DEFAULT_QUERY_GC_TIME_MS = 30 * 60_000;

export const queryPresets = {
  reference: {
    staleTime: 5 * 60_000,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
  },
  listSnapshot: {
    staleTime: 60_000,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    placeholderData: keepPreviousData,
  },
  detail: {
    staleTime: 5 * 60_000,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    placeholderData: keepPreviousData,
  },
  liveRun: {
    staleTime: 5_000,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
  },
} as const;

export const queryCachePresets = {
  reference: {
    staleTime: queryPresets.reference.staleTime,
    gcTime: queryPresets.reference.gcTime,
  },
  listSnapshot: {
    staleTime: queryPresets.listSnapshot.staleTime,
    gcTime: queryPresets.listSnapshot.gcTime,
  },
  detail: {
    staleTime: queryPresets.detail.staleTime,
    gcTime: queryPresets.detail.gcTime,
  },
  liveRun: {
    staleTime: queryPresets.liveRun.staleTime,
    gcTime: queryPresets.liveRun.gcTime,
  },
} as const;

function appendQueryParam(url: string, key: string, value: string) {
  const origin =
    getConfiguredApiBaseUrl() ||
    (typeof window === "undefined" || !window.location?.origin
      ? "http://localhost"
      : window.location.origin);
  const parsed = new URL(url, origin);
  parsed.searchParams.set(key, value);
  return /^https?:\/\//i.test(url) ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
}

export function buildRefreshUrl(url: string) {
  return appendQueryParam(url, "refresh", "1");
}

function getResponseLabel(res: Response) {
  if (!res.url) {
    return "request";
  }

  try {
    const url = new URL(res.url);
    return `${url.pathname}${url.search}`;
  } catch {
    return res.url;
  }
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

function summarizePayload(text: string, maxLength = 160) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function buildHtmlResponseMessage(res: Response) {
  return `Expected JSON from ${getResponseLabel(res)}, but received HTML. Check that the app server is running and that the /api route is correct.`;
}

function getApiEnvelopeErrorMessage(payload: ApiResponse<unknown>, fallback: string) {
  if (
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string" &&
    payload.error.message
  ) {
    return payload.error.message;
  }

  return fallback;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;

    if (isHtmlPayload(text, res.headers.get("content-type"))) {
      throw new Error(buildHtmlResponseMessage(res));
    }

    if (text) {
      try {
        const payload = JSON.parse(text) as unknown;
        if (isApiResponseEnvelope(payload) && payload.error?.message) {
          message = payload.error.message;
        } else if (
          payload &&
          typeof payload === "object" &&
          "message" in payload &&
          typeof (payload as { message?: unknown }).message === "string" &&
          (payload as { message: string }).message
        ) {
          message = (payload as { message: string }).message;
        }
      } catch {
        message = text;
      }
    }

    throw new Error(message);
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  if (!text.trim()) {
    throw new Error(`Empty response from ${getResponseLabel(res)}.`);
  }

  if (isHtmlPayload(text, res.headers.get("content-type"))) {
    throw new Error(buildHtmlResponseMessage(res));
  }

  try {
    const payload = JSON.parse(text) as unknown;

    if (isApiResponseEnvelope(payload)) {
      if (!payload.success) {
        throw new Error(
          getApiEnvelopeErrorMessage(
            payload,
            `Request to ${getResponseLabel(res)} failed without a valid error payload.`,
          ),
        );
      }

      return payload.data as T;
    }

    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.message) {
      throw error;
    }

    throw new Error(
      `Failed to parse JSON response from ${getResponseLabel(res)}. ${summarizePayload(text)}`,
    );
  }
}

export function unwrapApiResponse<T>(payload: ApiResponse<T> | T): T {
  if (isApiResponseEnvelope(payload)) {
    if (!payload.success) {
      throw new Error(getApiEnvelopeErrorMessage(payload, "Malformed API error response."));
    }

    return payload.data as T;
  }

  return payload as T;
}

export async function apiRequest(method: string, url: string, data?: unknown) {
  const res = await fetch(resolveApiUrl(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

export async function apiRequestJson<T>(method: string, url: string, data?: unknown): Promise<T> {
  const res = await apiRequest(method, url, data);
  return parseJsonResponse<T>(res);
}

export async function apiRequestFormDataJson<T>(
  method: string,
  url: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(resolveApiUrl(url), {
    method,
    body: formData,
  });

  await throwIfResNotOk(res);
  return parseJsonResponse<T>(res);
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(resolveApiUrl(url));
  await throwIfResNotOk(res);
  return parseJsonResponse<T>(res);
}

export async function getJsonWithRefresh<T>(url: string): Promise<T> {
  return getJson<T>(buildRefreshUrl(url));
}

export async function refreshQueryData<T>(input: {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  gcTime?: number;
}) {
  return queryClient.fetchQuery({
    queryKey: input.queryKey,
    queryFn: input.queryFn,
    staleTime: 0,
    gcTime: input.gcTime ?? DEFAULT_QUERY_GC_TIME_MS,
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: queryPresets.listSnapshot.staleTime,
      gcTime: DEFAULT_QUERY_GC_TIME_MS,
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
