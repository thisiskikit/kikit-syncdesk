import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperationLogEntry } from "@shared/operations";

const { listRecentMock, updateMock, getByIdMock, createMock } = vi.hoisted(() => ({
  listRecentMock: vi.fn(),
  updateMock: vi.fn(),
  getByIdMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock("./store", () => ({
  operationStore: {
    create: createMock,
    listRecent: listRecentMock,
    getById: getByIdMock,
    update: updateMock,
  },
}));

import {
  findActiveCoupangShipmentCollectOperation,
  OperationCancellationRequestedError,
  recoverStaleOperations,
  requestOperationCancellation,
  runTrackedOperation,
} from "./service";

function buildOperation(input: Partial<OperationLogEntry> & Pick<OperationLogEntry, "id" | "status">): OperationLogEntry {
  const timestamp = "2026-04-12T02:00:00.000Z";

  return {
    id: input.id,
    channel: "coupang",
    menuKey: "coupang.shipments",
    actionKey: "collect-worksheet",
    status: input.status,
    mode: "foreground",
    targetType: "store",
    targetCount: 1,
    targetIds: input.targetIds ?? [],
    requestPayload: input.requestPayload ?? null,
    normalizedPayload: input.normalizedPayload ?? null,
    resultSummary: input.resultSummary ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    retryable: false,
    retryOfOperationId: null,
    startedAt: input.startedAt ?? timestamp,
    cancelRequestedAt: input.cancelRequestedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
}

describe("recoverStaleOperations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T03:00:00.000Z"));
    listRecentMock.mockReset();
    updateMock.mockReset();
    getByIdMock.mockReset();
    createMock.mockReset();
    updateMock.mockImplementation(async (_id: string, patch: Record<string, unknown>) => patch);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks stale queued or running operations as warning", async () => {
    listRecentMock.mockResolvedValue([
      buildOperation({
        id: "stale-running",
        status: "running",
        startedAt: "2026-04-12T02:00:00.000Z",
        updatedAt: "2026-04-12T02:10:00.000Z",
      }),
      buildOperation({
        id: "fresh-running",
        status: "running",
        startedAt: "2026-04-12T02:50:00.000Z",
        updatedAt: "2026-04-12T02:50:00.000Z",
      }),
      buildOperation({
        id: "finished",
        status: "success",
        finishedAt: "2026-04-12T02:20:00.000Z",
        updatedAt: "2026-04-12T02:20:00.000Z",
      }),
    ]);

    const recoveredCount = await recoverStaleOperations();

    expect(recoveredCount).toBe(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      "stale-running",
      expect.objectContaining({
        status: "warning",
        errorCode: "STALE_OPERATION_RECOVERED",
        errorMessage: "이전 실행에서 종료되지 않은 작업을 자동으로 정리했습니다.",
      }),
    );
  });

  it("finds an active same-store coupang shipment full sync", async () => {
    listRecentMock.mockResolvedValue([
      buildOperation({
        id: "other-store",
        status: "running",
        targetIds: ["store-2"],
        normalizedPayload: {
          storeId: "store-2",
          syncMode: "full",
        },
      }),
      buildOperation({
        id: "matching-full-sync",
        status: "running",
        targetIds: ["store-1"],
        normalizedPayload: {
          storeId: "store-1",
          syncMode: "full",
        },
      }),
      buildOperation({
        id: "new-only",
        status: "running",
        targetIds: ["store-1"],
        normalizedPayload: {
          storeId: "store-1",
          syncMode: "new_only",
        },
      }),
    ]);

    const operation = await findActiveCoupangShipmentCollectOperation({
      storeId: "store-1",
      syncMode: "full",
    });

    expect(operation?.id).toBe("matching-full-sync");
  });

  it("records a cooperative cancellation request without finishing the operation", async () => {
    getByIdMock.mockResolvedValue(
      buildOperation({
        id: "running-full-sync",
        status: "running",
        targetIds: ["store-1"],
        normalizedPayload: {
          storeId: "store-1",
          syncMode: "full",
        },
      }),
    );
    updateMock.mockImplementationOnce(async (id: string, patch: Record<string, unknown>) => ({
      ...(await getByIdMock(id)),
      ...patch,
      id,
    }));

    const result = await requestOperationCancellation("running-full-sync");

    expect(updateMock).toHaveBeenCalledWith(
      "running-full-sync",
      expect.objectContaining({
        cancelRequestedAt: expect.any(String),
      }),
    );
    expect(result.data).toEqual({
      cancelled: true,
      alreadyFinished: false,
    });
    expect(result.operation).toMatchObject({
      id: "running-full-sync",
      status: "running",
      finishedAt: null,
      cancelRequestedAt: expect.any(String),
    });
  });

  it("finishes tracked operations as cancelled warnings when execution throws a cancellation error", async () => {
    createMock.mockImplementationOnce(async (input: Record<string, unknown>) => ({
      ...buildOperation({
        id: "tracked-cancelled",
        status: "queued",
        finishedAt: null,
      }),
      ...input,
    }));
    updateMock.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({
      ...buildOperation({
        id,
        status: "running",
        finishedAt: null,
      }),
      ...patch,
      id,
    }));

    const result = await runTrackedOperation({
      channel: "coupang",
      menuKey: "coupang.shipments",
      actionKey: "refresh-worksheet",
      mode: "foreground",
      targetType: "store",
      targetCount: 1,
      targetIds: ["store-1"],
      normalizedPayload: { storeId: "store-1" },
      execute: async () => {
        throw new OperationCancellationRequestedError({
          data: { cancelledAt: "checkpoint" },
        });
      },
    });

    expect(result.data).toEqual({ cancelledAt: "checkpoint" });
    expect(updateMock).toHaveBeenLastCalledWith(
      "tracked-cancelled",
      expect.objectContaining({
        status: "warning",
        errorCode: "OPERATION_CANCELLED",
        errorMessage: "사용자 요청으로 작업을 중단했습니다.",
        finishedAt: expect.any(String),
      }),
    );
  });
});
