import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperationLogEntry } from "@shared/operations";

const { listRecentMock, updateMock } = vi.hoisted(() => ({
  listRecentMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("./store", () => ({
  operationStore: {
    listRecent: listRecentMock,
    update: updateMock,
  },
}));

import { recoverStaleOperations } from "./service";

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
    targetIds: [],
    requestPayload: null,
    normalizedPayload: null,
    resultSummary: input.resultSummary ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    retryable: false,
    retryOfOperationId: null,
    startedAt: input.startedAt ?? timestamp,
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
});
