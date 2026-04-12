import type {
  CoupangActionItemResult,
  CoupangActionItemStatus,
  CoupangBatchActionResponse,
} from "@shared/coupang";
import type { OperationTicketDetail } from "@shared/operations";
import {
  registerOperationRetryHandler,
  runTrackedOperation,
  summarizeResult,
} from "../../services/operations/service";
import { sendData, sendError } from "../../services/shared/api-response";
import {
  buildOperationSummaryText,
  resolveTrackedOperationStatus,
} from "../responders/operation-summary";
import { asString } from "./parsers";

type JsonRecord = Record<string, unknown>;
type ResponseTarget = Parameters<typeof sendData>[0];

const MAX_OPERATION_TICKET_DETAILS = 5;

export function summarizeVendorItemAction(action: string, result: { message: string }) {
  return `${action}: ${result.message}`;
}

export function summarizeProductAction(action: string, result: { message: string }) {
  return `${action}: ${result.message}`;
}

function buildFailurePreview(result: CoupangBatchActionResponse) {
  const failedItems = result.items
    .filter((item) => item.status !== "succeeded")
    .slice(0, 3)
    .map((item) => `${item.targetId}: ${item.message}`);

  return failedItems.length ? failedItems.join(" | ") : null;
}

function mapBatchItemStatusToTicketResult(
  status: CoupangActionItemStatus,
): OperationTicketDetail["result"] {
  if (status === "failed") {
    return "error";
  }
  if (status === "warning") {
    return "warning";
  }
  if (status === "skipped") {
    return "skipped";
  }
  return "success";
}

function getTicketPriority(result: OperationTicketDetail["result"]) {
  if (result === "error") {
    return 0;
  }
  if (result === "warning") {
    return 1;
  }
  if (result === "skipped") {
    return 2;
  }
  return 3;
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length ? value : null;
}

function createBatchTicketDetail(
  item: CoupangActionItemResult,
  extra?: Partial<OperationTicketDetail> | null,
): OperationTicketDetail {
  return {
    result: mapBatchItemStatusToTicketResult(item.status),
    label: toNullableString(extra?.label),
    message: toNullableString(extra?.message) ?? item.message,
    targetId: toNullableString(extra?.targetId) ?? item.targetId,
    sourceKey: toNullableString(extra?.sourceKey),
    selpickOrderNumber: toNullableString(extra?.selpickOrderNumber),
    productOrderNumber: toNullableString(extra?.productOrderNumber),
    shipmentBoxId: toNullableString(extra?.shipmentBoxId) ?? item.shipmentBoxId,
    orderId: toNullableString(extra?.orderId) ?? item.orderId,
    receiptId: toNullableString(extra?.receiptId) ?? item.receiptId,
    vendorItemId: toNullableString(extra?.vendorItemId) ?? item.vendorItemId,
    productName: toNullableString(extra?.productName),
    receiverName: toNullableString(extra?.receiverName),
    deliveryCompanyCode: toNullableString(extra?.deliveryCompanyCode),
    invoiceNumber: toNullableString(extra?.invoiceNumber),
  };
}

export function buildBatchTicketDetailState<TTarget>(
  result: CoupangBatchActionResponse,
  items: readonly TTarget[],
  input?: {
    resolveTargetId?: (item: TTarget) => string | null;
    buildTicketDetail?: (params: {
      itemResult: CoupangActionItemResult;
      sourceItem: TTarget | null;
    }) => Partial<OperationTicketDetail> | null;
  },
) {
  const sourceByTargetId = new Map<string, TTarget>();
  if (input?.resolveTargetId) {
    for (const item of items) {
      const targetId = input.resolveTargetId(item);
      if (targetId && !sourceByTargetId.has(targetId)) {
        sourceByTargetId.set(targetId, item);
      }
    }
  }

  const details = result.items
    .map((item) =>
      createBatchTicketDetail(
        item,
        input?.buildTicketDetail
          ? input.buildTicketDetail({
              itemResult: item,
              sourceItem: sourceByTargetId.get(item.targetId) ?? null,
            })
          : null,
      ),
    )
    .sort((left, right) => {
      const priorityGap = getTicketPriority(left.result) - getTicketPriority(right.result);
      if (priorityGap !== 0) {
        return priorityGap;
      }

      return (left.targetId ?? "").localeCompare(right.targetId ?? "");
    });

  return {
    items: details.slice(0, MAX_OPERATION_TICKET_DETAILS),
    truncated: details.length > MAX_OPERATION_TICKET_DETAILS,
  };
}

export function buildBatchResultSummary(
  result: CoupangBatchActionResponse,
  detailLabel: string,
  itemCount: number,
  ticketDetailState?: {
    items: OperationTicketDetail[];
    truncated: boolean;
  },
) {
  const headline = buildOperationSummaryText(result.summary);
  const failurePreview = buildFailurePreview(result);

  return summarizeResult({
    headline,
    detail: `${detailLabel} ${itemCount}건`,
    stats: {
      ...result.summary,
      failurePreview,
      ticketDetailsTotalCount: result.items.length,
      ticketDetailsRecorded: ticketDetailState?.items.length ?? 0,
      ticketDetailsTruncated: ticketDetailState?.truncated ?? false,
      ticketDetails: ticketDetailState?.items ?? [],
    },
    preview: failurePreview ? `${headline} / ${failurePreview}` : headline,
  });
}

