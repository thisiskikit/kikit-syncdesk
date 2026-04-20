import type {
  AuditCoupangShipmentWorksheetMissingInput,
  CoupangShipmentIssueFilter,
  CoupangShipmentWorksheetAuditAutoAppliedAction,
  CoupangShipmentWorksheetAuditExceptionReasonCode,
  CoupangShipmentWorksheetAuditHiddenReason,
  CoupangShipmentWorksheetAuditMissingResponse,
  CoupangShipmentWorksheetInvoiceStatusCard,
  CoupangShipmentWorksheetOrderStatusCard,
  CoupangShipmentWorksheetOutputStatusCard,
  CoupangShipmentWorksheetPipelineCardFilter,
  CoupangShipmentWorksheetPriorityCardFilter,
  CoupangShipmentWorksheetViewScope,
} from "@shared/coupang";

export function buildShipmentWorksheetAuditRequest(input: {
  storeId: string;
  createdAtFrom: string;
  createdAtTo: string;
  scope: CoupangShipmentWorksheetViewScope;
  query: string;
  priorityCard: CoupangShipmentWorksheetPriorityCardFilter;
  pipelineCard: CoupangShipmentWorksheetPipelineCardFilter;
  issueFilter: CoupangShipmentIssueFilter;
  invoiceStatusCard: CoupangShipmentWorksheetInvoiceStatusCard;
  orderStatusCard: CoupangShipmentWorksheetOrderStatusCard;
  outputStatusCard: CoupangShipmentWorksheetOutputStatusCard;
}): AuditCoupangShipmentWorksheetMissingInput {
  return {
    storeId: input.storeId,
    createdAtFrom: input.createdAtFrom,
    createdAtTo: input.createdAtTo,
    viewQuery: {
      scope: input.scope,
      query: input.query,
      priorityCard: input.priorityCard,
      pipelineCard: input.pipelineCard,
      issueFilter: input.issueFilter,
      invoiceStatusCard: input.invoiceStatusCard,
      orderStatusCard: input.orderStatusCard,
      outputStatusCard: input.outputStatusCard,
    },
  };
}

export function formatShipmentWorksheetAuditHiddenReason(
  value: CoupangShipmentWorksheetAuditHiddenReason,
) {
  return value === "out_of_scope" ? "현재 scope 바깥" : "현재 검색/카드 필터에서 숨김";
}

export function formatShipmentWorksheetAuditAutoAppliedAction(
  value: CoupangShipmentWorksheetAuditAutoAppliedAction,
) {
  switch (value) {
    case "status_updated":
      return "상태 자동 갱신";
    case "inserted":
      return "worksheet 자동 추가";
    case "restored":
      return "보관함 자동 복구";
    default:
      return "자동 반영";
  }
}

export function formatShipmentWorksheetAuditExceptionReason(
  value: CoupangShipmentWorksheetAuditExceptionReasonCode,
) {
  switch (value) {
    case "duplicate_source_key":
      return "sourceKey 충돌";
    case "archived_conflict":
      return "보관 충돌";
    case "identity_incomplete":
      return "식별자 불완전";
    case "hydration_failed":
      return "상세 보강 실패";
    case "claim_or_blocking_issue":
      return "클레임/차단 이슈";
    case "unknown":
    default:
      return "기타 예외";
  }
}

export function summarizeShipmentWorksheetAuditResult(
  result: CoupangShipmentWorksheetAuditMissingResponse,
) {
  if (result.liveCount === 0) {
    return "선택한 기간에 live ACCEPT/INSTRUCT 주문이 없습니다.";
  }

  return `자동 반영 ${result.autoAppliedCount}건 / 예외 ${result.exceptionCount}건 / 현재 뷰 숨김 ${result.hiddenInfoCount}건`;
}

export function buildShipmentWorksheetAuditDetails(
  result: CoupangShipmentWorksheetAuditMissingResponse,
  options?: {
    limit?: number;
    includeHidden?: boolean;
    includeAutoApplied?: boolean;
  },
) {
  const limit = options?.limit ?? 4;
  const includeHidden = options?.includeHidden ?? true;
  const includeAutoApplied = options?.includeAutoApplied ?? true;

  const exceptionDetails = result.exceptionItems
    .slice(0, limit)
    .map(
      (item) =>
        `[예외:${formatShipmentWorksheetAuditExceptionReason(item.reasonCode)}] ${item.status ?? "-"} / ${item.productName} / ${item.shipmentBoxId ?? "-"}`,
    );
  const autoAppliedDetails = includeAutoApplied
    ? result.autoAppliedItems
        .slice(0, limit)
        .map(
          (item) =>
            `[자동반영:${formatShipmentWorksheetAuditAutoAppliedAction(item.action)}] ${item.status ?? "-"} / ${item.productName} / ${item.shipmentBoxId}`,
        )
    : [];
  const hiddenDetails = includeHidden
    ? result.hiddenItems
        .slice(0, limit)
        .map(
          (item) =>
            `[숨김] ${item.status ?? "-"} / ${item.productName} / ${formatShipmentWorksheetAuditHiddenReason(item.hiddenReason)}`,
        )
    : [];

  return [...exceptionDetails, ...autoAppliedDetails, ...hiddenDetails];
}

export function hasShipmentPrepareAuditWarnings(
  result: CoupangShipmentWorksheetAuditMissingResponse,
) {
  return result.exceptionCount > 0;
}

export function summarizeShipmentPrepareAuditWarning(
  result: CoupangShipmentWorksheetAuditMissingResponse,
) {
  return `예외 ${result.exceptionCount}건은 자동 반영하지 못해 확인이 필요합니다. 현재 처리 가능한 주문만 계속 진행했습니다.`;
}
