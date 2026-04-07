import {
  isCoupangInvoiceAlreadyProcessedResult,
  type CoupangShipmentWorksheetRow,
} from "@shared/coupang";
import { hasCoupangCustomerServiceIssue } from "@/lib/coupang-customer-service";
import { resolveCoupangDisplayOrderStatus } from "@/lib/coupang-order-status";

export type InvoiceStatusCardKey =
  | "all"
  | "idle"
  | "ready"
  | "pending"
  | "failed"
  | "applied";

export type OrderStatusCardKey =
  | "all"
  | "ACCEPT"
  | "INSTRUCT"
  | "DEPARTURE"
  | "DELIVERING"
  | "FINAL_DELIVERY"
  | "NONE_TRACKING"
  | "SHIPMENT_STOP_REQUESTED"
  | "SHIPMENT_STOP_HANDLED"
  | "CANCEL"
  | "RETURN"
  | "EXCHANGE";

export type OutputStatusCardKey = "all" | "notExported" | "exported";

export type ShipmentQuickFilterState = {
  invoiceStatusCard: InvoiceStatusCardKey;
  orderStatusCard: OrderStatusCardKey;
  outputStatusCard: OutputStatusCardKey;
};

export type ShipmentQuickFilterResult = {
  state: ShipmentQuickFilterState;
  invoiceFacetRows: CoupangShipmentWorksheetRow[];
  orderFacetRows: CoupangShipmentWorksheetRow[];
  outputFacetRows: CoupangShipmentWorksheetRow[];
  visibleRows: CoupangShipmentWorksheetRow[];
  invoiceCounts: Record<InvoiceStatusCardKey, number>;
  orderCounts: Record<OrderStatusCardKey, number>;
  outputCounts: Record<OutputStatusCardKey, number>;
  invoiceReadyRows: CoupangShipmentWorksheetRow[];
};

const INVOICE_STATUS_CARD_KEYS = [
  "all",
  "idle",
  "ready",
  "pending",
  "failed",
  "applied",
] as const satisfies readonly InvoiceStatusCardKey[];

const ORDER_STATUS_CARD_VALUE_KEYS = [
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
] as const satisfies readonly Exclude<OrderStatusCardKey, "all">[];

const ORDER_STATUS_CARD_KEYS = [
  "all",
  ...ORDER_STATUS_CARD_VALUE_KEYS,
] as const satisfies readonly OrderStatusCardKey[];

const OUTPUT_STATUS_CARD_KEYS = [
  "all",
  "notExported",
  "exported",
] as const satisfies readonly OutputStatusCardKey[];

const INVOICE_STATUS_CARD_KEY_SET = new Set<string>(INVOICE_STATUS_CARD_KEYS);
const ORDER_STATUS_CARD_VALUE_SET = new Set<string>(ORDER_STATUS_CARD_VALUE_KEYS);
const OUTPUT_STATUS_CARD_KEY_SET = new Set<string>(OUTPUT_STATUS_CARD_KEYS);

function createCountRecord<TKey extends string>(keys: readonly TKey[]) {
  return keys.reduce<Record<TKey, number>>((current, key) => {
    current[key] = 0;
    return current;
  }, {} as Record<TKey, number>);
}

export function normalizeInvoiceField(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function hasInvoicePayload(values: {
  deliveryCompanyCode: string | null | undefined;
  invoiceNumber: string | null | undefined;
}) {
  return Boolean(
    normalizeInvoiceField(values.deliveryCompanyCode) &&
      normalizeInvoiceField(values.invoiceNumber),
  );
}

export function isSameInvoicePayload(
  left: {
    deliveryCompanyCode: string | null | undefined;
    invoiceNumber: string | null | undefined;
  },
  right: {
    deliveryCompanyCode: string | null | undefined;
    invoiceNumber: string | null | undefined;
  },
) {
  return (
    normalizeInvoiceField(left.deliveryCompanyCode) ===
      normalizeInvoiceField(right.deliveryCompanyCode) &&
    normalizeInvoiceField(left.invoiceNumber) === normalizeInvoiceField(right.invoiceNumber)
  );
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
      isCoupangInvoiceAlreadyProcessedResult({
        message: row.invoiceTransmissionMessage,
      }),
  );
}

export function canSendInvoiceRow(row: CoupangShipmentWorksheetRow) {
  return (
    hasInvoicePayload(row) &&
    row.invoiceTransmissionStatus !== "pending" &&
    !hasAppliedInvoiceTransmission(row) &&
    !hasCoupangCustomerServiceIssue({
      summary: row.customerServiceIssueSummary,
      count: row.customerServiceIssueCount,
    }) &&
    (row.availableActions.includes("uploadInvoice") ||
      row.availableActions.includes("updateInvoice"))
  );
}

export function normalizeInvoiceStatusCardKey(
  value: string | null | undefined,
): InvoiceStatusCardKey {
  if (value === "verifying" || value === "mismatch") {
    return "applied";
  }

  return INVOICE_STATUS_CARD_KEY_SET.has(value ?? "") ? (value as InvoiceStatusCardKey) : "all";
}

function getOrderStatusValueKey(
  value: string | null | undefined,
): Exclude<OrderStatusCardKey, "all"> | null {
  const normalized = (value ?? "").trim().toUpperCase();
  return ORDER_STATUS_CARD_VALUE_SET.has(normalized)
    ? (normalized as Exclude<OrderStatusCardKey, "all">)
    : null;
}

export function normalizeOrderStatusCardKey(
  value: string | null | undefined,
): OrderStatusCardKey {
  if ((value ?? "").trim().toLowerCase() === "all") {
    return "all";
  }

  return getOrderStatusValueKey(value) ?? "all";
}

