import {
  type CoupangShipmentArchiveReason,
  type CoupangShipmentWorksheetAuditHiddenReason,
  isCoupangInvoiceAlreadyProcessedResult,
  type CoupangCustomerServiceIssueBreakdownItem,
  type CoupangShipmentIssueFilter,
  type CoupangShipmentWorksheetBulkResolveMode,
  type CoupangShipmentWorksheetDatasetMode,
  type CoupangShipmentWorksheetBulkResolveResponse,
  type CoupangShipmentWorksheetInvoiceStatusCard,
  type CoupangShipmentWorksheetOrderStatusCard,
  type CoupangShipmentWorksheetOutputStatusCard,
  type CoupangShipmentWorksheetPipelineCardFilter,
  type CoupangShipmentWorksheetPriorityCardFilter,
  type CoupangShipmentWorksheetRow,
  type CoupangShipmentWorksheetSortField,
  type CoupangShipmentWorksheetViewQuery,
  type CoupangShipmentWorksheetViewResponse,
  type CoupangShipmentWorksheetViewScope,
} from "@shared/coupang";
import {
  buildCoupangShipmentStatusSnapshot,
  isCoupangShipmentDirectDelivery,
  isCoupangShipmentStaleSync,
  matchesCoupangShipmentIssueFilter,
  matchesCoupangShipmentPipelineCard,
  matchesCoupangShipmentPriorityCard,
  resolveCoupangShipmentIssueStage,
} from "@shared/coupang-status";
import {
  buildCoupangFulfillmentDecisionCounts,
  buildCoupangShipmentDecisionPreviewGroups,
  buildCoupangShipmentRowSummary,
  matchesCoupangFulfillmentDecisionFilter,
} from "@shared/coupang-fulfillment";
import { resolveCoupangInvoiceTransmissionBlockReason } from "@shared/coupang-invoice";

type WorksheetViewCounts = Pick<
  CoupangShipmentWorksheetViewResponse,
  | "datasetMode"
  | "scopeCounts"
  | "invoiceCounts"
  | "orderCounts"
  | "outputCounts"
  | "invoiceReadyCount"
  | "decisionCounts"
  | "decisionPreviewGroups"
  | "priorityCounts"
  | "pipelineCounts"
  | "issueCounts"
  | "missingInCoupangCount"
  | "exceptionCounts"
  | "directDeliveryCount"
  | "staleSyncCount"
  | "scopeRowCount"
  | "filteredRowCount"
  | "mirrorTotalRowCount"
  | "mirrorFilteredRowCount"
  | "activeTotalRowCount"
  | "activeFilteredRowCount"
  | "activeExclusionCounts"
  | "page"
  | "pageSize"
  | "totalPages"
  | "totalRowCount"
  | "scope"
> & {
  items: CoupangShipmentWorksheetRow[];
};

type WorksheetResolvedItems = Pick<
  CoupangShipmentWorksheetBulkResolveResponse,
  "items" | "blockedItems" | "matchedCount" | "resolvedCount"
>;

type NormalizedQuery = Omit<
  Required<Omit<CoupangShipmentWorksheetViewQuery, "sortField" | "createdAtFrom" | "createdAtTo">>,
  "storeId"
> & {
  storeId: string;
  datasetMode: CoupangShipmentWorksheetDatasetMode;
  createdAtFrom: string | null;
  createdAtTo: string | null;
  sortField: CoupangShipmentWorksheetSortField | null;
};

const DEFAULT_SCOPE: CoupangShipmentWorksheetViewScope = "all";
const DEFAULT_DATASET_MODE: CoupangShipmentWorksheetDatasetMode = "active";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_DECISION_STATUS = "all";
const DEFAULT_PRIORITY_CARD: CoupangShipmentWorksheetPriorityCardFilter = "all";
const DEFAULT_PIPELINE_CARD: CoupangShipmentWorksheetPipelineCardFilter = "all";
const DEFAULT_ISSUE_FILTER: CoupangShipmentIssueFilter = "all";
const DEFAULT_INVOICE_STATUS_CARD: CoupangShipmentWorksheetInvoiceStatusCard = "all";
const DEFAULT_ORDER_STATUS_CARD: CoupangShipmentWorksheetOrderStatusCard = "all";
const DEFAULT_OUTPUT_STATUS_CARD: CoupangShipmentWorksheetOutputStatusCard = "all";

const VIEW_SCOPES = [
  "dispatch_active",
  "post_dispatch",
  "confirmed",
  "claims",
  "all",
] as const satisfies readonly CoupangShipmentWorksheetViewScope[];

const INVOICE_STATUS_KEYS = [
  "all",
  "idle",
  "ready",
  "pending",
  "failed",
  "applied",
] as const satisfies readonly CoupangShipmentWorksheetInvoiceStatusCard[];

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

const ORDER_STATUS_KEYS = [
  "all",
  "ACCEPT",
  "INSTRUCT",
  "DEPARTURE",
  "DELIVERING",
  "FINAL_DELIVERY",
  "NONE_TRACKING",
  "SHIPMENT_STOP_REQUESTED",
  "SHIPMENT_STOP_HANDLED",
  "CANCEL",
  "RETURN",
  "EXCHANGE",
] as const satisfies readonly CoupangShipmentWorksheetOrderStatusCard[];

