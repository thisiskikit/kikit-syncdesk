import {
  type CoupangShipmentWorksheetAuditHiddenReason,
  isCoupangInvoiceAlreadyProcessedResult,
  type CoupangCustomerServiceIssueBreakdownItem,
  type CoupangShipmentWorksheetBulkResolveMode,
  type CoupangShipmentWorksheetBulkResolveResponse,
  type CoupangShipmentWorksheetInvoiceStatusCard,
  type CoupangShipmentWorksheetOrderStatusCard,
  type CoupangShipmentWorksheetOutputStatusCard,
  type CoupangShipmentWorksheetRow,
  type CoupangShipmentWorksheetSortField,
  type CoupangShipmentWorksheetViewQuery,
  type CoupangShipmentWorksheetViewResponse,
  type CoupangShipmentWorksheetViewScope,
} from "@shared/coupang";

type WorksheetViewCounts = Pick<
  CoupangShipmentWorksheetViewResponse,
  | "scopeCounts"
  | "invoiceCounts"
  | "orderCounts"
  | "outputCounts"
  | "invoiceReadyCount"
  | "scopeRowCount"
  | "filteredRowCount"
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
  Required<Omit<CoupangShipmentWorksheetViewQuery, "sortField">>,
  "storeId"
> & {
  storeId: string;
  sortField: CoupangShipmentWorksheetSortField | null;
};

const DEFAULT_SCOPE: CoupangShipmentWorksheetViewScope = "dispatch_active";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_INVOICE_STATUS_CARD: CoupangShipmentWorksheetInvoiceStatusCard = "all";
const DEFAULT_ORDER_STATUS_CARD: CoupangShipmentWorksheetOrderStatusCard = "all";
const DEFAULT_OUTPUT_STATUS_CARD: CoupangShipmentWorksheetOutputStatusCard = "all";

const VIEW_SCOPES = [
  "dispatch_active",
  "post_dispatch",
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
    !hasCustomerServiceIssue(row) &&
    (row.availableActions.includes("uploadInvoice") || row.availableActions.includes("updateInvoice"))
  );
}

