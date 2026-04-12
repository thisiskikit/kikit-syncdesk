import type { RequestHandler } from "express";
import type { CollectCoupangShipmentInput } from "@shared/coupang";
import {
  applyShipmentWorksheetInvoiceInput,
  auditShipmentWorksheetMissing,
  collectShipmentWorksheet,
  getShipmentWorksheet,
  getShipmentWorksheetView,
  getShipmentWorksheetDetail,
  patchShipmentWorksheet,
  resolveShipmentWorksheetBulkRows,
} from "../../../services/coupang/shipment-worksheet-service";
import {
  updateInvoice,
  uploadInvoice,
} from "../../../services/coupang/order-service";
import { sendData, sendError } from "../../../services/shared/api-response";
import { runTrackedOperation, summarizeResult } from "../../../services/operations/service";
import { COUPANG_ACTION_LABELS } from "../../coupang/action-labels";
import { COUPANG_SHIPMENTS_MENU_KEY } from "../../coupang/constants";
import { buildInvoicePayload } from "../../coupang/payloads";
import {
  asString,
  parseCollectShipmentInput,
  parseInvoiceTargets,
  parseShipmentWorksheetAuditMissingInput,
  parseShipmentWorksheetBulkResolveRequest,
  parseShipmentWorksheetInvoiceInputApplyRequest,
  parseShipmentWorksheetPatchInput,
  parseShipmentWorksheetViewQuery,
} from "../../coupang/parsers";
import {
  ensureStoreId,
  handleTrackedBatchAction,
  registerBatchRetryHandler,
} from "../../coupang/tracked-actions";

let retryHandlersRegistered = false;

function resolveCollectModeLabel(syncMode: CollectCoupangShipmentInput["syncMode"] | undefined) {
  return syncMode === "full"
    ? "전체 재동기화"
    : syncMode === "incremental"
      ? "전체 재수집"
      : "빠른 수집";
}

function buildCollectResultSummary(
  response: Awaited<ReturnType<typeof collectShipmentWorksheet>>,
) {
  const modeLabel = resolveCollectModeLabel(response.syncSummary?.mode);
  const headline =
    response.syncSummary?.mode === "new_only"
      ? `${modeLabel} 신규 ${response.syncSummary.insertedCount}건 추가`
      : response.syncSummary
        ? `${modeLabel} ${response.syncSummary.insertedCount}건 추가 / ${response.syncSummary.updatedCount}건 갱신`
        : `${modeLabel} ${response.items.length}건 반영`;

  return summarizeResult({
    headline,
    detail: response.message,
    stats: response.syncSummary
      ? {
          mode: response.syncSummary.mode,
          fetchedCount: response.syncSummary.fetchedCount,
          insertedCount: response.syncSummary.insertedCount,
          updatedCount: response.syncSummary.updatedCount,
          skippedHydrationCount: response.syncSummary.skippedHydrationCount,
          autoExpanded: response.syncSummary.autoExpanded,
          source: response.source,
        }
      : {
          rowCount: response.items.length,
          source: response.source,
        },
    preview: response.message ?? headline,
  });
}

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

export const getShipmentWorksheetViewHandler: RequestHandler = async (req, res) => {
  try {
    const input = parseShipmentWorksheetViewQuery(req.query);
    if (!ensureStoreId(res, input.storeId)) {
      return;
    }

    sendData(res, await getShipmentWorksheetView(input));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SHIPMENT_WORKSHEET_VIEW_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang shipment worksheet view.",
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
    const normalizedPayload = { ...input } as Record<string, unknown>;
    const requestPayload =
      req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : null;

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_SHIPMENTS_MENU_KEY,
      actionKey: "collect-worksheet",
      mode: "foreground",
      targetType: "store",
      targetCount: 1,
      targetIds: [input.storeId],
      requestPayload,
      normalizedPayload,
      retryable: false,
      execute: async () => {
        const data = await collectShipmentWorksheet(input);

        return {
          data,
          status: data.source === "fallback" || Boolean(data.message) ? "warning" : "success",
          normalizedPayload,
          resultSummary: buildCollectResultSummary(data),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
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

export const applyShipmentWorksheetInvoiceInputHandler: RequestHandler = async (req, res) => {
  try {
    const input = parseShipmentWorksheetInvoiceInputApplyRequest(req.body);
    if (!ensureStoreId(res, input.storeId)) {
      return;
    }

    sendData(res, await applyShipmentWorksheetInvoiceInput(input));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SHIPMENT_WORKSHEET_INVOICE_INPUT_APPLY_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Failed to apply Coupang shipment worksheet invoice input.",
    });
  }
};

export const auditShipmentWorksheetMissingHandler: RequestHandler = async (req, res) => {
  try {
    const input = parseShipmentWorksheetAuditMissingInput(req.body);
    if (!ensureStoreId(res, input.storeId)) {
      return;
    }

    sendData(res, await auditShipmentWorksheetMissing(input));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SHIPMENT_WORKSHEET_AUDIT_MISSING_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Failed to audit missing Coupang shipment worksheet rows.",
    });
  }
};

export const resolveShipmentWorksheetBulkRowsHandler: RequestHandler = async (req, res) => {
  try {
    const input = parseShipmentWorksheetBulkResolveRequest(req.body);
    if (!ensureStoreId(res, input.storeId)) {
      return;
    }

    sendData(
      res,
      await resolveShipmentWorksheetBulkRows({
        storeId: input.storeId,
        viewQuery: input.viewQuery,
        mode: input.mode,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SHIPMENT_WORKSHEET_RESOLVE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Failed to resolve Coupang shipment worksheet bulk rows.",
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
