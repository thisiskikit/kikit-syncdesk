import type { RequestHandler } from "express";
import {
  approveReturn,
  confirmReturnInbound,
  getReturnDetail,
  listReturns,
  markAlreadyShipped,
  markShipmentStopped,
  uploadReturnCollectionInvoice,
} from "../../../services/coupang/order-service";
import { sendData, sendError } from "../../../services/shared/api-response";
import {
  COUPANG_CANCEL_REFUNDS_MENU_KEY,
  COUPANG_RETURNS_MENU_KEY,
} from "../../coupang/constants";
import {
  buildReturnCollectionPayload,
  buildReturnPayload,
} from "../../coupang/payloads";
import {
  asString,
  parseReturnCollectionTargets,
  parseReturnTargets,
} from "../../coupang/parsers";
import {
  ensureStoreId,
  handleTrackedBatchAction,
  registerBatchRetryHandler,
} from "../../coupang/tracked-actions";

let retryHandlersRegistered = false;

export function registerCoupangReturnRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerBatchRetryHandler({
    menuKey: COUPANG_CANCEL_REFUNDS_MENU_KEY,
    actionKey: "mark-shipment-stopped",
    targetType: "selection",
    parseItems: parseReturnTargets,
    buildPayload: (storeId, items) => buildReturnPayload(storeId, "stop-shipment", items),
    targetIds: (items) => items.map((item) => item.receiptId),
    detailLabel: "출고중지완료 처리",
    validateItem: (item) => (item.receiptId ? null : "receiptId is required."),
    execute: markShipmentStopped,
  });

  registerBatchRetryHandler({
    menuKey: COUPANG_CANCEL_REFUNDS_MENU_KEY,
    actionKey: "mark-already-shipped",
    targetType: "selection",
    parseItems: parseReturnTargets,
    buildPayload: (storeId, items) => buildReturnPayload(storeId, "already-shipped", items),
    targetIds: (items) => items.map((item) => item.receiptId),
    detailLabel: "이미출고 처리",
    validateItem: (item) => {
      if (!item.receiptId) return "receiptId is required.";
      if (!item.deliveryCompanyCode) return "deliveryCompanyCode is required.";
      if (!item.invoiceNumber) return "invoiceNumber is required.";
      return null;
    },
    execute: markAlreadyShipped,
  });

  registerBatchRetryHandler({
    menuKey: COUPANG_RETURNS_MENU_KEY,
    actionKey: "confirm-return-inbound",
    targetType: "selection",
    parseItems: parseReturnTargets,
    buildPayload: (storeId, items) => buildReturnPayload(storeId, "receive-confirmation", items),
    targetIds: (items) => items.map((item) => item.receiptId),
    detailLabel: "반품 입고 확인",
    validateItem: (item) => (item.receiptId ? null : "receiptId is required."),
    execute: confirmReturnInbound,
  });

  registerBatchRetryHandler({
    menuKey: COUPANG_RETURNS_MENU_KEY,
    actionKey: "approve-return",
    targetType: "selection",
    parseItems: parseReturnTargets,
    buildPayload: (storeId, items) => buildReturnPayload(storeId, "approve", items),
    targetIds: (items) => items.map((item) => item.receiptId),
    detailLabel: "반품 승인",
    validateItem: (item) => (item.receiptId ? null : "receiptId is required."),
    execute: approveReturn,
  });

  registerBatchRetryHandler({
    menuKey: COUPANG_RETURNS_MENU_KEY,
    actionKey: "upload-return-collection-invoice",
    targetType: "selection",
    parseItems: parseReturnCollectionTargets,
    buildPayload: buildReturnCollectionPayload,
    targetIds: (items) => items.map((item) => item.receiptId),
    detailLabel: "회수 송장 등록",
    validateItem: (item) => {
      if (!item.receiptId) return "receiptId is required.";
      if (!item.deliveryCompanyCode) return "deliveryCompanyCode is required.";
      if (!item.invoiceNumber) return "invoiceNumber is required.";
      return null;
    },
    execute: uploadReturnCollectionInvoice,
  });
}

