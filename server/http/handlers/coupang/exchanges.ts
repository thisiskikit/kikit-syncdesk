import type { RequestHandler } from "express";
import {
  confirmExchangeInbound,
  getExchangeDetail,
  listExchanges,
  rejectExchange,
  uploadExchangeInvoice,
} from "../../../services/coupang/order-service";
import { sendData, sendError } from "../../../services/shared/api-response";
import { COUPANG_ACTION_LABELS } from "../../coupang/action-labels";
import { COUPANG_EXCHANGES_MENU_KEY } from "../../coupang/constants";
import {
  buildExchangeInvoicePayload,
  buildExchangePayload,
} from "../../coupang/payloads";
import {
  asString,
  parseExchangeConfirmTargets,
  parseExchangeInvoiceTargets,
  parseExchangeRejectTargets,
  parsePositiveInteger,
} from "../../coupang/parsers";
import {
  ensureStoreId,
  handleTrackedBatchAction,
  registerBatchRetryHandler,
} from "../../coupang/tracked-actions";

let retryHandlersRegistered = false;

export function registerCoupangExchangeRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerBatchRetryHandler({
    menuKey: COUPANG_EXCHANGES_MENU_KEY,
    actionKey: "confirm-exchange-inbound",
    targetType: "selection",
    parseItems: parseExchangeConfirmTargets,
    buildPayload: (storeId, items) => buildExchangePayload(storeId, "receive-confirmation", items),
    targetIds: (items) => items.map((item) => item.exchangeId),
    detailLabel: COUPANG_ACTION_LABELS.confirmExchangeInbound,
    validateItem: (item) => (item.exchangeId ? null : "exchangeId is required."),
    execute: confirmExchangeInbound,
  });

  registerBatchRetryHandler({
    menuKey: COUPANG_EXCHANGES_MENU_KEY,
    actionKey: "reject-exchange",
    targetType: "selection",
    parseItems: parseExchangeRejectTargets,
    buildPayload: (storeId, items) => buildExchangePayload(storeId, "reject", items),
    targetIds: (items) => items.map((item) => item.exchangeId),
    detailLabel: COUPANG_ACTION_LABELS.rejectExchange,
    validateItem: (item) => {
      if (!item.exchangeId) return "exchangeId is required.";
      if (!item.exchangeRejectCode) return "exchangeRejectCode is required.";
      return null;
    },
    execute: rejectExchange,
  });

  registerBatchRetryHandler({
    menuKey: COUPANG_EXCHANGES_MENU_KEY,
    actionKey: "upload-exchange-invoice",
    targetType: "selection",
    parseItems: parseExchangeInvoiceTargets,
    buildPayload: buildExchangeInvoicePayload,
    targetIds: (items) => items.map((item) => item.exchangeId),
    detailLabel: COUPANG_ACTION_LABELS.uploadExchangeInvoice,
    validateItem: (item) => {
      if (!item.exchangeId) return "exchangeId is required.";
      if (!item.shipmentBoxId) return "shipmentBoxId is required.";
      if (!item.goodsDeliveryCode) return "goodsDeliveryCode is required.";
      if (!item.invoiceNumber) return "invoiceNumber is required.";
      return null;
    },
    execute: uploadExchangeInvoice,
  });
}

export const listExchangesHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listExchanges({
        storeId,
        createdAtFrom:
          typeof req.query.createdAtFrom === "string" ? req.query.createdAtFrom : undefined,
        createdAtTo:
          typeof req.query.createdAtTo === "string" ? req.query.createdAtTo : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        orderId: typeof req.query.orderId === "string" ? req.query.orderId : undefined,
        maxPerPage: parsePositiveInteger(req.query.maxPerPage, 50),
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_EXCHANGES_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang exchanges.",
    });
  }
};

export const getExchangeDetailHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const exchangeId = typeof req.query.exchangeId === "string" ? req.query.exchangeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    if (!exchangeId) {
      sendError(res, 400, {
        code: "MISSING_EXCHANGE_ID",
        message: "exchangeId is required.",
      });
      return;
    }

    sendData(
      res,
      await getExchangeDetail({
        storeId,
        exchangeId,
        createdAtFrom:
          typeof req.query.createdAtFrom === "string" ? req.query.createdAtFrom : undefined,
        createdAtTo:
          typeof req.query.createdAtTo === "string" ? req.query.createdAtTo : undefined,
        orderId: typeof req.query.orderId === "string" ? req.query.orderId : undefined,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_EXCHANGE_DETAIL_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang exchange detail.",
    });
  }
};

export const confirmExchangeInboundHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseExchangeConfirmTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_EXCHANGES_MENU_KEY,
      actionKey: "confirm-exchange-inbound",
      targetType: "selection",
      targetIds: items.map((item) => item.exchangeId),
      requestPayload: buildExchangePayload(storeId, "receive-confirmation", items),
      detailLabel: COUPANG_ACTION_LABELS.confirmExchangeInbound,
      validateItem: (item) => (item.exchangeId ? null : "exchangeId is required."),
      execute: confirmExchangeInbound,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CONFIRM_EXCHANGE_INBOUND_FAILED",
      message: error instanceof Error ? error.message : "Failed to confirm exchange inbound.",
    });
  }
};

export const rejectExchangeHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseExchangeRejectTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_EXCHANGES_MENU_KEY,
      actionKey: "reject-exchange",
      targetType: "selection",
      targetIds: items.map((item) => item.exchangeId),
      requestPayload: buildExchangePayload(storeId, "reject", items),
      detailLabel: COUPANG_ACTION_LABELS.rejectExchange,
      validateItem: (item) => {
        if (!item.exchangeId) return "exchangeId is required.";
        if (!item.exchangeRejectCode) return "exchangeRejectCode is required.";
        return null;
      },
      execute: rejectExchange,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_REJECT_EXCHANGE_FAILED",
      message: error instanceof Error ? error.message : "Failed to reject exchange.",
    });
  }
};

export const uploadExchangeInvoiceHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseExchangeInvoiceTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_EXCHANGES_MENU_KEY,
      actionKey: "upload-exchange-invoice",
      targetType: "selection",
      targetIds: items.map((item) => item.exchangeId),
      requestPayload: buildExchangeInvoicePayload(storeId, items),
      detailLabel: COUPANG_ACTION_LABELS.uploadExchangeInvoice,
      validateItem: (item) => {
        if (!item.exchangeId) return "exchangeId is required.";
        if (!item.shipmentBoxId) return "shipmentBoxId is required.";
        if (!item.goodsDeliveryCode) return "goodsDeliveryCode is required.";
        if (!item.invoiceNumber) return "invoiceNumber is required.";
        return null;
      },
      execute: uploadExchangeInvoice,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_UPLOAD_EXCHANGE_INVOICE_FAILED",
      message: error instanceof Error ? error.message : "Failed to upload exchange invoice.",
    });
  }
};
