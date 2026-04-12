import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import { buildShipmentQuickFilterResult } from "@/lib/coupang-shipment-quick-filters";
import {
  buildFulfillmentDecisionCounts,
  matchesFulfillmentDecisionFilter,
} from "./fulfillment-decision";
import type {
  FilterState,
  FulfillmentDecisionFilterValue,
  FulfillmentDecisionStatus,
} from "./types";

export type QuickCollectFocusState = {
  active: boolean;
  sourceKeys: string[];
  rows: CoupangShipmentWorksheetRow[];
  filterSignature: string;
};

type QuickCollectFocusSignatureInput = Pick<
  FilterState,
  | "selectedStoreId"
  | "createdAtFrom"
  | "createdAtTo"
  | "query"
  | "scope"
  | "decisionStatus"
  | "invoiceStatusCard"
  | "orderStatusCard"
  | "outputStatusCard"
>;

type ResolveQuickCollectFocusRowsInput = {
  rows: readonly CoupangShipmentWorksheetRow[];
  sourceKeys: readonly string[];
  decisionStatus: FulfillmentDecisionFilterValue;
  page: number;
  pageSize: number;
};

export type QuickCollectFocusRowsResult = {
  focusedRows: CoupangShipmentWorksheetRow[];
  pageRows: CoupangShipmentWorksheetRow[];
  visibleRows: CoupangShipmentWorksheetRow[];
  totalPages: number;
  page: number;
  decisionCounts: Record<"all" | FulfillmentDecisionStatus, number>;
  invoiceReadyCount: number;
  invoiceCounts: ReturnType<typeof buildShipmentQuickFilterResult>["invoiceCounts"];
  orderCounts: ReturnType<typeof buildShipmentQuickFilterResult>["orderCounts"];
  outputCounts: ReturnType<typeof buildShipmentQuickFilterResult>["outputCounts"];
};

export function buildQuickCollectFocusSignature(input: QuickCollectFocusSignatureInput) {
  return JSON.stringify({
    selectedStoreId: input.selectedStoreId,
    createdAtFrom: input.createdAtFrom,
    createdAtTo: input.createdAtTo,
    query: input.query.trim(),
    scope: input.scope,
    decisionStatus: input.decisionStatus,
    invoiceStatusCard: input.invoiceStatusCard,
    orderStatusCard: input.orderStatusCard,
    outputStatusCard: input.outputStatusCard,
  });
}

export function resolveQuickCollectFocusRows(
  input: ResolveQuickCollectFocusRowsInput,
): QuickCollectFocusRowsResult {
  const focusedSourceKeys = new Set(input.sourceKeys);
  const focusedRows = input.rows.filter((row) => focusedSourceKeys.has(row.sourceKey));
  const normalizedPageSize = Math.max(1, Math.floor(input.pageSize) || 1);
  const totalPages = Math.max(1, Math.ceil(focusedRows.length / normalizedPageSize));
  const page = Math.min(Math.max(1, Math.floor(input.page) || 1), totalPages);
  const pageRows = focusedRows.slice((page - 1) * normalizedPageSize, page * normalizedPageSize);
  const visibleRows = pageRows.filter((row) =>
    matchesFulfillmentDecisionFilter(row, input.decisionStatus),
  );
  const quickFilterResult = buildShipmentQuickFilterResult(focusedRows, {
    invoiceStatusCard: "all",
    orderStatusCard: "all",
    outputStatusCard: "all",
  });

  return {
    focusedRows,
    pageRows,
    visibleRows,
    totalPages,
    page,
    decisionCounts: buildFulfillmentDecisionCounts(pageRows),
    invoiceReadyCount: quickFilterResult.invoiceReadyRows.length,
    invoiceCounts: quickFilterResult.invoiceCounts,
    orderCounts: quickFilterResult.orderCounts,
    outputCounts: quickFilterResult.outputCounts,
  };
}