const OUTPUT_STATUS_KEYS = [
  "all",
  "notExported",
  "exported",
] as const satisfies readonly CoupangShipmentWorksheetOutputStatusCard[];

const ACTIVE_EXCLUSION_REASON_KEYS = [
  "retention_post_dispatch",
  "cancel_completed",
  "return_completed",
  "not_found_in_coupang",
] as const satisfies readonly CoupangShipmentArchiveReason[];

const DISPATCH_ACTIVE_STATUSES = new Set(["ACCEPT", "INSTRUCT"]);
const POST_DISPATCH_STATUSES = new Set([
  "DEPARTURE",
  "DELIVERING",
  "FINAL_DELIVERY",
  "NONE_TRACKING",
]);

const ISSUE_PRIORITY = [
  "shipment_stop_requested",
  "shipment_stop_handled",
  "cancel",
  "return",
  "exchange",
] as const satisfies readonly CoupangCustomerServiceIssueBreakdownItem["type"][];
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function createCountRecord<TKey extends string>(keys: readonly TKey[]) {
  return keys.reduce<Record<TKey, number>>((current, key) => {
    current[key] = 0;
    return current;
  }, {} as Record<TKey, number>);
}

function normalizeSummary(summary: string | null | undefined) {
  return (summary ?? "").trim().replaceAll("출고중지 처리됨", "출고중지완료");
}

function hasCustomerServiceIssue(
  row: Pick<
    CoupangShipmentWorksheetRow,
    "customerServiceIssueSummary" | "customerServiceIssueCount" | "customerServiceIssueBreakdown"
  >,
) {
  return Boolean(normalizeSummary(row.customerServiceIssueSummary)) ||
    (row.customerServiceIssueCount ?? 0) > 0 ||
    Boolean(row.customerServiceIssueBreakdown?.length);
}

export function hasShipmentWorksheetClaimIssue(
  row: Pick<
    CoupangShipmentWorksheetRow,
    "customerServiceIssueSummary" | "customerServiceIssueCount" | "customerServiceIssueBreakdown"
  >,
) {
  return hasCustomerServiceIssue(row);
}

function isMissingInCoupangRow(
  row: Pick<CoupangShipmentWorksheetRow, "missingInCoupang">,
) {
  return row.missingInCoupang === true;
}

function resolveDisplayOrderStatus(
  row: Pick<
    CoupangShipmentWorksheetRow,
    "orderStatus" | "customerServiceIssueSummary" | "customerServiceIssueBreakdown"
  >,
) {
  for (const type of ISSUE_PRIORITY) {
    if (row.customerServiceIssueBreakdown?.some((item) => item.type === type)) {
      switch (type) {
        case "shipment_stop_requested":
          return "SHIPMENT_STOP_REQUESTED";
        case "shipment_stop_handled":
          return "SHIPMENT_STOP_HANDLED";
        case "cancel":
          return "CANCEL";
        case "return":
          return "RETURN";
        case "exchange":
          return "EXCHANGE";
      }
    }
  }

  const normalizedSummary = normalizeSummary(row.customerServiceIssueSummary).toLowerCase();
  if (normalizedSummary.includes("출고중지 요청") || normalizedSummary.includes("shipment_stop_requested")) {
    return "SHIPMENT_STOP_REQUESTED";
  }
  if (normalizedSummary.includes("출고중지완료") || normalizedSummary.includes("shipment_stop_handled")) {
    return "SHIPMENT_STOP_HANDLED";
  }
  if (normalizedSummary.includes("취소") || normalizedSummary.includes("cancel")) {
    return "CANCEL";
  }
  if (normalizedSummary.includes("반품") || normalizedSummary.includes("return")) {
    return "RETURN";
  }
  if (normalizedSummary.includes("교환") || normalizedSummary.includes("exchange")) {
    return "EXCHANGE";
  }

  return (row.orderStatus ?? "").trim().toUpperCase() || null;
}

function hasInvoicePayload(
  row: Pick<CoupangShipmentWorksheetRow, "deliveryCompanyCode" | "invoiceNumber">,
) {
  return Boolean((row.deliveryCompanyCode ?? "").trim() && (row.invoiceNumber ?? "").trim());
}

function hasAppliedInvoiceTransmission(
  row: Pick<
    CoupangShipmentWorksheetRow,
    "invoiceTransmissionStatus" | "invoiceAppliedAt" | "invoiceTransmissionMessage"
  >,
) {
  return Boolean(
    row.invoiceTransmissionStatus === "succeeded" ||
      row.invoiceAppliedAt ||
      isCoupangInvoiceAlreadyProcessedResult({ message: row.invoiceTransmissionMessage }),
  );
}