export const listReturnsHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const cancelType =
      req.query.cancelType === "RETURN" ||
      req.query.cancelType === "CANCEL" ||
      req.query.cancelType === "ALL"
        ? req.query.cancelType
        : undefined;

    sendData(
      res,
      await listReturns({
        storeId,
        createdAtFrom:
          typeof req.query.createdAtFrom === "string" ? req.query.createdAtFrom : undefined,
        createdAtTo:
          typeof req.query.createdAtTo === "string" ? req.query.createdAtTo : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        orderId: typeof req.query.orderId === "string" ? req.query.orderId : undefined,
        cancelType,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_RETURNS_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang returns.",
    });
  }
};

export const getReturnDetailHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const receiptId = typeof req.query.receiptId === "string" ? req.query.receiptId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!receiptId) {
      sendError(res, 400, {
        code: "MISSING_RECEIPT_ID",
        message: "receiptId is required.",
      });
      return;
    }

    sendData(
      res,
      await getReturnDetail({
        storeId,
        receiptId,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_RETURN_DETAIL_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang return detail.",
    });
  }
};

export const stopShipmentHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseReturnTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_CANCEL_REFUNDS_MENU_KEY,
      actionKey: "mark-shipment-stopped",
      targetType: "selection",
      targetIds: items.map((item) => item.receiptId),
      requestPayload: buildReturnPayload(storeId, "stop-shipment", items),
      detailLabel: "출고중지완료 처리",
      validateItem: (item) => (item.receiptId ? null : "receiptId is required."),
      execute: markShipmentStopped,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_STOP_SHIPMENT_FAILED",
      message: error instanceof Error ? error.message : "Failed to process release stop.",
    });
  }
};

export const markAlreadyShippedHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseReturnTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_CANCEL_REFUNDS_MENU_KEY,
      actionKey: "mark-already-shipped",
      targetType: "selection",
      targetIds: items.map((item) => item.receiptId),
      requestPayload: buildReturnPayload(storeId, "already-shipped", items),
      detailLabel: "이미출고 처리",
      validateItem: (item) => {
        if (!item.receiptId) return "receiptId is required.";
        if (!item.deliveryCompanyCode) return "deliveryCompanyCode is required.";
        if (!item.invoiceNumber) return "invoiceNumber is required.";
        return null;
      },
      execute: markAlreadyShipped,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_ALREADY_SHIPPED_FAILED",
      message: error instanceof Error ? error.message : "Failed to mark already shipped.",
    });
  }
};

export const confirmReturnInboundHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseReturnTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_RETURNS_MENU_KEY,
      actionKey: "confirm-return-inbound",
      targetType: "selection",
      targetIds: items.map((item) => item.receiptId),
      requestPayload: buildReturnPayload(storeId, "receive-confirmation", items),
      detailLabel: "반품 입고 확인",
      validateItem: (item) => (item.receiptId ? null : "receiptId is required."),
      execute: confirmReturnInbound,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CONFIRM_RETURN_INBOUND_FAILED",
      message: error instanceof Error ? error.message : "Failed to confirm return inbound.",
    });
  }
};

export const approveReturnHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseReturnTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_RETURNS_MENU_KEY,
      actionKey: "approve-return",
      targetType: "selection",
      targetIds: items.map((item) => item.receiptId),
      requestPayload: buildReturnPayload(storeId, "approve", items),
      detailLabel: "반품 승인",
      validateItem: (item) => (item.receiptId ? null : "receiptId is required."),
      execute: approveReturn,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_APPROVE_RETURN_FAILED",
      message: error instanceof Error ? error.message : "Failed to approve return.",
    });
  }
};

export const uploadReturnCollectionInvoiceHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseReturnCollectionTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_RETURNS_MENU_KEY,
      actionKey: "upload-return-collection-invoice",
      targetType: "selection",
      targetIds: items.map((item) => item.receiptId),
      requestPayload: buildReturnCollectionPayload(storeId, items),
      detailLabel: "회수 송장 등록",
      validateItem: (item) => {
        if (!item.receiptId) return "receiptId is required.";
        if (!item.deliveryCompanyCode) return "deliveryCompanyCode is required.";
        if (!item.invoiceNumber) return "invoiceNumber is required.";
        return null;
      },
      execute: uploadReturnCollectionInvoice,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_RETURN_COLLECTION_INVOICE_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to upload return collection invoice.",
    });
  }
};
