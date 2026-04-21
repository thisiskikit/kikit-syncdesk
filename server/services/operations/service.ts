import type {
  OperationChannel,
  OperationExecutionResponse,
  OperationLogEntry,
  OperationMode,
  OperationResultSummary,
  OperationStatus,
  OperationTargetType,
} from "@shared/operations";
import { operationStore } from "./store";
import { ApiRouteError } from "../shared/api-response";

type RetryHandler = (input: {
  operation: OperationLogEntry;
  requestPayload: Record<string, unknown> | null;
  normalizedPayload: Record<string, unknown> | null;
}) => Promise<OperationExecutionResponse<unknown>>;

const STALE_OPERATION_THRESHOLD_MS = 15 * 60_000;
const STALE_OPERATION_SCAN_LIMIT = 500;
const ACTIVE_OPERATION_LOOKUP_LIMIT = 200;
const OPERATION_CANCELLED_ERROR_CODE = "OPERATION_CANCELLED";
const OPERATION_CANCELLED_MESSAGE = "사용자 요청으로 작업을 취소했습니다.";
const ACTIVE_OPERATION_STATUSES = new Set<OperationStatus>(["queued", "running"]);

type TrackedOperationResult<T> = {
  data: T;
  status?: Extract<OperationStatus, "success" | "warning">;
  normalizedPayload?: Record<string, unknown> | null;
  resultSummary?: OperationResultSummary | null;
};

type BaseOperationInput = {
  channel: OperationChannel;
  menuKey: string;
  actionKey: string;
  mode: OperationMode;
  targetType: OperationTargetType;
  targetCount: number;
  targetIds?: string[];
  requestPayload?: Record<string, unknown> | null;
  normalizedPayload?: Record<string, unknown> | null;
  retryable?: boolean;
  retryOfOperationId?: string | null;
};

const retryHandlers = new Map<string, RetryHandler>();
const inFlightRetries = new Map<string, Promise<OperationExecutionResponse<unknown>>>();
const requestedOperationCancellations = new Set<string>();

export function summarizeResult(input: {
  headline?: string | null;
  detail?: string | null;
  stats?: Record<string, unknown> | null;
  preview?: string | null;
}) {
  return {
    headline: input.headline ?? null,
    detail: input.detail ?? null,
    stats: input.stats ?? null,
    preview: input.preview ?? null,
  } satisfies OperationResultSummary;
}

export function buildOperationRetryKey(input: {
  channel: OperationChannel;
  menuKey: string;
  actionKey: string;
}) {
  return `${input.channel}:${input.menuKey}:${input.actionKey}`;
}

export function registerOperationRetryHandler(
  input: {
    channel: OperationChannel;
    menuKey: string;
    actionKey: string;
  },
  handler: RetryHandler,
) {
  retryHandlers.set(buildOperationRetryKey(input), handler);
}

export async function listRecentOperations(limit?: number) {
  return operationStore.listRecent(limit);
}

export async function getOperationById(id: string) {
  return operationStore.getById(id);
}

export function subscribeToOperationUpdates(listener: (entry: OperationLogEntry) => void) {
  return operationStore.subscribe(listener);
}

function isActiveOperation(operation: OperationLogEntry | null | undefined) {
  return Boolean(
    operation &&
      !operation.finishedAt &&
      ACTIVE_OPERATION_STATUSES.has(operation.status),
  );
}

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

function getOperationStoreId(
  operation: Pick<OperationLogEntry, "normalizedPayload" | "requestPayload" | "targetIds" | "targetType">,
) {
  return getOperationPayloadString(operation, "storeId");
}

function getOperationSyncMode(
  operation: Pick<OperationLogEntry, "normalizedPayload" | "requestPayload" | "targetIds" | "targetType">,
) {
  const syncMode = getOperationPayloadString(operation, "syncMode");
  return syncMode === "full" || syncMode === "incremental" || syncMode === "new_only"
    ? syncMode
    : null;
}

async function getProtectedCancelledOperation(operationId: string) {
  const current = await operationStore.getById(operationId);
  if (current?.errorCode === OPERATION_CANCELLED_ERROR_CODE) {
    return current;
  }

  return null;
}

export async function findActiveOperation(
  predicate: (operation: OperationLogEntry) => boolean,
  limit = ACTIVE_OPERATION_LOOKUP_LIMIT,
) {
  const operations = await operationStore.listRecent(limit);
  return (
    operations.find((operation) => isActiveOperation(operation) && predicate(operation)) ?? null
  );
}

