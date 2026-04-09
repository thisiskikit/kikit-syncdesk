import type {
  CollectCoupangShipmentInput,
  CoupangCancelOrderTarget,
  CoupangCustomerServiceSummaryRequestItem,
  CoupangExchangeConfirmTarget,
  CoupangExchangeInvoiceTarget,
  CoupangExchangeRejectTarget,
  CoupangInvoiceTarget,
  CoupangPrepareTarget,
  CoupangProductPriceUpdateTarget,
  CoupangProductQuantityUpdateTarget,
  CoupangProductSaleStatusUpdateTarget,
  CoupangShipmentWorksheetBulkResolveRequest,
  CoupangReturnActionTarget,
  CoupangReturnCollectionInvoiceTarget,
  CoupangShipmentWorksheetViewQuery,
  PatchCoupangShipmentWorksheetInput,
  PatchCoupangShipmentWorksheetItemInput,
} from "@shared/coupang";

type JsonRecord = Record<string, unknown>;

export function asItemList(value: unknown) {
  return Array.isArray((value as { items?: unknown[] } | null)?.items)
    ? ((value as { items: unknown[] }).items ?? [])
    : [];
}

export function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return "";
}

export function asOptionalString(value: unknown) {
  const normalized = asString(value);
  return normalized || null;
}

export function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function parsePrepareTargets(value: unknown): CoupangPrepareTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      shipmentBoxId: asString(item.shipmentBoxId),
      orderId: asOptionalString(item.orderId),
      productName: asOptionalString(item.productName),
    };
  });
}

export function parseCustomerServiceSummaryItems(
  value: unknown,
): CoupangCustomerServiceSummaryRequestItem[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      rowKey: asString(item.rowKey),
      orderId: asOptionalString(item.orderId),
      shipmentBoxId: asOptionalString(item.shipmentBoxId),
      vendorItemId: asOptionalString(item.vendorItemId),
      sellerProductId: asOptionalString(item.sellerProductId),
    };
  });
}

export function parseProductPriceTargets(value: unknown): CoupangProductPriceUpdateTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      sellerProductId: asOptionalString(item.sellerProductId),
      vendorItemId: asString(item.vendorItemId),
      price: asNumber(item.price),
      itemName: asOptionalString(item.itemName),
    };
  });
}

export function parseProductQuantityTargets(
  value: unknown,
): CoupangProductQuantityUpdateTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      sellerProductId: asOptionalString(item.sellerProductId),
      vendorItemId: asString(item.vendorItemId),
      quantity: asNumber(item.quantity),
      itemName: asOptionalString(item.itemName),
    };
  });
}

export function parseProductSaleStatusTargets(
  value: unknown,
): CoupangProductSaleStatusUpdateTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      sellerProductId: asOptionalString(item.sellerProductId),
      vendorItemId: asString(item.vendorItemId),
      saleStatus: item.saleStatus === "SUSPENDED" ? "SUSPENDED" : "ONSALE",
      itemName: asOptionalString(item.itemName),
    };
  });
}

export function parseInvoiceTargets(value: unknown): CoupangInvoiceTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      shipmentBoxId: asString(item.shipmentBoxId),
      orderId: asString(item.orderId),
      vendorItemId: asString(item.vendorItemId),
      deliveryCompanyCode: asString(item.deliveryCompanyCode),
      invoiceNumber: asString(item.invoiceNumber),
      splitShipping: item.splitShipping === true,
      preSplitShipped: item.preSplitShipped === true,
      estimatedShippingDate:
        typeof item.estimatedShippingDate === "string" ? item.estimatedShippingDate : undefined,
      productName: asOptionalString(item.productName),
    };
  });
}

export function parseCollectShipmentInput(value: unknown): CollectCoupangShipmentInput {
  const item = value && typeof value === "object" ? (value as JsonRecord) : {};
  const syncMode = asOptionalString(item.syncMode);

  return {
    storeId: asString(item.storeId),
    createdAtFrom: asOptionalString(item.createdAtFrom) ?? undefined,
    createdAtTo: asOptionalString(item.createdAtTo) ?? undefined,
    status: asOptionalString(item.status) ?? undefined,
    maxPerPage: parsePositiveInteger(item.maxPerPage, 20),
    syncMode:
      syncMode === "full"
        ? "full"
        : syncMode === "incremental"
          ? "incremental"
          : syncMode === "new_only"
            ? "new_only"
            : undefined,
  };
}

