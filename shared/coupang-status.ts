import type {
  CoupangCustomerServiceIssueBreakdownItem,
  CoupangShipmentIssueFilter,
  CoupangShipmentIssueStage,
  CoupangShipmentPipelineBucket,
  CoupangShipmentPriorityBucket,
  CoupangShipmentShippingStage,
  CoupangShipmentStatusSyncSource,
  CoupangShipmentWorksheetRow,
} from "./coupang";

type ShipmentStatusCarrier = Pick<
  CoupangShipmentWorksheetRow,
  | "orderStatus"
  | "rawOrderStatus"
  | "shippingStage"
  | "issueStage"
  | "priorityBucket"
  | "pipelineBucket"
  | "priorityCard"
  | "pipelineCard"
  | "customerServiceIssueSummary"
  | "customerServiceIssueCount"
  | "customerServiceIssueBreakdown"
  | "customerServiceState"
  | "customerServiceFetchedAt"
  | "purchaseConfirmedSyncedAt"
  | "lastOrderHydratedAt"
  | "coupangInvoiceUploadedAt"
  | "invoiceAppliedAt"
  | "estimatedShippingDate"
  | "orderedAtRaw"
  | "updatedAt"
  | "createdAt"
>;

const ISSUE_PRIORITY = [
  "shipment_stop_requested",
  "shipment_stop_handled",
  "cancel",
  "return",
  "exchange",
] as const satisfies readonly CoupangCustomerServiceIssueBreakdownItem["type"][];

const RAW_TO_SHIPPING_STAGE: Record<string, CoupangShipmentShippingStage> = {
  ACCEPT: "payment_completed",
  INSTRUCT: "preparing_product",
  DEPARTURE: "shipping_instruction",
  DELIVERING: "in_delivery",
  FINAL_DELIVERY: "delivered",
  NONE_TRACKING: "in_delivery",
};

const LEGACY_SHIPPING_STAGE_MAP: Record<string, CoupangShipmentShippingStage> = {
  ACCEPT: "payment_completed",
  INSTRUCT: "preparing_product",
  DEPARTURE: "shipping_instruction",
  DELIVERING: "in_delivery",
  FINAL_DELIVERY: "delivered",
  payment_completed: "payment_completed",
  preparing_product: "preparing_product",
  shipping_instruction: "shipping_instruction",
  in_delivery: "in_delivery",
  delivered: "delivered",
};

const SHIPPING_STAGES_FOR_DISPATCH = new Set<CoupangShipmentShippingStage>([
  "payment_completed",
  "preparing_product",
]);

const SHIPPING_STAGES_FOR_LONG_TRANSIT = new Set<CoupangShipmentShippingStage>([
  "shipping_instruction",
  "in_delivery",
]);

const SEOUL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normalizeCustomerServiceSummary(summary: string | null | undefined) {
  return (summary ?? "").trim().toLowerCase();
}

function hasCustomerServiceIssue(
  row: Pick<
    ShipmentStatusCarrier,
    "customerServiceIssueSummary" | "customerServiceIssueCount" | "customerServiceIssueBreakdown"
  >,
) {
  return Boolean((row.customerServiceIssueSummary ?? "").trim()) ||
    (row.customerServiceIssueCount ?? 0) > 0 ||
    Boolean(row.customerServiceIssueBreakdown?.length);
}

function normalizeStoredShippingStage(
  value: string | null | undefined,
): CoupangShipmentShippingStage | null {
  if (!value) {
    return null;
  }

  return LEGACY_SHIPPING_STAGE_MAP[value.trim()] ?? null;
}

function normalizeIssueStageToken(value: string | null | undefined): CoupangShipmentIssueStage | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "shipment_stop_handled") {
    return "shipment_stop_resolved";
  }

  if (
    normalized === "shipment_stop_requested" ||
    normalized === "shipment_stop_resolved" ||
    normalized === "cancel" ||
    normalized === "return" ||
    normalized === "exchange" ||
    normalized === "cs_open" ||
    normalized === "none"
  ) {
    return normalized;
  }

  return null;
}

function normalizeStoredPriorityBucket(
  value: string | null | undefined,
): CoupangShipmentPriorityBucket | null {
  const normalized = (value ?? "").trim();
  if (
    normalized === "shipment_stop_requested" ||
    normalized === "same_day_dispatch" ||
    normalized === "dispatch_delayed" ||
    normalized === "long_in_transit"
  ) {
    return normalized;
  }

  return null;
}

