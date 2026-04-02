import type { RequestHandler } from "express";
import {
  collectShipmentWorksheet,
  getShipmentWorksheet,
  getShipmentWorksheetDetail,
  patchShipmentWorksheet,
} from "../../../services/coupang/shipment-worksheet-service";
import {
  updateInvoice,
  uploadInvoice,
} from "../../../services/coupang/order-service";
import { sendData, sendError } from "../../../services/shared/api-response";
import { COUPANG_ACTION_LABELS } from "../../coupang/action-labels";
import { COUPANG_SHIPMENTS_MENU_KEY } from "../../coupang/constants";
import { buildInvoicePayload } from "../../coupang/payloads";
import {
  asString,
  parseCollectShipmentInput,
  parseInvoiceTargets,
  parseShipmentWorksheetPatchInput,
} from "../../coupang/parsers";
import {
  ensureStoreId,
  handleTrackedBatchAction,
  registerBatchRetryHandler,
} from "../../coupang/tracked-actions";

let retryHandlersRegistered = false;

function validateInvoiceTarget(item: {
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  deliveryCompanyCode: string;
  invoiceNumber: string;
}) {
  if (!item.shipmentBoxId) return "shipmentBoxId is required.";
  if (!item.orderId) return "orderId is required.";
  if (!item.vendorItemId) return "vendorItemId is required.";
  if (!item.deliveryCompanyCode) return "deliveryCompanyCode is required.";
  if (!item.invoiceNumber) return "invoiceNumber is required.";
  return null;
}

export function registerCoupangShipmentRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerBatchRetryHandler({
    menuKey: COUPANG_SHIPMENTS_MENU_KEY,
    actionKey: "upload-invoice",
    targetType: "selection",
    parseItems: parseInvoiceTargets,
    buildPayload: (storeId, items) => buildInvoicePayload(storeId, "upload", items),
    targetIds: (items) => items.map((item) => item.shipmentBoxId),
    detailLabel: COUPANG_ACTION_LABELS.uploadInvoice,
    validateItem: validateInvoiceTarget,
    execute: uploadInvoice,
  });

  registerBatchRetryHandler({
    menuKey: COUPANG_SHIPMENTS_MENU_KEY,
    actionKey: "update-invoice",
    targetType: "selection",
    parseItems: parseInvoiceTargets,
    buildPayload: (storeId, items) => buildInvoicePayload(storeId, "update", items),
    targetIds: (items) => items.map((item) => item.shipmentBoxId),
    detailLabel: COUPANG_ACTION_LABELS.updateInvoice,
    validateItem: validateInvoiceTarget,
    execute: updateInvoice,
  });
}

export const getShipmentWorksheetHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(res, await getShipmentWorksheet(storeId));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SHIPMENT_WORKSHEET_READ_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang shipment worksheet.",
    });
  }
};

export const getShipmentWorksheetDetailHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await getShipmentWorksheetDetail({
        storeId,
        shipmentBoxId:
          typeof req.query.shipmentBoxId === "string" ? req.query.shipmentBoxId : undefined,
        orderId: typeof req.query.orderId === "string" ? req.query.orderId : undefined,
        vendorItemId:
          typeof req.query.vendorItemId === "string" ? req.query.vendorItemId : undefined,
        sellerProductId:
          typeof req.query.sellerProductId === "string" ? req.query.sellerProductId : undefined,
        orderedAtRaw:
          typeof req.query.orderedAtRaw === "string" ? req.query.orderedAtRaw : undefined,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SHIPMENT_WORKSHEET_DETAIL_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Failed to load Coupang shipment worksheet detail.",
    });
  }
};

export const collectShipmentWorksheetHandler: RequestHandler = async (req, res) => {
  try {
    const input = parseCollectShipmentInput(req.body);
    if (!ensureStoreId(res, input.storeId)) {
      return;
    }

    sendData(res, await collectShipmentWorksheet(input));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SHIPMENT_COLLECT_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to collect Coupang shipment worksheet.",
    });
  }
};

export const patchShipmentWorksheetHandler: RequestHandler = async (req, res) => {
  try {
    const input = parseShipmentWorksheetPatchInput(req.body);
    if (!ensureStoreId(res, input.storeId)) {
      return;
    }

    sendData(res, await patchShipmentWorksheet(input));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SHIPMENT_WORKSHEET_PATCH_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to update Coupang shipment worksheet.",
    });
  }
};

export const uploadInvoiceHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseInvoiceTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_SHIPMENTS_MENU_KEY,
      actionKey: "upload-invoice",
      targetType: "selection",
      targetIds: items.map((item) => item.shipmentBoxId),
      requestPayload: buildInvoicePayload(storeId, "upload", items),
      detailLabel: COUPANG_ACTION_LABELS.uploadInvoice,
      validateItem: validateInvoiceTarget,
      execute: uploadInvoice,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_UPLOAD_INVOICE_FAILED",
      message: error instanceof Error ? error.message : "Failed to upload Coupang invoice.",
    });
  }
};

export const updateInvoiceHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseInvoiceTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_SHIPMENTS_MENU_KEY,
      actionKey: "update-invoice",
      targetType: "selection",
      targetIds: items.map((item) => item.shipmentBoxId),
      requestPayload: buildInvoicePayload(storeId, "update", items),
      detailLabel: COUPANG_ACTION_LABELS.updateInvoice,
      validateItem: validateInvoiceTarget,
      execute: updateInvoice,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_UPDATE_INVOICE_FAILED",
      message: error instanceof Error ? error.message : "Failed to update Coupang invoice.",
    });
  }
};