export function parseShipmentWorksheetPatchItems(
  value: unknown,
): PatchCoupangShipmentWorksheetItemInput[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      sourceKey: asOptionalString(item.sourceKey) ?? undefined,
      selpickOrderNumber: asOptionalString(item.selpickOrderNumber) ?? undefined,
      receiverName: asOptionalString(item.receiverName),
      receiverBaseName: asOptionalString(item.receiverBaseName),
      personalClearanceCode: asOptionalString(item.personalClearanceCode),
      deliveryCompanyCode: asOptionalString(item.deliveryCompanyCode),
      invoiceNumber: asOptionalString(item.invoiceNumber),
      deliveryRequest: asOptionalString(item.deliveryRequest),
      invoiceTransmissionStatus:
        item.invoiceTransmissionStatus === "pending" ||
        item.invoiceTransmissionStatus === "succeeded" ||
        item.invoiceTransmissionStatus === "failed"
          ? item.invoiceTransmissionStatus
          : item.invoiceTransmissionStatus === null
            ? null
            : undefined,
      invoiceTransmissionMessage: asOptionalString(item.invoiceTransmissionMessage),
      invoiceTransmissionAt:
        typeof item.invoiceTransmissionAt === "string"
          ? item.invoiceTransmissionAt
          : item.invoiceTransmissionAt === null
            ? null
            : undefined,
      exportedAt:
        typeof item.exportedAt === "string"
          ? item.exportedAt
          : item.exportedAt === null
            ? null
            : undefined,
      invoiceAppliedAt:
        typeof item.invoiceAppliedAt === "string"
          ? item.invoiceAppliedAt
          : item.invoiceAppliedAt === null
            ? null
            : undefined,
    };
  });
}

export function parseShipmentWorksheetPatchInput(
  value: unknown,
): PatchCoupangShipmentWorksheetInput {
  const item = value && typeof value === "object" ? (value as JsonRecord) : {};

  return {
    storeId: asString(item.storeId),
    items: parseShipmentWorksheetPatchItems(item),
  };
}

export function parseShipmentWorksheetViewQuery(value: unknown): CoupangShipmentWorksheetViewQuery {
  const item = value && typeof value === "object" ? (value as JsonRecord) : {};
  const scope = asOptionalString(item.scope);
  const invoiceStatusCard = asOptionalString(item.invoiceStatusCard);
  const orderStatusCard = asOptionalString(item.orderStatusCard);
  const outputStatusCard = asOptionalString(item.outputStatusCard);
  const sortField = asOptionalString(item.sortField);
  const sortDirection = asOptionalString(item.sortDirection);

  return {
    storeId: asString(item.storeId),
    scope:
      scope === "dispatch_active" || scope === "post_dispatch" || scope === "claims" || scope === "all"
        ? scope
        : undefined,
    page: parsePositiveInteger(item.page, 1),
    pageSize: parsePositiveInteger(item.pageSize, 50),
    query: asOptionalString(item.query) ?? undefined,
    invoiceStatusCard:
      invoiceStatusCard === "all" ||
      invoiceStatusCard === "idle" ||
      invoiceStatusCard === "ready" ||
      invoiceStatusCard === "pending" ||
      invoiceStatusCard === "failed" ||
      invoiceStatusCard === "applied"
        ? invoiceStatusCard
        : undefined,
    orderStatusCard:
      orderStatusCard === "all" ||
      orderStatusCard === "ACCEPT" ||
      orderStatusCard === "INSTRUCT" ||
      orderStatusCard === "DEPARTURE" ||
      orderStatusCard === "DELIVERING" ||
      orderStatusCard === "FINAL_DELIVERY" ||
      orderStatusCard === "NONE_TRACKING" ||
      orderStatusCard === "SHIPMENT_STOP_REQUESTED" ||
      orderStatusCard === "SHIPMENT_STOP_HANDLED" ||
      orderStatusCard === "CANCEL" ||
      orderStatusCard === "RETURN" ||
      orderStatusCard === "EXCHANGE"
        ? orderStatusCard
        : undefined,
    outputStatusCard:
      outputStatusCard === "all" ||
      outputStatusCard === "notExported" ||
      outputStatusCard === "exported"
        ? outputStatusCard
        : undefined,
    sortField:
      sortField === "__orderStatus" ||
      sortField === "__invoiceTransmissionStatus" ||
      sortField === "__exportStatus" ||
      sortField === "orderDateText" ||
      sortField === "quantity" ||
      sortField === "productName" ||
      sortField === "optionName" ||
      sortField === "productOrderNumber" ||
      sortField === "collectedPlatform" ||
      sortField === "ordererName" ||
      sortField === "contact" ||
      sortField === "receiverName" ||
      sortField === "collectedAccountName" ||
      sortField === "deliveryCompanyCode" ||
      sortField === "selpickOrderNumber" ||
      sortField === "invoiceNumber" ||
      sortField === "salePrice" ||
      sortField === "shippingFee" ||
      sortField === "receiverAddress" ||
      sortField === "deliveryRequest" ||
      sortField === "buyerPhoneNumber" ||
      sortField === "productNumber" ||
      sortField === "exposedProductName" ||
      sortField === "productOptionNumber" ||
      sortField === "sellerProductCode"
        ? sortField
        : undefined,
    sortDirection: sortDirection === "desc" ? "desc" : "asc",
  };
}

