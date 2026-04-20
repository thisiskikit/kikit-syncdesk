import type {
  CoupangShipmentIssueFilter,
  CoupangShipmentWorksheetPipelineCardFilter,
  CoupangShipmentWorksheetPriorityCardFilter,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";
import {
  buildCoupangShipmentStatusSnapshot,
  isCoupangShipmentDirectDelivery,
  isCoupangShipmentStaleSync,
  resolveCoupangShipmentIssueStage,
} from "@shared/coupang-status";
import {
  buildCoupangShipmentDecisionPreviewGroups,
  type CoupangFulfillmentDecisionCounts,
} from "@shared/coupang-fulfillment";
import { buildShipmentQuickFilterResult } from "@/lib/coupang-shipment-quick-filters";
import {
  buildFulfillmentDecisionCounts,
  matchesFulfillmentDecisionFilter,
} from "./fulfillment-decision";
import type {
  FilterState,
  FulfillmentDecisionFilterValue,
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
  | "priorityCard"
  | "pipelineCard"
  | "issueFilter"
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
  decisionCounts: CoupangFulfillmentDecisionCounts;
  decisionPreviewGroups: ReturnType<typeof buildCoupangShipmentDecisionPreviewGroups>;
  invoiceReadyCount: number;
  invoiceCounts: ReturnType<typeof buildShipmentQuickFilterResult>["invoiceCounts"];
  orderCounts: ReturnType<typeof buildShipmentQuickFilterResult>["orderCounts"];
  outputCounts: ReturnType<typeof buildShipmentQuickFilterResult>["outputCounts"];
  priorityCounts: Record<CoupangShipmentWorksheetPriorityCardFilter, number>;
  pipelineCounts: Record<CoupangShipmentWorksheetPipelineCardFilter, number>;
  issueCounts: Record<CoupangShipmentIssueFilter, number>;
  directDeliveryCount: number;
  staleSyncCount: number;
};

const PRIORITY_CARD_KEYS = [
  "all",
  "shipment_stop_requested",
  "same_day_dispatch",
  "dispatch_delayed",
  "long_in_transit",
] as const satisfies readonly CoupangShipmentWorksheetPriorityCardFilter[];

const PIPELINE_CARD_KEYS = [
  "all",
  "payment_completed",
  "preparing_product",
  "shipping_instruction",
  "in_delivery",
  "delivered",
] as const satisfies readonly CoupangShipmentWorksheetPipelineCardFilter[];

const ISSUE_FILTER_KEYS = [
  "all",
  "shipment_stop_requested",
  "shipment_stop_resolved",
  "cancel",
  "return",
  "exchange",
  "cs_open",
  "direct_delivery",
] as const satisfies readonly CoupangShipmentIssueFilter[];

function createCountRecord<TKey extends string>(keys: readonly TKey[]) {
  return keys.reduce<Record<TKey, number>>((current, key) => {
    current[key] = 0;
    return current;
  }, {} as Record<TKey, number>);
}

function countPriorityCards(rows: readonly CoupangShipmentWorksheetRow[]) {
  const counts = createCountRecord(PRIORITY_CARD_KEYS);
  counts.all = rows.length;

  for (const row of rows) {
    const priorityCard = buildCoupangShipmentStatusSnapshot(row).priorityBucket;
    if (priorityCard) {
      counts[priorityCard] += 1;
    }
  }

  return counts;
}

function countPipelineCards(rows: readonly CoupangShipmentWorksheetRow[]) {
  const counts = createCountRecord(PIPELINE_CARD_KEYS);
  counts.all = rows.length;

  for (const row of rows) {
    const pipelineCard = buildCoupangShipmentStatusSnapshot(row).pipelineBucket;
    if (pipelineCard) {
      counts[pipelineCard] += 1;
    }
  }

  return counts;
}

function countIssueFilters(rows: readonly CoupangShipmentWorksheetRow[]) {
  const counts = createCountRecord(ISSUE_FILTER_KEYS);
  counts.all = rows.length;

  for (const row of rows) {
    const issueStage = resolveCoupangShipmentIssueStage(row);
    if (issueStage !== "none") {
      counts[issueStage] += 1;
    }
    if (isCoupangShipmentDirectDelivery(row)) {
      counts.direct_delivery += 1;
    }
  }

  return counts;
}

export function buildQuickCollectFocusSignature(input: QuickCollectFocusSignatureInput) {
  return JSON.stringify({
    selectedStoreId: input.selectedStoreId,
    createdAtFrom: input.createdAtFrom,
    createdAtTo: input.createdAtTo,
    query: input.query.trim(),
    scope: input.scope,
    decisionStatus: input.decisionStatus,
    priorityCard: input.priorityCard,
    pipelineCard: input.pipelineCard,
    issueFilter: input.issueFilter,
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
    decisionCounts: buildFulfillmentDecisionCounts(focusedRows),
    decisionPreviewGroups: buildCoupangShipmentDecisionPreviewGroups(focusedRows),
    invoiceReadyCount: quickFilterResult.invoiceReadyRows.length,
    invoiceCounts: quickFilterResult.invoiceCounts,
    orderCounts: quickFilterResult.orderCounts,
    outputCounts: quickFilterResult.outputCounts,
    priorityCounts: countPriorityCards(focusedRows),
    pipelineCounts: countPipelineCards(focusedRows),
    issueCounts: countIssueFilters(focusedRows),
    directDeliveryCount: focusedRows.filter((row) => isCoupangShipmentDirectDelivery(row)).length,
    staleSyncCount: focusedRows.filter((row) => isCoupangShipmentStaleSync(row)).length,
  };
}
