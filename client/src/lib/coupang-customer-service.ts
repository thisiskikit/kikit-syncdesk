import type {
  CoupangCustomerServiceIssueBreakdownItem,
  CoupangCustomerServiceState,
  CoupangCustomerServiceSummaryItem,
  CoupangOrderRow,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";

type CustomerServiceCarrier = {
  customerServiceIssueCount: number;
  customerServiceState: CoupangCustomerServiceState;
};

type CustomerServiceBreakdownInputItem = Pick<CoupangCustomerServiceIssueBreakdownItem, "type"> &
  Partial<Pick<CoupangCustomerServiceIssueBreakdownItem, "count">>;

type CustomerServiceLabelInput = {
  summary: string | null | undefined;
  count: number | null | undefined;
  state?: CoupangCustomerServiceState | null | undefined;
  breakdown?: readonly CustomerServiceBreakdownInputItem[] | null | undefined;
};

const ISSUE_PRIORITY = [
  "shipment_stop_requested",
  "shipment_stop_handled",
  "cancel",
  "return",
  "exchange",
] as const satisfies readonly CoupangCustomerServiceIssueBreakdownItem["type"][];

const ISSUE_LABELS: Record<CoupangCustomerServiceIssueBreakdownItem["type"], string> = {
  shipment_stop_requested: "출고중지 요청",
  shipment_stop_handled: "출고중지완료",
  cancel: "취소",
  return: "반품",
  exchange: "교환",
};

function normalizeLegacySummary(summary: string | null | undefined) {
  return (summary ?? "").trim().replaceAll("출고중지 처리됨", "출고중지완료");
}

function formatBreakdownSummary(
  breakdown: readonly CustomerServiceBreakdownInputItem[] | null | undefined,
) {
  if (!breakdown?.length) {
    return null;
  }

  return breakdown
    .filter((item) => (item.count ?? 1) > 0)
    .map((item) => `${ISSUE_LABELS[item.type]} ${item.count ?? 1}건`)
    .join(" / ");
}

function resolvePrimaryIssueType(
  input: Pick<CustomerServiceLabelInput, "summary" | "breakdown">,
): CoupangCustomerServiceIssueBreakdownItem["type"] | null {
  for (const type of ISSUE_PRIORITY) {
    if (input.breakdown?.some((item) => item.type === type)) {
      return type;
    }
  }

  const normalizedSummary = normalizeLegacySummary(input.summary).toLowerCase();
  if (!normalizedSummary) {
    return null;
  }

  if (normalizedSummary.includes("출고중지 요청")) {
    return "shipment_stop_requested";
  }

  if (normalizedSummary.includes("출고중지완료")) {
    return "shipment_stop_handled";
  }

  if (normalizedSummary.includes("취소") || normalizedSummary.includes("cancel")) {
    return "cancel";
  }

  if (normalizedSummary.includes("반품") || normalizedSummary.includes("return")) {
    return "return";
  }

  if (normalizedSummary.includes("교환") || normalizedSummary.includes("exchange")) {
    return "exchange";
  }

  return null;
}

export function hasCoupangCustomerServiceIssue(
  input: Pick<CustomerServiceLabelInput, "summary" | "count" | "breakdown">,
) {
  const summary = normalizeLegacySummary(input.summary);
  const count = input.count ?? 0;

  return Boolean(summary) || count > 0 || Boolean(input.breakdown?.length);
}

export function getCoupangCustomerServiceToneClass(
  input: Pick<CustomerServiceLabelInput, "summary" | "breakdown">,
) {
  const primaryType = resolvePrimaryIssueType(input);

  if (
    primaryType === "shipment_stop_requested" ||
    primaryType === "cancel" ||
    primaryType === "return"
  ) {
    return "failed";
  }

  if (primaryType === "shipment_stop_handled" || primaryType === "exchange") {
    return "attention";
  }

  return "attention";
}

export function formatCoupangCustomerServiceLabel(input: CustomerServiceLabelInput) {
  const summary =
    formatBreakdownSummary(input.breakdown) ?? (normalizeLegacySummary(input.summary) || null);
  const count = input.count ?? 0;
  const state = input.state ?? "ready";

  if (state === "unknown") {
    return "CS 미조회";
  }

  if (summary) {
    return state === "stale" ? `CS ${summary} (오래됨)` : `CS ${summary}`;
  }

  if (count > 0) {
    return state === "stale" ? `CS ${count}건 (오래됨)` : `CS ${count}건`;
  }

  return state === "stale" ? "CS 확인 필요" : null;
}

export function formatShipmentWorksheetCustomerServiceLabel(input: CustomerServiceLabelInput) {
  if (!hasCoupangCustomerServiceIssue(input)) {
    return null;
  }

  return formatCoupangCustomerServiceLabel({
    ...input,
    state: input.state === "unknown" ? "ready" : input.state,
  });
}

export function getCoupangCustomerServiceStateText(state: CoupangCustomerServiceState) {
  switch (state) {
    case "ready":
      return "CS 확인 완료";
    case "stale":
      return "CS 오래됨";
    default:
      return "CS 미조회";
  }
}

export function countRowsWithCustomerServiceIssues(rows: Array<CustomerServiceCarrier>) {
  return rows.filter(
    (row) => row.customerServiceState !== "unknown" && row.customerServiceIssueCount > 0,
  ).length;
}

export function countRowsWithUnknownCustomerService(
  rows: Array<Pick<CustomerServiceCarrier, "customerServiceState">>,
) {
  return rows.filter((row) => row.customerServiceState === "unknown").length;
}

export function mergeCoupangOrderCustomerServiceSummary(
  rows: CoupangOrderRow[],
  summaryItems: CoupangCustomerServiceSummaryItem[],
) {
  const summaryByRowKey = new Map(summaryItems.map((item) => [item.rowKey, item] as const));

  return rows.map((row) => {
    const summary = summaryByRowKey.get(row.id);
    if (!summary) {
      return row;
    }

    return {
      ...row,
      customerServiceIssueCount: summary.customerServiceIssueCount,
      customerServiceIssueSummary: summary.customerServiceIssueSummary,
      customerServiceIssueBreakdown: summary.customerServiceIssueBreakdown,
      customerServiceState: summary.customerServiceState,
      customerServiceFetchedAt: summary.customerServiceFetchedAt,
    };
  });
}

export function getShipmentWorksheetCustomerServiceSearchText(
  row: Pick<
    CoupangShipmentWorksheetRow,
    | "customerServiceIssueCount"
    | "customerServiceIssueSummary"
    | "customerServiceIssueBreakdown"
    | "customerServiceState"
  >,
) {
  const label = formatShipmentWorksheetCustomerServiceLabel({
    summary: row.customerServiceIssueSummary,
    count: row.customerServiceIssueCount,
    breakdown: row.customerServiceIssueBreakdown,
    state: row.customerServiceState,
  });

  return label ?? "";
}