export function parseShipmentWorksheetBulkResolveRequest(
  value: unknown,
): CoupangShipmentWorksheetBulkResolveRequest {
  const item = value && typeof value === "object" ? (value as JsonRecord) : {};
  const parsedViewQuery =
    item.viewQuery && typeof item.viewQuery === "object"
      ? parseShipmentWorksheetViewQuery(item.viewQuery)
      : undefined;
  const viewQuery = parsedViewQuery
    ? {
        scope: parsedViewQuery.scope,
        page: parsedViewQuery.page,
        pageSize: parsedViewQuery.pageSize,
        query: parsedViewQuery.query,
        invoiceStatusCard: parsedViewQuery.invoiceStatusCard,
        orderStatusCard: parsedViewQuery.orderStatusCard,
        outputStatusCard: parsedViewQuery.outputStatusCard,
        sortField: parsedViewQuery.sortField,
        sortDirection: parsedViewQuery.sortDirection,
      }
    : undefined;

  return {
    storeId: asString(item.storeId),
    mode:
      asString(item.mode) === "invoice_ready"
        ? "invoice_ready"
        : asString(item.mode) === "prepare_ready"
          ? "prepare_ready"
          : "not_exported_download",
    viewQuery,
  };
}

export function parseReturnTargets(value: unknown): CoupangReturnActionTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      receiptId: asString(item.receiptId),
      cancelCount:
        item.cancelCount === null || item.cancelCount === undefined
          ? null
          : asNumber(item.cancelCount),
      deliveryCompanyCode: asOptionalString(item.deliveryCompanyCode),
      invoiceNumber: asOptionalString(item.invoiceNumber),
      orderId: asOptionalString(item.orderId),
      shipmentBoxId: asOptionalString(item.shipmentBoxId),
      vendorItemId: asOptionalString(item.vendorItemId),
      productName: asOptionalString(item.productName),
    };
  });
}

export function parseReturnCollectionTargets(
  value: unknown,
): CoupangReturnCollectionInvoiceTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      receiptId: asString(item.receiptId),
      returnExchangeDeliveryType:
        item.returnExchangeDeliveryType === "EXCHANGE" ? "EXCHANGE" : "RETURN",
      deliveryCompanyCode: asString(item.deliveryCompanyCode),
      invoiceNumber: asString(item.invoiceNumber),
      regNumber: asOptionalString(item.regNumber),
      orderId: asOptionalString(item.orderId),
      shipmentBoxId: asOptionalString(item.shipmentBoxId),
      vendorItemId: asOptionalString(item.vendorItemId),
      productName: asOptionalString(item.productName),
    };
  });
}

export function parseExchangeConfirmTargets(value: unknown): CoupangExchangeConfirmTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      exchangeId: asString(item.exchangeId),
      orderId: asOptionalString(item.orderId),
      shipmentBoxId: asOptionalString(item.shipmentBoxId),
      vendorItemId: asOptionalString(item.vendorItemId),
      productName: asOptionalString(item.productName),
    };
  });
}

export function parseExchangeRejectTargets(value: unknown): CoupangExchangeRejectTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      exchangeId: asString(item.exchangeId),
      exchangeRejectCode: item.exchangeRejectCode === "WITHDRAW" ? "WITHDRAW" : "SOLDOUT",
      orderId: asOptionalString(item.orderId),
      shipmentBoxId: asOptionalString(item.shipmentBoxId),
      vendorItemId: asOptionalString(item.vendorItemId),
      productName: asOptionalString(item.productName),
    };
  });
}

export function parseExchangeInvoiceTargets(value: unknown): CoupangExchangeInvoiceTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      exchangeId: asString(item.exchangeId),
      shipmentBoxId: asString(item.shipmentBoxId),
      goodsDeliveryCode: asString(item.goodsDeliveryCode),
      invoiceNumber: asString(item.invoiceNumber),
      orderId: asOptionalString(item.orderId),
      vendorItemId: asOptionalString(item.vendorItemId),
      productName: asOptionalString(item.productName),
    };
  });
}

export function parseCancelOrderTargets(value: unknown): CoupangCancelOrderTarget[] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      orderId: asString(item.orderId),
      vendorItemId: asString(item.vendorItemId),
      receiptCount: asNumber(item.receiptCount),
      userId: asString(item.userId),
      middleCancelCode:
        item.middleCancelCode === "CCPNER" || item.middleCancelCode === "CCPRER"
          ? item.middleCancelCode
          : "CCTTER",
      productName: asOptionalString(item.productName),
      shipmentBoxId: asOptionalString(item.shipmentBoxId),
    };
  });
}
