import type { CoupangCustomerServiceIssueBreakdownItem } from "@shared/coupang";

const COUPANG_ORDER_STATUS_LABELS: Record<string, string> = {
  ACCEPT: "결제완료",
  INSTRUCT: "상품준비중",
  DEPARTURE: "배송지시",
  DELIVERING: "배송중",
  FINAL_DELIVERY: "배송완료",
  NONE_TRACKING: "배송중",
  SHIPMENT_STOP_REQUESTED: "출고중지요청",
  SHIPMENT_STOP_HANDLED: "출고중지처리완료",
  CANCEL: "취소",
  RETURN: "반품",
  EXCHANGE: "교환",
};

const CUSTOMER_SERVICE_STATUS_PRIORITY = [
  "shipment_stop_requested",
  "shipment_stop_handled",
  "cancel",
  "return",
  "exchange",
] as const satisfies readonly CoupangCustomerServiceIssueBreakdownItem["type"][];

const CUSTOMER_SERVICE_STATUS_CODE_BY_TYPE = {
  shipment_stop_requested: "SHIPMENT_STOP_REQUESTED",
  shipment_stop_handled: "SHIPMENT_STOP_HANDLED",
  cancel: "CANCEL",
  return: "RETURN",
  exchange: "EXCHANGE",
} as const;

function normalizeLegacySummary(summary: string | null | undefined) {
  return (summary ?? "")
    .trim()
    .replaceAll("출고중지 처리완료", "출고중지처리완료")
    .replaceAll("출고중지 처리 완료", "출고중지처리완료")
    .replaceAll("출고중지 처리됨", "출고중지처리완료")
    .replaceAll("shipment stop handled", "shipment_stop_handled")
    .replaceAll("shipment stop resolved", "shipment_stop_handled");
}

export function normalizeCoupangOrderStatus(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized || null;
}

function resolveCustomerServiceStatusFromBreakdown(
  breakdown: readonly Pick<CoupangCustomerServiceIssueBreakdownItem, "type">[] | null | undefined,
) {
  if (!breakdown?.length) {
    return null;
  }

  for (const issueType of CUSTOMER_SERVICE_STATUS_PRIORITY) {
    if (breakdown.some((item) => item.type === issueType)) {
      return CUSTOMER_SERVICE_STATUS_CODE_BY_TYPE[issueType];
    }
  }

  return null;
}

function resolveCustomerServiceStatusFromSummary(summary: string | null | undefined) {
  const normalizedSummary = normalizeLegacySummary(summary).toLowerCase();
  if (!normalizedSummary) {
    return null;
  }

  if (
    normalizedSummary.includes("출고중지요청") ||
    normalizedSummary.includes("출고중지 요청") ||
    normalizedSummary.includes("shipment_stop_requested")
  ) {
    return "SHIPMENT_STOP_REQUESTED";
  }

  if (
    normalizedSummary.includes("출고중지처리완료") ||
    normalizedSummary.includes("출고중지 처리완료") ||
    normalizedSummary.includes("출고중지 처리 완료") ||
    normalizedSummary.includes("출고중지 처리됨") ||
    normalizedSummary.includes("shipment_stop_handled")
  ) {
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

  return null;
}

export function resolveCoupangDisplayOrderStatus(input: {
  orderStatus: string | null | undefined;
  customerServiceIssueBreakdown?:
    | readonly Pick<CoupangCustomerServiceIssueBreakdownItem, "type">[]
    | null
    | undefined;
  customerServiceIssueSummary?: string | null | undefined;
}) {
  return (
    resolveCustomerServiceStatusFromBreakdown(input.customerServiceIssueBreakdown) ??
    resolveCustomerServiceStatusFromSummary(input.customerServiceIssueSummary) ??
    normalizeCoupangOrderStatus(input.orderStatus)
  );
}

export function formatCoupangOrderStatusLabel(value: string | null | undefined) {
  const normalized = normalizeCoupangOrderStatus(value);
  if (!normalized) {
    return "-";
  }

  return COUPANG_ORDER_STATUS_LABELS[normalized] ?? normalized;
}

export function getCoupangOrderStatusToneClass(value: string | null | undefined) {
  const normalized = normalizeCoupangOrderStatus(value);

  if (normalized === "ACCEPT" || normalized === "INSTRUCT") {
    return "pending";
  }

  if (
    normalized === "DEPARTURE" ||
    normalized === "DELIVERING" ||
    normalized === "NONE_TRACKING"
  ) {
    return "running";
  }

  if (normalized === "FINAL_DELIVERY") {
    return "success";
  }

  if (normalized === "EXCHANGE" || normalized === "SHIPMENT_STOP_HANDLED") {
    return "attention";
  }

  if (
    normalized === "SHIPMENT_STOP_REQUESTED" ||
    normalized === "CANCEL" ||
    normalized === "RETURN"
  ) {
    return "failed";
  }

  return "draft";
}