function normalizeStoredPipelineBucket(
  value: string | null | undefined,
): CoupangShipmentPipelineBucket | null {
  return normalizeStoredShippingStage(value);
}

function resolveIssueStageFromBreakdown(
  breakdown:
    | readonly Pick<CoupangCustomerServiceIssueBreakdownItem, "type">[]
    | null
    | undefined,
) {
  if (!breakdown?.length) {
    return null;
  }

  for (const issueType of ISSUE_PRIORITY) {
    if (!breakdown.some((item) => item.type === issueType)) {
      continue;
    }

    if (issueType === "shipment_stop_handled") {
      return "shipment_stop_resolved" satisfies CoupangShipmentIssueStage;
    }

    return issueType;
  }

  return null;
}

function resolveIssueStageFromSummary(summary: string | null | undefined): CoupangShipmentIssueStage | null {
  const normalized = normalizeCustomerServiceSummary(summary);
  if (!normalized) {
    return null;
  }

  if (normalized.includes("shipment_stop_requested") || normalized.includes("출고중지 요청")) {
    return "shipment_stop_requested";
  }
  if (normalized.includes("shipment_stop_handled") || normalized.includes("출고중지 처리완료")) {
    return "shipment_stop_resolved";
  }
  if (normalized.includes("cancel") || normalized.includes("취소")) {
    return "cancel";
  }
  if (normalized.includes("return") || normalized.includes("반품")) {
    return "return";
  }
  if (normalized.includes("exchange") || normalized.includes("교환")) {
    return "exchange";
  }

  return null;
}

function toSeoulDateKey(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return SEOUL_DATE_FORMATTER.format(parsed);
  }

  const dateMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  return dateMatch?.[1] ?? null;
}

function compareDateKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function toUtcDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function diffDaysSeoul(fromDateKey: string, toDateKey: string) {
  return Math.floor((toUtcDateFromKey(toDateKey) - toUtcDateFromKey(fromDateKey)) / 86_400_000);
}

function resolveLongTransitBaseDate(row: ShipmentStatusCarrier) {
  return (
    toSeoulDateKey(row.coupangInvoiceUploadedAt) ??
    toSeoulDateKey(row.invoiceAppliedAt) ??
    toSeoulDateKey(row.estimatedShippingDate) ??
    toSeoulDateKey(row.orderedAtRaw) ??
    toSeoulDateKey(row.createdAt)
  );
}

function resolveLatestTimestamp(values: Array<string | null | undefined>) {
  let latestValue: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    if (parsed.getTime() > latestTime) {
      latestValue = value;
      latestTime = parsed.getTime();
    }
  }

  return latestValue;
}

function hasDispatchBlockingIssue(issueStage: CoupangShipmentIssueStage) {
  return (
    issueStage === "shipment_stop_requested" ||
    issueStage === "cancel" ||
    issueStage === "return" ||
    issueStage === "exchange"
  );
}

function resolveStoredMismatchReason(
  row: ShipmentStatusCarrier,
  derived: {
    shippingStage: CoupangShipmentShippingStage | null;
    issueStage: CoupangShipmentIssueStage;
    priorityBucket: CoupangShipmentPriorityBucket | null;
    pipelineBucket: CoupangShipmentPipelineBucket | null;
  },
) {
  const storedShippingStage = normalizeStoredShippingStage(row.shippingStage);
  if (
    storedShippingStage &&
    derived.shippingStage &&
    storedShippingStage !== derived.shippingStage
  ) {
    return "저장된 워크시트 배송 상태와 현재 쿠팡 정규화 결과가 달라 다시 계산했습니다.";
  }

  const storedIssueStage = normalizeIssueStageToken(row.issueStage);
  if (storedIssueStage && storedIssueStage !== derived.issueStage) {
    return "저장된 워크시트 이슈 상태와 현재 쿠팡 정규화 결과가 달라 다시 계산했습니다.";
  }

  const storedPriorityBucket = normalizeStoredPriorityBucket(
    row.priorityBucket ?? row.priorityCard,
  );
  if (storedPriorityBucket && storedPriorityBucket !== derived.priorityBucket) {
    return "저장된 우선 처리 분류와 현재 쿠팡 정규화 결과가 달라 다시 계산했습니다.";
  }

  const storedPipelineBucket = normalizeStoredPipelineBucket(
    row.pipelineBucket ?? row.pipelineCard,
  );
  if (
    storedPipelineBucket &&
    derived.pipelineBucket &&
    storedPipelineBucket !== derived.pipelineBucket
  ) {
    return "저장된 배송 파이프라인 분류와 현재 쿠팡 정규화 결과가 달라 다시 계산했습니다.";
  }

  return null;
}

