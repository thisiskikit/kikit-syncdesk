export const operationChannels = ["naver", "coupang", "draft", "shared"] as const;
export type OperationChannel = (typeof operationChannels)[number];

export const operationStatuses = ["queued", "running", "success", "error", "warning"] as const;
export type OperationStatus = (typeof operationStatuses)[number];

export const operationModes = ["foreground", "background", "system", "retry"] as const;
export type OperationMode = (typeof operationModes)[number];

export const operationCancelledErrorCode = "OPERATION_CANCELLED";
export const operationCancelRequestedLabel = "중단 요청";
export const operationCancelRequestedMessage = "중단 요청됨. 현재 단계가 끝나면 멈춥니다.";
export const operationCancelledMessage = "사용자 요청으로 작업을 중단했습니다.";

export const operationTargetTypes = [
  "store",
  "product",
  "originProduct",
  "vendorItem",
  "order",
  "draft",
  "execution",
  "selection",
  "menu",
  "unknown",
] as const;
export type OperationTargetType = (typeof operationTargetTypes)[number];

export interface OperationResultSummary {
  headline: string | null;
  detail: string | null;
  stats: Record<string, unknown> | null;
  preview: string | null;
}

export const operationTicketDetailResults = [
  "success",
  "warning",
  "error",
  "skipped",
] as const;
export type OperationTicketDetailResult = (typeof operationTicketDetailResults)[number];

export interface OperationTicketDetail {
  result: OperationTicketDetailResult;
  label: string | null;
  message: string | null;
  targetId: string | null;
  sourceKey: string | null;
  selpickOrderNumber: string | null;
  productOrderNumber: string | null;
  shipmentBoxId: string | null;
  orderId: string | null;
  receiptId: string | null;
  vendorItemId: string | null;
  productName: string | null;
  receiverName: string | null;
  deliveryCompanyCode: string | null;
  invoiceNumber: string | null;
}

export interface OperationTicketDetailState {
  totalCount: number;
  recordedCount: number;
  truncated: boolean;
  items: OperationTicketDetail[];
}

export interface OperationLogEntry {
  id: string;
  channel: OperationChannel;
  menuKey: string;
  actionKey: string;
  status: OperationStatus;
  mode: OperationMode;
  targetType: OperationTargetType;
  targetCount: number;
  targetIds: string[];
  requestPayload: Record<string, unknown> | null;
  normalizedPayload: Record<string, unknown> | null;
  resultSummary: OperationResultSummary | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  retryOfOperationId: string | null;
  startedAt: string;
  cancelRequestedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationListResponse {
  items: OperationLogEntry[];
}

export interface OperationRuntimeStatusItem {
  channel: OperationChannel;
  schedulerCount: number;
  activeRequestCount: number;
  queuedRequestCount: number;
  concurrencyLimit: number;
  minRequestGapMs: number;
  coolingDownSchedulerCount: number;
  cooldownRemainingMs: number;
  latestBlockedUntil: string | null;
  latestNextAvailableAt: string | null;
  fetchedAt: string;
}

export interface OperationRuntimeStatusResponse {
  items: OperationRuntimeStatusItem[];
}

export interface OperationExecutionResponse<T> {
  operation: OperationLogEntry;
  data: T;
}

function compactJson(value: unknown, maxLength = 140) {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= maxLength) {
      return serialized;
    }

    return `${serialized.slice(0, maxLength - 3)}...`;
  } catch {
    return String(value);
  }
}

function titleCaseWords(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length ? value : null;
}

function isOperationTicketDetailResult(value: unknown): value is OperationTicketDetailResult {
  return (
    typeof value === "string" &&
    (operationTicketDetailResults as readonly string[]).includes(value)
  );
}

