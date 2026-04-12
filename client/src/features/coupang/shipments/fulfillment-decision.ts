import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import { hasCoupangCustomerServiceIssue } from "@/lib/coupang-customer-service";
import type {
  FulfillmentDecisionFilterValue,
  FulfillmentDecisionPresentation,
  FulfillmentDecisionReason,
  FulfillmentDecisionStatus,
} from "./types";

const STATUS_LABELS: Record<FulfillmentDecisionStatus, string> = {
  ready: "출고 가능",
  invoice_waiting: "송장 대기",
  hold: "보류",
  blocked: "차단",
  recheck: "재확인 필요",
};

const REASON_LABELS: Record<FulfillmentDecisionReason, string> = {
  cancel_request: "취소 요청",
  return_exchange: "반품·교환",
  shipment_stop: "출고중지",
  customer_service_effect: "CS 영향",
  invoice_failure: "송장 반영 실패",
  sync_failure: "동기화 실패",
  status_conflict: "상태 충돌",
  missing_data: "데이터 누락",
  inquiry_check: "문의 확인",
  order_info_check: "주문 정보 확인",
  exception_order: "예외 주문",
  invoice_required: "송장 입력 필요",
  invoice_transmitting: "송장 전송 진행",
  ready_now: "즉시 실행 가능",
};

const STATUS_TONE_CLASS_NAMES: Record<FulfillmentDecisionStatus, string> = {
  ready: "shipment-decision-badge ready",
  invoice_waiting: "shipment-decision-badge invoice",
  hold: "shipment-decision-badge hold",
  blocked: "shipment-decision-badge blocked",
  recheck: "shipment-decision-badge recheck",
};

function includesAvailableAction(row: CoupangShipmentWorksheetRow, action: string) {
  return row.availableActions.includes(action as never);
}

function hasClaimLikeStatus(row: CoupangShipmentWorksheetRow) {
  const normalized = row.orderStatus?.toUpperCase() ?? "";
  return ["CANCEL", "RETURN", "EXCHANGE"].includes(normalized);
}

function hasShipmentStopIssue(row: CoupangShipmentWorksheetRow) {
  return row.customerServiceIssueBreakdown.some(
    (item) => item.type === "shipment_stop_requested" || item.type === "shipment_stop_handled",
  );
}

function hasClaimIssue(row: CoupangShipmentWorksheetRow) {
  return row.customerServiceIssueBreakdown.some(
    (item) => item.type === "cancel" || item.type === "return" || item.type === "exchange",
  );
}

function hasBlockingIssue(row: CoupangShipmentWorksheetRow) {
  return hasClaimLikeStatus(row) || hasShipmentStopIssue(row) || hasClaimIssue(row);
}

function hasInvoiceFailure(row: CoupangShipmentWorksheetRow) {
  return row.invoiceTransmissionStatus === "failed";
}

function hasDataGap(row: CoupangShipmentWorksheetRow) {
  return !row.receiverName?.trim() || !row.receiverAddress?.trim() || !row.productOrderNumber?.trim();
}

function hasNonBlockingCustomerServiceImpact(row: CoupangShipmentWorksheetRow) {
  return (
    hasCoupangCustomerServiceIssue({
      summary: row.customerServiceIssueSummary,
      count: row.customerServiceIssueCount,
      breakdown: row.customerServiceIssueBreakdown,
    }) && !hasBlockingIssue(row)
  );
}

function isShipmentPhase(row: CoupangShipmentWorksheetRow) {
  const normalized = row.orderStatus?.toUpperCase() ?? "";
  return ["DEPARTURE", "DELIVERING", "FINAL_DELIVERY", "NONE_TRACKING"].includes(normalized);
}

function needsInvoice(row: CoupangShipmentWorksheetRow) {
  if (row.invoiceTransmissionStatus === "pending") {
    return true;
  }

  if (row.invoiceNumber?.trim()) {
    return false;
  }

  return isShipmentPhase(row) || includesAvailableAction(row, "uploadInvoice") || includesAvailableAction(row, "updateInvoice");
}

export function getFulfillmentDecisionStatusLabel(status: FulfillmentDecisionStatus) {
  return STATUS_LABELS[status];
}

export function getFulfillmentDecisionReasonLabel(reason: FulfillmentDecisionReason) {
  return REASON_LABELS[reason];
}