export function validateBatchItems<TItem>(
  items: TItem[],
  validateItem?: (item: TItem) => string | null,
) {
  if (!validateItem) {
    return [] as string[];
  }

  return items
    .map((item) => validateItem(item))
    .filter((message): message is string => Boolean(message));
}

export function ensureStoreId(res: ResponseTarget, storeId: string) {
  if (storeId) {
    return true;
  }

  sendError(res, 400, {
    code: "MISSING_STORE_ID",
    message: "storeId is required.",
  });
  return false;
}

export async function handleTrackedBatchAction<TTarget>(input: {
  res: ResponseTarget;
  storeId: string;
  items: TTarget[];
  menuKey: string;
  actionKey: string;
  targetType: "order" | "selection";
  targetIds: string[];
  requestPayload: Record<string, unknown>;
  detailLabel: string;
  retryable?: boolean;
  validateItem?: (item: TTarget) => string | null;
  resolveTargetId?: (item: TTarget) => string | null;
  buildTicketDetail?: (params: {
    itemResult: CoupangActionItemResult;
    sourceItem: TTarget | null;
  }) => Partial<OperationTicketDetail> | null;
  execute: (params: { storeId: string; items: TTarget[] }) => Promise<CoupangBatchActionResponse>;
}) {
  if (!ensureStoreId(input.res, input.storeId)) {
    return;
  }

  if (!input.items.length) {
    sendError(input.res, 400, {
      code: "MISSING_TARGETS",
      message: "At least one target is required.",
    });
    return;
  }

  const validationErrors = validateBatchItems(input.items, input.validateItem);
  if (validationErrors.length) {
    sendError(input.res, 400, {
      code: "INVALID_ACTION_PAYLOAD",
      message: validationErrors.slice(0, 5).join(" / "),
    });
    return;
  }

  const tracked = await runTrackedOperation({
    channel: "coupang",
    menuKey: input.menuKey,
    actionKey: input.actionKey,
    mode: "foreground",
    targetType: input.targetType,
    targetCount: input.items.length,
    targetIds: input.targetIds,
    requestPayload: input.requestPayload,
    normalizedPayload: input.requestPayload,
    retryable: input.retryable ?? true,
    execute: async () => {
      const data = await input.execute({
        storeId: input.storeId,
        items: input.items,
      });
      const ticketDetailState = buildBatchTicketDetailState(data, input.items, {
        resolveTargetId: input.resolveTargetId,
        buildTicketDetail: input.buildTicketDetail,
      });

      return {
        data,
        status: resolveTrackedOperationStatus(data.summary),
        resultSummary: buildBatchResultSummary(
          data,
          input.detailLabel,
          input.items.length,
          ticketDetailState,
        ),
      };
    },
  });

  sendData(input.res, {
    ...tracked.data,
    operation: tracked.operation,
  });
}

export function registerBatchRetryHandler<TTarget>(input: {
  menuKey: string;
  actionKey: string;
  targetType: "order" | "selection";
  parseItems: (value: unknown) => TTarget[];
  buildPayload: (storeId: string, items: TTarget[]) => Record<string, unknown>;
  targetIds: (items: TTarget[]) => string[];
  detailLabel: string;
  validateItem?: (item: TTarget) => string | null;
  resolveTargetId?: (item: TTarget) => string | null;
  buildTicketDetail?: (params: {
    itemResult: CoupangActionItemResult;
    sourceItem: TTarget | null;
  }) => Partial<OperationTicketDetail> | null;
  execute: (params: { storeId: string; items: TTarget[] }) => Promise<CoupangBatchActionResponse>;
}) {
  registerOperationRetryHandler(
    {
      channel: "coupang",
      menuKey: input.menuKey,
      actionKey: input.actionKey,
    },
    async ({ operation, requestPayload }) => {
      const request = (requestPayload ?? {}) as JsonRecord;
      const storeId = asString(request.storeId);
      const items = input.parseItems({
        items: Array.isArray(request.items) ? request.items : [],
      });

      if (!storeId) {
        throw new Error("storeId is required for retry.");
      }

      const validationErrors = validateBatchItems(items, input.validateItem);
      if (validationErrors.length) {
        throw new Error(validationErrors[0]);
      }

      return runTrackedOperation({
        channel: "coupang",
        menuKey: input.menuKey,
        actionKey: input.actionKey,
        mode: "retry",
        targetType: input.targetType,
        targetCount: items.length,
        targetIds: input.targetIds(items),
        requestPayload: input.buildPayload(storeId, items),
        normalizedPayload: input.buildPayload(storeId, items),
        retryable: true,
        retryOfOperationId: operation.id,
        execute: async () => {
          const data = await input.execute({ storeId, items });
          const ticketDetailState = buildBatchTicketDetailState(data, items, {
            resolveTargetId: input.resolveTargetId,
            buildTicketDetail: input.buildTicketDetail,
          });

          return {
            data,
            status: resolveTrackedOperationStatus(data.summary),
            resultSummary: buildBatchResultSummary(
              data,
              input.detailLabel,
              items.length,
              ticketDetailState,
            ),
          };
        },
      });
    },
  );
}
