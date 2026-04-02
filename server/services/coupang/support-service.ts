import type { CoupangDataSource, CoupangStoreRef } from "@shared/coupang";
import type {
  AnswerCoupangCallCenterInquiryInput,
  AnswerCoupangProductInquiryInput,
  ConfirmCoupangCallCenterInquiryInput,
  CoupangCallCenterInquiryRow,
  CoupangCategoryListResponse,
  CoupangCategoryRow,
  CoupangInquiryAnswerResponse,
  CoupangInquiryConfirmResponse,
  CoupangInquiryListResponse,
  CoupangLogisticsMutationResponse,
  CoupangLogisticsCenterListResponse,
  CoupangOutboundCenterAddress,
  CoupangOutboundCenterRow,
  CoupangPagination,
  CoupangProductInquiryRow,
  CoupangReturnCenterAddress,
  CoupangReturnCenterRow,
  CoupangRocketGrowthInventoryListResponse,
  CoupangRocketGrowthInventoryRow,
  CoupangRocketGrowthOrderItemRow,
  CoupangRocketGrowthOrderListResponse,
  CoupangRocketGrowthOrderRow,
  CoupangRocketGrowthProductListResponse,
  CoupangRocketGrowthProductRow,
  CoupangInquiryReply,
  CreateCoupangOutboundCenterInput,
  CreateCoupangReturnCenterInput,
  UpdateCoupangOutboundCenterInput,
  UpdateCoupangReturnCenterInput,
} from "@shared/coupang-support";
import { mapWithConcurrency } from "../shared/async-control";
import { requestCoupangJson } from "./api-client";
import {
  getSampleCoupangCallCenterInquiries,
  getSampleCoupangCategories,
  getSampleCoupangOutboundCenters,
  getSampleCoupangProductInquiries,
  getSampleCoupangReturnCenters,
  getSampleCoupangRocketGrowthInventory,
  getSampleCoupangRocketGrowthOrders,
  getSampleCoupangRocketGrowthProducts,
} from "./support-sample-data";
import { coupangSettingsStore } from "./settings-store";

type StoredCoupangStore = NonNullable<Awaited<ReturnType<typeof coupangSettingsStore.getStore>>>;
type LooseObject = Record<string, unknown>;

const PRODUCT_NAME_ENRICHMENT_CONCURRENCY = 2;

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseObject)
    : null;
}

async function getStoreOrThrow(storeId: string) {
  const store = await coupangSettingsStore.getStore(storeId);
  if (!store) {
    throw new Error("Coupang store settings not found.");
  }

  return store as StoredCoupangStore;
}

