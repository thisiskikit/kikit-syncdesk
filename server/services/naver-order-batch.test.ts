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

async function loadOrderService() {
  vi.resetModules();
  return import("./naver-order-service");
}

describe("naver order batch actions", () => {
  beforeEach(() => {
    applyTestRateLimitEnv();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    delete process.env.NAVER_REQUEST_MAX_RETRIES;
    delete process.env.NAVER_REQUEST_MAX_CONCURRENCY;
    delete process.env.NAVER_REQUEST_MIN_GAP_MS;
    delete process.env.NAVER_REQUEST_TIMEOUT_MS;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("keeps processing later items when a confirmation exhausts retryable failures", async () => {
    const { confirmOrders } = await loadOrderService();
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
        buildJsonResponse(
          {
            code: "RATE_LIMITED",
            message: "Still rate limited",
          },
          429,
          { "retry-after": "0" },
        ),
      )
      .mockResolvedValueOnce(buildJsonResponse({ success: true }));

    const response = await confirmOrders({
      storeId: "store-1",
      items: [
        {
          productOrderId: "po-1",
          orderId: "order-1",
          productName: "First",
        },
        {
          productOrderId: "po-2",
          orderId: "order-2",
          productName: "Second",
        },
      ],
    });

    expect(response.summary).toMatchObject({
      total: 2,
      succeededCount: 1,
      failedCount: 1,
      skippedCount: 0,
    });
    expect(response.items[0]).toMatchObject({
      productOrderId: "po-1",
      status: "failed",
    });
    expect(response.items[1]).toMatchObject({
      productOrderId: "po-2",
      status: "succeeded",
    });
  }, 10_000);
});
