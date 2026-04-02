import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  process.env.COUPANG_REQUEST_MAX_RETRIES = "1";
  process.env.COUPANG_REQUEST_MAX_CONCURRENCY = "1";
  process.env.COUPANG_REQUEST_MIN_GAP_MS = "0";
}

async function loadApiClient() {
  vi.resetModules();
  return import("./api-client");
}

describe("coupang api client rate limiting", () => {
  beforeEach(() => {
    applyTestRateLimitEnv();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(async () => {
    try {
      const apiClient = await import("./api-client");
      apiClient.__resetCoupangRequestSchedulerForTests();
    } catch {
      // Ignore cleanup failures between module resets.
    }

    delete process.env.COUPANG_REQUEST_MAX_RETRIES;
    delete process.env.COUPANG_REQUEST_MAX_CONCURRENCY;
    delete process.env.COUPANG_REQUEST_MIN_GAP_MS;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("retries a 429 response before surfacing an error", async () => {
    const { requestCoupangJson } = await loadApiClient();
    const fetchMock = vi.mocked(global.fetch);

    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse(
          {
            code: "ERROR",
            message: "Too many requests",
          },
          429,
          { "retry-after": "0" },
        ),
      )
      .mockResolvedValueOnce(
        buildJsonResponse({
          code: "SUCCESS",
          data: {
            ok: true,
          },
        }),
      );

    const result = await requestCoupangJson<{
      code: string;
      data: { ok: boolean };
    }>({
      credentials: {
        accessKey: "test-access",
        secretKey: "test-secret",
        baseUrl: "https://api-gateway.coupang.com",
      },
      method: "GET",
      path: "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products",
      query: new URLSearchParams({
        vendorId: "A0001",
        maxPerPage: "1",
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      code: "SUCCESS",
      data: {
        ok: true,
      },
    });
  }, 10_000);

  it("serializes concurrent requests for the same Coupang credential set", async () => {
    const { requestCoupangJson } = await loadApiClient();
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
              code: "SUCCESS",
              data: { currentCall },
            }),
          );
        });
      });
    });

    const requestInput = {
      credentials: {
        accessKey: "test-access",
        secretKey: "test-secret",
        baseUrl: "https://api-gateway.coupang.com",
      },
      method: "GET" as const,
      path: "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products",
      query: new URLSearchParams({
        vendorId: "A0001",
        maxPerPage: "1",
      }),
    };

    const first = requestCoupangJson<{ data: { currentCall: number } }>(requestInput);
    const second = requestCoupangJson<{ data: { currentCall: number } }>(requestInput);

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
    expect(firstResult.data.currentCall).toBe(1);
    expect(secondResult.data.currentCall).toBe(2);
  });
});