function canMarkPreparingRow(row: CoupangShipmentWorksheetRow) {
  return row.availableActions.includes("markPreparing") && !hasCustomerServiceIssue(row);
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
  left: string | number | null | undefined,
  right: string | number | null | undefined,
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
  return String(left).localeCompare(String(right), "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
}

function getSortValue(
  row: CoupangShipmentWorksheetRow,
  sortField: CoupangShipmentWorksheetSortField | null,
) {
  switch (sortField) {
    case "__exportStatus":
      return row.exportedAt ? 1 : 0;
    case "__invoiceTransmissionStatus":
      return getInvoiceStatusCardKey(row);
    case "__orderStatus":
      return `${resolveDisplayOrderStatus(row) ?? ""}:${normalizeSummary(row.customerServiceIssueSummary)}`;
    case "quantity":
      return row.quantity;
    case "salePrice":
      return row.salePrice;
    case "shippingFee":
      return row.shippingFee;
    case "orderDateText":
      return row.orderDateKey;
    default:
      return sortField ? row[sortField] : null;
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

  switch (scope) {
    case "dispatch_active":
      return !hasClaim && (DISPATCH_ACTIVE_STATUSES.has(status) || !isExported);
    case "post_dispatch":
      return POST_DISPATCH_STATUSES.has(status) && !hasClaim && isExported;
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

export function normalizeShipmentWorksheetViewQuery(
  query: Partial<CoupangShipmentWorksheetViewQuery> | null | undefined,
): NormalizedQuery {
  return {
    storeId: query?.storeId ?? "",
    scope: normalizeScope(query?.scope),
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
  const scopedRows = rows.filter((row) => matchesScope(row, query.scope));
  const searchedRows = scopedRows.filter((row) => matchesShipmentWorksheetQuery(row, query.query));
  const filteredRows = searchedRows.filter(
    (row) =>
      matchesInvoiceStatusCard(row, query.invoiceStatusCard) &&
      matchesOrderStatusCard(row, query.orderStatusCard) &&
      matchesOutputStatusCard(row, query.outputStatusCard),
  );

  return {
    scopedRows,
    searchedRows,
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

  if (!matchesScope(row, query.scope)) {
    return "out_of_scope";
  }

  if (
    !matchesShipmentWorksheetQuery(row, query.query) ||
    !matchesInvoiceStatusCard(row, query.invoiceStatusCard) ||
    !matchesOrderStatusCard(row, query.orderStatusCard) ||
    !matchesOutputStatusCard(row, query.outputStatusCard)
  ) {
    return "filtered_out";
  }

  return null;
}

export function buildShipmentWorksheetViewData(
  rows: readonly CoupangShipmentWorksheetRow[],
  rawQuery: Partial<CoupangShipmentWorksheetViewQuery> | null | undefined,
): WorksheetViewCounts {
  const query = normalizeShipmentWorksheetViewQuery(rawQuery);
  const scopeCounts = countScopeRows(rows);
  const { scopedRows, searchedRows, filteredRows } = resolveFilteredRows(rows, query);

  const invoiceFacetRows = searchedRows.filter(
    (row) =>
      matchesOrderStatusCard(row, query.orderStatusCard) &&
      matchesOutputStatusCard(row, query.outputStatusCard),
  );
  const orderFacetRows = searchedRows.filter(
    (row) =>
      matchesInvoiceStatusCard(row, query.invoiceStatusCard) &&
      matchesOutputStatusCard(row, query.outputStatusCard),
  );
  const outputFacetRows = searchedRows.filter(
    (row) =>
      matchesInvoiceStatusCard(row, query.invoiceStatusCard) &&
      matchesOrderStatusCard(row, query.orderStatusCard),
  );

  const sortedRows = query.sortField
    ? filteredRows.slice().sort((left, right) => {
        const compared = compareSortValues(
          getSortValue(left, query.sortField),
          getSortValue(right, query.sortField),
        );
        if (compared !== 0) {
          return query.sortDirection === "desc" ? compared * -1 : compared;
        }
        return left.id.localeCompare(right.id);
      })
    : filteredRows.slice();

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const startIndex = (page - 1) * query.pageSize;
  const pagedRows = sortedRows.slice(startIndex, startIndex + query.pageSize);
  const invoiceCounts = createCountRecord(INVOICE_STATUS_KEYS);
  const orderCounts = createCountRecord(ORDER_STATUS_KEYS);
  const outputCounts = createCountRecord(OUTPUT_STATUS_KEYS);

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

  return {
    items: pagedRows,
    scope: query.scope,
    page,
    pageSize: query.pageSize,
    totalPages,
    totalRowCount: rows.length,
    scopeRowCount: scopedRows.length,
    filteredRowCount: sortedRows.length,
    invoiceReadyCount: filteredRows.filter((row) => canSendInvoiceRow(row)).length,
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

  if (mode === "prepare_ready") {
    const prepareCandidates = filteredRows.filter((row) => row.availableActions.includes("markPreparing"));
    const blockedItems = prepareCandidates.filter((row) => hasCustomerServiceIssue(row));
    const items = prepareCandidates.filter((row) => canMarkPreparingRow(row));
    return {
      items,
      blockedItems,
      matchedCount: prepareCandidates.length,
      resolvedCount: items.length,
    };
  }

  if (mode === "invoice_ready") {
    const blockedItems = filteredRows.filter((row) => hasCustomerServiceIssue(row));
    const items = filteredRows.filter((row) => canSendInvoiceRow(row));
    return {
      items,
      blockedItems,
      matchedCount: filteredRows.length,
      resolvedCount: items.length,
    };
  }

  const notExportedRows = filteredRows.filter((row) => !row.exportedAt);
  const blockedItems = notExportedRows.filter((row) => hasCustomerServiceIssue(row));
  const items = notExportedRows.filter((row) => !hasCustomerServiceIssue(row));

  return {
    items,
    blockedItems,
    matchedCount: notExportedRows.length,
    resolvedCount: items.length,
  };
}
