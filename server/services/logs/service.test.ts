import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createEventMock } = vi.hoisted(() => ({
  createEventMock: vi.fn(),
}));

vi.mock("./store", () => ({
  logStore: {
    createEvent: createEventMock,
  },
}));

import { recordApiRequestEvent, recordExternalRequestEvent } from "./service";

describe("log service event helpers", () => {
  beforeEach(() => {
    process.env.LOG_SERVICE_FORCE_WRITE = "true";
    vi.clearAllMocks();
    createEventMock.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.LOG_SERVICE_FORCE_WRITE;
  });

  it("records only slow or failed API requests", async () => {
    await recordApiRequestEvent({
      method: "GET",
      path: "/api/naver/orders",
      statusCode: 200,
      durationMs: 120,
    });

    expect(createEventMock).not.toHaveBeenCalled();

    await recordApiRequestEvent({
      method: "GET",
      path: "/api/naver/orders",
      statusCode: 200,
      durationMs: 1_200,
    });

    expect(createEventMock).toHaveBeenCalledTimes(1);
    expect(createEventMock.mock.calls[0]?.[0]).toMatchObject({
      eventType: "api",
      channel: "system",
      status: "warning",
    });
  });

  it("records retry-heavy and failed external requests", async () => {
    await recordExternalRequestEvent({
      provider: "coupang",
      method: "GET",
      path: "/v2/providers/openapi/apis/api/v1/marketplace",
      durationMs: 600,
      statusCode: 200,
      retryCount: 2,
    });

    expect(createEventMock).toHaveBeenCalledTimes(1);
    expect(createEventMock.mock.calls[0]?.[0]).toMatchObject({
      eventType: "external",
      channel: "coupang",
      status: "warning",
    });

    await recordExternalRequestEvent({
      provider: "naver",
      method: "POST",
      path: "/external/v1/oauth2/token",
      durationMs: 300,
      error: new Error("network timeout"),
    });

    expect(createEventMock).toHaveBeenCalledTimes(2);
    expect(createEventMock.mock.calls[1]?.[0]).toMatchObject({
      eventType: "external",
      channel: "naver",
      status: "error",
    });
  });
});
