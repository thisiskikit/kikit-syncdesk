import type { OperationLogEntry } from "@shared/operations";

function getOperationPayloadString(
  operation: Pick<OperationLogEntry, "normalizedPayload" | "requestPayload" | "targetIds" | "targetType">,
  key: string,
) {
  const normalizedValue = operation.normalizedPayload?.[key];
  if (typeof normalizedValue === "string" && normalizedValue.trim()) {
    return normalizedValue.trim();
  }

  const requestValue = operation.requestPayload?.[key];
  if (typeof requestValue === "string" && requestValue.trim()) {
    return requestValue.trim();
  }

  if (key === "storeId" && operation.targetType === "store") {
    const targetStoreId = operation.targetIds.find((value) => typeof value === "string" && value.trim());
    if (targetStoreId) {
      return targetStoreId.trim();
    }
  }

  return null;
}

function isActiveOperation(operation: Pick<OperationLogEntry, "status" | "finishedAt">) {
  return (
    !operation.finishedAt &&
    (operation.status === "queued" || operation.status === "running")
  );
}

export function isCoupangShipmentFullSyncOperation(
  operation: OperationLogEntry,
  storeId: string,
) {
  return (
    isActiveOperation(operation) &&
    operation.channel === "coupang" &&
    operation.menuKey === "coupang.shipments" &&
    operation.actionKey === "collect-worksheet" &&
    getOperationPayloadString(operation, "storeId") === storeId &&
    getOperationPayloadString(operation, "syncMode") === "full"
  );
}

export function getActiveCoupangShipmentFullSyncOperation(
  operations: readonly OperationLogEntry[],
  storeId: string | null | undefined,
) {
  if (!storeId) {
    return null;
  }

  return (
    operations
      .filter((operation) => isCoupangShipmentFullSyncOperation(operation, storeId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  );
}