export function normalizeCoupangRawOrderStatus(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized || null;
}

export function normalizeCoupangIssueStage(row: ShipmentStatusCarrier): CoupangShipmentIssueStage {
  return (
    resolveIssueStageFromBreakdown(row.customerServiceIssueBreakdown) ??
    resolveIssueStageFromSummary(row.customerServiceIssueSummary) ??
    (hasCustomerServiceIssue(row) ? "cs_open" : "none")
  );
}

export function deriveCoupangShippingStage(
  row: Pick<ShipmentStatusCarrier, "orderStatus">,
): CoupangShipmentShippingStage | null {
  const rawOrderStatus = normalizeCoupangRawOrderStatus(row.orderStatus);
  if (!rawOrderStatus) {
    return null;
  }

  return RAW_TO_SHIPPING_STAGE[rawOrderStatus] ?? null;
}

export function isCoupangShipmentDirectDelivery(
  row: Pick<ShipmentStatusCarrier, "orderStatus">,
) {
  return normalizeCoupangRawOrderStatus(row.orderStatus) === "NONE_TRACKING";
}

export function isCoupangShipmentStaleSync(
  row: Pick<ShipmentStatusCarrier, "customerServiceState">,
) {
  return row.customerServiceState === "stale" || row.customerServiceState === "unknown";
}

export function deriveCoupangPriorityBucket(
  row: ShipmentStatusCarrier,
  now: Date = new Date(),
): CoupangShipmentPriorityBucket | null {
  const issueStage = normalizeCoupangIssueStage(row);
  if (issueStage === "shipment_stop_requested") {
    return "shipment_stop_requested";
  }

  const shippingStage = deriveCoupangShippingStage(row);
  const todayDateKey = SEOUL_DATE_FORMATTER.format(now);

  if (shippingStage && SHIPPING_STAGES_FOR_DISPATCH.has(shippingStage)) {
    const estimatedShippingDateKey = toSeoulDateKey(row.estimatedShippingDate);
    if (estimatedShippingDateKey && !hasDispatchBlockingIssue(issueStage)) {
      if (compareDateKeys(estimatedShippingDateKey, todayDateKey) === 0) {
        return "same_day_dispatch";
      }
      if (compareDateKeys(estimatedShippingDateKey, todayDateKey) < 0) {
        return "dispatch_delayed";
      }
    }
  }

  if (shippingStage && SHIPPING_STAGES_FOR_LONG_TRANSIT.has(shippingStage)) {
    const baseDateKey = resolveLongTransitBaseDate(row);
    if (baseDateKey && diffDaysSeoul(baseDateKey, todayDateKey) > 30) {
      return "long_in_transit";
    }
  }

  return null;
}

export function deriveCoupangPipelineBucket(
  row: ShipmentStatusCarrier,
): CoupangShipmentPipelineBucket | null {
  return deriveCoupangShippingStage(row);
}

export function resolveCoupangShipmentSyncSource(
  row: Pick<
    ShipmentStatusCarrier,
    "customerServiceState" | "customerServiceFetchedAt" | "lastOrderHydratedAt" | "coupangInvoiceUploadedAt"
  >,
): CoupangShipmentStatusSyncSource {
  const hasLiveSnapshot = Boolean(
    row.customerServiceFetchedAt || row.lastOrderHydratedAt || row.coupangInvoiceUploadedAt,
  );

  return hasLiveSnapshot && row.customerServiceState === "ready"
    ? "live"
    : "worksheet_cache";
}

export function resolveCoupangShipmentStatusDerivedAt(row: ShipmentStatusCarrier) {
  return resolveLatestTimestamp([
    row.customerServiceFetchedAt,
    row.lastOrderHydratedAt,
    row.purchaseConfirmedSyncedAt,
    row.coupangInvoiceUploadedAt,
    row.updatedAt,
    row.createdAt,
  ]);
}

