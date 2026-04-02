export const NAVER_PRODUCT_ORDER_STATUS_LABELS: Record<string, string> = {
  PAYED: "결제 완료",
  DELIVERING: "배송 중",
  DELIVERED: "배송 완료",
  PURCHASE_DECIDED: "구매 확정",
  EXCHANGED: "교환",
  RETURNED: "반품",
  CANCELED: "취소",
  CANCELED_BY_NOPAYMENT: "미입금 취소",
  PLACE_ORDER: "주문 접수",
  PREPARE: "상품 준비 중",
};

export const NAVER_CLAIM_TYPE_LABELS: Record<string, string> = {
  CANCEL: "취소",
  RETURN: "반품",
  EXCHANGE: "교환",
};

export const NAVER_CLAIM_STATUS_LABELS: Record<string, string> = {
  CANCEL_REQUEST: "취소 요청",
  CANCELING: "취소 처리 중",
  CANCELED: "취소 완료",
  RETURN_REQUEST: "반품 요청",
  RETURN_REJECT: "반품 거부",
  RETURN_HOLDBACK: "반품 보류",
  COLLECTING: "수거 중",
  RETURNED: "반품 완료",
  EXCHANGE_REQUEST: "교환 요청",
  EXCHANGE_HOLDBACK: "교환 보류",
  EXCHANGE_REJECT: "교환 거부",
  EXCHANGE_REDELIVERING: "교환 재배송 중",
  EXCHANGED: "교환 완료",
};

function normalizeNaverKey(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export function toNaverProductOrderStatusLabel(status: string | null | undefined) {
  const normalized = normalizeNaverKey(status);

  if (!normalized) {
    return "-";
  }

  return NAVER_PRODUCT_ORDER_STATUS_LABELS[normalized] ?? normalized;
}

export function toNaverClaimTypeLabel(claimType: string | null | undefined) {
  const normalized = normalizeNaverKey(claimType);

  if (!normalized) {
    return null;
  }

  return NAVER_CLAIM_TYPE_LABELS[normalized] ?? normalized;
}

export function toNaverClaimStatusLabel(claimStatus: string | null | undefined) {
  const normalized = normalizeNaverKey(claimStatus);

  if (!normalized) {
    return null;
  }

  return NAVER_CLAIM_STATUS_LABELS[normalized] ?? normalized;
}
