import type { RequestHandler } from "express";
import {
  NAVER_ORDER_MAX_ITEMS,
  type NaverOrderConfirmTarget,
  type NaverOrderDelayTarget,
  type NaverOrderDispatchTarget,
} from "@shared/naver-orders";
import {
  confirmOrders,
  delayDispatch,
  dispatchOrders,
  getOrderDetail,
  listOrders,
} from "../../services/naver-order-service";
import {
  registerOperationRetryHandler,
  runTrackedOperation,
  summarizeResult,
} from "../../services/operations/service";
import { sendData, sendError } from "../../services/shared/api-response";
import { sendMessageBasedError } from "../responders/message-based-error";
import {
  buildOperationSummaryText,
  resolveTrackedOperationStatus,
} from "../responders/operation-summary";

const NAVER_SHIPMENT_MENU_KEY = "naver.shipment";
const ORDER_INVALID_PATTERNS = ["required", "유효", "필요", "찾을 수 없습니다", "스토어"];

let retryHandlersRegistered = false;

function clampPositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.max(1, Math.floor(parsed));
  return typeof max === "number" ? Math.min(normalized, max) : normalized;
}

function parseConfirmTargets(value: unknown): NaverOrderConfirmTarget[] {
  const items = Array.isArray((value as { items?: unknown[] } | null)?.items)
    ? ((value as { items: unknown[] }).items ?? [])
    : [];

  return items.map((rawItem) => {
    const item =
      rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};

    return {
      productOrderId:
        typeof item.productOrderId === "string"
          ? item.productOrderId
          : typeof item.productOrderId === "number"
            ? String(item.productOrderId)
            : "",
      orderId:
        typeof item.orderId === "string"
          ? item.orderId
          : typeof item.orderId === "number"
            ? String(item.orderId)
            : null,
      productName: typeof item.productName === "string" ? item.productName : null,
    } satisfies NaverOrderConfirmTarget;
  });
}

function parseDispatchTargets(value: unknown): NaverOrderDispatchTarget[] {
  const items = Array.isArray((value as { items?: unknown[] } | null)?.items)
    ? ((value as { items: unknown[] }).items ?? [])
    : [];

  return items.map((rawItem) => {
    const item =
      rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};

    return {
      productOrderId:
        typeof item.productOrderId === "string"
          ? item.productOrderId
          : typeof item.productOrderId === "number"
            ? String(item.productOrderId)
            : "",
      orderId:
        typeof item.orderId === "string"
          ? item.orderId
          : typeof item.orderId === "number"
            ? String(item.orderId)
            : null,
      productName: typeof item.productName === "string" ? item.productName : null,
      deliveryMethod: typeof item.deliveryMethod === "string" ? item.deliveryMethod : "",
      courierCode: typeof item.courierCode === "string" ? item.courierCode : null,
      courierName: typeof item.courierName === "string" ? item.courierName : null,
      trackingNumber: typeof item.trackingNumber === "string" ? item.trackingNumber : null,
      dispatchDate: typeof item.dispatchDate === "string" ? item.dispatchDate : null,
    } satisfies NaverOrderDispatchTarget;
  });
}

function parseDelayTargets(value: unknown): NaverOrderDelayTarget[] {
  const items = Array.isArray((value as { items?: unknown[] } | null)?.items)
    ? ((value as { items: unknown[] }).items ?? [])
    : [];

  return items.map((rawItem) => {
    const item =
      rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};

    return {
      productOrderId:
        typeof item.productOrderId === "string"
          ? item.productOrderId
          : typeof item.productOrderId === "number"
            ? String(item.productOrderId)
            : "",
      orderId:
        typeof item.orderId === "string"
          ? item.orderId
          : typeof item.orderId === "number"
            ? String(item.orderId)
            : null,
      productName: typeof item.productName === "string" ? item.productName : null,
      dispatchDueDate: typeof item.dispatchDueDate === "string" ? item.dispatchDueDate : "",
      delayedDispatchReason:
        typeof item.delayedDispatchReason === "string" ? item.delayedDispatchReason : "",
      dispatchDelayedDetailedReason:
        typeof item.dispatchDelayedDetailedReason === "string"
          ? item.dispatchDelayedDetailedReason
          : "",
    } satisfies NaverOrderDelayTarget;
  });
}

