import type { RequestHandler } from "express";
import {
  cancelOrderItem,
  getOrderCustomerServiceSummary,
  getOrderDetail,
  listOrders,
  markPreparing,
} from "../../../services/coupang/order-service";
import { sendData, sendError } from "../../../services/shared/api-response";
import { COUPANG_ORDERS_MENU_KEY } from "../../coupang/constants";
import {
  buildCancelOrderPayload,
  buildPreparePayload,
} from "../../coupang/payloads";
import {
  asOptionalString,
  asString,
  parseCustomerServiceSummaryItems,
  parsePositiveInteger,
  parsePrepareTargets,
  parseCancelOrderTargets,
} from "../../coupang/parsers";
import {
  ensureStoreId,
  handleTrackedBatchAction,
  registerBatchRetryHandler,
} from "../../coupang/tracked-actions";

let retryHandlersRegistered = false;

export function registerCoupangOrderRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerBatchRetryHandler({
    menuKey: COUPANG_ORDERS_MENU_KEY,
    actionKey: "mark-preparing",
    targetType: "order",
    parseItems: parsePrepareTargets,
    buildPayload: buildPreparePayload,
    targetIds: (items) => items.map((item) => item.shipmentBoxId),
    detailLabel: "상품준비중 처리",
    validateItem: (item) => (item.shipmentBoxId ? null : "shipmentBoxId is required."),
    execute: markPreparing,
  });

  registerBatchRetryHandler({
    menuKey: COUPANG_ORDERS_MENU_KEY,
    actionKey: "cancel-order-item",
    targetType: "selection",
    parseItems: parseCancelOrderTargets,
    buildPayload: buildCancelOrderPayload,
    targetIds: (items) => items.map((item) => `${item.orderId}:${item.vendorItemId}`),
    detailLabel: "주문 취소",
    validateItem: (item) => {
      if (!item.orderId) return "orderId is required.";
      if (!item.vendorItemId) return "vendorItemId is required.";
      if (!item.userId) return "userId is required.";
      return null;
    },
    execute: cancelOrderItem,
  });
}

export const listOrdersHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listOrders({
        storeId,
        createdAtFrom:
          typeof req.query.createdAtFrom === "string" ? req.query.createdAtFrom : undefined,
        createdAtTo:
          typeof req.query.createdAtTo === "string" ? req.query.createdAtTo : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        nextToken: typeof req.query.nextToken === "string" ? req.query.nextToken : null,
        maxPerPage: parsePositiveInteger(req.query.maxPerPage, 20),
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_ORDERS_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang orders.",
    });
  }
};

export const getCustomerServiceSummaryHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await getOrderCustomerServiceSummary({
        storeId,
        createdAtFrom: asOptionalString(req.body?.createdAtFrom) ?? undefined,
        createdAtTo: asOptionalString(req.body?.createdAtTo) ?? undefined,
        items: parseCustomerServiceSummaryItems(req.body),
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CUSTOMER_SERVICE_SUMMARY_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Failed to load Coupang customer service summary.",
    });
  }
};

export const getOrderDetailHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await getOrderDetail({
        storeId,
        shipmentBoxId:
          typeof req.query.shipmentBoxId === "string" ? req.query.shipmentBoxId : undefined,
        orderId: typeof req.query.orderId === "string" ? req.query.orderId : undefined,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_ORDER_DETAIL_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang order detail.",
    });
  }
};

export const markPreparingHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parsePrepareTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_ORDERS_MENU_KEY,
      actionKey: "mark-preparing",
      targetType: "order",
      targetIds: items.map((item) => item.shipmentBoxId),
      requestPayload: buildPreparePayload(storeId, items),
      detailLabel: "상품준비중 처리",
      validateItem: (item) => (item.shipmentBoxId ? null : "shipmentBoxId is required."),
      execute: markPreparing,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_MARK_PREPARING_FAILED",
      message: error instanceof Error ? error.message : "Failed to mark orders as preparing.",
    });
  }
};

export const cancelOrdersHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseCancelOrderTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_ORDERS_MENU_KEY,
      actionKey: "cancel-order-item",
      targetType: "selection",
      targetIds: items.map((item) => `${item.orderId}:${item.vendorItemId}`),
      requestPayload: buildCancelOrderPayload(storeId, items),
      detailLabel: "주문 취소",
      validateItem: (item) => {
        if (!item.orderId) return "orderId is required.";
        if (!item.vendorItemId) return "vendorItemId is required.";
        if (!item.userId) return "userId is required.";
        return null;
      },
      execute: cancelOrderItem,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CANCEL_ORDER_FAILED",
      message: error instanceof Error ? error.message : "Failed to cancel Coupang order.",
    });
  }
};
