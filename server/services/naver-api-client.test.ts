import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./channel-settings-store", () => ({
  channelSettingsStore: {
    getStore: vi.fn(async () => ({
      id: "store-1",
      channel: "naver",
      storeName: "Test Store",
      credentials: {
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    })),
  },
}));

vi.mock("./naver-auth", () => ({
  issueNaverAccessToken: vi.fn(async () => ({
    accessToken: "test-token",
    expiresIn: 3600,
    tokenType: "Bearer",
  })),
}));

vi.mock("./logs/service", () => ({
  recordExternalRequestEvent: vi.fn(async () => undefined),
}));

function buildJsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function applyTestRateLimitEnv() {
  process.env.NAVER_REQUEST_MAX_RETRIES = "1";
  process.env.NAVER_REQUEST_MAX_CONCURRENCY = "1";
  process.env.NAVER_REQUEST_MIN_GAP_MS = "0";
  process.env.NAVER_REQUEST_TIMEOUT_MS = "50";
}

function createContext() {
  return {
    store: {
      id: "store-1",
      channel: "naver",
      storeName: "Test Store",
      credentials: {
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    },
    authorization: "Bearer test-token",
  };
}

async function loadApiClient() {
  vi.resetModules();
  return import("./naver-api-client");
}

describe("naver api client", () => {
  beforeEach(() => {
    applyTestRateLimitEnv();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(async () => {
    try {
      const apiClient = await import("./naver-api-client");
      apiClient.__resetNaverRequestSchedulerForTests();
    } catch {
      // Ignore cleanup failures between module resets.
    }

    delete process.env.NAVER_REQUEST_MAX_RETRIES;
    delete process.env.NAVER_REQUEST_MAX_CONCURRENCY;
    delete process.env.NAVER_REQUEST_MIN_GAP_MS;
    delete process.env.NAVER_REQUEST_TIMEOUT_MS;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("retries a 429 response before succeeding", async () => {
    const { requestNaverJsonWithContext } = await loadApiClient();
    const fetchMock = vi.mocked(global.fetch);

    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse(
          {
            code: "RATE_LIMITED",
            message: "Too many requests",
          },
          429,
          { "retry-after": "0" },
        ),
      )
      .mockResolvedValueOnce(
        buildJsonResponse({
          ok: true,
        }),
      );

    const result = await requestNaverJsonWithContext<{ ok: boolean }>({
      context: createContext(),
      method: "GET",
      path: "/v1/products/test",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.payload).toEqual({ ok: true });
  }, 10_000);

  it("retries a temporary 503 response before succeeding", async () => {
    const { requestNaverJsonWithContext } = await loadApiClient();
    const fetchMock = vi.mocked(global.fetch);

    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse(
          {
            code: "TEMPORARY_FAILURE",
            message: "Service unavailable",
          },
          503,
        ),
      )
      .mockResolvedValueOnce(
        buildJsonResponse({
          ok: true,
        }),
      );

    const result = await requestNaverJsonWithContext<{ ok: boolean }>({
      context: createContext(),
      method: "POST",
      path: "/v1/products/test",
      body: { value: 1 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.payload.ok).toBe(true);
  }, 10_000);

  it("retries retryable network errors before succeeding", async () => {
    const { requestNaverJsonWithContext } = await loadApiClient();
    const fetchMock = vi.mocked(global.fetch);

    fetchMock
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(
        buildJsonResponse({
          ok: true,
        }),
      );

    const result = await requestNaverJsonWithContext<{ ok: boolean }>({
      context: createContext(),
      method: "GET",
      path: "/v1/products/test",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.payload.ok).toBe(true);
  }, 10_000);

  it("honors Retry-After before issuing the retry", async () => {
    vi.useFakeTimers();
    const { requestNaverJsonWithContext } = await loadApiClient();
    const fetchMock = vi.mocked(global.fetch);

    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse(
          {
            code: "RATE_LIMITED",
            message: "Too many requests",
          },
          429,
          { "retry-after": "1" },
        ),
      )
      .mockResolvedValueOnce(
        buildJsonResponse({
          ok: true,
        }),
      );

    const requestPromise = requestNaverJsonWithContext<{ ok: boolean }>({
      context: createContext(),
      method: "GET",
      path: "/v1/products/test",
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const result = await requestPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.payload.ok).toBe(true);
  });

  it("serializes concurrent requests for the same store", async () => {
    const { requestNaverJsonWithContext } = await loadApiClient();
    const fetchMock = vi.mocked(global.fetch);
    let activeCount = 0;
    let maxActiveCount = 0;
    let callIndex = 0;
    const resolvers: Array<() => void> = [];

    fetchMock.mockImplementation(() => {
      const currentCall = ++callIndex;
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);

      return new Promise<Response>((resolve) => {
        resolvers.push(() => {
          activeCount -= 1;
          resolve(
            buildJsonResponse({
              callIndex: currentCall,
            }),
          );
        });
      });
    });

    const requestInput = {
      context: createContext(),
      method: "GET" as const,
      path: "/v1/products/test",
    };

    const first = requestNaverJsonWithContext<{ callIndex: number }>(requestInput);
    const second = requestNaverJsonWithContext<{ callIndex: number }>(requestInput);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    resolvers[0]?.();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    resolvers[1]?.();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(maxActiveCount).toBe(1);
    expect(firstResult.payload.callIndex).toBe(1);
    expect(secondResult.payload.callIndex).toBe(2);
  });
});

describe("naver api normalization helpers", () => {
  it("coerces primitive values safely", async () => {
    const apiClient = await import("./naver-api-client");

    expect(apiClient.asString(12345)).toBe("12345");
    expect(apiClient.asString(null)).toBeNull();
    expect(apiClient.asNumber("42")).toBe(42);
    expect(apiClient.asNumber("bad-number")).toBeNull();
  });

  it("reads nested values through prioritized lookup paths", async () => {
    const apiClient = await import("./naver-api-client");
    const payload = apiClient.asObject({
      order: {
        id: "ORDER-1",
        quantity: "3",
      },
      fallback: {
        quantity: 5,
      },
    });

    expect(apiClient.getNestedValue(payload, ["order", "id"])).toBe("ORDER-1");
    expect(
      apiClient.firstString(payload, [
        ["missing", "id"],
        ["order", "id"],
      ]),
    ).toBe("ORDER-1");
    expect(
      apiClient.firstNumber(payload, [
        ["missing", "quantity"],
        ["order", "quantity"],
      ]),
    ).toBe(3);
  });

  it("normalizes date strings for Seoul date range requests", async () => {
    const apiClient = await import("./naver-api-client");

    expect(apiClient.normalizeDateOnly("2026-03-24")).toBe("2026-03-24");
    expect(apiClient.normalizeDateOnly("2026-03-24T03:00:00.000Z")).toBe("2026-03-24");
    expect(apiClient.toSeoulDateTime("2026-03-24", "start")).toBe("2026-03-24T00:00:00+09:00");
    expect(apiClient.toSeoulDateTime("2026-03-24", "end")).toBe("2026-03-24T23:59:59+09:00");
  });

  it("sums only numeric values", async () => {
    const apiClient = await import("./naver-api-client");

    expect(apiClient.toSummedValue([10, null, undefined, 5])).toBe(15);
  });
});