function mapStoreRef(store: StoredCoupangStore): CoupangStoreRef {
  return {
    id: store.id,
    name: store.storeName,
    vendorId: store.vendorId,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function toIsoDateTime(value: unknown) {
  const stringValue = asString(value);
  if (!stringValue) {
    return null;
  }

  if (/^\d{13}$/.test(stringValue)) {
    const parsed = Number(stringValue);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  const parsed = new Date(stringValue);
  return Number.isNaN(parsed.getTime()) ? stringValue : parsed.toISOString();
}

function filterByQuery<T>(items: T[], query: string, pickText: (item: T) => string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  return items.filter((item) => pickText(item).toLowerCase().includes(normalized));
}

function toPagination(value: unknown): CoupangPagination {
  const objectValue = asObject(value);
  return {
    currentPage: asNumber(objectValue?.currentPage),
    totalPages: asNumber(objectValue?.totalPages),
    totalElements: asNumber(objectValue?.totalElements),
    countPerPage: asNumber(objectValue?.countPerPage),
  };
}

function asContentArray(payload: unknown) {
  const objectValue = asObject(payload);
  const dataValue = asObject(objectValue?.data);

  const candidates = [
    dataValue?.content,
    dataValue?.data,
    objectValue?.content,
    objectValue?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function asPagination(payload: unknown) {
  const objectValue = asObject(payload);
  const dataValue = asObject(objectValue?.data);
  return toPagination(dataValue?.pagination ?? objectValue?.pagination ?? null);
}

function flattenCategoryTree(
  node: LooseObject,
  input: {
    depth: number;
    path: string[];
    parentCode: string | null;
  },
): CoupangCategoryRow[] {
  const code =
    asString(node.displayCategoryCode) ??
    asString(node.displayItemCategoryCode) ??
    asString(node.categoryCode) ??
    `category-${input.depth}-${input.path.length}`;
  const name = asString(node.name) ?? code;
  const nextPath = [...input.path, name];
  const children = asArray(node.child)
    .map((child) => asObject(child))
    .filter((child): child is LooseObject => Boolean(child));

  const current: CoupangCategoryRow = {
    id: code,
    code,
    name,
    status: asString(node.status) ?? "UNKNOWN",
    depth: input.depth,
    path: nextPath.join(" > "),
    parentCode: input.parentCode,
    leaf: children.length === 0,
    childCount: children.length,
  };

  return [
    current,
    ...children.flatMap((child) =>
      flattenCategoryTree(child, {
        depth: input.depth + 1,
        path: nextPath,
        parentCode: code,
      }),
    ),
  ];
}

function normalizeCategoryRows(payload: unknown) {
  const objectValue = asObject(payload);
  const dataValue = objectValue?.data;

  if (Array.isArray(dataValue)) {
    return dataValue
      .map((node) => asObject(node))
      .filter((node): node is LooseObject => Boolean(node))
      .flatMap((node) =>
        flattenCategoryTree(node, {
          depth: 0,
          path: [],
          parentCode: null,
        }),
      );
  }

  const root = asObject(dataValue);
  if (!root) {
    return [];
  }

  const roots = asArray(root.child)
    .map((node) => asObject(node))
    .filter((node): node is LooseObject => Boolean(node));

  return roots.flatMap((node) =>
    flattenCategoryTree(node, {
      depth: 1,
      path: [],
      parentCode: asString(root.displayCategoryCode) ?? asString(root.displayItemCategoryCode),
    }),
  );
}

function readAddress(value: LooseObject | null) {
  if (!value) {
    return {
      zipCode: null,
      address: null,
      addressDetail: null,
      countryCode: null,
      addressType: null,
    };
  }

  return {
    zipCode: asString(value.zipCode) ?? asString(value.postCode),
    address: asString(value.address) ?? asString(value.address1),
    addressDetail: asString(value.addressDetail) ?? asString(value.address2),
    countryCode: asString(value.countryCode),
    addressType: asString(value.addressType),
  };
}

function normalizeOutboundAddresses(value: unknown): CoupangOutboundCenterAddress[] {
  return asArray(value)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item) => ({
      addressType: asString(item.addressType),
      countryCode: asString(item.countryCode),
      companyContactNumber: asString(item.companyContactNumber),
      phoneNumber2: asString(item.phoneNumber2),
      returnZipCode: asString(item.returnZipCode) ?? asString(item.zipCode),
      returnAddress: asString(item.returnAddress) ?? asString(item.address),
      returnAddressDetail: asString(item.returnAddressDetail) ?? asString(item.addressDetail),
    }));
}

function normalizeReturnAddresses(value: unknown): CoupangReturnCenterAddress[] {
  return asArray(value)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item) => ({
      addressType: asString(item.addressType),
      countryCode: asString(item.countryCode),
      companyContactNumber: asString(item.companyContactNumber),
      phoneNumber2: asString(item.phoneNumber2),
      returnZipCode: asString(item.returnZipCode) ?? asString(item.zipCode),
      returnAddress: asString(item.returnAddress) ?? asString(item.address),
      returnAddressDetail: asString(item.returnAddressDetail) ?? asString(item.addressDetail),
    }));
}

function normalizeOutboundCenter(row: LooseObject, index: number): CoupangOutboundCenterRow {
  const placeAddresses = normalizeOutboundAddresses(row.placeAddresses ?? row.placeAddress);
  const address =
    asObject(row.placeAddress) ??
    asObject(asArray(row.placeAddresses)[0]) ??
    asObject(row.address);
  const parsedAddress = readAddress(address);
  const remoteInfos = asArray(row.remoteInfos)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item) => ({
      remoteInfoId: asString(item.remoteInfoId),
      deliveryCode: asString(item.deliveryCode),
      jeju: asNumber(item.jeju) ?? asNumber(item.jejuFee),
      notJeju: asNumber(item.notJeju),
      usable: asBoolean(item.usable),
    }));

  return {
    id: asString(row.outboundShippingPlaceCode) ?? `outbound-${index}`,
    vendorId: asString(row.vendorId),
    outboundShippingPlaceCode:
      asString(row.outboundShippingPlaceCode) ??
      asString(row.shippingPlaceCode) ??
      `OUT-${index}`,
    shippingPlaceName:
      asString(row.shippingPlaceName) ??
      asString(row.placeName) ??
      asString(row.outboundShippingPlaceName) ??
      `출고지 ${index + 1}`,
    createDate: asString(row.createDate),
    global: asBoolean(row.global),
    usable: asBoolean(row.usable) ?? asBoolean(row.exposure) ?? null,
    addressType: parsedAddress.addressType,
    countryCode: parsedAddress.countryCode,
    companyContactNumber:
      placeAddresses[0]?.companyContactNumber ?? asString(row.companyContactNumber),
    phoneNumber2: placeAddresses[0]?.phoneNumber2 ?? asString(row.phoneNumber2),
    zipCode: parsedAddress.zipCode,
    address: parsedAddress.address,
    addressDetail: parsedAddress.addressDetail,
    note: asString(row.note) ?? null,
    placeAddresses,
    remoteInfos,
  };
}

function normalizeReturnCenter(row: LooseObject, index: number): CoupangReturnCenterRow {
  const placeAddresses = normalizeReturnAddresses(row.placeAddresses ?? row.placeAddress);
  const address = asObject(row.placeAddress) ?? asObject(asArray(row.placeAddresses)[0]) ?? asObject(row.address);
  const parsedAddress = readAddress(address);

  return {
    id: asString(row.returnCenterCode) ?? `return-${index}`,
    vendorId: asString(row.vendorId),
    returnCenterCode: asString(row.returnCenterCode) ?? `RET-${index}`,
    shippingPlaceName:
      asString(row.shippingPlaceName) ??
      asString(row.returnChargeName) ??
      `반품지 ${index + 1}`,
    deliverCode: asString(row.deliverCode),
    deliverName: asString(row.deliverName),
    goodsflowStatus: asString(row.goodsflowStatus),
    errorMessage: asString(row.errorMessage),
    createdAt: asString(row.createdAt) ?? asString(row.regDate),
    usable: asBoolean(row.usable),
    companyContactNumber:
      placeAddresses[0]?.companyContactNumber ?? asString(row.companyContactNumber),
    phoneNumber2: placeAddresses[0]?.phoneNumber2 ?? asString(row.phoneNumber2),
    zipCode:
      asString(row.zipCode) ??
      asString(row.returnZipCode) ??
      parsedAddress.zipCode,
    address:
      asString(row.address) ??
      asString(row.returnAddress) ??
      parsedAddress.address,
    addressDetail:
      asString(row.addressDetail) ??
      asString(row.returnAddressDetail) ??
      parsedAddress.addressDetail,
    addressType: placeAddresses[0]?.addressType ?? parsedAddress.addressType,
    countryCode: placeAddresses[0]?.countryCode ?? parsedAddress.countryCode,
    vendorCreditFee02kg: asNumber(row.vendorCreditFee02kg),
    vendorCreditFee05kg: asNumber(row.vendorCreditFee05kg),
    vendorCreditFee10kg: asNumber(row.vendorCreditFee10kg),
    vendorCreditFee20kg: asNumber(row.vendorCreditFee20kg),
    vendorCashFee02kg: asNumber(row.vendorCashFee02kg),
    vendorCashFee05kg: asNumber(row.vendorCashFee05kg),
    vendorCashFee10kg: asNumber(row.vendorCashFee10kg),
    vendorCashFee20kg: asNumber(row.vendorCashFee20kg),
    consumerCashFee02kg: asNumber(row.consumerCashFee02kg),
    consumerCashFee05kg: asNumber(row.consumerCashFee05kg),
    consumerCashFee10kg: asNumber(row.consumerCashFee10kg),
    consumerCashFee20kg: asNumber(row.consumerCashFee20kg),
    returnFee02kg: asNumber(row.returnFee02kg),
    returnFee05kg: asNumber(row.returnFee05kg),
    returnFee10kg: asNumber(row.returnFee10kg),
    returnFee20kg: asNumber(row.returnFee20kg),
    placeAddresses,
  };
}

