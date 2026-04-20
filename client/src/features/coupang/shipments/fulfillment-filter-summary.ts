import type {
  CoupangShipmentIssueFilter,
  CoupangShipmentWorksheetPipelineCardFilter,
  CoupangShipmentWorksheetPriorityCardFilter,
  CoupangShipmentWorksheetViewScope,
} from "@shared/coupang";
import type {
  InvoiceStatusCardKey,
  OrderStatusCardKey,
  OutputStatusCardKey,
} from "@/lib/coupang-shipment-quick-filters";
import type { FilterState, FulfillmentDecisionFilterValue } from "./types";

const SCOPE_LABELS: Record<CoupangShipmentWorksheetViewScope, string> = {
  dispatch_active: "작업 대상",
  post_dispatch: "배송 이후",
  confirmed: "구매확정",
  claims: "예외·클레임",
  all: "전체",
};

const DECISION_LABELS: Record<FulfillmentDecisionFilterValue, string> = {
  all: "전체",
  ready: "즉시 출고",
  invoice_waiting: "송장 대기",
  hold: "보류",
  blocked: "차단",
  recheck: "재확인 필요",
};

const PRIORITY_CARD_LABELS: Record<CoupangShipmentWorksheetPriorityCardFilter, string> = {
  all: "우선 처리 전체",
  shipment_stop_requested: "출고중지요청",
  same_day_dispatch: "당일출고필요",
  dispatch_delayed: "출고지연",
  long_in_transit: "장기미배송",
};

const PIPELINE_CARD_LABELS: Record<CoupangShipmentWorksheetPipelineCardFilter, string> = {
  all: "배송 단계 전체",
  payment_completed: "결제완료",
  preparing_product: "상품준비중",
  shipping_instruction: "배송지시",
  in_delivery: "배송중",
  delivered: "배송완료",
};

const ISSUE_FILTER_LABELS: Record<CoupangShipmentIssueFilter, string> = {
  all: "이슈 전체",
  shipment_stop_requested: "출고중지요청",
  shipment_stop_resolved: "출고중지처리완료",
  cancel: "취소",
  return: "반품",
  exchange: "교환",
  cs_open: "CS 진행중",
  direct_delivery: "업체 직접 배송",
};

const INVOICE_STATUS_LABELS: Record<InvoiceStatusCardKey, string> = {
  all: "전체",
  idle: "입력 전",
  ready: "전송 가능",
  pending: "송장 전송 중",
  failed: "전송 실패",
  applied: "전송",
};

const OUTPUT_STATUS_LABELS: Record<OutputStatusCardKey, string> = {
  all: "전체",
  notExported: "미출력",
  exported: "출력 완료",
};

const ORDER_STATUS_LABELS: Record<OrderStatusCardKey, string> = {
  all: "전체",
  ACCEPT: "결제완료",
  INSTRUCT: "상품준비중",
  DEPARTURE: "배송지시",
  DELIVERING: "배송중",
  FINAL_DELIVERY: "배송완료",
  NONE_TRACKING: "업체 직접 배송",
  SHIPMENT_STOP_REQUESTED: "출고중지요청",
  SHIPMENT_STOP_HANDLED: "출고중지처리완료",
  CANCEL: "취소",
  RETURN: "반품",
  EXCHANGE: "교환",
};

export function getShipmentScopeLabel(scope: CoupangShipmentWorksheetViewScope) {
  return SCOPE_LABELS[scope];
}

export function getFulfillmentDecisionFilterLabel(value: FulfillmentDecisionFilterValue) {
  return DECISION_LABELS[value];
}

export function countActiveShipmentDetailFilters(
  filters: Partial<
    Pick<FilterState, "decisionStatus" | "invoiceStatusCard" | "orderStatusCard" | "outputStatusCard">
  >,
) {
  let count = 0;

  if ((filters.decisionStatus ?? "all") !== "all") {
    count += 1;
  }
  if ((filters.invoiceStatusCard ?? "all") !== "all") {
    count += 1;
  }
  if ((filters.outputStatusCard ?? "all") !== "all") {
    count += 1;
  }
  if ((filters.orderStatusCard ?? "all") !== "all") {
    count += 1;
  }

  return count;
}

export function buildShipmentFilterSummaryTokens(input: {
  storeName?: string | null;
  filters: Pick<
    FilterState,
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
}) {
  const tokens: string[] = [];

  if (input.storeName?.trim()) {
    tokens.push(input.storeName.trim());
  }

  const from = input.filters.createdAtFrom?.trim();
  const to = input.filters.createdAtTo?.trim();
  if (from && to) {
    tokens.push(`${from} ~ ${to}`);
  }

  tokens.push(getShipmentScopeLabel(input.filters.scope));

  if (input.filters.priorityCard && input.filters.priorityCard !== "all") {
    tokens.push(`우선 ${PRIORITY_CARD_LABELS[input.filters.priorityCard]}`);
  }

  if (input.filters.pipelineCard && input.filters.pipelineCard !== "all") {
    tokens.push(`배송 ${PIPELINE_CARD_LABELS[input.filters.pipelineCard]}`);
  }

  if (input.filters.issueFilter && input.filters.issueFilter !== "all") {
    tokens.push(`이슈 ${ISSUE_FILTER_LABELS[input.filters.issueFilter]}`);
  }

  if ((input.filters.decisionStatus ?? "all") !== "all") {
    tokens.push(DECISION_LABELS[input.filters.decisionStatus ?? "all"]);
  }

  if ((input.filters.invoiceStatusCard ?? "all") !== "all") {
    tokens.push(`송장 ${INVOICE_STATUS_LABELS[input.filters.invoiceStatusCard]}`);
  }

  if ((input.filters.outputStatusCard ?? "all") !== "all") {
    tokens.push(`출력 ${OUTPUT_STATUS_LABELS[input.filters.outputStatusCard]}`);
  }

  if ((input.filters.orderStatusCard ?? "all") !== "all") {
    tokens.push(`주문 ${ORDER_STATUS_LABELS[input.filters.orderStatusCard]}`);
  }

  const normalizedQuery = input.filters.query.trim();
  if (normalizedQuery) {
    tokens.push(`검색: ${normalizedQuery}`);
  }

  return tokens;
}