function normalizeOperationTicketDetail(value: unknown): OperationTicketDetail | null {
  if (!isRecord(value) || !isOperationTicketDetailResult(value.result)) {
    return null;
  }

  return {
    result: value.result,
    label: asNullableString(value.label),
    message: asNullableString(value.message),
    targetId: asNullableString(value.targetId),
    sourceKey: asNullableString(value.sourceKey),
    selpickOrderNumber: asNullableString(value.selpickOrderNumber),
    productOrderNumber: asNullableString(value.productOrderNumber),
    shipmentBoxId: asNullableString(value.shipmentBoxId),
    orderId: asNullableString(value.orderId),
    receiptId: asNullableString(value.receiptId),
    vendorItemId: asNullableString(value.vendorItemId),
    productName: asNullableString(value.productName),
    receiverName: asNullableString(value.receiverName),
    deliveryCompanyCode: asNullableString(value.deliveryCompanyCode),
    invoiceNumber: asNullableString(value.invoiceNumber),
  };
}

const menuLabelMap: Record<string, string> = {
  "naver.connection": "NAVER 연결관리",
  "naver.products": "NAVER 상품 목록",
  "naver.orders": "NAVER 주문 조회",
  "naver.shipment": "NAVER 발주/발송",
  "naver.claims": "NAVER 취소/반품/교환",
  "naver.inquiries": "NAVER 문의",
  "naver.settlements": "NAVER 정산",
  "naver.seller-info": "NAVER 판매자정보",
  "naver.stats": "NAVER 통계",
  "coupang.connection": "COUPANG 연결관리",
  "coupang.logistics": "COUPANG 카테고리/물류센터",
  "coupang.products": "COUPANG 상품 목록",
  "coupang.orders": "COUPANG 주문/출고",
  "coupang.shipments": "COUPANG 배송/송장",
  "coupang.cancel-refunds": "COUPANG 취소/환불",
  "coupang.returns": "COUPANG 반품",
  "coupang.exchanges": "COUPANG 교환",
  "coupang.inquiries": "COUPANG 문의/CS",
  "coupang.coupons": "COUPANG 쿠폰/캐시백",
  "coupang.settlements": "COUPANG 정산",
  "coupang.rocket-growth": "COUPANG 로켓그로스",
  "coupang.logs": "COUPANG 작업 로그",
  "engine.catalog": "공통 Draft",
  "engine.runs": "실행 엔진",
  "operations.center": "작업센터",
};

const actionLabelMap: Record<string, string> = {
  "test-connection": "연결 테스트",
  "save-settings": "설정 저장",
  "bulk-price-update": "대량 가격 반영",
  "bulk-price-preview": "대량 가격 미리보기",
  "update-price": "가격 변경",
  "update-quantity": "재고 변경",
  "update-sale-status": "판매상태 변경",
  "list-products": "상품 조회",
  "list-orders": "주문 조회",
  "mark-preparing": "상품준비중 처리",
  "refresh-worksheet": "출고 후속 보강",
  "upload-invoice": "송장 업로드",
  "update-invoice": "송장 수정",
  "mark-shipment-stopped": "출고중지완료",
  "mark-already-shipped": "이미출고",
  "cancel-order-item": "주문 취소",
  "confirm-return-inbound": "반품 입고 확인",
  "upload-return-collection-invoice": "반품 회수 송장 등록",
  "confirm-exchange-inbound": "교환 입고 확인",
  "upload-exchange-invoice": "교환상품 송장 업로드",
  "confirm-orders": "발주 확인",
  "dispatch-orders": "발송 처리",
  "delay-dispatch": "발송 지연 처리",
  "approve-cancel": "취소 승인",
  "approve-return": "반품 승인",
  "hold-return": "반품 보류",
  "release-return-hold": "반품 보류 해제",
  "reject-return": "반품 거부",
  "hold-exchange": "교환 보류",
  "release-exchange-hold": "교환 보류 해제",
  "reject-exchange": "교환 거부",
  "redeliver-exchange": "교환 재배송",
  "answer-customer-inquiry": "고객문의 답변 등록",
  "update-customer-inquiry-answer": "고객문의 답변 수정",
  "answer-product-inquiry": "상품 문의 답변 등록",
  "list-categories": "카테고리 조회",
  "list-outbound-centers": "출고지 조회",
  "list-return-centers": "반품지 조회",
  "list-product-inquiries": "상품 문의 조회",
  "list-call-center-inquiries": "콜센터 문의 조회",
  "list-rocket-growth-products": "로켓그로스 상품 조회",
  "list-rocket-growth-inventory": "로켓그로스 재고 조회",
  "retry-operation": "작업 재시도",
};