export function getFulfillmentDecision(row: CoupangShipmentWorksheetRow): FulfillmentDecisionPresentation {
  if (hasShipmentStopIssue(row)) {
    return {
      status: "blocked",
      statusLabel: STATUS_LABELS.blocked,
      reason: "shipment_stop",
      reasonLabel: REASON_LABELS.shipment_stop,
      description: "출고중지 또는 출고중지 처리 이력이 있어 출고 작업을 막습니다.",
      toneClassName: STATUS_TONE_CLASS_NAMES.blocked,
      allowedActions: ["details", "cs"],
      shouldBlockBatchActions: true,
    };
  }

  if (hasClaimLikeStatus(row) || hasClaimIssue(row)) {
    return {
      status: "blocked",
      statusLabel: STATUS_LABELS.blocked,
      reason: hasClaimLikeStatus(row) ? "cancel_request" : "return_exchange",
      reasonLabel: hasClaimLikeStatus(row)
        ? REASON_LABELS.cancel_request
        : REASON_LABELS.return_exchange,
      description: "취소, 반품, 교환 성격의 이슈가 있어 즉시 출고 작업을 진행하면 안 됩니다.",
      toneClassName: STATUS_TONE_CLASS_NAMES.blocked,
      allowedActions: ["details", "cs"],
      shouldBlockBatchActions: true,
    };
  }

  if (hasInvoiceFailure(row)) {
    return {
      status: "recheck",
      statusLabel: STATUS_LABELS.recheck,
      reason: "invoice_failure",
      reasonLabel: REASON_LABELS.invoice_failure,
      description: "송장 반영 실패 이력이 있어 상태를 다시 확인한 뒤 재전송해야 합니다.",
      toneClassName: STATUS_TONE_CLASS_NAMES.recheck,
      allowedActions: ["details", "invoice_input", "cs"],
      shouldBlockBatchActions: true,
    };
  }

  if (row.customerServiceState === "unknown" || row.customerServiceState === "stale") {
    return {
      status: "recheck",
      statusLabel: STATUS_LABELS.recheck,
      reason: "sync_failure",
      reasonLabel: REASON_LABELS.sync_failure,
      description: "CS 스냅샷이 최신이 아니어서 출고 전 다시 확인이 필요합니다.",
      toneClassName: STATUS_TONE_CLASS_NAMES.recheck,
      allowedActions: ["details", "cs"],
      shouldBlockBatchActions: true,
    };
  }

  if (hasDataGap(row)) {
    return {
      status: "recheck",
      statusLabel: STATUS_LABELS.recheck,
      reason: "missing_data",
      reasonLabel: REASON_LABELS.missing_data,
      description: "출고 판단에 필요한 수취 정보가 비어 있어 먼저 데이터 확인이 필요합니다.",
      toneClassName: STATUS_TONE_CLASS_NAMES.recheck,
      allowedActions: ["details", "invoice_input"],
      shouldBlockBatchActions: true,
    };
  }

  if (hasNonBlockingCustomerServiceImpact(row)) {
    return {
      status: "hold",
      statusLabel: STATUS_LABELS.hold,
      reason: row.customerServiceIssueSummary?.trim() ? "inquiry_check" : "customer_service_effect",
      reasonLabel: row.customerServiceIssueSummary?.trim()
        ? REASON_LABELS.inquiry_check
        : REASON_LABELS.customer_service_effect,
      description: "CS 영향이 있어 즉시 실행보다 확인이 먼저 필요한 주문입니다.",
      toneClassName: STATUS_TONE_CLASS_NAMES.hold,
      allowedActions: ["details", "cs"],
      shouldBlockBatchActions: true,
    };
  }

  if (row.invoiceTransmissionStatus === "pending") {
    return {
      status: "invoice_waiting",
      statusLabel: STATUS_LABELS.invoice_waiting,
      reason: "invoice_transmitting",
      reasonLabel: REASON_LABELS.invoice_transmitting,
      description: "송장 전송이 진행 중이라 완료 여부를 먼저 확인해야 합니다.",
      toneClassName: STATUS_TONE_CLASS_NAMES.invoice_waiting,
      allowedActions: ["details", "invoice"],
      shouldBlockBatchActions: false,
    };
  }

  if (needsInvoice(row)) {
    return {
      status: "invoice_waiting",
      statusLabel: STATUS_LABELS.invoice_waiting,
      reason: "invoice_required",
      reasonLabel: REASON_LABELS.invoice_required,
      description: "출고 흐름은 진행 가능하지만 송장 입력 또는 송장 전송이 아직 필요합니다.",
      toneClassName: STATUS_TONE_CLASS_NAMES.invoice_waiting,
      allowedActions: ["details", "invoice", "invoice_input"],
      shouldBlockBatchActions: false,
    };
  }

  return {
    status: "ready",
    statusLabel: STATUS_LABELS.ready,
    reason: includesAvailableAction(row, "markPreparing") ? "ready_now" : "exception_order",
    reasonLabel: includesAvailableAction(row, "markPreparing")
      ? REASON_LABELS.ready_now
      : REASON_LABELS.exception_order,
    description: includesAvailableAction(row, "markPreparing")
      ? "즉시 출고 관련 작업을 진행할 수 있는 주문입니다."
      : "즉시 차단할 사유는 없지만 현재 액션 가능 여부를 다시 확인할 필요가 있습니다.",
    toneClassName: STATUS_TONE_CLASS_NAMES.ready,
    allowedActions: includesAvailableAction(row, "markPreparing")
      ? ["details", "prepare", "invoice_input", "invoice"]
      : ["details"],
    shouldBlockBatchActions: !includesAvailableAction(row, "markPreparing"),
  };
}

export function matchesFulfillmentDecisionFilter(
  row: CoupangShipmentWorksheetRow,
  filterValue: FulfillmentDecisionFilterValue,
) {
  if (filterValue === "all") {
    return true;
  }

  return getFulfillmentDecision(row).status === filterValue;
}

export function buildFulfillmentDecisionCounts(rows: readonly CoupangShipmentWorksheetRow[]) {
  return rows.reduce(
    (current, row) => {
      const decision = getFulfillmentDecision(row);
      current.all += 1;
      current[decision.status] += 1;
      return current;
    },
    {
      all: 0,
      ready: 0,
      invoice_waiting: 0,
      hold: 0,
      blocked: 0,
      recheck: 0,
    } as Record<FulfillmentDecisionFilterValue, number>,
  );
}
