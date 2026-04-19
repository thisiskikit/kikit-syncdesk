import type {
  CoupangOrderDetail,
  CoupangOrderRow,
  CoupangProductDetail,
  CoupangShipmentWorksheetRawFieldCatalogItem,
  CoupangShipmentWorksheetRawFieldValue,
  CoupangShipmentWorksheetRawFieldValueType,
  CoupangShipmentWorksheetRawFields,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";

const RAW_FIELD_GROUP_ORDER = [
  "worksheet",
  "order",
  "detail",
  "detailItem",
  "product",
  "productItem",
] as const;

const RAW_FIELD_GROUP_LABELS: Record<string, string> = {
  worksheet: "워크시트",
  order: "주문",
  detail: "주문상세",
  detailItem: "주문상세 상품",
  product: "상품",
  productItem: "상품 옵션",
};

const RAW_FIELD_SKIPPED_KEYS = new Set([
  "rawData",
  "images",
  "notices",
  "contents",
  "previewHtml",
  "previewImages",
  "relatedReturnRequests",
  "relatedExchangeRequests",
]);

const RAW_FIELD_LABEL_OVERRIDES: Record<string, string> = {
  "worksheet.orderDateText": "주문일자 텍스트",
  "worksheet.orderDateKey": "주문일자 키",
  "worksheet.deliveryCompanyCode": "워크시트 택배사",
  "worksheet.invoiceNumber": "워크시트 송장번호",
  "worksheet.selpickOrderNumber": "셀픽 주문번호",
  "worksheet.coupangDisplayProductName": "쿠팡 노출 상품명",
  "order.orderedAt": "주문시각",
  "order.paidAt": "결제시각",
  "order.deliveryCompanyCode": "쿠팡 택배사 코드",
  "order.invoiceNumber": "쿠팡 송장번호",
  "detail.parcelPrintMessage": "배송메모",
  "detail.receiver.name": "수령인명",
  "detail.receiver.safeNumber": "수령인 안심번호",
  "detail.orderer.name": "주문자명",
  "detailItem.optionName": "옵션명",
  "detailItem.sellerProductName": "상품명",
  "product.displayProductName": "쿠팡 노출 상품명",
  "product.deliveryInfo.pccNeeded": "개인통관고유부호 필요",
  "productItem.itemName": "옵션 상품명",
  "productItem.externalVendorSku": "판매자 SKU",
};

type ProductDetailEnvelope = {
  item: CoupangProductDetail | null;
} | null;

function normalizeText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function normalizeScalar(
  value: unknown,
): CoupangShipmentWorksheetRawFieldValue | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return normalizeText(value) ?? null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function assignScalar(
  target: CoupangShipmentWorksheetRawFields,
  key: string,
  value: unknown,
) {
  const normalized = normalizeScalar(value);
  if (normalized === undefined) {
    return;
  }

  target[key] = normalized;
}

function flattenIntoRawFields(
  target: CoupangShipmentWorksheetRawFields,
  prefix: string,
  value: unknown,
) {
  if (value === null || value === undefined) {
    return;
  }

  const scalar = normalizeScalar(value);
  if (scalar !== undefined) {
    target[prefix] = scalar;
    return;
  }

  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => normalizeScalar(item))
      .filter((item): item is CoupangShipmentWorksheetRawFieldValue => item !== undefined);

    if (!normalizedItems.length) {
      return;
    }

    target[prefix] =
      normalizedItems.every((item) => item === null || typeof item === "string")
        ? normalizedItems.filter((item): item is string => typeof item === "string").join(" | ")
        : JSON.stringify(normalizedItems);
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  for (const [key, nextValue] of Object.entries(value)) {
    if (RAW_FIELD_SKIPPED_KEYS.has(key)) {
      continue;
    }

    flattenIntoRawFields(target, `${prefix}.${key}`, nextValue);
  }
}

function findOrderDetailItem(
  detail: CoupangOrderDetail | null,
  row: Pick<CoupangOrderRow, "vendorItemId" | "orderId" | "shipmentBoxId">,
) {
  return (
    detail?.items.find((item) => item.vendorItemId && item.vendorItemId === row.vendorItemId) ??
    detail?.items.find(
      (item) => item.orderId === row.orderId && item.shipmentBoxId === row.shipmentBoxId,
    ) ??
    null
  );
}

