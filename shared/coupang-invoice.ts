function normalizeInvoiceToken(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

const NON_TRANSMITTABLE_INVOICE_TOKENS = new Set([
  normalizeInvoiceToken("CS이관"),
]);

export function resolveCoupangInvoiceTransmissionBlockReason(input: {
  deliveryCompanyCode: string | null | undefined;
  invoiceNumber: string | null | undefined;
  storeName?: string | null | undefined;
}) {
  const deliveryCompanyCode = normalizeInvoiceToken(input.deliveryCompanyCode);
  const invoiceNumber = normalizeInvoiceToken(input.invoiceNumber);
  const storeName = normalizeInvoiceToken(input.storeName);

  if (
    (deliveryCompanyCode && NON_TRANSMITTABLE_INVOICE_TOKENS.has(deliveryCompanyCode)) ||
    (invoiceNumber && NON_TRANSMITTABLE_INVOICE_TOKENS.has(invoiceNumber))
  ) {
    return "CS 이관 표시 행은 실제 송장 전송 대상이 아닙니다.";
  }

  if (
    storeName &&
    (deliveryCompanyCode === storeName || invoiceNumber === storeName)
  ) {
    return `택배사 코드 대신 스토어명(${input.storeName?.trim() ?? "-"})이 들어 있어 전송할 수 없습니다.`;
  }

  return null;
}

export function canTransmitCoupangInvoicePayload(input: {
  deliveryCompanyCode: string | null | undefined;
  invoiceNumber: string | null | undefined;
  storeName?: string | null | undefined;
}) {
  return !resolveCoupangInvoiceTransmissionBlockReason(input);
}
