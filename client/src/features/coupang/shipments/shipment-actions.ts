import {
  COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE,
  isCoupangInvoiceAlreadyProcessedResult,
  type CoupangActionItemResult,
  type CoupangBatchActionResponse,
  type CoupangInvoiceTarget,
  type CoupangShipmentWorksheetRow,
  type PatchCoupangShipmentWorksheetItemInput,
} from "@shared/coupang";
import { resolveCoupangInvoiceTransmissionBlockReason } from "@shared/coupang-invoice";
import { isSameInvoicePayload, normalizeInvoiceField } from "@/lib/coupang-shipment-quick-filters";

export type InvoiceTransmissionMode = "upload" | "update";

export function buildWorksheetPatchItem(
  row: CoupangShipmentWorksheetRow,
  overrides: Partial<PatchCoupangShipmentWorksheetItemInput> = {},
): PatchCoupangShipmentWorksheetItemInput {
  return {
    sourceKey: row.sourceKey,
    selpickOrderNumber: row.selpickOrderNumber,
    receiverName: row.receiverName,
    receiverBaseName: row.receiverBaseName,
    personalClearanceCode: row.personalClearanceCode,
    deliveryCompanyCode: row.deliveryCompanyCode,
    invoiceNumber: row.invoiceNumber,
    deliveryRequest: row.deliveryRequest,
    invoiceTransmissionStatus: row.invoiceTransmissionStatus,
    invoiceTransmissionMessage: row.invoiceTransmissionMessage,
    invoiceTransmissionAt: row.invoiceTransmissionAt,
    exportedAt: row.exportedAt,
    invoiceAppliedAt: row.invoiceAppliedAt,
    ...overrides,
  };
}

export function buildInvoiceIdentity(
  shipmentBoxId: string | null | undefined,
  orderId: string | null | undefined,
  vendorItemId: string | null | undefined,
) {
  return `${shipmentBoxId ?? ""}|${orderId ?? ""}|${vendorItemId ?? ""}`;
}

export function normalizeInvoiceTransmissionGroupField(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized && normalized !== "-" ? normalized : null;
}

export function buildInvoiceTransmissionGroupKey(input: {
  shipmentBoxId: string | null | undefined;
  productOrderNumber?: string | null | undefined;
  orderId?: string | null | undefined;
}) {
  const shipmentBoxId = normalizeInvoiceTransmissionGroupField(input.shipmentBoxId);
  const productOrderNumber =
    normalizeInvoiceTransmissionGroupField(input.productOrderNumber) ??
    normalizeInvoiceTransmissionGroupField(input.orderId);
  return `${shipmentBoxId ?? ""}|${productOrderNumber ?? ""}`;
}

export function buildInvoiceTransmissionPayloadSignature(row: CoupangShipmentWorksheetRow) {
  return [
    normalizeInvoiceTransmissionGroupField(row.deliveryCompanyCode),
    normalizeInvoiceTransmissionGroupField(row.invoiceNumber),
    normalizeInvoiceTransmissionGroupField(row.estimatedShippingDate),
    row.splitShipping ? "split" : "single",
  ].join("|");
}

export function buildInvoiceTransmissionGroupLabel(row: CoupangShipmentWorksheetRow) {
  return (
    normalizeInvoiceTransmissionGroupField(row.productOrderNumber) ??
    normalizeInvoiceTransmissionGroupField(row.orderId) ??
    row.selpickOrderNumber
  );
}