function findProductDetailItem(
  detail: ProductDetailEnvelope,
  row: Pick<CoupangOrderRow, "vendorItemId">,
) {
  return (
    detail?.item?.items.find((item) => item.vendorItemId === row.vendorItemId) ?? null
  );
}

function buildSyntheticOrderRawFields(
  row: CoupangShipmentWorksheetRow,
): CoupangShipmentWorksheetRawFields {
  const fields: CoupangShipmentWorksheetRawFields = {};

  const worksheetAssignments: Array<[string, unknown]> = [
    ["worksheet.id", row.id],
    ["worksheet.sourceKey", row.sourceKey],
    ["worksheet.storeId", row.storeId],
    ["worksheet.storeName", row.storeName],
    ["worksheet.orderDateText", row.orderDateText],
    ["worksheet.orderDateKey", row.orderDateKey],
    ["worksheet.quantity", row.quantity],
    ["worksheet.productName", row.productName],
    ["worksheet.optionName", row.optionName],
    ["worksheet.productOrderNumber", row.productOrderNumber],
    ["worksheet.ordererName", row.ordererName],
    ["worksheet.contact", row.contact],
    ["worksheet.receiverName", row.receiverName],
    ["worksheet.receiverBaseName", row.receiverBaseName],
    ["worksheet.personalClearanceCode", row.personalClearanceCode],
    ["worksheet.collectedAccountName", row.collectedAccountName],
    ["worksheet.deliveryCompanyCode", row.deliveryCompanyCode],
    ["worksheet.selpickOrderNumber", row.selpickOrderNumber],
    ["worksheet.invoiceNumber", row.invoiceNumber],
    ["worksheet.salePrice", row.salePrice],
    ["worksheet.shippingFee", row.shippingFee],
    ["worksheet.receiverAddress", row.receiverAddress],
    ["worksheet.deliveryRequest", row.deliveryRequest],
    ["worksheet.buyerPhoneNumber", row.buyerPhoneNumber],
    ["worksheet.productNumber", row.productNumber],
    ["worksheet.exposedProductName", row.exposedProductName],
    ["worksheet.coupangDisplayProductName", row.coupangDisplayProductName ?? null],
    ["worksheet.productOptionNumber", row.productOptionNumber],
    ["worksheet.sellerProductCode", row.sellerProductCode],
    ["worksheet.isOverseas", row.isOverseas],
    ["worksheet.shipmentBoxId", row.shipmentBoxId],
    ["worksheet.orderId", row.orderId],
    ["worksheet.sellerProductId", row.sellerProductId],
    ["worksheet.vendorItemId", row.vendorItemId],
    ["worksheet.orderStatus", row.orderStatus],
    ["worksheet.orderedAtRaw", row.orderedAtRaw],
    ["worksheet.estimatedShippingDate", row.estimatedShippingDate],
    ["worksheet.splitShipping", row.splitShipping],
    ["worksheet.invoiceTransmissionStatus", row.invoiceTransmissionStatus],
    ["worksheet.invoiceTransmissionMessage", row.invoiceTransmissionMessage],
    ["worksheet.invoiceTransmissionAt", row.invoiceTransmissionAt],
    ["worksheet.invoiceAppliedAt", row.invoiceAppliedAt],
    ["worksheet.exportedAt", row.exportedAt],
  ];

  for (const [key, value] of worksheetAssignments) {
    assignScalar(fields, key, value);
  }

  const orderAssignments: Array<[string, unknown]> = [
    ["order.shipmentBoxId", row.shipmentBoxId],
    ["order.orderId", row.orderId],
    ["order.orderedAt", row.orderedAtRaw],
    ["order.paidAt", row.orderedAtRaw],
    ["order.status", row.orderStatus],
    ["order.ordererName", row.ordererName],
    ["order.receiverName", row.receiverBaseName ?? row.receiverName],
    ["order.receiverSafeNumber", row.contact],
    ["order.receiverAddress", row.receiverAddress],
    ["order.productName", row.productName],
    ["order.optionName", row.optionName],
    ["order.sellerProductId", row.sellerProductId],
    ["order.sellerProductName", row.productName],
    ["order.vendorItemId", row.vendorItemId],
    ["order.externalVendorSku", row.sellerProductCode],
    ["order.quantity", row.quantity],
    ["order.salesPrice", row.salePrice],
    ["order.orderPrice", row.salePrice],
    ["order.deliveryCompanyCode", row.deliveryCompanyCode],
    ["order.invoiceNumber", row.invoiceNumber],
    ["order.estimatedShippingDate", row.estimatedShippingDate],
    ["order.splitShipping", row.splitShipping],
    ["order.customerServiceIssueCount", row.customerServiceIssueCount],
    ["order.customerServiceIssueSummary", row.customerServiceIssueSummary],
  ];

  for (const [key, value] of orderAssignments) {
    assignScalar(fields, key, value);
  }

  const detailAssignments: Array<[string, unknown]> = [
    ["detail.orderer.name", row.ordererName],
    ["detail.orderer.safeNumber", row.buyerPhoneNumber],
    ["detail.receiver.name", row.receiverBaseName ?? row.receiverName],
    ["detail.receiver.safeNumber", row.contact],
    ["detail.receiver.addr1", row.receiverAddress],
    ["detail.receiver.postCode", null],
    ["detail.deliveryCompanyCode", row.deliveryCompanyCode],
    ["detail.invoiceNumber", row.invoiceNumber],
    ["detail.parcelPrintMessage", row.deliveryRequest],
    ["detail.splitShipping", row.splitShipping],
  ];

  for (const [key, value] of detailAssignments) {
    assignScalar(fields, key, value);
  }

  const detailItemAssignments: Array<[string, unknown]> = [
    ["detailItem.orderId", row.orderId],
    ["detailItem.shipmentBoxId", row.shipmentBoxId],
    ["detailItem.vendorItemId", row.vendorItemId],
    ["detailItem.sellerProductId", row.sellerProductId],
    ["detailItem.productName", row.productName],
    ["detailItem.sellerProductName", row.productName],
    ["detailItem.optionName", row.optionName],
    ["detailItem.quantity", row.quantity],
  ];

  for (const [key, value] of detailItemAssignments) {
    assignScalar(fields, key, value);
  }

  const productAssignments: Array<[string, unknown]> = [
    ["product.sellerProductId", row.sellerProductId],
    ["product.sellerProductName", row.productName],
    ["product.displayProductName", row.coupangDisplayProductName ?? row.productName],
    ["product.deliveryInfo.deliveryCompanyCode", row.deliveryCompanyCode],
    ["product.deliveryInfo.pccNeeded", row.isOverseas],
  ];

  for (const [key, value] of productAssignments) {
    assignScalar(fields, key, value);
  }

  const productItemAssignments: Array<[string, unknown]> = [
    ["productItem.vendorItemId", row.vendorItemId],
    ["productItem.itemName", row.optionName ?? row.productName],
    ["productItem.externalVendorSku", row.sellerProductCode],
    ["productItem.pccNeeded", row.isOverseas],
  ];

  for (const [key, value] of productItemAssignments) {
    assignScalar(fields, key, value);
  }

  return fields;
}