export function normalizeOutputStatusCardKey(
  value: string | null | undefined,
): OutputStatusCardKey {
  return OUTPUT_STATUS_CARD_KEY_SET.has(value ?? "") ? (value as OutputStatusCardKey) : "all";
}

export function getOrderStatusCardKey(
  row: Pick<
    CoupangShipmentWorksheetRow,
    "orderStatus" | "customerServiceIssueBreakdown" | "customerServiceIssueSummary"
  >,
): Exclude<OrderStatusCardKey, "all"> | null {
  return getOrderStatusValueKey(
    resolveCoupangDisplayOrderStatus({
      orderStatus: row.orderStatus,
      customerServiceIssueBreakdown: row.customerServiceIssueBreakdown,
      customerServiceIssueSummary: row.customerServiceIssueSummary,
    }),
  );
}

export function getOutputStatusCardKey(
  row: Pick<CoupangShipmentWorksheetRow, "exportedAt">,
): Exclude<OutputStatusCardKey, "all"> {
  return row.exportedAt ? "exported" : "notExported";
}

export function getInvoiceStatusCardKey(
  row: CoupangShipmentWorksheetRow,
): Exclude<InvoiceStatusCardKey, "all"> {
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

export function matchesInvoiceStatusCard(
  row: CoupangShipmentWorksheetRow,
  cardKey: InvoiceStatusCardKey,
) {
  return cardKey === "all" || getInvoiceStatusCardKey(row) === cardKey;
}

export function matchesOrderStatusCard(
  row: Pick<
    CoupangShipmentWorksheetRow,
    "orderStatus" | "customerServiceIssueBreakdown" | "customerServiceIssueSummary"
  >,
  cardKey: OrderStatusCardKey,
) {
  return cardKey === "all" || getOrderStatusCardKey(row) === cardKey;
}

export function matchesOutputStatusCard(
  row: Pick<CoupangShipmentWorksheetRow, "exportedAt">,
  cardKey: OutputStatusCardKey,
) {
  return cardKey === "all" || getOutputStatusCardKey(row) === cardKey;
}

function countInvoiceStatusCards(rows: readonly CoupangShipmentWorksheetRow[]) {
  const counts = createCountRecord(INVOICE_STATUS_CARD_KEYS);
  counts.all = rows.length;

  for (const row of rows) {
    counts[getInvoiceStatusCardKey(row)] += 1;
  }

  return counts;
}

function countOrderStatusCards(rows: readonly CoupangShipmentWorksheetRow[]) {
  const counts = createCountRecord(ORDER_STATUS_CARD_KEYS);
  counts.all = rows.length;

  for (const row of rows) {
    const key = getOrderStatusCardKey(row);
    if (key) {
      counts[key] += 1;
    }
  }

  return counts;
}

function countOutputStatusCards(rows: readonly CoupangShipmentWorksheetRow[]) {
  const counts = createCountRecord(OUTPUT_STATUS_CARD_KEYS);
  counts.all = rows.length;

  for (const row of rows) {
    counts[getOutputStatusCardKey(row)] += 1;
  }

  return counts;
}

export function buildShipmentQuickFilterResult(
  rows: readonly CoupangShipmentWorksheetRow[],
  state: ShipmentQuickFilterState,
): ShipmentQuickFilterResult {
  const normalizedState: ShipmentQuickFilterState = {
    invoiceStatusCard: normalizeInvoiceStatusCardKey(state.invoiceStatusCard),
    orderStatusCard: normalizeOrderStatusCardKey(state.orderStatusCard),
    outputStatusCard: normalizeOutputStatusCardKey(state.outputStatusCard),
  };
  const invoiceFacetRows = rows.filter((row) =>
    matchesOrderStatusCard(row, normalizedState.orderStatusCard) &&
    matchesOutputStatusCard(row, normalizedState.outputStatusCard),
  );
  const orderFacetRows = rows.filter((row) =>
    matchesInvoiceStatusCard(row, normalizedState.invoiceStatusCard) &&
    matchesOutputStatusCard(row, normalizedState.outputStatusCard),
  );
  const outputFacetRows = rows.filter((row) =>
    matchesInvoiceStatusCard(row, normalizedState.invoiceStatusCard) &&
    matchesOrderStatusCard(row, normalizedState.orderStatusCard),
  );
  const visibleRows = rows.filter(
    (row) =>
      matchesInvoiceStatusCard(row, normalizedState.invoiceStatusCard) &&
      matchesOrderStatusCard(row, normalizedState.orderStatusCard) &&
      matchesOutputStatusCard(row, normalizedState.outputStatusCard),
  );

  return {
    state: normalizedState,
    invoiceFacetRows,
    orderFacetRows,
    outputFacetRows,
    visibleRows,
    invoiceCounts: countInvoiceStatusCards(invoiceFacetRows),
    orderCounts: countOrderStatusCards(orderFacetRows),
    outputCounts: countOutputStatusCards(outputFacetRows),
    invoiceReadyRows: visibleRows.filter(
      (row) => canSendInvoiceRow(row) && row.invoiceTransmissionStatus !== "pending",
    ),
  };
}

export function pruneShipmentSelectedRowIds(
  selectedRowIds: ReadonlySet<string>,
  visibleRows: readonly Pick<CoupangShipmentWorksheetRow, "id">[],
) {
  if (!selectedRowIds.size) {
    return selectedRowIds;
  }

  const visibleIds = new Set(visibleRows.map((row) => row.id));
  let hasChanges = false;
  const next = new Set<string>();

  selectedRowIds.forEach((rowId) => {
    if (visibleIds.has(rowId)) {
      next.add(rowId);
      return;
    }

    hasChanges = true;
  });

  return hasChanges ? next : selectedRowIds;
}