export function resolveCoupangShipmentStatusMismatchReason(row: ShipmentStatusCarrier) {
  const shippingStage = deriveCoupangShippingStage(row);
  const issueStage = normalizeCoupangIssueStage(row);
  const priorityBucket = deriveCoupangPriorityBucket(row);
  const pipelineBucket = deriveCoupangPipelineBucket(row);
  const storedMismatchReason = resolveStoredMismatchReason(row, {
    shippingStage,
    issueStage,
    priorityBucket,
    pipelineBucket,
  });

  if (storedMismatchReason) {
    return storedMismatchReason;
  }
  if (issueStage === "shipment_stop_requested") {
    return "출고중지요청은 배송 단계와 별도 이슈 축으로 표시합니다.";
  }
  if (
    issueStage === "shipment_stop_resolved" ||
    issueStage === "cancel" ||
    issueStage === "return" ||
    issueStage === "exchange"
  ) {
    return "반품/취소/교환/출고중지 처리완료는 배송 상태를 덮어쓰지 않고 별도 이슈 배지로 표시합니다.";
  }
  if (issueStage === "cs_open") {
    return "일반 CS는 배송 상태를 바꾸지 않고 CS 진행중 이슈로만 표시합니다.";
  }
  if (isCoupangShipmentDirectDelivery(row)) {
    return "NONE_TRACKING은 배송중으로 계산하고 업체 직접 배송 배지로 구분합니다.";
  }
  if (isCoupangShipmentStaleSync(row)) {
    return "라이브 쿠팡 동기화가 최신이 아니어서 저장된 워크시트 스냅샷 기준으로 표시합니다.";
  }

  return null;
}

export function buildCoupangShipmentStatusSnapshot(row: ShipmentStatusCarrier) {
  const rawOrderStatus = normalizeCoupangRawOrderStatus(row.orderStatus);
  const shippingStage = deriveCoupangShippingStage(row);
  const issueStage = normalizeCoupangIssueStage(row);
  const priorityBucket = deriveCoupangPriorityBucket(row);
  const pipelineBucket = deriveCoupangPipelineBucket(row);

  return {
    rawOrderStatus,
    shippingStage,
    issueStage,
    priorityBucket,
    pipelineBucket,
    priorityCard: priorityBucket,
    pipelineCard: pipelineBucket,
    isDirectDelivery: isCoupangShipmentDirectDelivery(row),
    syncSource: resolveCoupangShipmentSyncSource(row),
    statusDerivedAt: resolveCoupangShipmentStatusDerivedAt(row),
    statusMismatchReason: resolveCoupangShipmentStatusMismatchReason(row),
  };
}

export function withCoupangShipmentStatusSnapshot<TRow extends ShipmentStatusCarrier>(row: TRow) {
  return {
    ...row,
    ...buildCoupangShipmentStatusSnapshot(row),
  };
}

export function matchesCoupangShipmentPriorityBucket(
  row: ShipmentStatusCarrier,
  filter: CoupangShipmentPriorityBucket | "all",
) {
  return filter === "all" || deriveCoupangPriorityBucket(row) === filter;
}

export function matchesCoupangShipmentPipelineBucket(
  row: ShipmentStatusCarrier,
  filter: CoupangShipmentPipelineBucket | "all",
) {
  return filter === "all" || deriveCoupangPipelineBucket(row) === filter;
}

export function matchesCoupangShipmentIssueFilter(
  row: ShipmentStatusCarrier,
  filter: CoupangShipmentIssueFilter,
) {
  if (filter === "all") {
    return true;
  }
  if (filter === "direct_delivery") {
    return isCoupangShipmentDirectDelivery(row);
  }

  const issueStage = normalizeCoupangIssueStage(row);
  return issueStage !== "none" && issueStage === filter;
}

export function resolveCoupangShipmentIssueStage(row: ShipmentStatusCarrier) {
  return normalizeCoupangIssueStage(row);
}

export function resolveCoupangShipmentShippingStage(
  row: Pick<ShipmentStatusCarrier, "orderStatus">,
) {
  return deriveCoupangShippingStage(row);
}

export function resolveCoupangShipmentPriorityCard(
  row: ShipmentStatusCarrier,
  now?: Date,
) {
  return deriveCoupangPriorityBucket(row, now);
}

export function resolveCoupangShipmentPipelineCard(row: ShipmentStatusCarrier) {
  return deriveCoupangPipelineBucket(row);
}

export function matchesCoupangShipmentPriorityCard(
  row: ShipmentStatusCarrier,
  filter: CoupangShipmentPriorityBucket | "all",
) {
  return matchesCoupangShipmentPriorityBucket(row, filter);
}

export function matchesCoupangShipmentPipelineCard(
  row: ShipmentStatusCarrier,
  filter: CoupangShipmentPipelineBucket | "all",
) {
  return matchesCoupangShipmentPipelineBucket(row, filter);
}