export function getOperationMenuLabel(menuKey: string) {
  return menuLabelMap[menuKey] ?? titleCaseWords(menuKey.replaceAll(".", " "));
}

export function getOperationActionLabel(actionKey: string) {
  return actionLabelMap[actionKey] ?? titleCaseWords(actionKey);
}

export function getOperationTitle(operation: Pick<OperationLogEntry, "menuKey" | "actionKey">) {
  return `${getOperationMenuLabel(operation.menuKey)} / ${getOperationActionLabel(operation.actionKey)}`;
}

export function getOperationResultSummaryText(summary: OperationResultSummary | null) {
  if (!summary) {
    return null;
  }

  return summary.headline ?? summary.preview ?? summary.detail ?? null;
}

export function isOperationActive(
  operation: Pick<OperationLogEntry, "status" | "finishedAt">,
) {
  return (
    !operation.finishedAt &&
    (operation.status === "queued" || operation.status === "running")
  );
}

export function isOperationCancellationPending(
  operation: Pick<OperationLogEntry, "cancelRequestedAt" | "finishedAt">,
) {
  return Boolean(operation.cancelRequestedAt && !operation.finishedAt);
}

export function isOperationCancellable(
  operation: Pick<
    OperationLogEntry,
    "channel" | "menuKey" | "actionKey" | "status" | "finishedAt"
  >,
) {
  if (!isOperationActive(operation)) {
    return false;
  }

  return (
    operation.channel === "coupang" &&
    operation.menuKey === "coupang.shipments" &&
    (operation.actionKey === "collect-worksheet" ||
      operation.actionKey === "refresh-worksheet" ||
      operation.actionKey === "reconcile-live-worksheet" ||
      operation.actionKey === "audit-missing")
  );
}

export function getOperationTicketDetailState(
  summary: OperationResultSummary | null,
): OperationTicketDetailState {
  const stats = summary?.stats;
  if (!isRecord(stats)) {
    return {
      totalCount: 0,
      recordedCount: 0,
      truncated: false,
      items: [],
    };
  }

  const items = Array.isArray(stats.ticketDetails)
    ? stats.ticketDetails
        .map((item) => normalizeOperationTicketDetail(item))
        .filter((item): item is OperationTicketDetail => Boolean(item))
    : [];

  const recordedCount =
    typeof stats.ticketDetailsRecorded === "number" && Number.isFinite(stats.ticketDetailsRecorded)
      ? Math.max(0, Math.trunc(stats.ticketDetailsRecorded))
      : items.length;
  const totalCount =
    typeof stats.ticketDetailsTotalCount === "number" &&
    Number.isFinite(stats.ticketDetailsTotalCount)
      ? Math.max(0, Math.trunc(stats.ticketDetailsTotalCount))
      : recordedCount;

  return {
    totalCount,
    recordedCount,
    truncated: stats.ticketDetailsTruncated === true,
    items,
  };
}

export function getOperationErrorSummary(
  operation: Pick<OperationLogEntry, "errorCode" | "errorMessage">,
) {
  if (operation.errorCode && operation.errorMessage) {
    return `${operation.errorCode}: ${operation.errorMessage}`;
  }

  return operation.errorMessage ?? operation.errorCode ?? null;
}

export function getOperationPayloadPreview(
  operation: Pick<OperationLogEntry, "requestPayload" | "normalizedPayload">,
  maxLength = 140,
) {
  if (operation.normalizedPayload) {
    return compactJson(operation.normalizedPayload, maxLength);
  }

  if (operation.requestPayload) {
    return compactJson(operation.requestPayload, maxLength);
  }

  return null;
}