function buildOperationPayload<TItem extends { productOrderId: string }>(input: {
  storeId: string;
  items: TItem[];
}) {
  return {
    storeId: input.storeId,
    itemCount: input.items.length,
    targetIds: input.items.map((item) => item.productOrderId),
    items: input.items,
  };
}

async function runTrackedOrderAction<
  TItem extends { productOrderId: string },
  TResult extends { summary: { succeededCount: number; failedCount: number; skippedCount: number } },
>(input: {
  actionKey: string;
  detailLabel: string;
  mode: "foreground" | "retry";
  storeId: string;
  items: TItem[];
  retryOfOperationId?: string;
  execute: (params: { storeId: string; items: TItem[] }) => Promise<TResult>;
}) {
  return runTrackedOperation({
    channel: "naver",
    menuKey: NAVER_SHIPMENT_MENU_KEY,
    actionKey: input.actionKey,
    mode: input.mode,
    targetType: "order",
    targetCount: input.items.length,
    targetIds: input.items.map((item) => item.productOrderId),
    requestPayload: {
      storeId: input.storeId,
      items: input.items,
    },
    normalizedPayload: buildOperationPayload({
      storeId: input.storeId,
      items: input.items,
    }),
    retryable: true,
    retryOfOperationId: input.retryOfOperationId ?? null,
    execute: async () => {
      const data = await input.execute({
        storeId: input.storeId,
        items: input.items,
      });

      return {
        data,
        status: resolveTrackedOperationStatus(data.summary),
        normalizedPayload: buildOperationPayload({
          storeId: input.storeId,
          items: input.items,
        }),
        resultSummary: summarizeResult({
          headline: buildOperationSummaryText(data.summary),
          detail: `${input.detailLabel} ${input.items.length}건`,
          stats: data.summary,
          preview: buildOperationSummaryText(data.summary),
        }),
      };
    },
  });
}

function ensureStoreId(res: Parameters<typeof sendError>[0], storeId: string) {
  if (storeId) {
    return true;
  }

  sendError(res, 400, {
    code: "MISSING_STORE_ID",
    message: "storeId is required.",
  });
  return false;
}

type OrderActionConfig<TItem extends { productOrderId: string }> = {
  actionKey: string;
  detailLabel: string;
  parseItems: (value: unknown) => TItem[];
  execute: (params: { storeId: string; items: TItem[] }) => Promise<{
    summary: { succeededCount: number; failedCount: number; skippedCount: number };
  }>;
};

const confirmOrdersConfig: OrderActionConfig<NaverOrderConfirmTarget> = {
  actionKey: "confirm-orders",
  detailLabel: "NAVER 발주 확인",
  parseItems: parseConfirmTargets,
  execute: confirmOrders,
};

const dispatchOrdersConfig: OrderActionConfig<NaverOrderDispatchTarget> = {
  actionKey: "dispatch-orders",
  detailLabel: "NAVER 발송 처리",
  parseItems: parseDispatchTargets,
  execute: dispatchOrders,
};

const delayDispatchConfig: OrderActionConfig<NaverOrderDelayTarget> = {
  actionKey: "delay-dispatch",
  detailLabel: "NAVER 발송 지연처리",
  parseItems: parseDelayTargets,
  execute: delayDispatch,
};

