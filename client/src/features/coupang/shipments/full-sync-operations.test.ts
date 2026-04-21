import { describe, expect, it } from "vitest";

import type { OperationLogEntry } from "@shared/operations";

import {
  getActiveCoupangShipmentFullSyncOperation,
  isCoupangShipmentFullSyncOperation,
} from "./full-sync-operations";

function buildOperation(input: Partial<OperationLogEntry> = {}): OperationLogEntry {
  return {
    id: input.id ?? "operation-1",
    channel: input.channel ?? "coupang",
    menuKey: input.menuKey ?? "coupang.shipments",
    actionKey: input.actionKey ?? "collect-worksheet",
    status: input.status ?? "running",
    mode: input.mode ?? "foreground",
    targetType: input.targetType ?? "store",
    targetCount: input.targetCount ?? 1,
    targetIds: input.targetIds ?? ["store-1"],
    requestPayload: input.requestPayload ?? null,
    normalizedPayload:
      input.normalizedPayload ?? {
        storeId: "store-1",
        syncMode: "full",
      },
    resultSummary: input.resultSummary ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    retryable: input.retryable ?? false,
    retryOfOperationId: input.retryOfOperationId ?? null,
    startedAt: input.startedAt ?? "2026-04-21T10:00:00+09:00",
    finishedAt: input.finishedAt ?? null,
    createdAt: input.createdAt ?? "2026-04-21T10:00:00+09:00",
    updatedAt: input.updatedAt ?? "2026-04-21T10:00:00+09:00",
  };
}

describe("full sync operation helpers", () => {
  it("detects an active same-store coupang shipment full sync", () => {
    const operation = buildOperation();

    expect(isCoupangShipmentFullSyncOperation(operation, "store-1")).toBe(true);
    expect(isCoupangShipmentFullSyncOperation(operation, "store-2")).toBe(false);
  });

  it("ignores finished or non-full collect operations", () => {
    expect(
      isCoupangShipmentFullSyncOperation(
        buildOperation({
          status: "warning",
          finishedAt: "2026-04-21T10:02:00+09:00",
        }),
        "store-1",
      ),
    ).toBe(false);

    expect(
      isCoupangShipmentFullSyncOperation(
        buildOperation({
          normalizedPayload: {
            storeId: "store-1",
            syncMode: "new_only",
          },
        }),
        "store-1",
      ),
    ).toBe(false);
  });

  it("returns the latest active full sync for the selected store", () => {
    const target = buildOperation({
      id: "operation-latest",
      updatedAt: "2026-04-21T10:03:00+09:00",
    });
    const older = buildOperation({
      id: "operation-older",
      updatedAt: "2026-04-21T10:01:00+09:00",
    });
    const otherStore = buildOperation({
      id: "operation-other-store",
      targetIds: ["store-2"],
      normalizedPayload: {
        storeId: "store-2",
        syncMode: "full",
      },
      updatedAt: "2026-04-21T10:04:00+09:00",
    });

    expect(
      getActiveCoupangShipmentFullSyncOperation([older, target, otherStore], "store-1"),
    ).toEqual(target);
  });
});
