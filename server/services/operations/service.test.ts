import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationExecutionResponse, OperationLogEntry } from "@shared/operations";

const {
  createMock,
  findActiveRetryForMock,
  getByIdMock,
  listRecentMock,
  subscribeMock,
  updateMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  findActiveRetryForMock: vi.fn(),
  getByIdMock: vi.fn(),
  listRecentMock: vi.fn(),
  subscribeMock: vi.fn(() => () => undefined),
  updateMock: vi.fn(),
}));

vi.mock("./store", () => ({
  operationStore: {
    create: createMock,
    findActiveRetryFor: findActiveRetryForMock,
    getById: getByIdMock,
    listRecent: listRecentMock,
    subscribe: subscribeMock,
    update: updateMock,
  },
}));

import {
  buildOperationRetryKey,
  registerOperationRetryHandler,
  retryOperation,
  summarizeResult,
} from "./service";

function buildOperation(overrides: Partial<OperationLogEntry> = {}): OperationLogEntry {
  return {
    id: "operation-1",
    channel: "coupang",
    menuKey: "coupang.shipments",
    actionKey: "upload-invoice",
    status: "error",
    mode: "background",
    targetType: "order",
    targetCount: 1,
    targetIds: ["target-1"],
    requestPayload: { shipmentBoxId: "SB-1" },
    normalizedPayload: { shipmentBoxId: "SB-1" },
    resultSummary: null,
    errorCode: "FAILED",
    errorMessage: "failed",
    retryable: true,
    retryOfOperationId: null,
    startedAt: "2026-03-24T09:00:00.000Z",
    finishedAt: "2026-03-24T09:01:00.000Z",
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:01:00.000Z",
    ...overrides,
  };
}

describe("operations service helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findActiveRetryForMock.mockResolvedValue(null);
  });

  it("builds stable retry keys and summary objects", () => {
    expect(
      buildOperationRetryKey({
        channel: "naver",
        menuKey: "naver.orders",
        actionKey: "confirm-orders",
      }),
    ).toBe("naver:naver.orders:confirm-orders");

    expect(
      summarizeResult({
        headline: "done",
        stats: { succeeded: 3 },
      }),
    ).toEqual({
      headline: "done",
      detail: null,
      stats: { succeeded: 3 },
      preview: null,
    });
  });

  it("reuses an already running retry child instead of starting a duplicate", async () => {
    const original = buildOperation({
      channel: "naver",
      menuKey: "naver.orders",
      actionKey: "dispatch-orders",
    });
    const activeRetry = buildOperation({
      id: "retry-1",
      status: "running",
      mode: "retry",
      retryOfOperationId: original.id,
      startedAt: "2026-03-24T09:02:00.000Z",
      finishedAt: null,
      updatedAt: "2026-03-24T09:02:10.000Z",
    });
    const handler = vi.fn();

    getByIdMock.mockResolvedValue(original);
    findActiveRetryForMock.mockResolvedValue(activeRetry);
    registerOperationRetryHandler(
      {
        channel: "naver",
        menuKey: "naver.orders",
        actionKey: "dispatch-orders",
      },
      handler,
    );

    const result = await retryOperation(original.id);

    expect(handler).not.toHaveBeenCalled();
    expect(result.operation.id).toBe("retry-1");
    expect(result.data).toEqual({
      reused: true,
      source: "active-retry",
    });
  });

  it("deduplicates concurrent retry requests while one retry is in flight", async () => {
    const original = buildOperation({
      actionKey: "update-price-dedupe-test",
      menuKey: "coupang.products",
    });

    getByIdMock.mockResolvedValue(original);

    let resolveRetry: ((value: OperationExecutionResponse<unknown>) => void) | null = null;
    const handler = vi.fn(
      () =>
        new Promise<OperationExecutionResponse<unknown>>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    registerOperationRetryHandler(
      {
        channel: "coupang",
        menuKey: "coupang.products",
        actionKey: "update-price-dedupe-test",
      },
      handler,
    );

    const first = retryOperation(original.id);
    const second = retryOperation(original.id);

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });

    resolveRetry?.({
      operation: buildOperation({
        id: "retry-2",
        actionKey: "update-price-dedupe-test",
        menuKey: "coupang.products",
        mode: "retry",
        status: "success",
        retryOfOperationId: original.id,
        errorCode: null,
        errorMessage: null,
        resultSummary: {
          headline: "done",
          detail: null,
          stats: null,
          preview: null,
        },
      }),
      data: { ok: true },
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.operation.id).toBe("retry-2");
    expect(secondResult.operation.id).toBe("retry-2");
  });
});
