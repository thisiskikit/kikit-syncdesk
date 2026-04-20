import type { OperationStatus } from "./operations";
import type {
  CoupangCustomerServiceIssueBreakdownItem,
  CoupangCustomerServiceState,
  CoupangShipmentWorksheetRow,
  CoupangShipmentWorksheetViewScope,
} from "./coupang";

export type CoupangFulfillmentDecisionStatus =
  | "ready"
  | "invoice_waiting"
  | "hold"
  | "blocked"
  | "recheck";

export type CoupangFulfillmentDecisionReason =
  | "cancel_request"
  | "return_exchange"
  | "shipment_stop"
  | "customer_service_effect"
  | "invoice_failure"
  | "sync_failure"
  | "status_conflict"
  | "missing_data"
  | "inquiry_check"
  | "order_info_check"
  | "exception_order"
  | "invoice_required"
  | "invoice_transmitting"
  | "ready_now";

export type CoupangFulfillmentDecisionAllowedAction =
  | "prepare"
  | "invoice"
  | "invoice_input"
  | "details"
  | "cs";

export type CoupangFulfillmentDecisionFilterValue =
  | "all"
  | CoupangFulfillmentDecisionStatus;

export type CoupangFulfillmentLinkDestination =
  | "fulfillment"
  | "cs"
  | "work_center";

export type CoupangFulfillmentLinkVariant = "primary" | "secondary" | "ghost";

export type CoupangFulfillmentWorkspaceTab =
  | "worksheet"
  | "confirmed"
  | "archive"
  | "settings";

export type CoupangFulfillmentCsFocus =
  | "fulfillment-impact"
  | "claims"
  | "inquiries"
  | "recovery";

export type CoupangFulfillmentCsSource =
  | "dashboard"
  | "fulfillment"
  | "work-center";

export type CoupangFulfillmentWorkCenterTab = "operations" | "events";

export interface CoupangFulfillmentNextHandoffLink {
  destination: CoupangFulfillmentLinkDestination;
  label: string;
  variant?: CoupangFulfillmentLinkVariant;
  tab?: CoupangFulfillmentWorkspaceTab;
  scope?: CoupangShipmentWorksheetViewScope;
  decisionStatus?: CoupangFulfillmentDecisionFilterValue;
  csFocus?: CoupangFulfillmentCsFocus;
  csSource?: CoupangFulfillmentCsSource;
  workCenterTab?: CoupangFulfillmentWorkCenterTab;
  operationStatus?: "all" | OperationStatus;
  query?: string | null;
}

export interface CoupangFulfillmentDecisionPresentation {
  status: CoupangFulfillmentDecisionStatus;
  statusLabel: string;
  reason: CoupangFulfillmentDecisionReason;
  reasonLabel: string;
  description: string;
  toneClassName: string;
  allowedActions: CoupangFulfillmentDecisionAllowedAction[];
  shouldBlockBatchActions: boolean;
}

export interface CoupangFulfillmentSecondaryStatusSummary {
  orderStatusCode: string | null;
  orderStatusLabel: string;
  customerServiceSignalLabels: string[];
  customerServiceState: CoupangCustomerServiceState;
  customerServiceStateLabel: string;
}

export interface CoupangShipmentDecisionPreviewItem {
  rowId: string;
  sourceKey: string;
  shipmentBoxId: string;
  orderId: string;
  productOrderNumber: string;
  selpickOrderNumber: string;
  productName: string;
  optionName: string | null;
  receiverName: string;
  primaryDecision: CoupangFulfillmentDecisionPresentation;
  secondaryStatus: CoupangFulfillmentSecondaryStatusSummary;
  riskSummary: string[];
  nextHandoffLinks: CoupangFulfillmentNextHandoffLink[];
}

export interface CoupangShipmentDecisionPreviewGroup {
  status: CoupangFulfillmentDecisionStatus;
  statusLabel: string;
  count: number;
  topReasonLabels: string[];
  previewItems: CoupangShipmentDecisionPreviewItem[];
  nextHandoffLinks: CoupangFulfillmentNextHandoffLink[];
}

export type CoupangFulfillmentDecisionCounts = Record<
  CoupangFulfillmentDecisionFilterValue,
  number
