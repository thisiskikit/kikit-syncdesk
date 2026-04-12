import type { CoupangShipmentWorksheetViewScope } from "@shared/coupang";
import type {
  InvoiceStatusCardKey,
  OrderStatusCardKey,
  OutputStatusCardKey,
} from "@/lib/coupang-shipment-quick-filters";
import type { FilterState, FulfillmentDecisionFilterValue } from "./types";

const SCOPE_LABELS: Record<CoupangShipmentWorksheetViewScope, string> = {
  dispatch_active: "�۾� ���",
  post_dispatch: "��� ����",
  claims: "���ܡ�Ŭ����",
  all: "��ü",
};

const DECISION_LABELS: Record<FulfillmentDecisionFilterValue, string> = {
  all: "��ü",
  ready: "��� ����",
  invoice_waiting: "���� ���",
  hold: "����",
  blocked: "����",
  recheck: "��Ȯ�� �ʿ�",
};

const INVOICE_STATUS_LABELS: Record<InvoiceStatusCardKey, string> = {
  all: "��ü",
  idle: "�Է� ��",
  ready: "���� ��",
  pending: "���� ��",
  failed: "���� ����",
  applied: "���� �Ϸ�",
};

const OUTPUT_STATUS_LABELS: Record<OutputStatusCardKey, string> = {
  all: "��ü",
  notExported: "�����",
  exported: "��� �Ϸ�",
};

const ORDER_STATUS_LABELS: Record<OrderStatusCardKey, string> = {
  all: "��ü",
  ACCEPT: "�ֹ�����",
  INSTRUCT: "��ǰ�غ���",
  DEPARTURE: "���Ϸ�",
  DELIVERING: "�����",
  FINAL_DELIVERY: "��ۿϷ�",
  NONE_TRACKING: "��������",
  SHIPMENT_STOP_REQUESTED: "������� ��û",
  SHIPMENT_STOP_HANDLED: "������� �Ϸ�",
  CANCEL: "���",
  RETURN: "��ǰ",
  EXCHANGE: "��ȯ",
};

export function getShipmentScopeLabel(scope: CoupangShipmentWorksheetViewScope) {
  return SCOPE_LABELS[scope];
}

export function getFulfillmentDecisionFilterLabel(value: FulfillmentDecisionFilterValue) {
  return DECISION_LABELS[value];
}

export function countActiveShipmentDetailFilters(filters: Pick<FilterState, "invoiceStatusCard" | "orderStatusCard" | "outputStatusCard">) {
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
    tokens.push(`���� ${INVOICE_STATUS_LABELS[input.filters.invoiceStatusCard]}`);
  }

  if (input.filters.outputStatusCard !== "all") {
    tokens.push(`��� ${OUTPUT_STATUS_LABELS[input.filters.outputStatusCard]}`);
  }

  if (input.filters.orderStatusCard !== "all") {
    tokens.push(`�ֹ� ${ORDER_STATUS_LABELS[input.filters.orderStatusCard]}`);
  }

  const normalizedQuery = input.filters.query.trim();
  if (normalizedQuery) {
    tokens.push(`�˻�: ${normalizedQuery}`);
  }

  return tokens;
}
