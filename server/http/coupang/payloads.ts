import type {
  CoupangCancelOrderTarget,
  CoupangExchangeConfirmTarget,
  CoupangExchangeInvoiceTarget,
  CoupangExchangeRejectTarget,
  CoupangInvoiceTarget,
  CoupangPrepareTarget,
  CoupangProductPriceUpdateTarget,
  CoupangProductQuantityUpdateTarget,
  CoupangProductSaleStatusUpdateTarget,
  CoupangReturnActionTarget,
  CoupangReturnCollectionInvoiceTarget,
} from "@shared/coupang";

export function buildConnectionPayload(input: {
  storeId?: string | null;
  vendorId: string;
  accessKey: string;
  baseUrl: string;
}) {
  return {
    storeId: input.storeId ?? null,
    vendorId: input.vendorId,
    accessKey: input.accessKey,
    baseUrl: input.baseUrl,
  };
}

export function buildVendorItemPayload(input: {
  storeId: string;
  sellerProductId: string | null;
  vendorItemId: string;
  valueKey: "price" | "quantity" | "saleStatus";
  value: number | string;
}) {
  return {
    storeId: input.storeId,
    sellerProductId: input.sellerProductId,
    vendorItemId: input.vendorItemId,
    [input.valueKey]: input.value,
  };
}

export function buildPreparePayload(storeId: string, items: CoupangPrepareTarget[]) {
  return {
    storeId,
    itemCount: items.length,
    shipmentBoxIds: items.map((item) => item.shipmentBoxId),
    items,
  };
}

export function buildInvoicePayload(
  storeId: string,
  mode: "upload" | "update",
  items: CoupangInvoiceTarget[],
) {
  return {
    storeId,
    mode,
    itemCount: items.length,
    shipmentBoxIds: items.map((item) => item.shipmentBoxId),
    orderIds: items.map((item) => item.orderId),
    items,
  };
}

export function buildReturnPayload(
  storeId: string,
  action: "stop-shipment" | "already-shipped" | "receive-confirmation" | "approve",
  items: CoupangReturnActionTarget[],
) {
  return {
    storeId,
    action,
    itemCount: items.length,
    receiptIds: items.map((item) => item.receiptId),
    items,
  };
}

export function buildReturnCollectionPayload(
  storeId: string,
  items: CoupangReturnCollectionInvoiceTarget[],
) {
  return {
    storeId,
    itemCount: items.length,
    receiptIds: items.map((item) => item.receiptId),
    items,
  };
}

export function buildExchangePayload(
  storeId: string,
  action: "receive-confirmation" | "reject",
  items: CoupangExchangeConfirmTarget[] | CoupangExchangeRejectTarget[],
) {
  return {
    storeId,
    action,
    itemCount: items.length,
    exchangeIds: items.map((item) => item.exchangeId),
    items,
  };
}

export function buildExchangeInvoicePayload(
  storeId: string,
  items: CoupangExchangeInvoiceTarget[],
) {
  return {
    storeId,
    itemCount: items.length,
    exchangeIds: items.map((item) => item.exchangeId),
    shipmentBoxIds: items.map((item) => item.shipmentBoxId),
    items,
  };
}

export function buildCancelOrderPayload(storeId: string, items: CoupangCancelOrderTarget[]) {
  return {
    storeId,
    itemCount: items.length,
    orderIds: items.map((item) => item.orderId),
    items,
  };
}

export function buildProductBatchPayload(
  storeId: string,
  items:
    | CoupangProductPriceUpdateTarget[]
    | CoupangProductQuantityUpdateTarget[]
    | CoupangProductSaleStatusUpdateTarget[],
) {
  return {
    storeId,
    items,
  };
}