>;

const STATUS_LABELS: Record<CoupangFulfillmentDecisionStatus, string> = {
  ready: "즉시 출고",
  invoice_waiting: "송장 입력",
  hold: "보류",
  blocked: "차단",
  recheck: "재확인",
};

const REASON_LABELS: Record<CoupangFulfillmentDecisionReason, string> = {
  cancel_request: "취소 요청",
  return_exchange: "반품/교환",
  shipment_stop: "출고중지",
  customer_service_effect: "CS 영향",
  invoice_failure: "송장 실패",
  sync_failure: "CS stale",
  status_conflict: "상태 충돌",
  missing_data: "데이터 누락",
  inquiry_check: "문의 확인",
  order_info_check: "주문 정보 확인",
  exception_order: "판단 필요",
  invoice_required: "송장 입력 필요",
  invoice_transmitting: "송장 전송 중",
  ready_now: "즉시 출고 가능",
};

const STATUS_TONE_CLASS_NAMES: Record<CoupangFulfillmentDecisionStatus, string> = {
  ready: "shipment-decision-badge ready",
  invoice_waiting: "shipment-decision-badge invoice",
  hold: "shipment-decision-badge hold",
  blocked: "shipment-decision-badge blocked",
  recheck: "shipment-decision-badge recheck",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
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

const CUSTOMER_SERVICE_STATE_LABELS: Record<CoupangCustomerServiceState, string> = {
  unknown: "미조회",
  ready: "최신",
  stale: "stale",
};

const ISSUE_PRIORITY = [
  "shipment_stop_requested",
  "shipment_stop_handled",
  "cancel",
  "return",
  "exchange",
] as const satisfies readonly CoupangCustomerServiceIssueBreakdownItem["type"][];

function normalizeText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function normalizeSummary(summary: string | null | undefined) {
  return (summary ?? "")
    .trim()
    .replaceAll("출고중지 처리중", "출고중지 완료");
}

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

function hasAppliedInvoiceTransmission(row: CoupangShipmentWorksheetRow) {
  return Boolean(row.invoiceTransmissionStatus === "succeeded" || row.invoiceAppliedAt);
}

function hasDataGap(row: CoupangShipmentWorksheetRow) {
  return (
    !row.receiverName?.trim() ||
    !row.receiverAddress?.trim() ||
    !row.productOrderNumber?.trim()
  );
}

function hasCustomerServiceIssue(row: CoupangShipmentWorksheetRow) {
  return Boolean(normalizeSummary(row.customerServiceIssueSummary)) ||
    (row.customerServiceIssueCount ?? 0) > 0 ||
    row.customerServiceIssueBreakdown.length > 0;
}

function hasNonBlockingCustomerServiceImpact(row: CoupangShipmentWorksheetRow) {
  return hasCustomerServiceIssue(row) && !hasBlockingIssue(row);
}

function isShipmentPhase(row: CoupangShipmentWorksheetRow) {
  const normalized = row.orderStatus?.toUpperCase() ?? "";
  return ["DEPARTURE", "DELIVERING", "FINAL_DELIVERY", "NONE_TRACKING"].includes(normalized);
}

function shouldTreatCustomerServiceSnapshotAsBlockingRecheck(
  row: CoupangShipmentWorksheetRow,
) {
  if (hasAppliedInvoiceTransmission(row)) {
    return false;
  }

  if (isShipmentPhase(row)) {
    return false;
  }

  return true;
}

function needsInvoice(row: CoupangShipmentWorksheetRow) {
  if (row.invoiceTransmissionStatus === "pending") {
    return true;
  }

  if (row.invoiceNumber?.trim()) {
    return false;
  }

  return (
    isShipmentPhase(row) ||
    includesAvailableAction(row, "uploadInvoice") ||
    includesAvailableAction(row, "updateInvoice")
  );
}

function buildRowSearchQuery(row: CoupangShipmentWorksheetRow) {
  return (
    normalizeText(row.shipmentBoxId) ??
    normalizeText(row.productOrderNumber) ??
    normalizeText(row.selpickOrderNumber) ??
    normalizeText(row.orderId)
  );
}

function buildQueueHandoffLinks(
  status: CoupangFulfillmentDecisionStatus,
): CoupangFulfillmentNextHandoffLink[] {
  if (status === "blocked") {
    return [
      {
        destination: "fulfillment",
        label: "차단 큐 보기",
        decisionStatus: "blocked",
        scope: "all",
        variant: "secondary",
      },
      {
        destination: "cs",
        label: "CS 허브",
        csFocus: "claims",
        csSource: "fulfillment",
        variant: "ghost",
      },
    ];
  }

  if (status === "hold") {
    return [
      {
        destination: "fulfillment",
        label: "보류 큐 보기",
        decisionStatus: "hold",
        scope: "all",
        variant: "secondary",
      },
      {
        destination: "cs",
        label: "CS 허브",
        csFocus: "fulfillment-impact",
        csSource: "fulfillment",
        variant: "ghost",
      },
    ];
  }

  if (status === "recheck") {
    return [
      {
        destination: "fulfillment",
        label: "재확인 큐 보기",
        decisionStatus: "recheck",
        scope: "all",
        variant: "secondary",
      },
      {
        destination: "work_center",
        label: "작업센터",
        workCenterTab: "operations",
        operationStatus: "error",
        variant: "ghost",
      },
    ];
  }

  if (status === "invoice_waiting") {
    return [
      {
        destination: "fulfillment",
        label: "송장 입력 큐 보기",
        decisionStatus: "invoice_waiting",
        scope: "dispatch_active",
        variant: "secondary",
      },
    ];
  }

  return [
    {
      destination: "fulfillment",
      label: "즉시 출고 큐 보기",
      decisionStatus: "ready",
      scope: "dispatch_active",
      variant: "secondary",
    },
  ];
}

function buildRowHandoffLinks(
  row: CoupangShipmentWorksheetRow,
  decision: CoupangFulfillmentDecisionPresentation,
): CoupangFulfillmentNextHandoffLink[] {
  const query = buildRowSearchQuery(row);

  if (decision.status === "blocked") {
    return [
      {
        destination: "cs",
        label: "클레임/차단 보기",
        csFocus: "claims",
        csSource: "fulfillment",
        query,
      },
      {
        destination: "work_center",
        label: "복구 로그",
        workCenterTab: "operations",
        operationStatus: "error",
        query,
        variant: "ghost",
      },
    ];
  }

  if (decision.status === "hold") {
    return [
      {
        destination: "cs",
        label: "CS 영향 보기",
        csFocus: "fulfillment-impact",
        csSource: "fulfillment",
        query,
      },
      {
        destination: "work_center",
        label: "관련 작업 로그",
        workCenterTab: "operations",
        operationStatus: "warning",
        query,
        variant: "ghost",
      },
    ];
  }

  if (decision.status === "recheck") {
    return [
      {
        destination: "work_center",
        label: "작업센터 복구",
        workCenterTab: "operations",
        operationStatus: "error",
        query,
      },
      {
        destination: "cs",
        label: "CS stale 확인",
        csFocus: "recovery",
        csSource: "fulfillment",
        query,
        variant: "ghost",
      },
    ];
  }

  if (decision.status === "invoice_waiting") {
    return [
      {
        destination: "fulfillment",
        label: "송장 입력 보기",
        tab: "worksheet",
        scope: "dispatch_active",
        decisionStatus: "invoice_waiting",
        query,
      },
    ];
  }

  return [
    {
      destination: "fulfillment",
      label: "즉시 출고 보기",
      tab: "worksheet",
      scope: "dispatch_active",
      decisionStatus: "ready",
      query,
    },
  ];
}

function resolveOriginalOrderStatusCode(row: CoupangShipmentWorksheetRow) {
  for (const type of ISSUE_PRIORITY) {
    if (row.customerServiceIssueBreakdown.some((item) => item.type === type)) {
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
  if (normalizedSummary.includes("출고중지 완료") || normalizedSummary.includes("shipment_stop_handled")) {
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

  return normalizeText(row.orderStatus)?.toUpperCase() ?? null;
}

function resolveOrderStatusLabel(orderStatusCode: string | null) {
  if (!orderStatusCode) {
    return "-";
  }

  return ORDER_STATUS_LABELS[orderStatusCode] ?? orderStatusCode;
}

function buildCustomerServiceSignalLabels(row: CoupangShipmentWorksheetRow) {
  const labels = row.customerServiceIssueBreakdown
    .map((item) => normalizeText(item.label) ?? REASON_LABELS.return_exchange)
    .filter((value, index, items) => items.indexOf(value) === index);

  if (row.customerServiceState === "unknown" || row.customerServiceState === "stale") {
    labels.push(`CS snapshot ${CUSTOMER_SERVICE_STATE_LABELS[row.customerServiceState]}`);
  }

  return labels.slice(0, 3);
}

function buildRiskSummary(
  row: CoupangShipmentWorksheetRow,
  decision: CoupangFulfillmentDecisionPresentation,
) {
  const risks: string[] = [decision.reasonLabel];

  if (hasDataGap(row) && !risks.includes(REASON_LABELS.missing_data)) {
    risks.push(REASON_LABELS.missing_data);
  }

  if (row.invoiceTransmissionStatus === "failed" && !risks.includes(REASON_LABELS.invoice_failure)) {
    risks.push(REASON_LABELS.invoice_failure);
  }

  if (
    (row.customerServiceState === "unknown" || row.customerServiceState === "stale") &&
    !risks.includes(REASON_LABELS.sync_failure)
  ) {
    risks.push(REASON_LABELS.sync_failure);
  }

  if (
    hasCustomerServiceIssue(row) &&
    !risks.includes(REASON_LABELS.customer_service_effect) &&
    decision.status !== "blocked"
  ) {
    risks.push(REASON_LABELS.customer_service_effect);
  }

  return risks.slice(0, 3);
}

function buildSecondaryStatusSummary(
  row: CoupangShipmentWorksheetRow,
): CoupangFulfillmentSecondaryStatusSummary {
  const orderStatusCode = resolveOriginalOrderStatusCode(row);
  return {
    orderStatusCode,
    orderStatusLabel: resolveOrderStatusLabel(orderStatusCode),
    customerServiceSignalLabels: buildCustomerServiceSignalLabels(row),
    customerServiceState: row.customerServiceState,
    customerServiceStateLabel: CUSTOMER_SERVICE_STATE_LABELS[row.customerServiceState],
  };
}

export function getCoupangFulfillmentDecisionStatusLabel(
  status: CoupangFulfillmentDecisionStatus,
) {
  return STATUS_LABELS[status];
}

export function getCoupangFulfillmentDecisionReasonLabel(
  reason: CoupangFulfillmentDecisionReason,
) {
  return REASON_LABELS[reason];
}

export function getCoupangFulfillmentDecision(
  row: CoupangShipmentWorksheetRow,
): CoupangFulfillmentDecisionPresentation {
  if (hasShipmentStopIssue(row)) {
    return {
      status: "blocked",
      statusLabel: STATUS_LABELS.blocked,
      reason: "shipment_stop",
      reasonLabel: REASON_LABELS.shipment_stop,
      description: "출고중지 요청 또는 처리 이력이 있어 출고 작업을 막습니다.",
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

  if (
    (row.customerServiceState === "unknown" || row.customerServiceState === "stale") &&
    shouldTreatCustomerServiceSnapshotAsBlockingRecheck(row)
  ) {
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
      reason: row.customerServiceIssueSummary?.trim()
        ? "inquiry_check"
        : "customer_service_effect",
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

export function matchesCoupangFulfillmentDecisionFilter(
  row: CoupangShipmentWorksheetRow,
  filterValue: CoupangFulfillmentDecisionFilterValue,
) {
  if (filterValue === "all") {
    return true;
  }

  return getCoupangFulfillmentDecision(row).status === filterValue;
}

export function buildCoupangFulfillmentDecisionCounts(
  rows: readonly CoupangShipmentWorksheetRow[],
): CoupangFulfillmentDecisionCounts {
  return rows.reduce(
    (current, row) => {
      const decision = getCoupangFulfillmentDecision(row);
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
    } satisfies CoupangFulfillmentDecisionCounts,
  );
}

export function buildCoupangShipmentRowSummary(row: CoupangShipmentWorksheetRow) {
  const primaryDecision = getCoupangFulfillmentDecision(row);
  return {
    primaryDecision,
    secondaryStatus: buildSecondaryStatusSummary(row),
    riskSummary: buildRiskSummary(row, primaryDecision),
    nextHandoffLinks: buildRowHandoffLinks(row, primaryDecision),
  };
}

function buildPreviewItem(row: CoupangShipmentWorksheetRow): CoupangShipmentDecisionPreviewItem {
  const summary = buildCoupangShipmentRowSummary(row);
  return {
    rowId: row.id,
    sourceKey: row.sourceKey,
    shipmentBoxId: row.shipmentBoxId,
    orderId: row.orderId,
    productOrderNumber: row.productOrderNumber,
    selpickOrderNumber: row.selpickOrderNumber,
    productName: row.productName,
    optionName: row.optionName,
    receiverName: row.receiverName,
    primaryDecision: summary.primaryDecision,
    secondaryStatus: summary.secondaryStatus,
    riskSummary: summary.riskSummary,
    nextHandoffLinks: summary.nextHandoffLinks,
  };
}

export function buildCoupangShipmentDecisionPreviewGroups(
  rows: readonly CoupangShipmentWorksheetRow[],
  previewLimit = 5,
): Record<CoupangFulfillmentDecisionStatus, CoupangShipmentDecisionPreviewGroup> {
  const groups = {
    ready: {
      status: "ready",
      statusLabel: STATUS_LABELS.ready,
      count: 0,
      topReasonLabels: [] as string[],
      previewItems: [] as CoupangShipmentDecisionPreviewItem[],
      nextHandoffLinks: buildQueueHandoffLinks("ready"),
    },
    invoice_waiting: {
      status: "invoice_waiting",
      statusLabel: STATUS_LABELS.invoice_waiting,
      count: 0,
      topReasonLabels: [] as string[],
      previewItems: [] as CoupangShipmentDecisionPreviewItem[],
      nextHandoffLinks: buildQueueHandoffLinks("invoice_waiting"),
    },
    hold: {
      status: "hold",
      statusLabel: STATUS_LABELS.hold,
      count: 0,
      topReasonLabels: [] as string[],
      previewItems: [] as CoupangShipmentDecisionPreviewItem[],
      nextHandoffLinks: buildQueueHandoffLinks("hold"),
    },
    blocked: {
      status: "blocked",
      statusLabel: STATUS_LABELS.blocked,
      count: 0,
      topReasonLabels: [] as string[],
      previewItems: [] as CoupangShipmentDecisionPreviewItem[],
      nextHandoffLinks: buildQueueHandoffLinks("blocked"),
    },
    recheck: {
      status: "recheck",
      statusLabel: STATUS_LABELS.recheck,
      count: 0,
      topReasonLabels: [] as string[],
      previewItems: [] as CoupangShipmentDecisionPreviewItem[],
      nextHandoffLinks: buildQueueHandoffLinks("recheck"),
    },
  } satisfies Record<
    CoupangFulfillmentDecisionStatus,
    CoupangShipmentDecisionPreviewGroup
  >;

  const reasonCounts = {
    ready: new Map<string, number>(),
    invoice_waiting: new Map<string, number>(),
    hold: new Map<string, number>(),
    blocked: new Map<string, number>(),
    recheck: new Map<string, number>(),
  } satisfies Record<CoupangFulfillmentDecisionStatus, Map<string, number>>;

  for (const row of rows) {
    const decision = getCoupangFulfillmentDecision(row);
    const group = groups[decision.status];
    group.count += 1;

    const currentReasonCount = reasonCounts[decision.status].get(decision.reasonLabel) ?? 0;
    reasonCounts[decision.status].set(decision.reasonLabel, currentReasonCount + 1);

    if (group.previewItems.length < previewLimit) {
      group.previewItems.push(buildPreviewItem(row));
    }
  }

  for (const status of Object.keys(groups) as CoupangFulfillmentDecisionStatus[]) {
    groups[status].topReasonLabels = Array.from(reasonCounts[status].entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko-KR"))
      .slice(0, 3)
      .map(([label]) => label);
  }

  return groups;
}
