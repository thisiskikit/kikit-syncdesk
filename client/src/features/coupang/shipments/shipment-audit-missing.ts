import type {
  AuditCoupangShipmentWorksheetMissingInput,
  CoupangShipmentIssueFilter,
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
  return value === "out_of_scope" ? "현재 scope 바깥" : "현재 검색/카드 필터로 숨김";
}

export function summarizeShipmentWorksheetAuditResult(
  result: CoupangShipmentWorksheetAuditMissingResponse,
) {
  if (result.liveCount === 0) {
    return "선택한 기간의 상품준비중/주문접수 live 주문이 없습니다.";
  }

  if (result.missingCount === 0 && result.hiddenCount === 0) {
    return `live 주문 ${result.liveCount}건이 모두 worksheet와 현재 화면 조건에서 확인됩니다.`;
  }

  return `live ${result.liveCount}건 중 누락 ${result.missingCount}건, 현재 뷰 숨김 ${result.hiddenCount}건입니다.`;
}

export function buildShipmentWorksheetAuditDetails(
  result: CoupangShipmentWorksheetAuditMissingResponse,
  options?: {
    limit?: number;
    includeHidden?: boolean;
  },
) {
  const limit = options?.limit ?? 4;
  const includeHidden = options?.includeHidden ?? true;

  return [
    ...result.missingItems
      .slice(0, limit)
      .map((item) => `[누락] ${item.status ?? "-"} / ${item.productName} / ${item.shipmentBoxId}`),
    ...(includeHidden
      ? result.hiddenItems
          .slice(0, limit)
          .map((item) => `[숨김] ${item.status ?? "-"} / ${item.productName} / ${item.hiddenReason}`)
      : []),
  ];
}

export function hasShipmentPrepareAuditWarnings(
  result: CoupangShipmentWorksheetAuditMissingResponse,
) {
  return result.missingCount > 0;
}

export function summarizeShipmentPrepareAuditWarning(
  result: CoupangShipmentWorksheetAuditMissingResponse,
) {
  return `수집 누락 ${result.missingCount}건은 현재 worksheet에서 제외하고, 확인 가능한 주문만 계속 처리했습니다.`;
}
