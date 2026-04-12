import type {
  AuditCoupangShipmentWorksheetMissingInput,
  CoupangShipmentWorksheetAuditHiddenReason,
  CoupangShipmentWorksheetAuditMissingResponse,
  CoupangShipmentWorksheetInvoiceStatusCard,
  CoupangShipmentWorksheetOrderStatusCard,
  CoupangShipmentWorksheetOutputStatusCard,
  CoupangShipmentWorksheetViewScope,
} from "@shared/coupang";

export function buildShipmentWorksheetAuditRequest(input: {
  storeId: string;
  createdAtFrom: string;
  createdAtTo: string;
  scope: CoupangShipmentWorksheetViewScope;
  query: string;
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