export function formatInvoicePayloadText(values: {
  deliveryCompanyCode: string | null | undefined;
  invoiceNumber: string | null | undefined;
}) {
  const parts = [
    normalizeInvoiceField(values.deliveryCompanyCode),
    normalizeInvoiceField(values.invoiceNumber),
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

export function hasSuccessfulInvoiceTransmission(row: CoupangShipmentWorksheetRow | null | undefined) {
  return Boolean(
    row &&
      (row.invoiceTransmissionStatus === "succeeded" ||
        row.invoiceAppliedAt ||
        isCoupangInvoiceAlreadyProcessedResult({
          message: row.invoiceTransmissionMessage,
        })),
  );
}

export function shouldPreserveSucceededInvoiceState(
  row: CoupangShipmentWorksheetRow,
  previousRow: CoupangShipmentWorksheetRow | null | undefined,
) {
  return Boolean(
    previousRow && hasSuccessfulInvoiceTransmission(previousRow) && isSameInvoicePayload(row, previousRow),
  );
}

export function resolveRepeatedInvoiceMessage(previousRow: CoupangShipmentWorksheetRow | null | undefined) {
  return previousRow?.invoiceTransmissionMessage ?? COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE;
}

export function buildResultSummary(result: CoupangBatchActionResponse) {
  return `성공 ${result.summary.succeededCount}건 / 실패 ${result.summary.failedCount}건 / 경고 ${result.summary.warningCount}건 / 건너뜀 ${result.summary.skippedCount}건`;
}

export function summarizeBatchActionItems(items: CoupangActionItemResult[]) {
  return {
    total: items.length,
    succeededCount: items.filter((item) => item.status === "succeeded").length,
    failedCount: items.filter((item) => item.status === "failed").length,
    warningCount: items.filter((item) => item.status === "warning").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
  };
}

export function buildFailureDetails(result: CoupangBatchActionResponse) {
  return result.items
    .filter((item) => item.status !== "succeeded")
    .slice(0, 8)
    .map((item) => `${item.targetId}: ${item.message}`);
}

export function combineBatchResults(results: CoupangBatchActionResponse[]): CoupangBatchActionResponse {
  const items = results.flatMap((result) => result.items);

  return {
    items,
    summary: summarizeBatchActionItems(items),
    completedAt: new Date().toISOString(),
  };
}

export function normalizeRepeatedInvoiceBatchResult(
  result: CoupangBatchActionResponse,
  rowByInvoiceIdentity: Map<string, CoupangShipmentWorksheetRow>,
  previousRowBySourceKey: Map<string, CoupangShipmentWorksheetRow>,
) {
  let changed = false;
  const items = result.items.map((item) => {
    if (item.status === "succeeded") {
      return item;
    }

    const alreadyProcessed = isCoupangInvoiceAlreadyProcessedResult({
      resultCode: item.resultCode,
      message: item.message,
    });

    const row = rowByInvoiceIdentity.get(
      buildInvoiceIdentity(item.shipmentBoxId, item.orderId, item.vendorItemId),
    );
    if (!row) {
      if (!alreadyProcessed) {
        return item;
      }

      changed = true;
      return {
        ...item,
        status: "succeeded" as const,
        retryRequired: false,
        message: COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE,
        appliedAt: item.appliedAt ?? result.completedAt,
      };
    }

    const previousRow = previousRowBySourceKey.get(row.sourceKey);
    if (!alreadyProcessed && !shouldPreserveSucceededInvoiceState(row, previousRow)) {
      return item;
    }

    changed = true;
    return {
      ...item,
      status: "succeeded" as const,
      retryRequired: false,
      message: alreadyProcessed
        ? COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE
        : resolveRepeatedInvoiceMessage(previousRow),
      appliedAt: previousRow?.invoiceAppliedAt ?? item.appliedAt ?? result.completedAt,
    };
  });

  if (!changed) {
    return result;
  }

  return {
    ...result,
    items,
    summary: summarizeBatchActionItems(items),
  };
}

export function validateInvoiceRow(row: CoupangShipmentWorksheetRow) {
  if (!row.shipmentBoxId) {
    return "shipmentBoxId가 없습니다.";
  }
  if (!row.orderId) {
    return "orderId가 없습니다.";
  }
  if (!row.vendorItemId) {
    return "vendorItemId가 없습니다.";
  }
  if (!row.deliveryCompanyCode.trim()) {
    return "택배사를 입력해 주세요.";
  }
  if (!row.invoiceNumber.trim()) {
    return "송장번호를 입력해 주세요.";
  }

  const blockedReason = resolveCoupangInvoiceTransmissionBlockReason({
    deliveryCompanyCode: row.deliveryCompanyCode,
    invoiceNumber: row.invoiceNumber,
    storeName: row.storeName,
  });
  if (blockedReason) {
    return blockedReason;
  }

  return null;
}

export function resolveInvoiceTransmissionMode(row: CoupangShipmentWorksheetRow): InvoiceTransmissionMode | null {
  if (row.availableActions.includes("updateInvoice")) {
    return "update";
  }
  if (row.availableActions.includes("uploadInvoice")) {
    return "upload";
  }
  return null;
}

export function toInvoiceTarget(row: CoupangShipmentWorksheetRow): CoupangInvoiceTarget {
  return {
    shipmentBoxId: row.shipmentBoxId,
    orderId: row.orderId,
    vendorItemId: row.vendorItemId ?? "",
    deliveryCompanyCode: row.deliveryCompanyCode.trim(),
    invoiceNumber: row.invoiceNumber.trim(),
    estimatedShippingDate: row.estimatedShippingDate ?? undefined,
    splitShipping: Boolean(row.splitShipping),
    preSplitShipped: false,
    productName: row.exposedProductName,
  };
}