export async function findActiveCoupangShipmentCollectOperation(input: {
  storeId: string;
  syncMode?: "full" | "incremental" | "new_only" | null;
}) {
  return findActiveOperation(
    (operation) =>
      operation.channel === "coupang" &&
      operation.menuKey === "coupang.shipments" &&
      operation.actionKey === "collect-worksheet" &&
      getOperationStoreId(operation) === input.storeId &&
      (input.syncMode ? getOperationSyncMode(operation) === input.syncMode : true),
  );
}

export function isOperationCancellationRequested(operationId: string) {
  return requestedOperationCancellations.has(operationId);
}

export async function requestOperationCancellation(id: string) {
  const operation = await operationStore.getById(id);

  if (!operation) {
    throw new ApiRouteError({
      code: "OPERATION_NOT_FOUND",
      message: "Operation not found.",
      status: 404,
    });
  }

  if (!isActiveOperation(operation)) {
    return {
      operation,
      data: {
        cancelled: false,
        alreadyFinished: true,
      },
    } satisfies OperationExecutionResponse<{
      cancelled: boolean;
      alreadyFinished: boolean;
    }>;
  }

  requestedOperationCancellations.add(id);

  const cancelledOperation = await operationStore.update(id, {
    status: "warning",
    normalizedPayload: operation.normalizedPayload,
    resultSummary:
      operation.resultSummary ??
      summarizeResult({
        headline: "작업 취소",
        detail: OPERATION_CANCELLED_MESSAGE,
      }),
    errorCode: OPERATION_CANCELLED_ERROR_CODE,
    errorMessage: OPERATION_CANCELLED_MESSAGE,
    finishedAt: new Date().toISOString(),
    retryable: false,
  });

  return {
    operation: cancelledOperation ?? operation,
    data: {
      cancelled: true,
      alreadyFinished: false,
    },
  } satisfies OperationExecutionResponse<{
    cancelled: boolean;
    alreadyFinished: boolean;
  }>;
}