function normalizeReplies(value: unknown): CoupangInquiryReply[] {
  return asArray(value)
    .map((reply) => asObject(reply))
    .filter((reply): reply is LooseObject => Boolean(reply))
    .map((reply, index) => ({
      replyId: asString(reply.answerId) ?? asString(reply.inquiryCommentId) ?? `reply-${index}`,
      answerId: asString(reply.answerId),
      parentAnswerId: asString(reply.parentAnswerId),
      authorType:
        asString(reply.answerType) === "vendor"
          ? "vendor"
          : asString(reply.answerType) === "csAgent"
            ? "csAgent"
            : asString(reply.answerType) === "system"
              ? "system"
              : "unknown",
      receptionistName: asString(reply.receptionistName),
      receptionistCode: asString(reply.receptionist) ?? asString(reply.replyBy),
      content: asString(reply.content) ?? "",
      repliedAt: asString(reply.replyAt) ?? asString(reply.inquiryCommentAt),
      needAnswer: asBoolean(reply.needAnswer),
      partnerTransferStatus: asString(reply.partnerTransferStatus),
      partnerTransferCompleteReason: asString(reply.partnerTransferCompleteReason),
    }));
}

async function buildProductNameMap(
  store: StoredCoupangStore,
  rows: Array<{ sellerProductId: string | null; vendorItemId: string | null }>,
) {
  const productIds = Array.from(
    new Set(rows.map((row) => row.sellerProductId).filter((value): value is string => Boolean(value))),
  ).slice(0, 30);

  const map = new Map<string, string>();

  await mapWithConcurrency(productIds, PRODUCT_NAME_ENRICHMENT_CONCURRENCY, async (sellerProductId) => {
      try {
        const payload = await requestCoupangJson<{
          data?: LooseObject;
        }>({
          credentials: {
            accessKey: store.credentials.accessKey,
            secretKey: store.credentials.secretKey,
            baseUrl: store.baseUrl,
          },
          method: "GET",
          path:
            "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/" +
            encodeURIComponent(sellerProductId),
        });

        const data = asObject(payload.data);
        const sellerProductName = asString(data?.sellerProductName);
        if (sellerProductName) {
          map.set(sellerProductId, sellerProductName);
        }

        const items = asArray(data?.items)
          .map((item) => asObject(item))
          .filter((item): item is LooseObject => Boolean(item));

        for (const item of items) {
          const vendorItemId = asString(item.vendorItemId);
          const itemName = asString(item.itemName);
          if (vendorItemId && itemName) {
            map.set(vendorItemId, sellerProductName ? `${sellerProductName} / ${itemName}` : itemName);
          }
        }
      } catch {
        // Ignore enrichment failure and fall back to ids.
      }
    });

  return map;
}

function normalizeProductInquiryRows(
  rows: unknown[],
  productNameMap: Map<string, string>,
): CoupangProductInquiryRow[] {
  return rows
    .map((row) => asObject(row))
    .filter((row): row is LooseObject => Boolean(row))
    .map((row, index) => {
      const sellerProductId = asString(row.sellerProductId);
      const vendorItemId = asString(row.vendorItemId);
      const replies = normalizeReplies(row.commentDtoList);
      return {
        id: asString(row.inquiryId) ?? `product-inquiry-${index}`,
        inquiryId: asString(row.inquiryId) ?? `product-inquiry-${index}`,
        inquiryType: "product",
        sellerProductId,
        vendorItemId,
        productId: asString(row.productId),
        productName:
          (vendorItemId && productNameMap.get(vendorItemId)) ??
          (sellerProductId && productNameMap.get(sellerProductId)) ??
          sellerProductId ??
          vendorItemId ??
          "상품 문의",
        content: asString(row.content) ?? "",
        inquiryAt: asString(row.inquiryAt),
        orderIds: asArray(row.orderIds)
          .map((value) => asString(value))
          .filter((value): value is string => Boolean(value)),
        answered: replies.length > 0,
        needsAnswer: replies.length === 0,
        lastAnsweredAt: replies[replies.length - 1]?.repliedAt ?? null,
        replies,
      };
    });
}