function readRawString(
  rawFields: CoupangShipmentWorksheetRawFields,
  key: string,
) {
  const value = rawFields[key];
  if (typeof value !== "string") {
    return null;
  }

  return normalizeText(value);
}

function readRawBoolean(
  rawFields: CoupangShipmentWorksheetRawFields,
  key: string,
) {
  const value = rawFields[key];
  return typeof value === "boolean" ? value : null;
}

function normalizeOptionName(
  optionName: string | null | undefined,
  productName: string | null | undefined,
) {
  const normalizedOptionName = normalizeText(optionName);
  if (!normalizedOptionName) {
    return null;
  }

  const normalizedProductName = normalizeText(productName);
  if (!normalizedProductName) {
    return normalizedOptionName;
  }

  if (normalizedOptionName === normalizedProductName) {
    return null;
  }

  if (normalizedOptionName.includes(normalizedProductName)) {
    const firstCommaIndex = normalizedOptionName.indexOf(",");
    if (firstCommaIndex >= 0) {
      const stripped = normalizeText(normalizedOptionName.slice(firstCommaIndex + 1));
      if (stripped) {
        return stripped;
      }
    }
  }

  return normalizedOptionName;
}

function humanizeRawFieldKey(key: string) {
  const lastSegment = key.split(".").at(-1) ?? key;
  return lastSegment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function resolveRawFieldValueType(
  value: CoupangShipmentWorksheetRawFieldValue | undefined,
): CoupangShipmentWorksheetRawFieldValueType {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  return "boolean";
}

export function buildWorksheetRawFields(input: {
  row: CoupangOrderRow;
  detail: CoupangOrderDetail | null;
  productDetail: ProductDetailEnvelope;
  currentRow?: CoupangShipmentWorksheetRow;
  selpickOrderNumber: string;
  isOverseas: boolean;
}) {
  const rawFields =
    input.currentRow?.rawFields && Object.keys(input.currentRow.rawFields).length
      ? { ...input.currentRow.rawFields }
      : buildSyntheticOrderRawFields({
          ...(input.currentRow ?? {
            id: "",
            sourceKey: "",
            storeId: "",
            storeName: "",
            orderDateText: "",
            orderDateKey: "",
            quantity: input.row.quantity,
            productName: input.row.productName,
            optionName: input.row.optionName,
            productOrderNumber: input.row.orderId,
            collectedPlatform: "",
            ordererName: input.row.ordererName,
            contact: input.row.receiverSafeNumber,
            receiverName: input.row.receiverName ?? "-",
            receiverBaseName: input.row.receiverName,
            personalClearanceCode: null,
            collectedAccountName: "",
            deliveryCompanyCode: input.row.deliveryCompanyCode ?? "",
            selpickOrderNumber: input.selpickOrderNumber,
            invoiceNumber: input.row.invoiceNumber ?? "",
            coupangDeliveryCompanyCode: null,
            coupangInvoiceNumber: null,
            coupangInvoiceUploadedAt: null,
            salePrice: input.row.orderPrice ?? input.row.salesPrice,
            shippingFee: 0,
            receiverAddress: input.row.receiverAddress,
            deliveryRequest: input.detail?.parcelPrintMessage ?? null,
            buyerPhoneNumber: input.row.receiverSafeNumber,
            productNumber: input.row.sellerProductId,
            exposedProductName: input.row.productName,
            coupangDisplayProductName: input.productDetail?.item?.displayProductName ?? null,
            productOptionNumber: input.row.vendorItemId,
            sellerProductCode: input.row.externalVendorSku,
            isOverseas: input.isOverseas,
            shipmentBoxId: input.row.shipmentBoxId,
            orderId: input.row.orderId,
            sellerProductId: input.row.sellerProductId,
            vendorItemId: input.row.vendorItemId,
            availableActions: input.row.availableActions,
            orderStatus: input.row.status,
            customerServiceIssueCount: input.row.customerServiceIssueCount,
            customerServiceIssueSummary: input.row.customerServiceIssueSummary,
            customerServiceIssueBreakdown: input.row.customerServiceIssueBreakdown,
            customerServiceState: input.row.customerServiceState,
            customerServiceFetchedAt: input.row.customerServiceFetchedAt,
            orderedAtRaw: input.row.orderedAt ?? input.row.paidAt,
            lastOrderHydratedAt: null,
            lastProductHydratedAt: null,
            estimatedShippingDate: input.row.estimatedShippingDate,
            splitShipping: input.row.splitShipping,
            invoiceTransmissionStatus: null,
            invoiceTransmissionMessage: null,
            invoiceTransmissionAt: null,
            exportedAt: null,
            invoiceAppliedAt: null,
            createdAt: "",
            updatedAt: "",
          } satisfies CoupangShipmentWorksheetRow),
        });

  flattenIntoRawFields(rawFields, "order", input.row);
  flattenIntoRawFields(rawFields, "detail", input.detail);
  const detailItem = findOrderDetailItem(input.detail, input.row);
  flattenIntoRawFields(rawFields, "detailItem", detailItem);
  flattenIntoRawFields(rawFields, "product", input.productDetail?.item ?? null);
  const productItem = findProductDetailItem(input.productDetail, input.row);
  flattenIntoRawFields(rawFields, "productItem", productItem);

  assignScalar(rawFields, "worksheet.selpickOrderNumber", input.selpickOrderNumber);
  assignScalar(
    rawFields,
    "worksheet.deliveryCompanyCode",
    input.currentRow?.deliveryCompanyCode ?? input.row.deliveryCompanyCode ?? "",
  );
  assignScalar(
    rawFields,
    "worksheet.invoiceNumber",
    input.currentRow?.invoiceNumber ?? input.row.invoiceNumber ?? "",
  );

  return rawFields;
}

export function ensureWorksheetRawFields(
  row: CoupangShipmentWorksheetRow,
): CoupangShipmentWorksheetRawFields {
  if (row.rawFields && Object.keys(row.rawFields).length) {
    return row.rawFields;
  }

  return buildSyntheticOrderRawFields(row);
}

export function buildWorksheetRawFieldCatalog(
  rows: readonly Pick<CoupangShipmentWorksheetRow, "rawFields">[],
): CoupangShipmentWorksheetRawFieldCatalogItem[] {
  const catalog = new Map<
    string,
    {
      valueType: CoupangShipmentWorksheetRawFieldValueType;
    }
  >();

  for (const row of rows) {
    const rawFields = row.rawFields ?? {};
    for (const [key, value] of Object.entries(rawFields)) {
      if (!catalog.has(key)) {
        catalog.set(key, {
          valueType: resolveRawFieldValueType(value),
        });
        continue;
      }

      if (catalog.get(key)?.valueType === "null" && value !== null && value !== undefined) {
        catalog.set(key, {
          valueType: resolveRawFieldValueType(value),
        });
      }
    }
  }

  return Array.from(catalog.entries())
    .map(([key, meta]) => {
      const groupKey = key.split(".")[0] ?? "raw";
      return {
        key,
        label: RAW_FIELD_LABEL_OVERRIDES[key] ?? humanizeRawFieldKey(key),
        group: RAW_FIELD_GROUP_LABELS[groupKey] ?? groupKey,
        sampleValueType: meta.valueType,
      } satisfies CoupangShipmentWorksheetRawFieldCatalogItem;
    })
    .sort((left, right) => {
      const leftGroupIndex = RAW_FIELD_GROUP_ORDER.indexOf(
        left.key.split(".")[0] as (typeof RAW_FIELD_GROUP_ORDER)[number],
      );
      const rightGroupIndex = RAW_FIELD_GROUP_ORDER.indexOf(
        right.key.split(".")[0] as (typeof RAW_FIELD_GROUP_ORDER)[number],
      );
      const normalizedLeftGroupIndex =
        leftGroupIndex >= 0 ? leftGroupIndex : RAW_FIELD_GROUP_ORDER.length;
      const normalizedRightGroupIndex =
        rightGroupIndex >= 0 ? rightGroupIndex : RAW_FIELD_GROUP_ORDER.length;

      if (normalizedLeftGroupIndex !== normalizedRightGroupIndex) {
        return normalizedLeftGroupIndex - normalizedRightGroupIndex;
      }

      return left.key.localeCompare(right.key, "ko-KR", {
        numeric: true,
        sensitivity: "base",
      });
    });
}

export function resolveWorksheetProductNameFromRawFields(input: {
  rawFields: CoupangShipmentWorksheetRawFields;
  currentRow?: Pick<CoupangShipmentWorksheetRow, "productName">;
}) {
  return (
    readRawString(input.rawFields, "product.sellerProductName") ??
    readRawString(input.rawFields, "order.sellerProductName") ??
    readRawString(input.rawFields, "detailItem.sellerProductName") ??
    readRawString(input.rawFields, "detailItem.productName") ??
    readRawString(input.rawFields, "order.productName") ??
    normalizeText(input.currentRow?.productName) ??
    "주문 상품"
  );
}

export function resolveWorksheetOptionNameFromRawFields(input: {
  rawFields: CoupangShipmentWorksheetRawFields;
  currentRow?: Pick<CoupangShipmentWorksheetRow, "optionName">;
  productName: string;
}) {
  return (
    normalizeOptionName(
      readRawString(input.rawFields, "productItem.itemName"),
      input.productName,
    ) ??
    normalizeOptionName(
      readRawString(input.rawFields, "detailItem.optionName"),
      input.productName,
    ) ??
    normalizeOptionName(input.currentRow?.optionName, input.productName) ??
    null
  );
}

export function resolveWorksheetDisplayProductNameFromRawFields(input: {
  rawFields: CoupangShipmentWorksheetRawFields;
  currentRow?: Pick<CoupangShipmentWorksheetRow, "coupangDisplayProductName">;
}) {
  return (
    readRawString(input.rawFields, "product.displayProductName") ??
    normalizeText(input.currentRow?.coupangDisplayProductName) ??
    null
  );
}

export function resolveWorksheetOverseasFlagFromRawFields(input: {
  rawFields: CoupangShipmentWorksheetRawFields;
  currentRow?: Pick<CoupangShipmentWorksheetRow, "isOverseas">;
}) {
  return (
    readRawBoolean(input.rawFields, "productItem.pccNeeded") ??
    readRawBoolean(input.rawFields, "product.deliveryInfo.pccNeeded") ??
    input.currentRow?.isOverseas ??
    false
  );
}