async function handleTrackedOrderRoute<TItem extends { productOrderId: string }>(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  config: OrderActionConfig<TItem>,
) {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const items = config.parseItems(req.body);

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!items.length) {
    sendError(res, 400, {
      code: "MISSING_TARGETS",
      message: "At least one order must be selected.",
    });
    return;
  }

  try {
    const tracked = await runTrackedOrderAction({
      actionKey: config.actionKey,
      detailLabel: config.detailLabel,
      mode: "foreground",
      storeId,
      items,
      execute: config.execute,
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: ORDER_INVALID_PATTERNS,
      invalidCode: "INVALID_NAVER_ORDER_REQUEST",
      apiFailedCode: "NAVER_ORDER_API_FAILED",
      fallbackMessage: "Failed to execute NAVER order action.",
    });
  }
}

function registerOrderRetryHandler<TItem extends { productOrderId: string }>(
  config: OrderActionConfig<TItem>,
) {
  registerOperationRetryHandler(
    {
      channel: "naver",
      menuKey: NAVER_SHIPMENT_MENU_KEY,
      actionKey: config.actionKey,
    },
    async ({ operation, requestPayload }) => {
      const request = (requestPayload ?? {}) as Record<string, unknown>;
      const storeId = typeof request.storeId === "string" ? request.storeId : "";
      const items = config.parseItems({
        items: Array.isArray(request.items) ? request.items : [],
      });

      return runTrackedOrderAction({
        actionKey: config.actionKey,
        detailLabel: config.detailLabel,
        mode: "retry",
        storeId,
        items,
        retryOfOperationId: operation.id,
        execute: config.execute,
      });
    },
  );
}

export function registerNaverOrderRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerOrderRetryHandler(confirmOrdersConfig);
  registerOrderRetryHandler(dispatchOrdersConfig);
  registerOrderRetryHandler(delayDispatchConfig);
}

export const listOrdersHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
  const lastChangedFrom =
    typeof req.query.lastChangedFrom === "string" ? req.query.lastChangedFrom : "";

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!lastChangedFrom) {
    sendError(res, 400, {
      code: "MISSING_LAST_CHANGED_FROM",
      message: "lastChangedFrom is required.",
    });
    return;
  }

  try {
    sendData(
      res,
      await listOrders({
        storeId,
        lastChangedFrom,
        lastChangedTo:
          typeof req.query.lastChangedTo === "string" ? req.query.lastChangedTo : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        query: typeof req.query.query === "string" ? req.query.query : undefined,
        maxItems: clampPositiveInteger(req.query.maxItems, 60, NAVER_ORDER_MAX_ITEMS),
        refresh: req.query.refresh === "1",
      }),
    );
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: ORDER_INVALID_PATTERNS,
      invalidCode: "INVALID_NAVER_ORDER_REQUEST",
      apiFailedCode: "NAVER_ORDER_API_FAILED",
      fallbackMessage: "Failed to load NAVER orders.",
    });
  }
};

export const getOrderDetailHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
  const productOrderId =
    typeof req.params.productOrderId === "string" ? req.params.productOrderId : "";

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!productOrderId) {
    sendError(res, 400, {
      code: "MISSING_PRODUCT_ORDER_ID",
      message: "productOrderId is required.",
    });
    return;
  }

  try {
    sendData(
      res,
      await getOrderDetail({
        storeId,
        productOrderId,
      }),
    );
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: ORDER_INVALID_PATTERNS,
      invalidCode: "INVALID_NAVER_ORDER_REQUEST",
      apiFailedCode: "NAVER_ORDER_API_FAILED",
      fallbackMessage: "Failed to load NAVER order detail.",
    });
  }
};

export const confirmOrdersHandler: RequestHandler = async (req, res) => {
  await handleTrackedOrderRoute(req, res, confirmOrdersConfig);
};

export const dispatchOrdersHandler: RequestHandler = async (req, res) => {
  await handleTrackedOrderRoute(req, res, dispatchOrdersConfig);
};

export const delayDispatchHandler: RequestHandler = async (req, res) => {
  await handleTrackedOrderRoute(req, res, delayDispatchConfig);
};