export async function startOperation(
  input: BaseOperationInput & {
    status?: OperationStatus;
    resultSummary?: OperationResultSummary | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
) {
  return operationStore.create({
    channel: input.channel,
    menuKey: input.menuKey,
    actionKey: input.actionKey,
    status: input.status ?? "queued",
    mode: input.mode,
    targetType: input.targetType,
    targetCount: input.targetCount,
    targetIds: input.targetIds,
    requestPayload: input.requestPayload ?? null,
    normalizedPayload: input.normalizedPayload ?? null,
    resultSummary: input.resultSummary ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    retryable: input.retryable ?? false,
    retryOfOperationId: input.retryOfOperationId ?? null,
  });
}

export async function completeOperation(
  operationId: string,
  input: {
    normalizedPayload?: Record<string, unknown> | null;
    resultSummary?: OperationResultSummary | null;
  },
) {
  const cancelledOperation = await getProtectedCancelledOperation(operationId);
  if (cancelledOperation) {
    return cancelledOperation;
  }

  return operationStore.update(operationId, {
    status: "success",
    normalizedPayload: input.normalizedPayload,
    resultSummary: input.resultSummary ?? null,
    errorCode: null,
    errorMessage: null,
    finishedAt: new Date().toISOString(),
  });
}

export async function warnOperation(
  operationId: string,
  input: {
    normalizedPayload?: Record<string, unknown> | null;
    resultSummary?: OperationResultSummary | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
) {
  const cancelledOperation = await getProtectedCancelledOperation(operationId);
  if (cancelledOperation) {
    return cancelledOperation;
  }

  return operationStore.update(operationId, {
    status: "warning",
    normalizedPayload: input.normalizedPayload,
    resultSummary: input.resultSummary ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    finishedAt: new Date().toISOString(),
  });
}

export async function failOperation(
  operationId: string,
  input: {
    normalizedPayload?: Record<string, unknown> | null;
    resultSummary?: OperationResultSummary | null;
    errorCode?: string | null;
    errorMessage: string;
  },
) {
  const cancelledOperation = await getProtectedCancelledOperation(operationId);
  if (cancelledOperation) {
    return cancelledOperation;
  }

  return operationStore.update(operationId, {
    status: "error",
    normalizedPayload: input.normalizedPayload,
    resultSummary: input.resultSummary ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage,
    finishedAt: new Date().toISOString(),
  });
}

export async function updateManualOperation(
  id: string,
  patch: Partial<
    Pick<
      OperationLogEntry,
      | "status"
      | "normalizedPayload"
      | "resultSummary"
      | "errorCode"
      | "errorMessage"
      | "finishedAt"
      | "retryable"
    >
  >,
) {
  return operationStore.update(id, patch);
}

export async function recoverStaleOperations() {
  const now = Date.now();
  const operations = await operationStore.listRecent(STALE_OPERATION_SCAN_LIMIT);
  let recoveredCount = 0;

  for (const operation of operations) {
    if (
      operation.finishedAt ||
      (operation.status !== "queued" && operation.status !== "running")
    ) {
      continue;
    }

    const referenceTimestamp = Date.parse(operation.updatedAt || operation.startedAt);
    if (!Number.isFinite(referenceTimestamp) || now - referenceTimestamp < STALE_OPERATION_THRESHOLD_MS) {
      continue;
    }

    await updateManualOperation(operation.id, {
      status: "warning",
      finishedAt: new Date(now).toISOString(),
      errorCode: "STALE_OPERATION_RECOVERED",
      errorMessage: "이전 실행에서 종료되지 않은 작업을 자동으로 정리했습니다.",
      resultSummary:
        operation.resultSummary ??
        summarizeResult({
          headline: "중단된 작업 정리",
          detail: "이전 실행에서 종료되지 않은 작업을 자동으로 정리했습니다.",
        }),
    });
    recoveredCount += 1;
  }

  return recoveredCount;
}

export async function runTrackedOperation<T>(
  input: BaseOperationInput & {
    execute: (context: {
      operationId: string;
      isCancellationRequested: () => boolean;
    }) => Promise<TrackedOperationResult<T>>;
  },
) {
  const created = await startOperation({
    ...input,
    status: "queued",
  });

  const running = await updateManualOperation(created.id, {
    status: "running",
    errorCode: null,
    errorMessage: null,
  });

  try {
    const result = await input.execute({
      operationId: created.id,
      isCancellationRequested: () => isOperationCancellationRequested(created.id),
    });
    const summary = result.resultSummary ?? summarizeResult({});
    const finalOperation =
      result.status === "warning"
        ? await warnOperation(created.id, {
            normalizedPayload: result.normalizedPayload ?? input.normalizedPayload ?? null,
            resultSummary: summary,
          })
        : await completeOperation(created.id, {
            normalizedPayload: result.normalizedPayload ?? input.normalizedPayload ?? null,
            resultSummary: summary,
          });

    return {
      operation: finalOperation ?? running ?? created,
      data: result.data,
    } satisfies OperationExecutionResponse<T>;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Background operation failed.";

    await failOperation(created.id, {
      normalizedPayload: input.normalizedPayload ?? null,
      errorCode: "UNEXPECTED_ERROR",
      errorMessage: message,
      resultSummary: summarizeResult({
        headline: "작업 실패",
        detail: message,
      }),
    });

    throw error;
  } finally {
    requestedOperationCancellations.delete(created.id);
  }
}

export async function retryOperation(id: string) {
  const operation = await operationStore.getById(id);

  if (!operation) {
    throw new ApiRouteError({
      code: "OPERATION_NOT_FOUND",
      message: "Operation not found.",
      status: 404,
    });
  }

  if (!operation.retryable) {
    throw new ApiRouteError({
      code: "RETRY_NOT_AVAILABLE",
      message: "Retry is not available for this operation.",
      status: 400,
    });
  }

  const activeRetry = await operationStore.findActiveRetryFor(operation.id);
  if (activeRetry) {
    return {
      operation: activeRetry,
      data: {
        reused: true,
        source: "active-retry",
      },
    } satisfies OperationExecutionResponse<{
      reused: true;
      source: "active-retry";
    }>;
  }

  const handler = retryHandlers.get(
    buildOperationRetryKey({
      channel: operation.channel,
      menuKey: operation.menuKey,
      actionKey: operation.actionKey,
    }),
  );

  if (!handler) {
    throw new ApiRouteError({
      code: "RETRY_HANDLER_NOT_FOUND",
      message: "Retry handler is not registered.",
      status: 400,
    });
  }

  const inFlight = inFlightRetries.get(operation.id);
  if (inFlight) {
    return inFlight;
  }

  const retryPromise = handler({
    operation,
    requestPayload: operation.requestPayload,
    normalizedPayload: operation.normalizedPayload,
  }).finally(() => {
    if (inFlightRetries.get(operation.id) === retryPromise) {
      inFlightRetries.delete(operation.id);
    }
  });

  inFlightRetries.set(operation.id, retryPromise);
  return retryPromise;
}

export async function createManualOperation(input: BaseOperationInput & {
  status?: OperationStatus;
  resultSummary?: OperationResultSummary | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  return startOperation(input);
}