function canSendInvoiceRow(row: CoupangShipmentWorksheetRow) {
  return (
    hasInvoicePayload(row) &&
    row.invoiceTransmissionStatus !== "pending" &&
    !hasAppliedInvoiceTransmission(row) &&
    !resolveCoupangInvoiceTransmissionBlockReason({
      deliveryCompanyCode: row.deliveryCompanyCode,
      invoiceNumber: row.invoiceNumber,
      storeName: row.storeName,
    }) &&
    !hasCustomerServiceIssue(row) &&
    (row.availableActions.includes("uploadInvoice") || row.availableActions.includes("updateInvoice"))
  );
}

function canMarkPreparingRow(row: CoupangShipmentWorksheetRow) {
  return row.availableActions.includes("markPreparing") && !hasCustomerServiceIssue(row);
}

export function getShipmentWorksheetBulkResolveTargetRows(
  filteredRows: readonly CoupangShipmentWorksheetRow[],
  mode: CoupangShipmentWorksheetBulkResolveMode,
) {
  if (mode === "prepare_ready") {
    return filteredRows.filter((row) => row.availableActions.includes("markPreparing"));
  }

  if (mode === "invoice_ready") {
    return filteredRows.filter(
      (row) =>
        hasInvoicePayload(row) &&
        row.invoiceTransmissionStatus !== "pending" &&
        !hasAppliedInvoiceTransmission(row),
    );
  }

  return filteredRows.filter((row) => !row.exportedAt);
}

function getInvoiceStatusCardKey(
  row: CoupangShipmentWorksheetRow,
): Exclude<CoupangShipmentWorksheetInvoiceStatusCard, "all"> {
  if (row.invoiceTransmissionStatus === "pending") {
    return "pending";
  }
  if (hasAppliedInvoiceTransmission(row)) {
    return "applied";
  }
  if (row.invoiceTransmissionStatus === "failed") {
    return "failed";
  }
  if (hasInvoicePayload(row)) {
    return "ready";
  }
  return "idle";
}

function getOrderStatusCardKey(
  row: Pick<
    CoupangShipmentWorksheetRow,
    "orderStatus" | "customerServiceIssueSummary" | "customerServiceIssueBreakdown"
  >,
): Exclude<CoupangShipmentWorksheetOrderStatusCard, "all"> | null {
  const normalized = (resolveDisplayOrderStatus(row) ?? "").trim().toUpperCase();
  return ORDER_STATUS_KEYS.includes(normalized as CoupangShipmentWorksheetOrderStatusCard)
    ? (normalized as Exclude<CoupangShipmentWorksheetOrderStatusCard, "all">)
    : null;
}

function getOutputStatusCardKey(
  row: Pick<CoupangShipmentWorksheetRow, "exportedAt">,
): Exclude<CoupangShipmentWorksheetOutputStatusCard, "all"> {
  return row.exportedAt ? "exported" : "notExported";
}

function matchesInvoiceStatusCard(
  row: CoupangShipmentWorksheetRow,
  card: CoupangShipmentWorksheetInvoiceStatusCard,
) {
  return card === "all" || getInvoiceStatusCardKey(row) === card;
}

function matchesPriorityCard(
  row: CoupangShipmentWorksheetRow,
  card: CoupangShipmentWorksheetPriorityCardFilter,
) {
  return matchesCoupangShipmentPriorityCard(row, card);
}

function matchesPipelineCard(
  row: CoupangShipmentWorksheetRow,
  card: CoupangShipmentWorksheetPipelineCardFilter,
) {
  return matchesCoupangShipmentPipelineCard(row, card);
}

function matchesIssueFilter(
  row: CoupangShipmentWorksheetRow,
  filter: CoupangShipmentIssueFilter,
) {
  return matchesCoupangShipmentIssueFilter(row, filter);
}

function matchesOrderStatusCard(
  row: Pick<
    CoupangShipmentWorksheetRow,
    "orderStatus" | "customerServiceIssueSummary" | "customerServiceIssueBreakdown"
  >,
  card: CoupangShipmentWorksheetOrderStatusCard,
) {
  return card === "all" || getOrderStatusCardKey(row) === card;
}

function matchesOutputStatusCard(
  row: Pick<CoupangShipmentWorksheetRow, "exportedAt">,
  card: CoupangShipmentWorksheetOutputStatusCard,
) {
  return card === "all" || getOutputStatusCardKey(row) === card;
}