function normalizeCallCenterRows(rows: unknown[]): CoupangCallCenterInquiryRow[] {
  return rows
    .map((row) => asObject(row))
    .filter((row): row is LooseObject => Boolean(row))
    .map((row, index) => {
      const replies = normalizeReplies(row.replies);
      return {
        id: asString(row.inquiryId) ?? `call-center-${index}`,
        inquiryId: asString(row.inquiryId) ?? `call-center-${index}`,
        inquiryType: "callCenter",
        inquiryStatus: asString(row.inquiryStatus) ?? "UNKNOWN",
        counselingStatus: asString(row.csPartnerCounselingStatus) ?? "UNKNOWN",
        needsAnswer: replies.some((reply) => reply.needAnswer === true) || replies.length === 0,
        productName: asString(row.itemName) ?? "고객 문의",
        vendorItemIds: asArray(row.vendorItemId)
          .map((value) => asString(value))
          .filter((value): value is string => Boolean(value)),
        orderId: asString(row.orderId),
        buyerPhone: asString(row.buyerPhone),
        receiptCategory: asString(row.receiptCategory),
        content: asString(row.content) ?? "",
        inquiryAt: asString(row.inquiryAt),
        answeredAt: asString(row.answeredAt),
        replies,
      };
    });
}

function normalizeRocketGrowthProductRows(payload: unknown): CoupangRocketGrowthProductRow[] {
  return asArray(asObject(payload)?.data)
    .map((row) => asObject(row))
    .filter((row): row is LooseObject => Boolean(row))
    .map((row) => {
      const items = asArray(row.items)
        .map((item) => asObject(item))
        .filter((item): item is LooseObject => Boolean(item));
      const vendorItemIds = items
        .flatMap((item) => [
          asString(asObject(item.rocketGrowthItem)?.vendorItemId),
          asString(asObject(item.marketPlaceItem)?.vendorItemId),
          asString(asObject(item.rocketGrowthItemData)?.vendorItemId),
          asString(asObject(item.marketPlaceItemData)?.vendorItemId),
        ])
        .filter((value): value is string => Boolean(value));

      const registrationType = asString(row.registrationType);

      return {
        sellerProductId: asString(row.sellerProductId) ?? "",
        sellerProductName: asString(row.sellerProductName) ?? "로켓그로스 상품",
        displayCategoryCode: asString(row.displayCategoryCode),
        displayCategoryName: null,
        statusName: asString(row.statusName),
        vendorId: asString(row.vendorId) ?? "",
        productType:
          registrationType === "RFM" ? "RFM" : registrationType === "NORMAL" ? "CGF" : "UNKNOWN",
        vendorItemIds: Array.from(new Set(vendorItemIds)),
        lastModifiedAt: asString(row.lastModifiedAt) ?? asString(row.createdAt),
      };
    });
}

function normalizeRocketGrowthInventoryRows(payload: unknown): CoupangRocketGrowthInventoryRow[] {
  return asArray(asObject(payload)?.data)
    .map((row) => asObject(row))
    .filter((row): row is LooseObject => Boolean(row))
    .map((row, index) => ({
      id: asString(row.vendorItemId) ?? `rg-${index}`,
      vendorItemId: asString(row.vendorItemId) ?? `rg-${index}`,
      externalSkuId: asString(row.externalSkuId),
      totalOrderableQuantity: asNumber(asObject(row.inventoryDetails)?.totalOrderableQuantity),
      salesCountLastThirtyDays: asNumber(asObject(row.salesCountMap)?.SALES_COUNT_LAST_THIRTY_DAYS),
      nextToken: asString(row.nextToken),
    }));
}

function normalizeRocketGrowthOrderRows(payload: unknown): CoupangRocketGrowthOrderRow[] {
  return asArray(asObject(payload)?.data)
    .map((row) => asObject(row))
    .filter((row): row is LooseObject => Boolean(row))
    .map((row, index) => {
      const orderId = asString(row.orderId) ?? `rg-order-${index}`;
      const orderItems = asArray(row.orderItems)
        .map((item) => asObject(item))
        .filter((item): item is LooseObject => Boolean(item))
        .map((item, itemIndex) => {
          const vendorItemId = asString(item.vendorItemId) ?? `rg-item-${itemIndex}`;
          return {
            id: `${orderId}:${vendorItemId}`,
            vendorItemId,
            productName: asString(item.productName) ?? vendorItemId,
            salesQuantity: asNumber(item.salesQuantity),
            unitSalesPrice: asNumber(item.unitSalesPrice) ?? asNumber(item.salesPrice),
            currency: asString(item.currency),
          } satisfies CoupangRocketGrowthOrderItemRow;
        });

      return {
        id: orderId,
        orderId,
        vendorId: asString(row.vendorId),
        paidAt: toIsoDateTime(row.paidAt),
        orderItems,
        totalSalesQuantity: orderItems.reduce(
          (sum, item) => sum + (item.salesQuantity ?? 0),
          0,
        ),
        totalSalesAmount: orderItems.reduce(
          (sum, item) => sum + (item.salesQuantity ?? 0) * (item.unitSalesPrice ?? 0),
          0,
        ),
        currency: orderItems[0]?.currency ?? null,
      } satisfies CoupangRocketGrowthOrderRow;
    });
}

function responseMeta<TStore extends StoredCoupangStore, TItems>(
  store: TStore,
  items: TItems,
  source: CoupangDataSource,
  message: string | null,
) {
  return {
    store: mapStoreRef(store),
    items,
    fetchedAt: nowIso(),
    servedFromFallback: source === "fallback",
    message,
    source,
  };
}

