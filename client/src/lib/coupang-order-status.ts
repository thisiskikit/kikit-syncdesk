import type { CoupangCustomerServiceIssueBreakdownItem } from "@shared/coupang";

const COUPANG_ORDER_STATUS_LABELS: Record<string, string> = {
  ACCEPT: "주문접수",
  INSTRUCT: "상품준비중",
  DEPARTURE: "출고완료",
  DELIVERING: "배송중",
  FINAL_DELIVERY: "배송완료",
  NONE_TRACKING: "추적없음",
  SHIPMENT_STOP_REQUESTED: "출고중지 요청",
  SHIPMENT_STOP_HANDLED: "출고중지완료",
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
  return (summary ?? "").trim().replaceAll("출고중지 처리됨", "출고중지완료");
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
    normalizedSummary.includes("출고중지 요청") ||
    normalizedSummary.includes("shipment_stop_requested")
  ) {
    return "SHIPMENT_STOP_REQUESTED";
  }

  if (
    normalizedSummary.includes("출고중지완료") ||
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

  if (normalized === "DEPARTURE" || normalized === "DELIVERING") {
    return "running";
  }

  if (normalized === "FINAL_DELIVERY") {
    return "success";
  }

  if (
    normalized === "NONE_TRACKING" ||
    normalized === "EXCHANGE" ||
    normalized === "SHIPMENT_STOP_HANDLED"
  ) {
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
