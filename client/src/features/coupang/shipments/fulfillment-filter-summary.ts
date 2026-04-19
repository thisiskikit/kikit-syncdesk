import type { CoupangShipmentWorksheetViewScope } from "@shared/coupang";
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
  claims: "예외/클레임",
  all: "전체",
};

const DECISION_LABELS: Record<FulfillmentDecisionFilterValue, string> = {
  all: "전체",
  ready: "출고 가능",
  invoice_waiting: "송장 대기",
  hold: "보류",
  blocked: "차단",
  recheck: "재확인 필요",
};

const INVOICE_STATUS_LABELS: Record<InvoiceStatusCardKey, string> = {
  all: "전체",
  idle: "입력 전",
  ready: "전송 전",
  pending: "전송 중",
  failed: "전송 실패",
  applied: "전송 완료",
};

const OUTPUT_STATUS_LABELS: Record<OutputStatusCardKey, string> = {
  all: "전체",
  notExported: "미출력",
  exported: "출력 완료",
};

const ORDER_STATUS_LABELS: Record<OrderStatusCardKey, string> = {
  all: "전체",
  ACCEPT: "주문접수",
  INSTRUCT: "상품준비중",
  DEPARTURE: "출고완료",
  DELIVERING: "배송중",
  FINAL_DELIVERY: "배송완료",
  NONE_TRACKING: "추적없음",
  SHIPMENT_STOP_REQUESTED: "출고중지 요청",
  SHIPMENT_STOP_HANDLED: "출고중지 완료",
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
  filters: Pick<FilterState, "invoiceStatusCard" | "orderStatusCard" | "outputStatusCard">,
) {
  let count = 0;

  if (filters.invoiceStatusCard !== "all") {
    count += 1;
  }
  if (filters.outputStatusCard !== "all") {
    count += 1;
  }
  if (filters.orderStatusCard !== "all") {
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

  if (input.filters.decisionStatus !== "all") {
    tokens.push(getFulfillmentDecisionFilterLabel(input.filters.decisionStatus));
  }

  if (input.filters.invoiceStatusCard !== "all") {
    tokens.push(`송장 ${INVOICE_STATUS_LABELS[input.filters.invoiceStatusCard]}`);
  }

  if (input.filters.outputStatusCard !== "all") {
    tokens.push(`출력 ${OUTPUT_STATUS_LABELS[input.filters.outputStatusCard]}`);
  }

  if (input.filters.orderStatusCard !== "all") {
    tokens.push(`주문 ${ORDER_STATUS_LABELS[input.filters.orderStatusCard]}`);
  }

  const normalizedQuery = input.filters.query.trim();
  if (normalizedQuery) {
    tokens.push(`검색 ${normalizedQuery}`);
  }

  return tokens;
}