function buildOutboundPlaceAddresses(
  items: CreateCoupangOutboundCenterInput["placeAddresses"] | UpdateCoupangOutboundCenterInput["placeAddresses"],
) {
  return items.map((item) => ({
    addressType: item.addressType,
    countryCode: item.countryCode,
    companyContactNumber: item.companyContactNumber,
    phoneNumber2: item.phoneNumber2 ?? "",
    returnZipCode: item.returnZipCode,
    returnAddress: item.returnAddress,
    returnAddressDetail: item.returnAddressDetail,
  }));
}

function buildOutboundRemoteInfos(
  items: CreateCoupangOutboundCenterInput["remoteInfos"] | UpdateCoupangOutboundCenterInput["remoteInfos"],
) {
  return (items ?? []).map((item) => {
    const remoteInfo: Record<string, unknown> = {
      deliveryCode: item.deliveryCode,
      jeju: item.jeju,
      notJeju: item.notJeju,
    };

    if (item.remoteInfoId) {
      remoteInfo.remoteInfoId = Number(item.remoteInfoId);
    }
    if (item.usable !== null && item.usable !== undefined) {
      remoteInfo.usable = item.usable;
    }

    return remoteInfo;
  });
}

function buildReturnPlaceAddresses(
  items: CreateCoupangReturnCenterInput["placeAddresses"] | UpdateCoupangReturnCenterInput["placeAddresses"],
) {
  return items.map((item) => ({
    addressType: item.addressType,
    countryCode: item.countryCode,
    companyContactNumber: item.companyContactNumber,
    phoneNumber2: item.phoneNumber2 ?? "",
    returnZipCode: item.returnZipCode,
    returnAddress: item.returnAddress,
    returnAddressDetail: item.returnAddressDetail,
  }));
}

function buildReturnGoodsflowInfo(
  input: CreateCoupangReturnCenterInput["goodsflowInfo"] | UpdateCoupangReturnCenterInput["goodsflowInfo"],
) {
  const body: Record<string, unknown> = {};
  const numericKeys = [
    "vendorCreditFee02kg",
    "vendorCreditFee05kg",
    "vendorCreditFee10kg",
    "vendorCreditFee20kg",
    "vendorCashFee02kg",
    "vendorCashFee05kg",
    "vendorCashFee10kg",
    "vendorCashFee20kg",
    "consumerCashFee02kg",
    "consumerCashFee05kg",
    "consumerCashFee10kg",
    "consumerCashFee20kg",
    "returnFee02kg",
    "returnFee05kg",
    "returnFee10kg",
    "returnFee20kg",
  ] as const;

  if (input.deliverCode) {
    body.deliverCode = input.deliverCode;
  }
  if (input.deliverName) {
    body.deliverName = input.deliverName;
  }
  if ("contractNumber" in input && input.contractNumber) {
    body.contractNumber = input.contractNumber;
  }
  if ("contractCustomerNumber" in input && input.contractCustomerNumber) {
    body.contractCustomerNumber = input.contractCustomerNumber;
  }

  for (const key of numericKeys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      body[key] = value;
    }
  }

  return body;
}

function extractMutationMessage(payload: unknown) {
  const data = asObject(asObject(payload)?.data);
  return (
    asString(data?.resultMessage) ??
    asString(data?.message) ??
    asString(asObject(payload)?.message) ??
    "OK"
  );
}

export async function listCoupangCategories(input: {
  storeId: string;
  registrationType?: "ALL" | "RFM";
  query?: string;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const registrationType = input.registrationType ?? "ALL";

  try {
    const query = new URLSearchParams({
      locale: "kr",
    });
    if (registrationType !== "ALL") {
      query.set("registrationType", registrationType);
    }

    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "GET",
      path: "/v2/providers/seller_api/apis/api/v1/marketplace/meta/display-categories",
      query,
    });

    const items = filterByQuery(normalizeCategoryRows(payload), input.query ?? "", (item) =>
      [item.code, item.name, item.path, item.status].join(" "),
    );

    return {
      ...responseMeta(store, items, "live", items.length ? null : "조회된 카테고리가 없습니다."),
      registrationType,
    } satisfies CoupangCategoryListResponse;
  } catch (error) {
    const fallback = getSampleCoupangCategories(registrationType);
    return {
      ...fallback,
      store: mapStoreRef(store),
      items: filterByQuery(fallback.items, input.query ?? "", (item) =>
        [item.code, item.name, item.path, item.status].join(" "),
      ),
      message:
        error instanceof Error
          ? `${error.message} 실연동에 실패해 샘플 카테고리를 표시합니다.`
          : fallback.message,
    } satisfies CoupangCategoryListResponse;
  }
}

export async function listCoupangOutboundCenters(input: { storeId: string }) {
  const store = await getStoreOrThrow(input.storeId);

  try {
    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "GET",
      path: "/v2/providers/marketplace_openapi/apis/api/v2/vendor/shipping-place/outbound",
      query: new URLSearchParams({
        pageSize: "50",
        pageNum: "1",
      }),
    });

    const items = asContentArray(payload)
      .map((row) => asObject(row))
      .filter((row): row is LooseObject => Boolean(row))
      .map((row, index) => normalizeOutboundCenter(row, index));

    return responseMeta(
      store,
      items,
      "live",
      items.length ? null : "등록된 출고지가 없습니다.",
    ) satisfies CoupangLogisticsCenterListResponse<CoupangOutboundCenterRow>;
  } catch (error) {
    const fallback = getSampleCoupangOutboundCenters();
    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 출고지는 현재 readonly 샘플 구조로 제공합니다.`
          : fallback.message,
    } satisfies CoupangLogisticsCenterListResponse<CoupangOutboundCenterRow>;
  }
}

export async function listCoupangReturnCenters(input: { storeId: string }) {
  const store = await getStoreOrThrow(input.storeId);

  try {
    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "GET",
      path:
        "/v2/providers/openapi/apis/api/v5/vendors/" +
        encodeURIComponent(store.vendorId) +
        "/returnShippingCenters",
    });

    const items = asContentArray(payload)
      .map((row) => asObject(row))
      .filter((row): row is LooseObject => Boolean(row))
      .map((row, index) => normalizeReturnCenter(row, index));

    return responseMeta(
      store,
      items,
      "live",
      items.length ? null : "등록된 반품지가 없습니다.",
    ) satisfies CoupangLogisticsCenterListResponse<CoupangReturnCenterRow>;
  } catch (error) {
    const fallback = getSampleCoupangReturnCenters();
    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 실연동에 실패해 샘플 반품지를 표시합니다.`
          : fallback.message,
    } satisfies CoupangLogisticsCenterListResponse<CoupangReturnCenterRow>;
  }
}