function compareSortValues(
  left: string | number | boolean | null | undefined,
  right: string | number | boolean | null | undefined,
) {
  if (left === right) {
    return 0;
  }
  if (left === null || left === undefined || left === "") {
    return 1;
  }
  if (right === null || right === undefined || right === "") {
    return -1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }
  return String(left).localeCompare(String(right), "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
}

function extractRawSortFieldKey(sortField: CoupangShipmentWorksheetSortField | null) {
  if (!sortField || !sortField.startsWith("raw:")) {
    return null;
  }

  const rawKey = sortField.slice(4).trim();
  return rawKey || null;
}

function getSortValue(
  row: CoupangShipmentWorksheetRow,
  sortField: CoupangShipmentWorksheetSortField | null,
) {
  const rawSortFieldKey = extractRawSortFieldKey(sortField);
  if (rawSortFieldKey) {
    return row.rawFields?.[rawSortFieldKey] ?? null;
  }

  switch (sortField) {
    case "__exportStatus":
      return row.exportedAt ? 1 : 0;
    case "__invoiceTransmissionStatus":
      return getInvoiceStatusCardKey(row);
    case "__orderStatus": {
      const statusSnapshot = buildCoupangShipmentStatusSnapshot(row);
      return `${statusSnapshot.shippingStage ?? ""}:${statusSnapshot.issueStage ?? ""}:${
        statusSnapshot.statusDerivedAt ?? ""
      }`;
    }
    case "quantity":
      return row.quantity;
    case "salePrice":
      return row.salePrice;
    case "shippingFee":
      return row.shippingFee;
    case "orderDateText":
      return row.orderDateKey;
    default:
      return sortField
        ? (row[sortField as Exclude<typeof sortField, `raw:${string}`>] ?? null)
        : null;
  }
}

export function matchesShipmentWorksheetQuery(row: CoupangShipmentWorksheetRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    row.orderDateText,
    row.orderStatus,
    buildCoupangShipmentStatusSnapshot(row).rawOrderStatus,
    buildCoupangShipmentStatusSnapshot(row).shippingStage,
    buildCoupangShipmentStatusSnapshot(row).issueStage,
    buildCoupangShipmentStatusSnapshot(row).priorityBucket,
    buildCoupangShipmentStatusSnapshot(row).pipelineBucket,
    buildCoupangShipmentStatusSnapshot(row).syncSource,
    buildCoupangShipmentStatusSnapshot(row).statusMismatchReason,
    row.lastSeenOrderStatus,
    row.lastSeenIssueSummary,
    row.missingInCoupang ? "missing_in_coupang" : "",
    resolveDisplayOrderStatus(row),
    normalizeSummary(row.customerServiceIssueSummary),
    row.productName,
    row.optionName,
    row.productOrderNumber,
    row.ordererName,
    row.contact,
    row.receiverName,
    row.collectedAccountName,
    row.deliveryCompanyCode,
    row.selpickOrderNumber,
    row.invoiceNumber,
    row.receiverAddress,
    row.deliveryRequest,
    row.buyerPhoneNumber,
    row.productNumber,
    row.exposedProductName,
    row.productOptionNumber,
    row.sellerProductCode,
    row.orderId,
    row.shipmentBoxId,
    ...Object.values(row.rawFields ?? {}).map((value) =>
      value === null || value === undefined ? "" : String(value),
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function matchesScope(row: CoupangShipmentWorksheetRow, scope: CoupangShipmentWorksheetViewScope) {
  const status = (row.orderStatus ?? "").trim().toUpperCase();
  const hasClaim = hasCustomerServiceIssue(row);
  const isExported = Boolean(row.exportedAt);
  const isPurchaseConfirmed = Boolean(row.purchaseConfirmedAt);

  switch (scope) {
    case "dispatch_active":
      return !hasClaim && !isPurchaseConfirmed && (DISPATCH_ACTIVE_STATUSES.has(status) || !isExported);
    case "post_dispatch":
      return POST_DISPATCH_STATUSES.has(status) && !hasClaim && !isPurchaseConfirmed && isExported;
    case "confirmed":
      return isPurchaseConfirmed && !hasClaim;
    case "claims":
      return hasClaim;
    case "all":
    default:
      return true;
  }
}

export function isShipmentWorksheetPostDispatchRow(row: CoupangShipmentWorksheetRow) {
  return matchesScope(row, "post_dispatch");
}

function normalizeScope(value: string | null | undefined): CoupangShipmentWorksheetViewScope {
  return VIEW_SCOPES.includes(value as CoupangShipmentWorksheetViewScope)
    ? (value as CoupangShipmentWorksheetViewScope)
    : DEFAULT_SCOPE;
}

function normalizeDatasetMode(
  value: string | null | undefined,
): CoupangShipmentWorksheetDatasetMode {
  return value === "mirror" ? "mirror" : DEFAULT_DATASET_MODE;
}

function normalizePriorityCard(
  value: string | null | undefined,
): CoupangShipmentWorksheetPriorityCardFilter {
  return PRIORITY_CARD_KEYS.includes(value as CoupangShipmentWorksheetPriorityCardFilter)
    ? (value as CoupangShipmentWorksheetPriorityCardFilter)
    : DEFAULT_PRIORITY_CARD;
}

function normalizePipelineCard(
  value: string | null | undefined,
): CoupangShipmentWorksheetPipelineCardFilter {
  if (value === "ACCEPT") {
    return "payment_completed";
  }
  if (value === "INSTRUCT") {
    return "preparing_product";
  }
  if (value === "DEPARTURE") {
    return "shipping_instruction";
  }
  if (value === "DELIVERING" || value === "NONE_TRACKING") {
    return "in_delivery";
  }
  if (value === "FINAL_DELIVERY") {
    return "delivered";
  }

  return PIPELINE_CARD_KEYS.includes(value as CoupangShipmentWorksheetPipelineCardFilter)
    ? (value as CoupangShipmentWorksheetPipelineCardFilter)
    : DEFAULT_PIPELINE_CARD;
}

function normalizeIssueFilter(
  value: string | null | undefined,
): CoupangShipmentIssueFilter {
  if (value === "shipment_stop_handled") {
    return "shipment_stop_resolved";
  }

  return ISSUE_FILTER_KEYS.includes(value as CoupangShipmentIssueFilter)
    ? (value as CoupangShipmentIssueFilter)
    : DEFAULT_ISSUE_FILTER;
}

function normalizeInvoiceStatusCard(
  value: string | null | undefined,
): CoupangShipmentWorksheetInvoiceStatusCard {
  return INVOICE_STATUS_KEYS.includes(value as CoupangShipmentWorksheetInvoiceStatusCard)
    ? (value as CoupangShipmentWorksheetInvoiceStatusCard)
    : DEFAULT_INVOICE_STATUS_CARD;
}

function normalizeOrderStatusCard(
  value: string | null | undefined,
): CoupangShipmentWorksheetOrderStatusCard {
  return ORDER_STATUS_KEYS.includes(value as CoupangShipmentWorksheetOrderStatusCard)
    ? (value as CoupangShipmentWorksheetOrderStatusCard)
    : DEFAULT_ORDER_STATUS_CARD;
}

function normalizeOutputStatusCard(
  value: string | null | undefined,
): CoupangShipmentWorksheetOutputStatusCard {
  return OUTPUT_STATUS_KEYS.includes(value as CoupangShipmentWorksheetOutputStatusCard)
    ? (value as CoupangShipmentWorksheetOutputStatusCard)
    : DEFAULT_OUTPUT_STATUS_CARD;
}

function normalizeDateOnly(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return DATE_ONLY_PATTERN.test(normalized) ? normalized : null;
}

function normalizeDateRange(input: {
  createdAtFrom: string | null | undefined;
  createdAtTo: string | null | undefined;
}) {
  const createdAtFrom = normalizeDateOnly(input.createdAtFrom);
  const createdAtTo = normalizeDateOnly(input.createdAtTo);

  if (!createdAtFrom || !createdAtTo) {
    return {
      createdAtFrom: null,
      createdAtTo: null,
    };
  }

  if (createdAtFrom.localeCompare(createdAtTo) > 0) {
    return {
      createdAtFrom: createdAtTo,
      createdAtTo: createdAtFrom,
    };
  }

  return {
    createdAtFrom,
    createdAtTo,
  };
}

function resolveWorksheetRowDateKey(row: CoupangShipmentWorksheetRow) {
  const orderedAtDate = (row.orderedAtRaw ?? "").trim().slice(0, 10);
  const normalizedOrderedAtDate = DATE_ONLY_PATTERN.test(orderedAtDate)
    ? orderedAtDate.replaceAll("-", "")
    : null;
  const orderDateKey = (row.orderDateKey ?? "").trim();

  if (normalizedOrderedAtDate?.length === 8) {
    return normalizedOrderedAtDate;
  }

  return orderDateKey.length === 8 ? orderDateKey : null;
}

function matchesWorksheetRowDateRange(
  row: CoupangShipmentWorksheetRow,
  createdAtFrom: string | null,
  createdAtTo: string | null,
) {
  if (!createdAtFrom || !createdAtTo) {
    return true;
  }

  const rowDateKey = resolveWorksheetRowDateKey(row);
  if (!rowDateKey) {
    return false;
  }

  const fromKey = createdAtFrom.replaceAll("-", "");
  const toKey = createdAtTo.replaceAll("-", "");
  return rowDateKey >= fromKey && rowDateKey <= toKey;
}

export function matchesShipmentWorksheetDateRange(
  row: CoupangShipmentWorksheetRow,
  createdAtFrom: string | null,
  createdAtTo: string | null,
) {
  return matchesWorksheetRowDateRange(row, createdAtFrom, createdAtTo);
}

export function normalizeShipmentWorksheetViewQuery(
  query: Partial<CoupangShipmentWorksheetViewQuery> | null | undefined,
): NormalizedQuery {
  const normalizedDateRange = normalizeDateRange({
    createdAtFrom: query?.createdAtFrom,
    createdAtTo: query?.createdAtTo,
  });

  return {
    storeId: query?.storeId ?? "",
    datasetMode: normalizeDatasetMode(query?.datasetMode),
    createdAtFrom: normalizedDateRange.createdAtFrom,
    createdAtTo: normalizedDateRange.createdAtTo,
    scope: normalizeScope(query?.scope),
    decisionStatus:
      query?.decisionStatus === "ready" ||
      query?.decisionStatus === "invoice_waiting" ||
      query?.decisionStatus === "hold" ||
      query?.decisionStatus === "blocked" ||
      query?.decisionStatus === "recheck"
        ? query.decisionStatus
        : DEFAULT_DECISION_STATUS,
    priorityCard: normalizePriorityCard(query?.priorityCard),
    pipelineCard: normalizePipelineCard(query?.pipelineCard),
    issueFilter: normalizeIssueFilter(query?.issueFilter),
    page: Number.isFinite(query?.page) && (query?.page ?? 0) > 0 ? Math.floor(query!.page!) : DEFAULT_PAGE,
    pageSize:
      Number.isFinite(query?.pageSize) && (query?.pageSize ?? 0) > 0
        ? Math.floor(query!.pageSize!)
        : DEFAULT_PAGE_SIZE,
    query: (query?.query ?? "").trim(),
    invoiceStatusCard: normalizeInvoiceStatusCard(query?.invoiceStatusCard),
    orderStatusCard: normalizeOrderStatusCard(query?.orderStatusCard),
    outputStatusCard: normalizeOutputStatusCard(query?.outputStatusCard),
    sortField: query?.sortField ?? null,
    sortDirection: query?.sortDirection === "desc" ? "desc" : "asc",
  };
}

function countScopeRows(rows: readonly CoupangShipmentWorksheetRow[]) {
  const counts = createCountRecord(VIEW_SCOPES);

  for (const scope of VIEW_SCOPES) {
    counts[scope] = rows.filter((row) => matchesScope(row, scope)).length;
  }

  return counts;
}

function resolveFilteredRows(
  rows: readonly CoupangShipmentWorksheetRow[],
  query: NormalizedQuery,
) {
  const datedRows = rows.filter((row) =>
    matchesWorksheetRowDateRange(row, query.createdAtFrom, query.createdAtTo),
  );
  const scopedRows = datedRows.filter((row) => matchesScope(row, query.scope));
  const searchedRows = scopedRows.filter((row) => matchesShipmentWorksheetQuery(row, query.query));
  const priorityFacetRows = searchedRows.filter(
    (row) =>
      !isMissingInCoupangRow(row) &&
      matchesPipelineCard(row, query.pipelineCard) &&
      matchesIssueFilter(row, query.issueFilter) &&
      matchesCoupangFulfillmentDecisionFilter(row, query.decisionStatus) &&
      matchesInvoiceStatusCard(row, query.invoiceStatusCard) &&
      matchesOrderStatusCard(row, query.orderStatusCard) &&
      matchesOutputStatusCard(row, query.outputStatusCard),
  );
  const pipelineFacetRows = searchedRows.filter(
    (row) =>
      !isMissingInCoupangRow(row) &&
      matchesPriorityCard(row, query.priorityCard) &&
      matchesIssueFilter(row, query.issueFilter) &&
      matchesCoupangFulfillmentDecisionFilter(row, query.decisionStatus) &&
      matchesInvoiceStatusCard(row, query.invoiceStatusCard) &&
      matchesOrderStatusCard(row, query.orderStatusCard) &&
      matchesOutputStatusCard(row, query.outputStatusCard),
  );
  const issueFacetRows = searchedRows.filter(
    (row) =>
      !isMissingInCoupangRow(row) &&
      matchesPriorityCard(row, query.priorityCard) &&
      matchesPipelineCard(row, query.pipelineCard) &&
      matchesCoupangFulfillmentDecisionFilter(row, query.decisionStatus) &&
      matchesInvoiceStatusCard(row, query.invoiceStatusCard) &&
      matchesOrderStatusCard(row, query.orderStatusCard) &&
      matchesOutputStatusCard(row, query.outputStatusCard),
  );
  const queueFilteredRows = searchedRows.filter(
    (row) =>
      matchesPriorityCard(row, query.priorityCard) &&
      matchesPipelineCard(row, query.pipelineCard) &&
      matchesIssueFilter(row, query.issueFilter) &&
      matchesInvoiceStatusCard(row, query.invoiceStatusCard) &&
      matchesOrderStatusCard(row, query.orderStatusCard) &&
      matchesOutputStatusCard(row, query.outputStatusCard),
  );
  const filteredRows = queueFilteredRows.filter((row) =>
    matchesCoupangFulfillmentDecisionFilter(row, query.decisionStatus),
  );

  return {
    datedRows,
    scopedRows,
    searchedRows,
    priorityFacetRows,
    pipelineFacetRows,
    issueFacetRows,
    queueFilteredRows,
    filteredRows,
  };
}

export function resolveShipmentWorksheetFilteredRows(
  rows: readonly CoupangShipmentWorksheetRow[],
  rawQuery: Partial<CoupangShipmentWorksheetViewQuery> | null | undefined,
) {
  const query = normalizeShipmentWorksheetViewQuery(rawQuery);
  return {
    query,
    ...resolveFilteredRows(rows, query),
  };
}

export function getShipmentWorksheetRowHiddenReason(
  row: CoupangShipmentWorksheetRow,
  rawQuery: Partial<CoupangShipmentWorksheetViewQuery> | null | undefined,
): CoupangShipmentWorksheetAuditHiddenReason | null {
  const query = normalizeShipmentWorksheetViewQuery(rawQuery);

  if (!matchesWorksheetRowDateRange(row, query.createdAtFrom, query.createdAtTo)) {
    return "filtered_out";
  }

  if (!matchesScope(row, query.scope)) {
    return "out_of_scope";
  }

  if (
    !matchesShipmentWorksheetQuery(row, query.query) ||
    !matchesPriorityCard(row, query.priorityCard) ||
    !matchesPipelineCard(row, query.pipelineCard) ||
    !matchesIssueFilter(row, query.issueFilter) ||
    !matchesCoupangFulfillmentDecisionFilter(row, query.decisionStatus) ||
    !matchesInvoiceStatusCard(row, query.invoiceStatusCard) ||
    !matchesOrderStatusCard(row, query.orderStatusCard) ||
    !matchesOutputStatusCard(row, query.outputStatusCard)
  ) {
    return "filtered_out";
  }

  return null;
}

type WorksheetViewDatasetInput =
  | readonly CoupangShipmentWorksheetRow[]
  | {
      activeRows: readonly CoupangShipmentWorksheetRow[];
      mirrorRows: readonly CoupangShipmentWorksheetRow[];
    };

function resolveWorksheetViewDatasets(input: WorksheetViewDatasetInput) {
  if (!("activeRows" in input)) {
    return {
      activeRows: input,
      mirrorRows: input,
    };
  }

  return {
    activeRows: input.activeRows,
    mirrorRows: input.mirrorRows,
  };
}

export function buildShipmentWorksheetViewData(
  input: WorksheetViewDatasetInput,
  rawQuery: Partial<CoupangShipmentWorksheetViewQuery> | null | undefined,
): WorksheetViewCounts {
  const query = normalizeShipmentWorksheetViewQuery(rawQuery);
  const { activeRows, mirrorRows } = resolveWorksheetViewDatasets(input);
  const activeView = resolveFilteredRows(activeRows, query);
  const mirrorView = resolveFilteredRows(mirrorRows, query);
  const displayView = query.datasetMode === "mirror" ? mirrorView : activeView;

  const scopeCounts = countScopeRows(activeView.datedRows);
  const invoiceFacetRows = activeView.searchedRows.filter(
    (row) =>
      !isMissingInCoupangRow(row) &&
      matchesPriorityCard(row, query.priorityCard) &&
      matchesPipelineCard(row, query.pipelineCard) &&
      matchesIssueFilter(row, query.issueFilter) &&
      matchesCoupangFulfillmentDecisionFilter(row, query.decisionStatus) &&
      matchesOrderStatusCard(row, query.orderStatusCard) &&
      matchesOutputStatusCard(row, query.outputStatusCard),
  );
  const orderFacetRows = mirrorView.searchedRows.filter(
    (row) =>
      !isMissingInCoupangRow(row) &&
      matchesPriorityCard(row, query.priorityCard) &&
      matchesPipelineCard(row, query.pipelineCard) &&
      matchesIssueFilter(row, query.issueFilter) &&
      matchesCoupangFulfillmentDecisionFilter(row, query.decisionStatus) &&
      matchesInvoiceStatusCard(row, query.invoiceStatusCard) &&
      matchesOutputStatusCard(row, query.outputStatusCard),
  );
  const outputFacetRows = activeView.searchedRows.filter(
    (row) =>
      !isMissingInCoupangRow(row) &&
      matchesPriorityCard(row, query.priorityCard) &&
      matchesPipelineCard(row, query.pipelineCard) &&
      matchesIssueFilter(row, query.issueFilter) &&
      matchesCoupangFulfillmentDecisionFilter(row, query.decisionStatus) &&
      matchesInvoiceStatusCard(row, query.invoiceStatusCard) &&
      matchesOrderStatusCard(row, query.orderStatusCard),
  );

  const sortedRows = query.sortField
    ? displayView.filteredRows.slice().sort((left, right) => {
        const compared = compareSortValues(
          getSortValue(left, query.sortField),
          getSortValue(right, query.sortField),
        );
        if (compared !== 0) {
          return query.sortDirection === "desc" ? compared * -1 : compared;
        }
        return left.id.localeCompare(right.id);
      })
    : displayView.filteredRows.slice();

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const startIndex = (page - 1) * query.pageSize;
  const pagedRows = sortedRows.slice(startIndex, startIndex + query.pageSize);
  const invoiceCounts = createCountRecord(INVOICE_STATUS_KEYS);
  const priorityCounts = createCountRecord(PRIORITY_CARD_KEYS);
  const pipelineCounts = createCountRecord(PIPELINE_CARD_KEYS);
  const issueCounts = createCountRecord(ISSUE_FILTER_KEYS);
  const orderCounts = createCountRecord(ORDER_STATUS_KEYS);
  const outputCounts = createCountRecord(OUTPUT_STATUS_KEYS);
  const activeExclusionCounts = createCountRecord(ACTIVE_EXCLUSION_REASON_KEYS);
  const missingInCoupangCount = mirrorView.searchedRows.filter((row) => isMissingInCoupangRow(row)).length;

  priorityCounts.all = mirrorView.priorityFacetRows.length;
  for (const row of mirrorView.priorityFacetRows) {
    const cardKey = buildCoupangShipmentStatusSnapshot(row).priorityBucket;
    if (cardKey) {
      priorityCounts[cardKey] += 1;
    }
  }

  pipelineCounts.all = mirrorView.pipelineFacetRows.length;
  for (const row of mirrorView.pipelineFacetRows) {
    const cardKey = buildCoupangShipmentStatusSnapshot(row).pipelineBucket;
    if (cardKey) {
      pipelineCounts[cardKey] += 1;
    }
  }

  issueCounts.all = mirrorView.issueFacetRows.length;
  for (const row of mirrorView.issueFacetRows) {
    const issueStage = resolveCoupangShipmentIssueStage(row);
    if (issueStage !== "none") {
      issueCounts[issueStage] += 1;
    }
    if (isCoupangShipmentDirectDelivery(row)) {
      issueCounts.direct_delivery += 1;
    }
  }

  invoiceCounts.all = invoiceFacetRows.length;
  for (const row of invoiceFacetRows) {
    invoiceCounts[getInvoiceStatusCardKey(row)] += 1;
  }

  orderCounts.all = orderFacetRows.length;
  for (const row of orderFacetRows) {
    const cardKey = getOrderStatusCardKey(row);
    if (cardKey) {
      orderCounts[cardKey] += 1;
    }
  }

  outputCounts.all = outputFacetRows.length;
  for (const row of outputFacetRows) {
    outputCounts[getOutputStatusCardKey(row)] += 1;
  }

  for (const row of mirrorView.filteredRows) {
    if (row.isVisibleInActive === false && row.excludedFromActiveReason) {
      activeExclusionCounts[row.excludedFromActiveReason] += 1;
    }
  }

  const decisionCounts = buildCoupangFulfillmentDecisionCounts(activeView.queueFilteredRows);
  const decisionPreviewGroups = buildCoupangShipmentDecisionPreviewGroups(activeView.queueFilteredRows);

  return {
    datasetMode: query.datasetMode,
    items: pagedRows.map((row) => {
      const statusSnapshot = buildCoupangShipmentStatusSnapshot(row);
      return {
        ...row,
        ...statusSnapshot,
        ...buildCoupangShipmentRowSummary({
          ...row,
          ...statusSnapshot,
        }),
      };
    }),
    scope: query.scope,
    page,
    pageSize: query.pageSize,
    totalPages,
    totalRowCount: displayView.datedRows.length,
    scopeRowCount: displayView.scopedRows.length,
    filteredRowCount: sortedRows.length,
    mirrorTotalRowCount: mirrorView.datedRows.length,
    mirrorFilteredRowCount: mirrorView.filteredRows.length,
    activeTotalRowCount: activeView.datedRows.length,
    activeFilteredRowCount: activeView.filteredRows.length,
    activeExclusionCounts,
    invoiceReadyCount: activeView.filteredRows.filter((row) => canSendInvoiceRow(row)).length,
    decisionCounts,
    decisionPreviewGroups,
    priorityCounts,
    pipelineCounts,
    issueCounts,
    missingInCoupangCount,
    exceptionCounts: {
      notFoundInCoupang: missingInCoupangCount,
    },
    directDeliveryCount: mirrorView.issueFacetRows.filter((row) => isCoupangShipmentDirectDelivery(row)).length,
    staleSyncCount: mirrorView.issueFacetRows.filter((row) => isCoupangShipmentStaleSync(row)).length,
    scopeCounts,
    invoiceCounts,
    orderCounts,
    outputCounts,
  };
}

export function resolveShipmentWorksheetRows(
  rows: readonly CoupangShipmentWorksheetRow[],
  rawQuery: Partial<CoupangShipmentWorksheetViewQuery> | null | undefined,
  mode: CoupangShipmentWorksheetBulkResolveMode,
): WorksheetResolvedItems {
  const query = normalizeShipmentWorksheetViewQuery(rawQuery);
  const { filteredRows } = resolveFilteredRows(rows, query);
  const targetRows = getShipmentWorksheetBulkResolveTargetRows(filteredRows, mode);

  if (mode === "prepare_ready") {
    const blockedItems = targetRows.filter((row) => hasCustomerServiceIssue(row));
    const items = targetRows.filter((row) => canMarkPreparingRow(row));
    return {
      items,
      blockedItems,
      matchedCount: targetRows.length,
      resolvedCount: items.length,
    };
  }

  if (mode === "invoice_ready") {
    const blockedItems = targetRows.filter((row) => hasCustomerServiceIssue(row));
    const items = targetRows.filter((row) => canSendInvoiceRow(row));
    return {
      items,
      blockedItems,
      matchedCount: targetRows.length,
      resolvedCount: items.length,
    };
  }

  const blockedItems = targetRows.filter((row) => hasCustomerServiceIssue(row));
  const items = targetRows.filter((row) => !hasCustomerServiceIssue(row));

  return {
    items,
    blockedItems,
    matchedCount: targetRows.length,
    resolvedCount: items.length,
  };
}
