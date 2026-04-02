import type { CoupangBatchActionResponse } from "@shared/coupang";
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

export function buildBatchResultSummary(
  result: CoupangBatchActionResponse,
  detailLabel: string,
  itemCount: number,
) {
  const headline = buildOperationSummaryText(result.summary);
  const failurePreview = buildFailurePreview(result);

  return summarizeResult({
    headline,
    detail: `${detailLabel} ${itemCount}건`,
    stats: {
      ...result.summary,
      failurePreview,
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

      return {
        data,
        status: resolveTrackedOperationStatus(data.summary),
        resultSummary: buildBatchResultSummary(data, input.detailLabel, input.items.length),
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
          return {
            data,
            status: resolveTrackedOperationStatus(data.summary),
            resultSummary: buildBatchResultSummary(data, input.detailLabel, items.length),
          };
        },
      });
    },
  );
}