export async function listCoupangProductInquiries(input: {
  storeId: string;
  answeredType?: "ALL" | "ANSWERED" | "NOANSWER";
  inquiryStartAt: string;
  inquiryEndAt: string;
  pageSize?: number;
  pageNum?: number;
  query?: string;
}) {
  const store = await getStoreOrThrow(input.storeId);

  try {
    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "GET",
      path:
        "/v2/providers/openapi/apis/api/v5/vendors/" +
        encodeURIComponent(store.vendorId) +
        "/onlineInquiries",
      query: new URLSearchParams({
        vendorId: store.vendorId,
        answeredType: input.answeredType ?? "ALL",
        inquiryStartAt: input.inquiryStartAt,
        inquiryEndAt: input.inquiryEndAt,
        pageSize: String(Math.max(1, Math.min(input.pageSize ?? 20, 50))),
        pageNum: String(Math.max(1, input.pageNum ?? 1)),
      }),
    });

    const rawRows = asContentArray(payload);
    const productNameMap = await buildProductNameMap(
      store,
      rawRows.map((row) => {
        const objectValue = asObject(row);
        return {
          sellerProductId: asString(objectValue?.sellerProductId),
          vendorItemId: asString(objectValue?.vendorItemId),
        };
      }),
    );
    const items = filterByQuery(
      normalizeProductInquiryRows(rawRows, productNameMap),
      input.query ?? "",
      (item) =>
        [
          item.inquiryId,
          item.productName,
          item.content,
          item.orderIds.join(" "),
          item.replies.map((reply) => reply.content).join(" "),
        ].join(" "),
    );

    return {
      ...responseMeta(store, items, "live", items.length ? null : "조회된 상품 문의가 없습니다."),
      pagination: asPagination(payload),
    } satisfies CoupangInquiryListResponse<CoupangProductInquiryRow>;
  } catch (error) {
    const fallback = getSampleCoupangProductInquiries();
    return {
      ...fallback,
      store: mapStoreRef(store),
      items: filterByQuery(fallback.items, input.query ?? "", (item) =>
        [item.inquiryId, item.productName, item.content, item.orderIds.join(" ")].join(" "),
      ),
      message:
        error instanceof Error
          ? `${error.message} 실연동에 실패해 샘플 상품 문의를 표시합니다.`
          : fallback.message,
    } satisfies CoupangInquiryListResponse<CoupangProductInquiryRow>;
  }
}

export async function listCoupangCallCenterInquiries(input: {
  storeId: string;
  partnerCounselingStatus?: "NONE" | "ANSWER" | "NO_ANSWER" | "TRANSFER";
  inquiryStartAt?: string;
  inquiryEndAt?: string;
  vendorItemId?: string;
  orderId?: string;
  pageSize?: number;
  pageNum?: number;
  query?: string;
}) {
  const store = await getStoreOrThrow(input.storeId);

  try {
    const query = new URLSearchParams({
      vendorId: store.vendorId,
      partnerCounselingStatus: input.partnerCounselingStatus ?? "NONE",
      pageSize: String(Math.max(1, Math.min(input.pageSize ?? 20, 30))),
      pageNum: String(Math.max(1, input.pageNum ?? 1)),
    });

    if (input.inquiryStartAt) {
      query.set("inquiryStartAt", input.inquiryStartAt);
    }
    if (input.inquiryEndAt) {
      query.set("inquiryEndAt", input.inquiryEndAt);
    }
    if (input.vendorItemId) {
      query.set("vendorItemId", input.vendorItemId);
    }
    if (input.orderId) {
      query.set("orderId", input.orderId);
    }

    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "GET",
      path:
        "/v2/providers/openapi/apis/api/v5/vendors/" +
        encodeURIComponent(store.vendorId) +
        "/callCenterInquiries",
      query,
    });

    const items = filterByQuery(normalizeCallCenterRows(asContentArray(payload)), input.query ?? "", (item) =>
      [
        item.inquiryId,
        item.productName,
        item.content,
        item.orderId ?? "",
        item.vendorItemIds.join(" "),
        item.replies.map((reply) => reply.content).join(" "),
      ].join(" "),
    );

    return {
      ...responseMeta(
        store,
        items,
        "live",
        items.length ? null : "조회된 쿠팡 상담 문의가 없습니다.",
      ),
      pagination: asPagination(payload),
    } satisfies CoupangInquiryListResponse<CoupangCallCenterInquiryRow>;
  } catch (error) {
    const fallback = getSampleCoupangCallCenterInquiries();
    return {
      ...fallback,
      store: mapStoreRef(store),
      items: filterByQuery(fallback.items, input.query ?? "", (item) =>
        [item.inquiryId, item.productName, item.content, item.orderId ?? ""].join(" "),
      ),
      message:
        error instanceof Error
          ? `${error.message} 실연동에 실패해 샘플 상담 문의를 표시합니다.`
          : fallback.message,
    } satisfies CoupangInquiryListResponse<CoupangCallCenterInquiryRow>;
  }
}

export async function answerCoupangProductInquiry(
  input: AnswerCoupangProductInquiryInput,
): Promise<CoupangInquiryAnswerResponse> {
  const store = await getStoreOrThrow(input.storeId);

  await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "POST",
    path:
      "/v2/providers/openapi/apis/api/v4/vendors/" +
      encodeURIComponent(store.vendorId) +
      `/onlineInquiries/${encodeURIComponent(input.inquiryId)}/replies`,
    body: {
      content: input.content,
      vendorId: store.vendorId,
      replyBy: input.replyBy,
    },
  });

  return {
    inquiryId: input.inquiryId,
    appliedAt: nowIso(),
    message: "상품 문의 답변이 등록되었습니다.",
  };
}

export async function confirmCoupangCallCenterInquiry(
  input: ConfirmCoupangCallCenterInquiryInput,
): Promise<CoupangInquiryConfirmResponse> {
  const store = await getStoreOrThrow(input.storeId);

  await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "POST",
    path:
      "/v2/providers/openapi/apis/api/v4/vendors/" +
      encodeURIComponent(store.vendorId) +
      `/callCenterInquiries/${encodeURIComponent(input.inquiryId)}/confirms`,
    body: {
      confirmBy: input.confirmBy,
    },
  });

  return {
    inquiryId: input.inquiryId,
    appliedAt: nowIso(),
    message: "콜센터 문의 확인 처리가 완료되었습니다.",
  };
}

export async function answerCoupangCallCenterInquiry(
  input: AnswerCoupangCallCenterInquiryInput,
): Promise<CoupangInquiryAnswerResponse> {
  const store = await getStoreOrThrow(input.storeId);

  await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "POST",
    path:
      "/v2/providers/openapi/apis/api/v4/vendors/" +
      encodeURIComponent(store.vendorId) +
      `/callCenterInquiries/${encodeURIComponent(input.inquiryId)}/replies`,
    body: {
      vendorId: store.vendorId,
      inquiryId: input.inquiryId,
      content: input.content,
      replyBy: input.replyBy,
      parentAnswerId: input.parentAnswerId,
    },
  });

  return {
    inquiryId: input.inquiryId,
    appliedAt: nowIso(),
    message: "콜센터 문의 답변이 등록되었습니다.",
  };
}

export async function createCoupangOutboundCenter(
  input: CreateCoupangOutboundCenterInput,
): Promise<CoupangLogisticsMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "POST",
    path:
      "/v2/providers/openapi/apis/api/v5/vendors/" +
      encodeURIComponent(store.vendorId) +
      "/outboundShippingCenters",
    body: {
      vendorId: store.vendorId,
      userId: input.userId,
      shippingPlaceName: input.shippingPlaceName,
      usable: input.usable ?? true,
      global: input.global ?? false,
      placeAddresses: buildOutboundPlaceAddresses(input.placeAddresses),
      remoteInfos: buildOutboundRemoteInfos(input.remoteInfos),
    },
  });

  const resultMessage = asString(asObject(asObject(payload)?.data)?.resultMessage);
  return {
    centerCode: resultMessage ?? input.shippingPlaceName,
    appliedAt: nowIso(),
    message: resultMessage
      ? `출고지 생성이 완료되었습니다. 출고지 코드: ${resultMessage}`
      : "출고지 생성이 완료되었습니다.",
  };
}

export async function updateCoupangOutboundCenter(
  input: UpdateCoupangOutboundCenterInput,
): Promise<CoupangLogisticsMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "PUT",
    path:
      "/v2/providers/openapi/apis/api/v5/vendors/" +
      encodeURIComponent(store.vendorId) +
      `/outboundShippingCenters/${encodeURIComponent(input.outboundShippingPlaceCode)}`,
    body: {
      vendorId: store.vendorId,
      userId: input.userId,
      outboundShippingPlaceCode: Number(input.outboundShippingPlaceCode),
      shippingPlaceName: input.shippingPlaceName,
      usable: input.usable ?? true,
      global: input.global ?? false,
      placeAddresses: buildOutboundPlaceAddresses(input.placeAddresses),
      remoteInfos: buildOutboundRemoteInfos(input.remoteInfos),
    },
  });

  return {
    centerCode: input.outboundShippingPlaceCode,
    appliedAt: nowIso(),
    message: `출고지 수정이 완료되었습니다. ${extractMutationMessage(payload)}`,
  };
}

export async function createCoupangReturnCenter(
  input: CreateCoupangReturnCenterInput,
): Promise<CoupangLogisticsMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "POST",
    path:
      "/v2/providers/openapi/apis/api/v5/vendors/" +
      encodeURIComponent(store.vendorId) +
      "/returnShippingCenters",
    body: {
      vendorId: store.vendorId,
      userId: input.userId,
      shippingPlaceName: input.shippingPlaceName,
      placeAddresses: buildReturnPlaceAddresses(input.placeAddresses),
      goodsflowInfoOpenApiDto: buildReturnGoodsflowInfo(input.goodsflowInfo),
    },
  });

  const resultData = asObject(asObject(payload)?.data);
  return {
    centerCode:
      asString(resultData?.returnCenterCode) ??
      asString(resultData?.resultMessage) ??
      input.shippingPlaceName,
    appliedAt: nowIso(),
    message: "반품지 생성이 완료되었습니다.",
  };
}

export async function updateCoupangReturnCenter(
  input: UpdateCoupangReturnCenterInput,
): Promise<CoupangLogisticsMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "PUT",
    path:
      "/v2/providers/openapi/apis/api/v5/vendors/" +
      encodeURIComponent(store.vendorId) +
      `/returnShippingCenters/${encodeURIComponent(input.returnCenterCode)}`,
    body: {
      vendorId: store.vendorId,
      returnCenterCode: Number(input.returnCenterCode),
      userId: input.userId,
      shippingPlaceName: input.shippingPlaceName ?? null,
      usable: input.usable ?? true,
      placeAddresses: buildReturnPlaceAddresses(input.placeAddresses),
      goodsflowInfoDto: buildReturnGoodsflowInfo(input.goodsflowInfo),
    },
  });

  return {
    centerCode: input.returnCenterCode,
    appliedAt: nowIso(),
    message: `반품지 수정이 완료되었습니다. ${extractMutationMessage(payload)}`,
  };
}

export async function listCoupangRocketGrowthProducts(input: {
  storeId: string;
  sellerProductName?: string;
  nextToken?: string | null;
  maxPerPage?: number;
}) {
  const store = await getStoreOrThrow(input.storeId);

  try {
    const query = new URLSearchParams({
      vendorId: store.vendorId,
      businessTypes: "rocketGrowth",
      maxPerPage: String(Math.max(1, Math.min(input.maxPerPage ?? 20, 100))),
    });
    if (input.nextToken) {
      query.set("nextToken", input.nextToken);
    }
    if (input.sellerProductName) {
      query.set("sellerProductName", input.sellerProductName.slice(0, 20));
    }

    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "GET",
      path: "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products",
      query,
    });

    const items = normalizeRocketGrowthProductRows(payload);

    return {
      ...responseMeta(
        store,
        items,
        "live",
        items.length ? null : "조회된 로켓그로스 상품이 없습니다.",
      ),
      nextToken: asString(asObject(payload)?.nextToken),
    } satisfies CoupangRocketGrowthProductListResponse;
  } catch (error) {
    const fallback = getSampleCoupangRocketGrowthProducts();
    return {
      ...fallback,
      store: mapStoreRef(store),
      items: filterByQuery(fallback.items, input.sellerProductName ?? "", (item) =>
        [item.sellerProductId, item.sellerProductName, item.vendorItemIds.join(" ")].join(" "),
      ),
      message:
        error instanceof Error
          ? `${error.message} 실연동에 실패해 샘플 로켓그로스 상품을 표시합니다.`
          : fallback.message,
    } satisfies CoupangRocketGrowthProductListResponse;
  }
}

export async function listCoupangRocketGrowthInventory(input: {
  storeId: string;
  vendorItemId?: string;
  nextToken?: string | null;
}) {
  const store = await getStoreOrThrow(input.storeId);

  try {
    const query = new URLSearchParams();
    if (input.vendorItemId) {
      query.set("vendorItemId", input.vendorItemId);
    }
    if (input.nextToken && !input.vendorItemId) {
      query.set("nextToken", input.nextToken);
    }

    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "GET",
      path:
        "/v2/providers/rg_open_api/apis/api/v1/vendors/" +
        encodeURIComponent(store.vendorId) +
        "/rg/inventory/summaries",
      query,
    });

    const items = normalizeRocketGrowthInventoryRows(payload);

    return {
      ...responseMeta(
        store,
        items,
        "live",
        items.length ? null : "조회된 로켓그로스 재고가 없습니다.",
      ),
      nextToken: asString(asObject(payload)?.nextToken),
    } satisfies CoupangRocketGrowthInventoryListResponse;
  } catch (error) {
    const fallback = getSampleCoupangRocketGrowthInventory();
    return {
      ...fallback,
      store: mapStoreRef(store),
      items: filterByQuery(fallback.items, input.vendorItemId ?? "", (item) =>
        [item.vendorItemId, item.externalSkuId ?? ""].join(" "),
      ),
      message:
        error instanceof Error
          ? `${error.message} 실연동에 실패해 샘플 로켓그로스 재고를 표시합니다.`
          : fallback.message,
    } satisfies CoupangRocketGrowthInventoryListResponse;
  }
}

export async function listCoupangRocketGrowthOrders(input: {
  storeId: string;
  paidDateFrom: string;
  paidDateTo: string;
  nextToken?: string | null;
}) {
  const store = await getStoreOrThrow(input.storeId);

  try {
    const query = new URLSearchParams({
      paidDateFrom: input.paidDateFrom.replaceAll("-", ""),
      paidDateTo: input.paidDateTo.replaceAll("-", ""),
    });

    if (input.nextToken) {
      query.set("nextToken", input.nextToken);
    }

    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "GET",
      path:
        "/v2/providers/rg_open_api/apis/api/v1/vendors/" +
        encodeURIComponent(store.vendorId) +
        "/rg/orders",
      query,
    });

    const items = normalizeRocketGrowthOrderRows(payload);

    return {
      ...responseMeta(
        store,
        items,
        "live",
        items.length ? null : "조회된 로켓그로스 주문이 없습니다.",
      ),
      nextToken: asString(asObject(payload)?.nextToken),
    } satisfies CoupangRocketGrowthOrderListResponse;
  } catch (error) {
    const fallback = getSampleCoupangRocketGrowthOrders();
    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 실데이터 조회에 실패해 샘플 주문을 표시합니다.`
          : fallback.message,
    } satisfies CoupangRocketGrowthOrderListResponse;
  }
}
