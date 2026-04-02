import { COUPANG_PRODUCT_VIOLATION_TYPES } from "@shared/coupang";
import type { ConnectionTestResult } from "@shared/channel-settings";
import type {
  CoupangActionItemResult,
  CoupangBatchActionResponse,
  CoupangDataSource,
  CoupangProductAttribute,
  CoupangProductContentDetailInput,
  CoupangProductContentGroup,
  CoupangProductDetail,
  CoupangProductDetailResponse,
  CoupangProductEditableItem,
  CoupangProductExplorerExposureCard,
  CoupangProductExplorerFacets,
  CoupangProductExplorerOperationCard,
  CoupangProductExplorerResponse,
  CoupangProductExplorerRow,
  CoupangProductExplorerSortField,
  CoupangProductExposureState,
  CoupangProductFullEditPayload,
  CoupangProductImage,
  CoupangProductListItem,
  CoupangProductListResponse,
  CoupangProductMutationResult,
  CoupangProductNotice,
  CoupangProductPartialEditPayload,
  CoupangProductPriceUpdateTarget,
  CoupangProductQuantityUpdateTarget,
  CoupangProductSaleStatusUpdateTarget,
  CoupangProductSearchField,
  CoupangProductViolationType,
  CoupangProductVendorItem,
  CoupangQuickEditOptionRow,
  CoupangSaleStatus,
  CoupangSortDirection,
  CoupangStoreRef,
  CoupangVendorItemActionResult,
} from "@shared/coupang";
import {
  coupangProductCacheStore,
  coupangSettingsStore,
  getSampleCoupangProducts,
  listCoupangCategories,
  mapWithConcurrency,
  normalizeCoupangBaseUrl,
  requestCoupangJson,
} from "../../../infra/coupang/product-deps";

type StoredCoupangStore = NonNullable<Awaited<ReturnType<typeof coupangSettingsStore.getStore>>>;
type LooseObject = Record<string, unknown>;
type ProductHydrationMode = "summary" | "full";
type ExplorerSnapshot = {
  store: CoupangStoreRef;
  items: CoupangProductExplorerRow[];
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
};

const PRODUCT_SUMMARY_CONCURRENCY = 2;
const PRODUCT_VENDOR_INVENTORY_CONCURRENCY = 2;
const PRODUCT_BATCH_CONCURRENCY = 2;
const EXPLORER_DEFAULT_PAGE_SIZE = 20;
const EXPLORER_MAX_PAGE_SIZE = 100;
const EXPLORER_FRESH_TTL_MS = 2 * 60_000;
const DETAIL_BACKGROUND_FRESH_TTL_MS = 6 * 60 * 60_000;
const EXPLORER_BACKGROUND_HYDRATION_CONCURRENCY = 4;
const EXPLORER_BACKGROUND_RETRY_MS = 60_000;
const CATEGORY_PATH_CACHE_TTL_MS = 6 * 60 * 60_000;

const inFlightExplorerRefreshes = new Map<string, Promise<ExplorerSnapshot>>();
const inFlightProductDetails = new Map<string, Promise<CoupangProductDetailResponse>>();
const inFlightCategoryPathRequests = new Map<string, Promise<Map<string, string>>>();
const suspendedExplorerHydrationStores = new Map<string, number>();
const cachedCategoryPaths = new Map<
  string,
  {
    expiresAt: number;
    pathByCode: Map<string, string>;
  }
>();

type ExplorerHydrationController = {
  queue: string[];
  queued: Set<string>;
  running: Set<string>;
  retryAfter: Map<string, number>;
  retryTimer: ReturnType<typeof setTimeout> | null;
  hydrated: Map<string, { lastModifiedAt: string | null; warmedAt: number }>;
};

const explorerHydrationControllers = new Map<string, ExplorerHydrationController>();

function isExplorerHydrationSuspended(storeId: string) {
  return (suspendedExplorerHydrationStores.get(storeId) ?? 0) > 0;
}

function suspendExplorerHydration(storeId: string) {
  suspendedExplorerHydrationStores.set(
    storeId,
    (suspendedExplorerHydrationStores.get(storeId) ?? 0) + 1,
  );
}

async function resumeExplorerHydration(storeId: string) {
  const current = suspendedExplorerHydrationStores.get(storeId) ?? 0;
  if (current <= 1) {
    suspendedExplorerHydrationStores.delete(storeId);
  } else {
    suspendedExplorerHydrationStores.set(storeId, current - 1);
    return;
  }

  if (!explorerHydrationControllers.has(storeId)) {
    return;
  }

  try {
    const store = await getStoreOrThrow(storeId);
    pumpExplorerBackgroundHydration(store);
  } catch {
    // Ignore resume failures; hydration can restart on the next explicit queue event.
  }
}

export async function withCoupangExplorerHydrationSuspended<T>(
  storeId: string,
  task: () => Promise<T>,
) {
  suspendExplorerHydration(storeId);
  try {
    return await task();
  } finally {
    await resumeExplorerHydration(storeId);
  }
}

export function asString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

export function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseObject)
    : null;
}

type ExplorerVendorItemSummary = {
  optionCount: number;
  totalInventory: number | null;
  minSalePrice: number | null;
  maxSalePrice: number | null;
  onSaleOptionCount: number;
  suspendedOptionCount: number;
  zeroInventoryOptionCount: number;
  bestPriceGuaranteedOptionCount: number;
};

const COUPANG_PRODUCT_VIOLATION_TYPE_SET = new Set<CoupangProductViolationType>(
  COUPANG_PRODUCT_VIOLATION_TYPES,
);
const EXPLORER_EXPOSURE_CARD_KEYS: CoupangProductExplorerExposureCard[] = [
  "all",
  "restricted",
  "low",
  "normal",
  "unknown",
];
const EXPLORER_OPERATION_CARD_KEYS: CoupangProductExplorerOperationCard[] = [
  "all",
  "suspended",
  "zeroInventory",
  "bestPriceGuaranteed",
];

function createEmptyExplorerFacets(): CoupangProductExplorerFacets {
  return {
    exposure: {
      all: 0,
      restricted: 0,
      low: 0,
      normal: 0,
      unknown: 0,
    },
    operation: {
      all: 0,
      suspended: 0,
      zeroInventory: 0,
      bestPriceGuaranteed: 0,
    },
  };
}

function normalizeViolationType(value: unknown): CoupangProductViolationType | null {
  const normalized = asString(value)?.trim().toUpperCase() ?? null;
  return normalized && COUPANG_PRODUCT_VIOLATION_TYPE_SET.has(normalized as CoupangProductViolationType)
    ? (normalized as CoupangProductViolationType)
    : null;
}

function sortViolationTypes(
  violationTypes: Iterable<CoupangProductViolationType>,
): CoupangProductViolationType[] {
  const unique = new Set(violationTypes);
  return COUPANG_PRODUCT_VIOLATION_TYPES.filter((value) => unique.has(value));
}

function normalizeViolationTypes(value: unknown): CoupangProductViolationType[] {
  const normalizedTypes = new Set<CoupangProductViolationType>();
  const entries = Array.isArray(value) ? value : [value];

  for (const entry of entries) {
    const directType = normalizeViolationType(entry);
    if (directType) {
      normalizedTypes.add(directType);
      continue;
    }

    const objectEntry = asObject(entry);
    if (!objectEntry) {
      continue;
    }

    const nestedCandidates = [
      objectEntry.violationType,
      objectEntry.type,
      objectEntry.code,
      objectEntry.name,
      objectEntry.violationTypeCode,
    ];

    for (const candidate of nestedCandidates) {
      const nestedType = normalizeViolationType(candidate);
      if (nestedType) {
        normalizedTypes.add(nestedType);
      }
    }
  }

  return sortViolationTypes(normalizedTypes);
}

function extractViolationTypes(
  value: LooseObject | null | undefined,
  fallback: ReadonlyArray<CoupangProductViolationType> = [],
): CoupangProductViolationType[] {
  if (!value) {
    return [...fallback];
  }

  const candidates = [
    value.violationTypes,
    value.violationType,
    value.violationTypeList,
    value.violationTypeCodes,
    value.violationList,
    value.violations,
  ];

  const normalized = new Set<CoupangProductViolationType>(fallback);
  for (const candidate of candidates) {
    for (const violationType of normalizeViolationTypes(candidate)) {
      normalized.add(violationType);
    }
  }

  return sortViolationTypes(normalized);
}

function resolveExposureState(
  violationTypes: ReadonlyArray<CoupangProductViolationType>,
): CoupangProductExposureState {
  if (
    violationTypes.includes("NO_VA_V2") ||
    violationTypes.includes("MOTA_V2")
  ) {
    return "restricted";
  }

  if (violationTypes.includes("ATTR")) {
    return "low";
  }

  return "normal";
}

function clampPositiveInteger(value: number | string | undefined, fallback: number, max?: number) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.max(1, Math.floor(parsed));
  return typeof max === "number" ? Math.min(normalized, max) : normalized;
}

function compareNullableNumbers(left: number | null | undefined, right: number | null | undefined) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  return left - right;
}

function compareNullableStrings(left: string | null | undefined, right: string | null | undefined) {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, "ko-KR");
}

function compareNullableDates(left: string | null | undefined, right: string | null | undefined) {
  const leftTime = left ? new Date(left).getTime() : Number.NaN;
  const rightTime = right ? new Date(right).getTime() : Number.NaN;

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
  if (Number.isNaN(leftTime)) return 1;
  if (Number.isNaN(rightTime)) return -1;
  return leftTime - rightTime;
}

function parseExplorerDateBoundary(
  value: string | undefined,
  edge: "start" | "end",
) {
  if (!value?.trim()) {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const suffix = edge === "start" ? "T00:00:00+09:00" : "T23:59:59.999+09:00";
  const parsed = new Date(`${normalized}${suffix}`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function parseExplorerRowDate(value: string | null | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? fallback : parsed;
}

function matchesSalePeriod(
  row: CoupangProductExplorerRow,
  salePeriodFrom?: string,
  salePeriodTo?: string,
) {
  const filterStart = parseExplorerDateBoundary(salePeriodFrom, "start");
  const filterEnd = parseExplorerDateBoundary(salePeriodTo, "end");

  if (filterStart === null && filterEnd === null) {
    return true;
  }

  if (filterStart !== null && filterEnd !== null && filterStart > filterEnd) {
    return false;
  }

  const rowStart = parseExplorerRowDate(row.saleStartedAt, Number.NEGATIVE_INFINITY);
  const rowEnd = parseExplorerRowDate(row.saleEndedAt, Number.POSITIVE_INFINITY);
  const effectiveFilterStart = filterStart ?? Number.NEGATIVE_INFINITY;
  const effectiveFilterEnd = filterEnd ?? Number.POSITIVE_INFINITY;

  return rowStart <= effectiveFilterEnd && rowEnd >= effectiveFilterStart;
}

function matchesCreatedAt(row: CoupangProductExplorerRow, createdAtFrom?: string) {
  const filterStart = parseExplorerDateBoundary(createdAtFrom, "start");

  if (filterStart === null) {
    return true;
  }

  const rowCreatedAt = parseExplorerRowDate(row.createdAt, Number.NaN);
  return Number.isFinite(rowCreatedAt) && rowCreatedAt >= filterStart;
}

function normalizeIdValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value);
  }

  return value ?? undefined;
}

function buildCdnImageUrl(cdnPath: string | null) {
  if (!cdnPath) {
    return null;
  }

  if (/^https?:\/\//i.test(cdnPath)) {
    return cdnPath;
  }

  return `https://img1a.coupangcdn.com/image/${cdnPath.replace(/^\/+/, "")}`;
}

function buildImageUrl(image: LooseObject | null) {
  if (!image) {
    return null;
  }

  const vendorPath = asString(image.vendorPath);
  if (vendorPath && /^https?:\/\//i.test(vendorPath)) {
    return vendorPath;
  }

  return buildCdnImageUrl(asString(image.cdnPath));
}

function normalizeImages(value: unknown): CoupangProductImage[] {
  return asArray(value)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item, index) => ({
      imageOrder: asNumber(item.imageOrder) ?? index,
      imageType: asString(item.imageType),
      cdnPath: asString(item.cdnPath),
      vendorPath: asString(item.vendorPath),
      url: buildImageUrl(item),
    }));
}

function normalizeNotices(value: unknown): CoupangProductNotice[] {
  return asArray(value)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item) => ({
      noticeCategoryName: asString(item.noticeCategoryName),
      noticeCategoryDetailName: asString(item.noticeCategoryDetailName),
      content: asString(item.content),
    }));
}

function normalizeAttributes(value: unknown): CoupangProductAttribute[] {
  return asArray(value)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item) => ({
      attributeTypeName: asString(item.attributeTypeName),
      attributeValueName: asString(item.attributeValueName),
      exposed: asString(item.exposed),
      editable: asBoolean(item.editable),
    }));
}

function normalizeContents(value: unknown): CoupangProductContentGroup[] {
  return asArray(value)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item) => ({
      contentsType: asString(item.contentsType),
      contentDetails: asArray(item.contentDetails)
        .map((detail) => asObject(detail))
        .filter((detail): detail is LooseObject => Boolean(detail))
        .map((detail) => ({
          detailType: asString(detail.detailType),
          content: asString(detail.content),
        })),
    }));
}

function extractPreviewHtml(groups: CoupangProductContentGroup[]) {
  for (const group of groups) {
    for (const detail of group.contentDetails) {
      if (detail.content?.trim()) {
        return detail.content;
      }
    }
  }

  return null;
}

async function getStoreOrThrow(storeId: string) {
  const store = await coupangSettingsStore.getStore(storeId);
  if (!store) {
    throw new Error("Coupang store settings not found.");
  }

  return store as StoredCoupangStore;
}

function mapStoreRef(store: StoredCoupangStore) {
  return {
    id: store.id,
    name: store.storeName,
    vendorId: store.vendorId,
  };
}

function inferSaleStatus(onSale: boolean | null | undefined): CoupangSaleStatus {
  if (onSale === true) return "ONSALE";
  if (onSale === false) return "SUSPENDED";
  return "UNKNOWN";
}

async function requestProductList(
  store: StoredCoupangStore,
  input: {
    maxPerPage?: number;
    nextToken?: string | null;
    sellerProductId?: string | null;
    sellerProductName?: string;
    status?: string;
    violationTypes?: CoupangProductViolationType[];
    violationTypeAndOr?: "AND" | "OR";
  },
) {
  const query = new URLSearchParams({
    vendorId: store.vendorId,
    maxPerPage: String(Math.max(1, Math.min(input.maxPerPage ?? 10, 100))),
  });

  if (input.nextToken) {
    query.set("nextToken", input.nextToken);
  }

  if (input.sellerProductId) {
    query.set("sellerProductId", input.sellerProductId);
  }

  if (input.sellerProductName?.trim()) {
    query.set("sellerProductName", input.sellerProductName.trim().slice(0, 20));
  }

  if (input.status?.trim()) {
    query.set("status", input.status.trim());
  }

  for (const violationType of input.violationTypes ?? []) {
    query.append("violationTypes", violationType);
  }

  if (input.violationTypes?.length && input.violationTypeAndOr) {
    query.set("violationTypeAndOr", input.violationTypeAndOr);
  }

  return requestCoupangJson<{
    code?: string;
    message?: string;
    data?: LooseObject[];
    nextToken?: string;
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path: "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products",
    query,
  });
}

async function requestProductDetail(store: StoredCoupangStore, sellerProductId: string) {
  return requestCoupangJson<{
    code?: string;
    message?: string;
    data?: LooseObject;
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path: `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${encodeURIComponent(sellerProductId)}`,
  });
}

async function requestPartialProductDetail(store: StoredCoupangStore, sellerProductId: string) {
  return requestCoupangJson<{
    code?: string;
    message?: string;
    data?: LooseObject;
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path:
      `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${encodeURIComponent(
        sellerProductId,
      )}/partial`,
  });
}

async function requestVendorItemInventory(store: StoredCoupangStore, vendorItemId: string) {
  return requestCoupangJson<{
    code?: string;
    message?: string;
    data?: LooseObject;
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path:
      `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${encodeURIComponent(
        vendorItemId,
      )}/inventories`,
  });
}

function normalizeVendorItem(
  detailItem: LooseObject,
  inventory: LooseObject | null,
): CoupangProductVendorItem {
  return {
    vendorItemId: asString(detailItem.vendorItemId) ?? "",
    itemName: asString(detailItem.itemName) ?? "?듭뀡紐??놁쓬",
    externalVendorSku: asString(detailItem.externalVendorSku),
    originalPrice: asNumber(detailItem.originalPrice),
    salePrice: asNumber(inventory?.salePrice ?? detailItem.salePrice),
    inventoryCount: asNumber(inventory?.amountInStock ?? detailItem.maximumBuyCount),
    saleStatus: inferSaleStatus(typeof inventory?.onSale === "boolean" ? inventory.onSale : null),
    adultOnly: asString(detailItem.adultOnly),
    lastModifiedAt: asString(detailItem.modifiedAt) ?? asString(detailItem.updatedAt),
    attributes: normalizeAttributes(detailItem.attributes)
      .map((attribute) =>
        attribute.attributeTypeName && attribute.attributeValueName
          ? `${attribute.attributeTypeName}: ${attribute.attributeValueName}`
          : null,
      )
      .filter((value): value is string => Boolean(value)),
  };
}

function normalizeQuickEditOptionRow(input: CoupangProductEditableItem): CoupangQuickEditOptionRow {
  return {
    vendorItemId: input.vendorItemId ?? "",
    sellerProductItemId: input.sellerProductItemId,
    itemId: input.itemId,
    itemName: input.itemName,
    externalVendorSku: input.externalVendorSku,
    barcode: input.barcode,
    originalPrice: input.originalPrice,
    supplyPrice: input.supplyPrice,
    salePrice: input.salePrice,
    saleAgentCommission: input.saleAgentCommission,
    bestPriceGuaranteed3P: input.bestPriceGuaranteed3P,
    maximumBuyCount: input.maximumBuyCount,
    inventoryCount: input.inventoryCount,
    saleStatus: input.saleStatus,
    lastModifiedAt: input.rawData ? asString(asObject(input.rawData)?.modifiedAt) : null,
    attributes: input.attributes
      .map((attribute) =>
        attribute.attributeTypeName && attribute.attributeValueName
          ? `${attribute.attributeTypeName}: ${attribute.attributeValueName}`
          : null,
      )
      .filter((value): value is string => Boolean(value)),
  };
}

function normalizeSummaryQuickEditOptionRow(item: LooseObject): CoupangQuickEditOptionRow {
  const saleStatus = asString(item.saleStatus) ?? asString(item.status);
  const normalizedSaleStatus: CoupangSaleStatus =
    saleStatus === "ONSALE" ||
    saleStatus === "SUSPENDED" ||
    saleStatus === "ENDED" ||
    saleStatus === "UNKNOWN"
      ? saleStatus
      : inferSaleStatus(asBoolean(item.onSale));

  return {
    vendorItemId: asString(item.vendorItemId) ?? "",
    sellerProductItemId: asString(item.sellerProductItemId),
    itemId: asString(item.itemId),
    itemName: asString(item.itemName) ?? asString(item.vendorItemName) ?? "?듭뀡紐??놁쓬",
    externalVendorSku: asString(item.externalVendorSku),
    barcode: asString(item.barcode),
    originalPrice: asNumber(item.originalPrice),
    supplyPrice: asNumber(item.supplyPrice),
    salePrice: asNumber(item.salePrice),
    saleAgentCommission: asNumber(item.saleAgentCommission),
    bestPriceGuaranteed3P: asBoolean(item.bestPriceGuaranteed3P),
    maximumBuyCount: asNumber(item.maximumBuyCount),
    inventoryCount: asNumber(
      item.inventoryCount ?? item.quantity ?? item.amountInStock ?? item.stockCount ?? item.maximumBuyCount,
    ),
    saleStatus: normalizedSaleStatus,
    lastModifiedAt: asString(item.modifiedAt) ?? asString(item.updatedAt),
    attributes: normalizeAttributes(item.attributes)
      .map((attribute) =>
        attribute.attributeTypeName && attribute.attributeValueName
          ? `${attribute.attributeTypeName}: ${attribute.attributeValueName}`
          : null,
      )
      .filter((value): value is string => Boolean(value)),
  };
}

function collectSummaryItemObjects(summary: LooseObject) {
  const candidates = [
    summary.items,
    summary.vendorItems,
    summary.sellerProductItems,
    summary.sellerProductItemDtos,
    summary.itemList,
  ];

  for (const candidate of candidates) {
    const items = asArray(candidate)
      .map((item) => asObject(item))
      .filter((item): item is LooseObject => Boolean(item));

    if (items.length) {
      return items;
    }
  }

  return [] as LooseObject[];
}

function summarizeExplorerVendorItems(
  vendorItems: CoupangQuickEditOptionRow[],
): ExplorerVendorItemSummary {
  const salePrices = vendorItems
    .map((item) => item.salePrice)
    .filter((value): value is number => typeof value === "number");
  const inventories = vendorItems
    .map((item) => item.inventoryCount)
    .filter((value): value is number => typeof value === "number");
  const onSaleOptionCount = vendorItems.filter((item) => item.saleStatus === "ONSALE").length;
  const suspendedOptionCount = vendorItems.filter((item) => item.saleStatus === "SUSPENDED").length;
  const zeroInventoryOptionCount = vendorItems.filter(
    (item) => typeof item.inventoryCount === "number" && item.inventoryCount <= 0,
  ).length;
  const bestPriceGuaranteedOptionCount = vendorItems.filter(
    (item) => item.bestPriceGuaranteed3P === true,
  ).length;

  return {
    optionCount: vendorItems.length,
    totalInventory: inventories.length ? inventories.reduce((sum, value) => sum + value, 0) : null,
    minSalePrice: salePrices.length ? Math.min(...salePrices) : null,
    maxSalePrice: salePrices.length ? Math.max(...salePrices) : null,
    onSaleOptionCount,
    suspendedOptionCount,
    zeroInventoryOptionCount,
    bestPriceGuaranteedOptionCount,
  };
}

function extractSummaryThumbnailUrl(summary: LooseObject) {
  const directUrl =
    asString(summary.thumbnailUrl) ??
    asString(summary.imageUrl) ??
    asString(summary.representationImageUrl);

  if (directUrl) {
    return /^https?:\/\//i.test(directUrl) ? directUrl : buildCdnImageUrl(directUrl);
  }

  const singleImageCandidates = [
    asObject(summary.image),
    asObject(summary.thumbnailImage),
    asObject(summary.representationImage),
  ].filter((image): image is LooseObject => Boolean(image));

  for (const image of singleImageCandidates) {
    const url = buildImageUrl(image);
    if (url) {
      return url;
    }
  }

  const images = normalizeImages(summary.images ?? summary.imageList);
  return images.find((image) => image.imageType === "REPRESENTATION")?.url ?? images[0]?.url ?? null;
}

function getSummaryOptionCount(summary: LooseObject) {
  return asNumber(
    summary.optionCount ??
      summary.vendorItemCount ??
      summary.itemCount ??
      summary.itemsCount ??
      summary.totalItemCount ??
      summary.vendorItemSize ??
      summary.itemSize,
  );
}

export function applyExplorerRowFallbacks(
  nextRow: CoupangProductExplorerRow,
  previousRow?: CoupangProductExplorerRow | null,
): CoupangProductExplorerRow {
  if (!previousRow) {
    return nextRow;
  }

  const vendorItems = nextRow.vendorItems.length ? nextRow.vendorItems : previousRow.vendorItems;
  const vendorItemSummary = summarizeExplorerVendorItems(vendorItems);
  const violationTypes = nextRow.violationTypes.length
    ? nextRow.violationTypes
    : previousRow.violationTypes;
  const exposureState =
    nextRow.violationTypes.length || nextRow.exposureState !== "unknown"
      ? nextRow.exposureState
      : previousRow.exposureState;

  return {
    ...nextRow,
    sellerProductId: nextRow.sellerProductId || previousRow.sellerProductId,
    productId: nextRow.productId ?? previousRow.productId,
    sellerProductName: nextRow.sellerProductName || previousRow.sellerProductName,
    vendorId: nextRow.vendorId || previousRow.vendorId,
    displayCategoryCode: nextRow.displayCategoryCode ?? previousRow.displayCategoryCode,
    displayCategoryName: nextRow.displayCategoryName ?? previousRow.displayCategoryName,
    brand: nextRow.brand ?? previousRow.brand,
    status: nextRow.status ?? previousRow.status,
    statusName: nextRow.statusName ?? previousRow.statusName ?? nextRow.status ?? previousRow.status ?? null,
    violationTypes,
    exposureState,
    saleStartedAt: nextRow.saleStartedAt ?? previousRow.saleStartedAt,
    saleEndedAt: nextRow.saleEndedAt ?? previousRow.saleEndedAt,
    createdAt: nextRow.createdAt ?? previousRow.createdAt,
    lastModifiedAt: nextRow.lastModifiedAt ?? previousRow.lastModifiedAt,
    deliveryCharge: nextRow.deliveryCharge ?? previousRow.deliveryCharge,
    deliveryChargeType: nextRow.deliveryChargeType ?? previousRow.deliveryChargeType,
    thumbnailUrl: nextRow.thumbnailUrl ?? previousRow.thumbnailUrl,
    previewHtml: nextRow.previewHtml ?? previousRow.previewHtml,
    optionCount:
      nextRow.optionCount > 0
        ? nextRow.optionCount
        : vendorItemSummary.optionCount || previousRow.optionCount,
    totalInventory: nextRow.totalInventory ?? vendorItemSummary.totalInventory ?? previousRow.totalInventory,
    minSalePrice: nextRow.minSalePrice ?? vendorItemSummary.minSalePrice ?? previousRow.minSalePrice,
    maxSalePrice: nextRow.maxSalePrice ?? vendorItemSummary.maxSalePrice ?? previousRow.maxSalePrice,
    onSaleOptionCount:
      nextRow.onSaleOptionCount || vendorItemSummary.onSaleOptionCount || previousRow.onSaleOptionCount,
    suspendedOptionCount:
      nextRow.suspendedOptionCount ||
      vendorItemSummary.suspendedOptionCount ||
      previousRow.suspendedOptionCount,
    zeroInventoryOptionCount:
      nextRow.zeroInventoryOptionCount ||
      vendorItemSummary.zeroInventoryOptionCount ||
      previousRow.zeroInventoryOptionCount,
    bestPriceGuaranteedOptionCount:
      nextRow.bestPriceGuaranteedOptionCount ||
      vendorItemSummary.bestPriceGuaranteedOptionCount ||
      previousRow.bestPriceGuaranteedOptionCount,
    vendorItems,
  };
}

export function buildExplorerSummaryRow(input: {
  summary: LooseObject;
  previousRow?: CoupangProductExplorerRow | null;
  vendorIdFallback?: string | null;
}): CoupangProductExplorerRow {
  const summaryItems = collectSummaryItemObjects(input.summary).map((item) =>
    normalizeSummaryQuickEditOptionRow(item),
  );
  const summaryVendorStats = summarizeExplorerVendorItems(summaryItems);
  const violationTypes = extractViolationTypes(input.summary, input.previousRow?.violationTypes);

  return applyExplorerRowFallbacks(
    {
      sellerProductId:
        asString(input.summary.sellerProductId) ?? input.previousRow?.sellerProductId ?? "",
      productId: asString(input.summary.productId),
      sellerProductName:
        asString(input.summary.sellerProductName) ??
        input.previousRow?.sellerProductName ??
        "?곹뭹紐??놁쓬",
      vendorId:
        asString(input.summary.vendorId) ??
        input.vendorIdFallback ??
        input.previousRow?.vendorId ??
        "",
      displayCategoryCode: asString(input.summary.displayCategoryCode),
      displayCategoryName: asString(input.summary.displayCategoryName),
      brand: asString(input.summary.brand),
      status: asString(input.summary.status),
      statusName: asString(input.summary.statusName) ?? asString(input.summary.status),
      violationTypes,
      exposureState: resolveExposureState(violationTypes),
      saleStartedAt: asString(input.summary.saleStartedAt),
      saleEndedAt: asString(input.summary.saleEndedAt),
      createdAt: asString(input.summary.createdAt) ?? asString(input.summary.registeredAt),
      lastModifiedAt:
        asString(input.summary.lastModifiedAt) ??
        asString(input.summary.updatedAt) ??
        asString(input.summary.modifiedAt),
      deliveryCharge: asNumber(input.summary.deliveryCharge),
      deliveryChargeType: asString(input.summary.deliveryChargeType),
      thumbnailUrl: extractSummaryThumbnailUrl(input.summary),
      previewHtml: null,
      optionCount: getSummaryOptionCount(input.summary) ?? summaryVendorStats.optionCount,
      totalInventory: summaryVendorStats.totalInventory,
      minSalePrice: summaryVendorStats.minSalePrice,
      maxSalePrice: summaryVendorStats.maxSalePrice,
      onSaleOptionCount: summaryVendorStats.onSaleOptionCount,
      suspendedOptionCount: summaryVendorStats.suspendedOptionCount,
      zeroInventoryOptionCount: summaryVendorStats.zeroInventoryOptionCount,
      bestPriceGuaranteedOptionCount: summaryVendorStats.bestPriceGuaranteedOptionCount,
      vendorItems: summaryItems,
    },
    input.previousRow,
  );
}

function normalizeDisplayCategoryName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function applyExplorerCategoryPaths(
  rows: CoupangProductExplorerRow[],
  categoryPathByCode: ReadonlyMap<string, string>,
): CoupangProductExplorerRow[] {
  return rows.map((row) => {
    const currentName = normalizeDisplayCategoryName(row.displayCategoryName);
    if (currentName) {
      return row;
    }

    const categoryCode = row.displayCategoryCode?.trim();
    const resolvedName = categoryCode
      ? normalizeDisplayCategoryName(categoryPathByCode.get(categoryCode) ?? null)
      : null;

    if (!resolvedName) {
      return row;
    }

    return {
      ...row,
      displayCategoryName: resolvedName,
    };
  });
}

async function getCachedCategoryPaths(storeId: string) {
  const cached = cachedCategoryPaths.get(storeId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.pathByCode;
  }

  const inFlight = inFlightCategoryPathRequests.get(storeId);
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = (async () => {
    const response = await listCoupangCategories({
      storeId,
      registrationType: "ALL",
    });

    const pathByCode = new Map<string, string>();
    for (const item of response.items) {
      const code = item.code.trim();
      const resolvedPath = normalizeDisplayCategoryName(item.path) ?? normalizeDisplayCategoryName(item.name);
      if (code && resolvedPath) {
        pathByCode.set(code, resolvedPath);
      }
    }

    cachedCategoryPaths.set(storeId, {
      expiresAt: Date.now() + CATEGORY_PATH_CACHE_TTL_MS,
      pathByCode,
    });

    return pathByCode;
  })().finally(() => {
    inFlightCategoryPathRequests.delete(storeId);
  });

  inFlightCategoryPathRequests.set(storeId, requestPromise);
  return requestPromise;
}

export function mergeExplorerRowWithDetail(input: {
  row: CoupangProductExplorerRow;
  detailData: LooseObject;
  partialData: LooseObject;
  itemRows: CoupangProductEditableItem[];
}): CoupangProductExplorerRow {
  const productImages = normalizeImages(input.detailData.images);
  const fallbackImages = input.itemRows.flatMap((item) => item.images);
  const images = productImages.length ? productImages : fallbackImages;
  const previewHtml =
    extractPreviewHtml(normalizeContents(input.detailData.contents)) ??
    extractPreviewHtml(input.itemRows.flatMap((item) => item.contents)) ??
    input.row.previewHtml;
  const violationTypes = extractViolationTypes(input.detailData, input.row.violationTypes);
  const vendorItems = input.itemRows.length
    ? input.itemRows.map(normalizeQuickEditOptionRow)
    : input.row.vendorItems;
  const vendorItemSummary = summarizeExplorerVendorItems(vendorItems);

  return applyExplorerRowFallbacks(
    {
      ...input.row,
      sellerProductId: asString(input.detailData.sellerProductId) ?? input.row.sellerProductId,
      productId: asString(input.detailData.productId) ?? input.row.productId,
      sellerProductName:
        asString(input.detailData.sellerProductName) ?? input.row.sellerProductName,
      vendorId: asString(input.detailData.vendorId) ?? input.row.vendorId,
      displayCategoryCode:
        asString(input.detailData.displayCategoryCode) ?? input.row.displayCategoryCode,
      displayCategoryName:
        asString(input.detailData.displayCategoryName) ?? input.row.displayCategoryName,
      brand: asString(input.detailData.brand) ?? input.row.brand,
      status: asString(input.detailData.status) ?? input.row.status,
      statusName:
        asString(input.detailData.statusName) ??
        asString(input.detailData.status) ??
        input.row.statusName,
      violationTypes,
      exposureState: resolveExposureState(violationTypes),
      saleStartedAt: asString(input.detailData.saleStartedAt) ?? input.row.saleStartedAt,
      saleEndedAt: asString(input.detailData.saleEndedAt) ?? input.row.saleEndedAt,
      createdAt: asString(input.detailData.createdAt) ?? input.row.createdAt,
      lastModifiedAt:
        asString(input.detailData.updatedAt) ??
        asString(input.detailData.createdAt) ??
        input.row.lastModifiedAt,
      deliveryCharge: asNumber(input.partialData.deliveryCharge ?? input.detailData.deliveryCharge),
      deliveryChargeType: asString(
        input.partialData.deliveryChargeType ?? input.detailData.deliveryChargeType,
      ),
      thumbnailUrl:
        images.find((image) => image.imageType === "REPRESENTATION")?.url ??
        images[0]?.url ??
        input.row.thumbnailUrl,
      previewHtml,
      optionCount: input.itemRows.length || input.row.optionCount,
      totalInventory: vendorItemSummary.totalInventory,
      minSalePrice: vendorItemSummary.minSalePrice,
      maxSalePrice: vendorItemSummary.maxSalePrice,
      onSaleOptionCount: vendorItemSummary.onSaleOptionCount,
      suspendedOptionCount: vendorItemSummary.suspendedOptionCount,
      zeroInventoryOptionCount: vendorItemSummary.zeroInventoryOptionCount,
      bestPriceGuaranteedOptionCount: vendorItemSummary.bestPriceGuaranteedOptionCount,
      vendorItems,
    },
    input.row,
  );
}

function normalizeEditableItem(
  detailItem: LooseObject,
  inventory: LooseObject | null,
): CoupangProductEditableItem {
  return {
    sellerProductItemId: asString(detailItem.sellerProductItemId),
    vendorItemId: asString(detailItem.vendorItemId),
    itemId: asString(detailItem.itemId),
    itemName: asString(detailItem.itemName) ?? "?듭뀡紐??놁쓬",
    offerCondition: asString(detailItem.offerCondition),
    offerDescription: asString(detailItem.offerDescription),
    originalPrice: asNumber(detailItem.originalPrice),
    supplyPrice: asNumber(detailItem.supplyPrice),
    salePrice: asNumber(inventory?.salePrice ?? detailItem.salePrice),
    maximumBuyCount: asNumber(detailItem.maximumBuyCount),
    maximumBuyForPerson: asNumber(detailItem.maximumBuyForPerson),
    maximumBuyForPersonPeriod: asNumber(detailItem.maximumBuyForPersonPeriod),
    outboundShippingTimeDay: asNumber(detailItem.outboundShippingTimeDay),
    unitCount: asNumber(detailItem.unitCount),
    adultOnly: asString(detailItem.adultOnly),
    taxType: asString(detailItem.taxType),
    parallelImported: asString(detailItem.parallelImported),
    overseasPurchased: asString(detailItem.overseasPurchased),
    externalVendorSku: asString(detailItem.externalVendorSku),
    barcode: asString(detailItem.barcode),
    emptyBarcode: asBoolean(detailItem.emptyBarcode),
    emptyBarcodeReason: asString(detailItem.emptyBarcodeReason),
    modelNo: asString(detailItem.modelNo),
    saleAgentCommission: asNumber(detailItem.saleAgentCommission),
    bestPriceGuaranteed3P: asBoolean(detailItem.bestPriceGuaranteed3P),
    pccNeeded: asBoolean(detailItem.pccNeeded),
    saleStatus: inferSaleStatus(typeof inventory?.onSale === "boolean" ? inventory.onSale : null),
    inventoryCount: asNumber(inventory?.amountInStock ?? detailItem.maximumBuyCount),
    images: normalizeImages(detailItem.images),
    notices: normalizeNotices(detailItem.notices),
    attributes: normalizeAttributes(detailItem.attributes),
    contents: normalizeContents(detailItem.contents),
    rawData: structuredClone(detailItem),
  };
}

async function normalizeProductSummary(
  store: StoredCoupangStore,
  summary: LooseObject,
  mode: ProductHydrationMode,
): Promise<CoupangProductListItem> {
  const sellerProductId = asString(summary.sellerProductId) ?? "";
  const detailPayload = sellerProductId ? await requestProductDetail(store, sellerProductId) : null;
  const detailData = asObject(detailPayload?.data) ?? {};
  const itemObjects = asArray(detailData.items)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item));

  const vendorItems =
    mode === "full"
      ? await mapWithConcurrency(itemObjects, PRODUCT_VENDOR_INVENTORY_CONCURRENCY, async (item) => {
          const vendorItemId = asString(item.vendorItemId);
          let inventoryData: LooseObject | null = null;

          if (vendorItemId) {
            try {
              const inventoryPayload = await requestVendorItemInventory(store, vendorItemId);
              inventoryData = asObject(inventoryPayload.data);
            } catch {
              inventoryData = null;
            }
          }

          return normalizeVendorItem(item, inventoryData);
        })
      : itemObjects.map((item) => normalizeVendorItem(item, null));

  return {
    sellerProductId,
    sellerProductName:
      asString(summary.sellerProductName) ??
      asString(detailData.sellerProductName) ??
      "?곹뭹紐??놁쓬",
    vendorId: store.vendorId,
    displayCategoryCode:
      asString(summary.displayCategoryCode) ?? asString(detailData.displayCategoryCode),
    displayCategoryName:
      asString(summary.displayCategoryName) ?? asString(detailData.displayCategoryName),
    brand: asString(summary.brand) ?? asString(detailData.brand),
    statusName:
      asString(summary.statusName) ?? asString(summary.status) ?? asString(detailData.statusName),
    saleStartedAt: asString(detailData.saleStartedAt),
    saleEndedAt: asString(detailData.saleEndedAt),
    createdAt:
      asString(summary.createdAt) ??
      asString(summary.registeredAt) ??
      asString(detailData.createdAt),
    lastModifiedAt:
      asString(summary.lastModifiedAt) ??
      asString(summary.updatedAt) ??
      asString(detailData.updatedAt) ??
      asString(detailData.createdAt),
    vendorItems,
  };
}

function buildExplorerRow(
  summary: LooseObject,
  detailData: LooseObject,
  partialData: LooseObject,
  itemRows: CoupangProductEditableItem[],
  previousRow?: CoupangProductExplorerRow | null,
): CoupangProductExplorerRow {
  return mergeExplorerRowWithDetail({
    row: buildExplorerSummaryRow({
      summary,
      previousRow,
      vendorIdFallback: asString(detailData.vendorId) ?? asString(summary.vendorId),
    }),
    detailData,
    partialData,
    itemRows,
  });
}

function matchesSearchField(row: CoupangProductExplorerRow, field: CoupangProductSearchField, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const optionHaystack = row.vendorItems.flatMap((item) => [
    item.itemName,
    item.externalVendorSku ?? "",
    item.vendorItemId,
    item.sellerProductItemId ?? "",
    item.itemId ?? "",
    ...item.attributes,
  ]);

  const haystacks =
    field === "sellerProductName"
      ? [row.sellerProductName]
      : field === "sellerProductId"
        ? [row.sellerProductId]
        : field === "displayCategoryName"
          ? [row.displayCategoryName ?? ""]
          : field === "brand"
            ? [row.brand ?? ""]
            : field === "statusName"
              ? [row.statusName ?? "", row.status ?? ""]
              : field === "vendorItemName"
                ? row.vendorItems.map((item) => item.itemName)
                : field === "externalVendorSku"
                  ? row.vendorItems.map((item) => item.externalVendorSku ?? "")
                  : [
                      row.sellerProductName,
                      row.sellerProductId,
                      row.productId ?? "",
                      row.displayCategoryName ?? "",
                      row.brand ?? "",
                      row.statusName ?? "",
                      row.status ?? "",
                      ...optionHaystack,
                    ];

  return haystacks.some((value) => value.toLowerCase().includes(normalized));
}

function matchesExposureCard(
  row: CoupangProductExplorerRow,
  exposureCard: CoupangProductExplorerExposureCard | undefined,
) {
  const activeCard = exposureCard ?? "all";
  return activeCard === "all" ? true : row.exposureState === activeCard;
}

function matchesOperationCard(
  row: CoupangProductExplorerRow,
  operationCard: CoupangProductExplorerOperationCard | undefined,
) {
  const activeCard = operationCard ?? "all";
  if (activeCard === "all") {
    return true;
  }

  if (activeCard === "suspended") {
    return row.suspendedOptionCount > 0 || row.status === "SUSPENDED";
  }

  if (activeCard === "zeroInventory") {
    return row.zeroInventoryOptionCount > 0 || row.totalInventory === 0;
  }

  return row.bestPriceGuaranteedOptionCount > 0;
}

function buildExplorerFacets(input: {
  exposureRows: CoupangProductExplorerRow[];
  operationRows: CoupangProductExplorerRow[];
}): CoupangProductExplorerFacets {
  const facets = createEmptyExplorerFacets();

  for (const exposureCard of EXPLORER_EXPOSURE_CARD_KEYS) {
    facets.exposure[exposureCard] = input.exposureRows.filter((row) =>
      matchesExposureCard(row, exposureCard),
    ).length;
  }

  for (const operationCard of EXPLORER_OPERATION_CARD_KEYS) {
    facets.operation[operationCard] = input.operationRows.filter((row) =>
      matchesOperationCard(row, operationCard),
    ).length;
  }

  return facets;
}

function compareExplorerRows(
  left: CoupangProductExplorerRow,
  right: CoupangProductExplorerRow,
  sortField: CoupangProductExplorerSortField,
  sortDirection: CoupangSortDirection,
) {
  let result = 0;

  if (sortField === "sellerProductName") {
    result = left.sellerProductName.localeCompare(right.sellerProductName, "ko-KR");
  } else if (sortField === "sellerProductId") {
    result = left.sellerProductId.localeCompare(right.sellerProductId, "ko-KR");
  } else if (sortField === "displayCategoryName") {
    result = compareNullableStrings(left.displayCategoryName, right.displayCategoryName);
  } else if (sortField === "brand") {
    result = compareNullableStrings(left.brand, right.brand);
  } else if (sortField === "statusName") {
    result = compareNullableStrings(left.statusName, right.statusName);
  } else if (sortField === "optionCount") {
    result = left.optionCount - right.optionCount;
  } else if (sortField === "minSalePrice") {
    result = compareNullableNumbers(left.minSalePrice, right.minSalePrice);
  } else if (sortField === "deliveryCharge") {
    result = compareNullableNumbers(left.deliveryCharge, right.deliveryCharge);
  } else if (sortField === "totalInventory") {
    result = compareNullableNumbers(left.totalInventory, right.totalInventory);
  } else if (sortField === "saleStartedAt") {
    result = compareNullableDates(left.saleStartedAt, right.saleStartedAt);
    if (result === 0) {
      result = compareNullableDates(left.saleEndedAt, right.saleEndedAt);
    }
  } else if (sortField === "createdAt") {
    result = compareNullableDates(left.createdAt, right.createdAt);
  } else {
    result = compareNullableDates(left.lastModifiedAt, right.lastModifiedAt);
  }

  const direction = sortDirection === "asc" ? 1 : -1;
  if (result !== 0) {
    return result * direction;
  }

  return left.sellerProductId.localeCompare(right.sellerProductId, "ko-KR") * direction;
}

export function buildCoupangProductExplorerPage(input: {
  snapshot: ExplorerSnapshot;
  searchField: CoupangProductSearchField;
  searchQuery: string;
  status?: string;
  exposureCard?: CoupangProductExplorerExposureCard;
  operationCard?: CoupangProductExplorerOperationCard;
  createdAtFrom?: string;
  salePeriodFrom?: string;
  salePeriodTo?: string;
  sortField: CoupangProductExplorerSortField;
  sortDirection: CoupangSortDirection;
  page?: number;
  pageSize?: number;
  servedFromCache?: boolean;
}): CoupangProductExplorerResponse {
  const searchFiltered = input.snapshot.items.filter((row) => {
    if (row.status === "DELETED") {
      return false;
    }

    if (input.status && row.status !== input.status && row.statusName !== input.status) {
      return false;
    }

    if (!matchesCreatedAt(row, input.createdAtFrom)) {
      return false;
    }

    if (!matchesSalePeriod(row, input.salePeriodFrom, input.salePeriodTo)) {
      return false;
    }

    return matchesSearchField(row, input.searchField, input.searchQuery);
  });
  const exposureFacetRows = searchFiltered.filter((row) =>
    matchesOperationCard(row, input.operationCard),
  );
  const operationFacetRows = searchFiltered.filter((row) =>
    matchesExposureCard(row, input.exposureCard),
  );
  const filtered = searchFiltered.filter(
    (row) =>
      matchesExposureCard(row, input.exposureCard) &&
      matchesOperationCard(row, input.operationCard),
  );

  const sorted = [...filtered].sort((left, right) =>
    compareExplorerRows(left, right, input.sortField, input.sortDirection),
  );

  const pageSize = clampPositiveInteger(
    input.pageSize,
    EXPLORER_DEFAULT_PAGE_SIZE,
    EXPLORER_MAX_PAGE_SIZE,
  );
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(total, 1) / pageSize));
  const page = Math.min(clampPositiveInteger(input.page, 1), totalPages);
  const offset = (page - 1) * pageSize;

  return {
    store: input.snapshot.store,
    items: sorted.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
    totalPages,
    fetchedAt: input.snapshot.fetchedAt,
    servedFromCache: input.servedFromCache ?? false,
    servedFromFallback: input.snapshot.servedFromFallback,
    facets: buildExplorerFacets({
      exposureRows: exposureFacetRows,
      operationRows: operationFacetRows,
    }),
    message: total ? input.snapshot.message : input.snapshot.message ?? "조회된 쿠팡 상품이 없습니다.",
    source: input.snapshot.source,
  };
}

function fallbackProducts(store: StoredCoupangStore, message: string): CoupangProductListResponse {
  const fallback = getSampleCoupangProducts();
  return {
    ...fallback,
    store: mapStoreRef(store),
    message,
  };
}

function buildFallbackExplorerSnapshot(store: StoredCoupangStore, message: string): ExplorerSnapshot {
  const fallback = getSampleCoupangProducts();
  return {
    store: mapStoreRef(store),
    items: fallback.items.map((item) => {
      const vendorItems: CoupangQuickEditOptionRow[] = item.vendorItems.map((vendorItem) => ({
        vendorItemId: vendorItem.vendorItemId,
        sellerProductItemId: null,
        itemId: null,
        itemName: vendorItem.itemName,
        externalVendorSku: vendorItem.externalVendorSku,
        barcode: null,
        originalPrice: vendorItem.originalPrice,
        supplyPrice: null,
        salePrice: vendorItem.salePrice,
        saleAgentCommission: null,
        bestPriceGuaranteed3P: null,
        maximumBuyCount: vendorItem.inventoryCount,
        inventoryCount: vendorItem.inventoryCount,
        saleStatus: vendorItem.saleStatus,
        lastModifiedAt: vendorItem.lastModifiedAt,
        attributes: vendorItem.attributes,
      }));
      const vendorSummary = summarizeExplorerVendorItems(vendorItems);

      return {
        sellerProductId: item.sellerProductId,
        productId: null,
        sellerProductName: item.sellerProductName,
        vendorId: item.vendorId,
        displayCategoryCode: item.displayCategoryCode,
        displayCategoryName: item.displayCategoryName,
        brand: item.brand,
        status: item.statusName,
        statusName: item.statusName,
        violationTypes: [],
        exposureState: "unknown",
        saleStartedAt: item.saleStartedAt,
        saleEndedAt: item.saleEndedAt,
        createdAt: item.createdAt,
        lastModifiedAt: item.lastModifiedAt,
        deliveryCharge: 2500,
        deliveryChargeType: "NOT_FREE",
        thumbnailUrl: null,
        previewHtml: `<div style="padding: 24px; font-family: sans-serif;"><h2>${item.sellerProductName}</h2><p>Fallback preview data</p></div>`,
        optionCount: vendorSummary.optionCount,
        totalInventory: vendorSummary.totalInventory,
        minSalePrice: vendorSummary.minSalePrice,
        maxSalePrice: vendorSummary.maxSalePrice,
        onSaleOptionCount: vendorSummary.onSaleOptionCount,
        suspendedOptionCount: vendorSummary.suspendedOptionCount,
        zeroInventoryOptionCount: vendorSummary.zeroInventoryOptionCount,
        bestPriceGuaranteedOptionCount: vendorSummary.bestPriceGuaranteedOptionCount,
        vendorItems,
      };
    }),
    fetchedAt: new Date().toISOString(),
    servedFromFallback: true,
    message,
    source: "fallback",
  };
}

function buildFallbackDetail(
  store: StoredCoupangStore,
  sellerProductId: string,
  message: string,
): CoupangProductDetailResponse {
  const fallback = getSampleCoupangProducts();
  const product =
    fallback.items.find((item) => item.sellerProductId === sellerProductId) ?? fallback.items[0] ?? null;

  if (!product) {
    return {
      store: mapStoreRef(store),
      item: null,
      fetchedAt: new Date().toISOString(),
      servedFromFallback: true,
      message,
      source: "fallback",
    };
  }

  const detail: CoupangProductDetail = {
    sellerProductId: product.sellerProductId,
    sellerProductName: product.sellerProductName,
    displayCategoryCode: product.displayCategoryCode,
    displayCategoryName: product.displayCategoryName,
    categoryId: null,
    productId: null,
    vendorId: product.vendorId,
    status: product.statusName,
    statusName: product.statusName,
    violationTypes: [],
    exposureState: "unknown",
    brand: product.brand,
    manufacture: product.brand,
    displayProductName: product.sellerProductName,
    generalProductName: product.sellerProductName,
    productGroup: null,
    saleStartedAt: product.saleStartedAt,
    saleEndedAt: product.saleEndedAt,
    createdAt: product.createdAt,
    requested: false,
    vendorUserId: null,
    searchTags: [],
    deliveryInfo: {
      deliveryMethod: "SEQUENCIAL",
      deliveryCompanyCode: null,
      deliveryChargeType: "NOT_FREE",
      deliveryCharge: 2500,
      freeShipOverAmount: 0,
      deliveryChargeOnReturn: 2500,
      deliverySurcharge: 0,
      remoteAreaDeliverable: "N",
      unionDeliveryType: "NOT_UNION_DELIVERY",
      outboundShippingPlaceCode: null,
      outboundShippingTimeDay: null,
      pccNeeded: false,
      returnCenterCode: null,
      returnChargeName: "Fallback return center",
      companyContactNumber: null,
      returnZipCode: null,
      returnAddress: null,
      returnAddressDetail: null,
      returnCharge: 2500,
      extraInfoMessage: null,
    },
    images: [],
    notices: [],
    contents: [
      {
        contentsType: "TEXT",
        contentDetails: [
          {
            detailType: "TEXT",
            content: `<div style="padding:24px;font-family:sans-serif;"><h2>${product.sellerProductName}</h2><p>Fallback preview data</p></div>`,
          },
        ],
      },
    ],
    items: product.vendorItems.map((item) => ({
      sellerProductItemId: null,
      vendorItemId: item.vendorItemId,
      itemId: null,
      itemName: item.itemName,
      offerCondition: "NEW",
      offerDescription: null,
      originalPrice: item.originalPrice,
      supplyPrice: null,
      salePrice: item.salePrice,
      maximumBuyCount: item.inventoryCount,
      maximumBuyForPerson: null,
      maximumBuyForPersonPeriod: null,
      outboundShippingTimeDay: null,
      unitCount: null,
      adultOnly: item.adultOnly,
      taxType: null,
      parallelImported: null,
      overseasPurchased: null,
      externalVendorSku: item.externalVendorSku,
      barcode: null,
      emptyBarcode: null,
      emptyBarcodeReason: null,
      modelNo: null,
      saleAgentCommission: null,
      bestPriceGuaranteed3P: null,
      pccNeeded: false,
      saleStatus: item.saleStatus,
      inventoryCount: item.inventoryCount,
      images: [],
      notices: [],
      attributes: item.attributes.map((attribute) => {
        const [attributeTypeName, attributeValueName] = attribute.split(":").map((value) => value.trim());
        return {
          attributeTypeName,
          attributeValueName: attributeValueName ?? null,
          exposed: "EXPOSED",
          editable: true,
        };
      }),
      contents: [],
      rawData: null,
    })),
    previewHtml: `<div style="padding:24px;font-family:sans-serif;"><h2>${product.sellerProductName}</h2><p>Fallback preview data</p></div>`,
    previewImages: [],
    rawData: null,
    canEdit: false,
    editLocks: ["Fallback ?곗씠?곗뿉?쒕뒗 ?곹뭹 ?섏젙???좉꺼 ?덉뒿?덈떎."],
  };

  return {
    store: mapStoreRef(store),
    item: detail,
    fetchedAt: new Date().toISOString(),
    servedFromFallback: true,
    message,
    source: "fallback",
  };
}

function serializeImages(
  images: Array<{
    imageOrder: number;
    imageType: string | null;
    cdnPath?: string | null;
    vendorPath?: string | null;
  }>,
) {
  return images.map((image, index) => {
    const payload: LooseObject = {
      imageOrder: asNumber(image.imageOrder) ?? index,
      imageType: image.imageType ?? "DETAIL",
    };

    if (image.cdnPath) {
      payload.cdnPath = image.cdnPath;
    }

    if (image.vendorPath) {
      payload.vendorPath = image.vendorPath;
    }

    return payload;
  });
}

function serializeNotices(
  notices: Array<{
    noticeCategoryName?: string | null;
    noticeCategoryDetailName?: string | null;
    content?: string | null;
  }>,
) {
  return notices
    .map((notice) => ({
      noticeCategoryName: notice.noticeCategoryName ?? undefined,
      noticeCategoryDetailName: notice.noticeCategoryDetailName ?? undefined,
      content: notice.content ?? undefined,
    }))
    .filter(
      (notice) =>
        typeof notice.noticeCategoryName === "string" ||
        typeof notice.noticeCategoryDetailName === "string" ||
        typeof notice.content === "string",
    );
}

function serializeAttributes(
  attributes: Array<{
    attributeTypeName?: string | null;
    attributeValueName?: string | null;
    exposed?: string | null;
    editable?: boolean | null;
  }>,
) {
  return attributes
    .map((attribute) => ({
      attributeTypeName: attribute.attributeTypeName ?? undefined,
      attributeValueName: attribute.attributeValueName ?? undefined,
      exposed: attribute.exposed ?? undefined,
      editable: attribute.editable ?? undefined,
    }))
    .filter(
      (attribute) =>
        typeof attribute.attributeTypeName === "string" ||
        typeof attribute.attributeValueName === "string",
    );
}

function serializeContents(contents: Array<{ contentsType?: string | null; contentDetails: CoupangProductContentDetailInput[] }>) {
  return contents
    .map((group) => ({
      contentsType: group.contentsType ?? undefined,
      contentDetails: group.contentDetails
        .map((detail) => ({
          detailType: detail.detailType ?? undefined,
          content: detail.content ?? undefined,
        }))
        .filter((detail) => typeof detail.content === "string" && detail.content.trim().length > 0),
    }))
    .filter((group) => group.contentDetails.length > 0);
}

function assignDefined(target: LooseObject, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  return target;
}

export function buildCoupangProductPartialUpdatePayload(input: CoupangProductPartialEditPayload) {
  const payload: LooseObject = {
    sellerProductId: normalizeIdValue(input.sellerProductId),
  };

  return assignDefined(payload, {
    companyContactNumber: input.companyContactNumber,
    deliveryCharge: input.deliveryCharge,
    deliveryChargeOnReturn: input.deliveryChargeOnReturn,
    deliveryChargeType: input.deliveryChargeType,
    deliveryCompanyCode: input.deliveryCompanyCode,
    deliveryMethod: input.deliveryMethod,
    extraInfoMessage: input.extraInfoMessage,
    freeShipOverAmount: input.freeShipOverAmount,
    outboundShippingPlaceCode: normalizeIdValue(input.outboundShippingPlaceCode),
    outboundShippingTimeDay: input.outboundShippingTimeDay,
    pccNeeded: input.pccNeeded,
    remoteAreaDeliverable: input.remoteAreaDeliverable,
    returnAddress: input.returnAddress,
    returnAddressDetail: input.returnAddressDetail,
    returnCenterCode: input.returnCenterCode,
    returnCharge: input.returnCharge,
    returnChargeName: input.returnChargeName,
    returnZipCode: input.returnZipCode,
    unionDeliveryType: input.unionDeliveryType,
  });
}

export function buildCoupangProductFullUpdatePayload(input: CoupangProductFullEditPayload) {
  const payload = structuredClone(asObject(input.rawData) ?? {}) as LooseObject;

  assignDefined(payload, {
    sellerProductId: normalizeIdValue(input.sellerProductId),
    sellerProductName: input.sellerProductName,
    displayCategoryCode: normalizeIdValue(input.displayCategoryCode),
    displayProductName: input.displayProductName,
    brand: input.brand,
    generalProductName: input.generalProductName,
    productGroup: input.productGroup,
    manufacture: input.manufacture,
    saleStartedAt: input.saleStartedAt,
    saleEndedAt: input.saleEndedAt,
    deliveryMethod: input.deliveryMethod,
    deliveryCompanyCode: input.deliveryCompanyCode,
    deliveryChargeType: input.deliveryChargeType,
    deliveryCharge: input.deliveryCharge,
    freeShipOverAmount: input.freeShipOverAmount,
    deliveryChargeOnReturn: input.deliveryChargeOnReturn,
    deliverySurcharge: input.deliverySurcharge,
    remoteAreaDeliverable: input.remoteAreaDeliverable,
    unionDeliveryType: input.unionDeliveryType,
    returnCenterCode: input.returnCenterCode,
    returnChargeName: input.returnChargeName,
    companyContactNumber: input.companyContactNumber,
    returnZipCode: input.returnZipCode,
    returnAddress: input.returnAddress,
    returnAddressDetail: input.returnAddressDetail,
    returnCharge: input.returnCharge,
    outboundShippingPlaceCode: normalizeIdValue(input.outboundShippingPlaceCode),
    vendorUserId: input.vendorUserId,
    extraInfoMessage: input.extraInfoMessage,
    requested: input.requestApproval,
  });

  payload.searchTags = structuredClone(input.searchTags ?? []);
  payload.images = serializeImages(input.images);
  payload.notices = serializeNotices(input.notices);
  payload.contents = serializeContents(input.contents);
  payload.items = input.items.map((item) => {
    const base = structuredClone(asObject(item.rawData) ?? {}) as LooseObject;

    assignDefined(base, {
      sellerProductItemId: normalizeIdValue(item.sellerProductItemId),
      vendorItemId: normalizeIdValue(item.vendorItemId),
      itemId: normalizeIdValue(item.itemId),
      itemName: item.itemName,
      offerCondition: item.offerCondition,
      offerDescription: item.offerDescription,
      originalPrice: item.originalPrice,
      salePrice: item.salePrice,
      maximumBuyCount: item.maximumBuyCount,
      maximumBuyForPerson: item.maximumBuyForPerson,
      maximumBuyForPersonPeriod: item.maximumBuyForPersonPeriod,
      outboundShippingTimeDay: item.outboundShippingTimeDay,
      unitCount: item.unitCount,
      adultOnly: item.adultOnly,
      taxType: item.taxType,
      parallelImported: item.parallelImported,
      overseasPurchased: item.overseasPurchased,
      externalVendorSku: item.externalVendorSku,
      barcode: item.barcode,
      emptyBarcode: item.emptyBarcode,
      emptyBarcodeReason: item.emptyBarcodeReason,
      modelNo: item.modelNo,
      saleAgentCommission: item.saleAgentCommission,
      pccNeeded: item.pccNeeded,
    });

    base.images = serializeImages(item.images);
    base.notices = serializeNotices(item.notices);
    base.attributes = serializeAttributes(item.attributes);
    base.contents = serializeContents(item.contents);

    return base;
  });

  return payload;
}

function getExplorerSnapshotAgeMs(snapshot: ExplorerSnapshot) {
  const fetchedAt = new Date(snapshot.fetchedAt).getTime();
  return Number.isFinite(fetchedAt) ? Math.max(0, Date.now() - fetchedAt) : Number.POSITIVE_INFINITY;
}

function isExplorerSnapshotFresh(snapshot: ExplorerSnapshot) {
  return getExplorerSnapshotAgeMs(snapshot) <= EXPLORER_FRESH_TTL_MS;
}

function mergeExplorerSnapshotWithPrevious(
  snapshot: ExplorerSnapshot,
  previousSnapshot?: ExplorerSnapshot | null,
): ExplorerSnapshot {
  if (!previousSnapshot) {
    return snapshot;
  }

  const previousById = new Map(
    previousSnapshot.items.map((row) => [row.sellerProductId, row] as const),
  );

  return {
    ...snapshot,
    items: snapshot.items.map((row) =>
      applyExplorerRowFallbacks(row, previousById.get(row.sellerProductId) ?? null),
    ),
  };
}

async function refreshExplorerSnapshot(
  store: StoredCoupangStore,
  previousSnapshot?: ExplorerSnapshot | null,
) {
  const existing = inFlightExplorerRefreshes.get(store.id);
  if (existing) {
    return existing;
  }

  const refreshPromise = (async () => {
    const latestSnapshot = previousSnapshot ?? (await coupangProductCacheStore.getExplorer(store.id));
    const rebuiltSnapshot = await buildExplorerSnapshot(store, latestSnapshot);
    const mergedSnapshot = mergeExplorerSnapshotWithPrevious(
      rebuiltSnapshot,
      await coupangProductCacheStore.getExplorer(store.id),
    );
    await coupangProductCacheStore.setExplorer(store.id, mergedSnapshot);
    scheduleExplorerBackgroundHydration(store, mergedSnapshot);
    return mergedSnapshot;
  })().finally(() => {
    inFlightExplorerRefreshes.delete(store.id);
  });

  inFlightExplorerRefreshes.set(store.id, refreshPromise);
  return refreshPromise;
}

function scheduleExplorerSnapshotRefresh(
  store: StoredCoupangStore,
  previousSnapshot?: ExplorerSnapshot | null,
) {
  if (inFlightExplorerRefreshes.has(store.id)) {
    return;
  }

  void refreshExplorerSnapshot(store, previousSnapshot).catch(() => undefined);
}

function rebuildExplorerRowFromVendorItems(
  row: CoupangProductExplorerRow,
  vendorItems: CoupangQuickEditOptionRow[],
): CoupangProductExplorerRow {
  const summary = summarizeExplorerVendorItems(vendorItems);

  return {
    ...row,
    vendorItems,
    optionCount: row.optionCount > 0 ? Math.max(row.optionCount, vendorItems.length) : vendorItems.length,
    totalInventory: summary.totalInventory,
    minSalePrice: summary.minSalePrice,
    maxSalePrice: summary.maxSalePrice,
    onSaleOptionCount: summary.onSaleOptionCount,
    suspendedOptionCount: summary.suspendedOptionCount,
    zeroInventoryOptionCount: summary.zeroInventoryOptionCount,
    bestPriceGuaranteedOptionCount: summary.bestPriceGuaranteedOptionCount,
  };
}

function patchExplorerVendorItem(
  row: CoupangProductExplorerRow,
  vendorItemId: string,
  updater: (item: CoupangQuickEditOptionRow) => CoupangQuickEditOptionRow,
) {
  const index = row.vendorItems.findIndex((item) => item.vendorItemId === vendorItemId);
  if (index < 0) {
    return row;
  }

  const vendorItems = [...row.vendorItems];
  vendorItems[index] = updater(vendorItems[index]!);
  return {
    ...rebuildExplorerRowFromVendorItems(row, vendorItems),
    lastModifiedAt: new Date().toISOString(),
  };
}

function markExplorerRowHydrated(
  controller: ExplorerHydrationController,
  row: Pick<CoupangProductExplorerRow, "sellerProductId" | "lastModifiedAt">,
) {
  controller.hydrated.set(row.sellerProductId, {
    lastModifiedAt: row.lastModifiedAt ?? null,
    warmedAt: Date.now(),
  });
}

function shouldHydrateExplorerRow(
  controller: ExplorerHydrationController,
  row: CoupangProductExplorerRow,
) {
  const priority = getExplorerHydrationPriority(row);
  const hydrationState = controller.hydrated.get(row.sellerProductId);

  if (!hydrationState) {
    return true;
  }

  if (priority > 0) {
    return true;
  }

  if (hydrationState.lastModifiedAt !== (row.lastModifiedAt ?? null)) {
    return true;
  }

  return Date.now() - hydrationState.warmedAt > DETAIL_BACKGROUND_FRESH_TTL_MS;
}

function queueExplorerHydrationTargets(
  store: StoredCoupangStore,
  sellerProductIds: Iterable<string>,
  options?: { force?: boolean; front?: boolean },
) {
  const controller = getOrCreateExplorerHydrationController(store.id);
  const nextSellerProductIds = Array.from(sellerProductIds).filter(Boolean);

  for (const sellerProductId of nextSellerProductIds) {
    if (!sellerProductId) {
      continue;
    }

    if (options?.force) {
      controller.retryAfter.delete(sellerProductId);
      controller.hydrated.delete(sellerProductId);
    }

    if (controller.running.has(sellerProductId)) {
      continue;
    }

    const queuedIndex = controller.queue.indexOf(sellerProductId);
    if (queuedIndex >= 0) {
      if (!options?.front) {
        continue;
      }

      controller.queue.splice(queuedIndex, 1);
    } else {
      controller.queued.add(sellerProductId);
    }

    if (options?.front) {
      continue;
    }

    controller.queue.push(sellerProductId);
  }

  if (options?.front) {
    for (const sellerProductId of [...nextSellerProductIds].reverse()) {
      if (!sellerProductId || controller.running.has(sellerProductId)) {
        continue;
      }

      controller.queued.add(sellerProductId);
      controller.queue.unshift(sellerProductId);
    }
  }

  if (isExplorerHydrationSuspended(store.id)) {
    return;
  }

  pumpExplorerBackgroundHydration(store);
}

function refreshPatchedDetailResponse(
  response: CoupangProductDetailResponse,
  item: CoupangProductDetail,
): CoupangProductDetailResponse {
  return {
    ...response,
    item,
    fetchedAt: new Date().toISOString(),
    servedFromFallback: false,
    message: null,
    source: "live",
  };
}

function patchCachedDetailResponse(
  response: CoupangProductDetailResponse | null,
  updater: (item: CoupangProductDetail) => CoupangProductDetail,
) {
  if (!response) {
    return response;
  }

  if (response.servedFromFallback || !response.item) {
    return null;
  }

  return refreshPatchedDetailResponse(response, updater(structuredClone(response.item)));
}

function patchCachedDetailVendorItem(
  response: CoupangProductDetailResponse | null,
  vendorItemId: string,
  updater: (item: CoupangProductEditableItem) => CoupangProductEditableItem,
) {
  return patchCachedDetailResponse(response, (item) => {
    const index = item.items.findIndex((candidate) => candidate.vendorItemId === vendorItemId);
    if (index < 0) {
      return item;
    }

    const items = [...item.items];
    items[index] = updater(structuredClone(items[index]!));
    return {
      ...item,
      items,
    };
  });
}

function buildPatchedEditableItem(
  item: CoupangProductFullEditPayload["items"][number],
  previousItem?: CoupangProductEditableItem | null,
): CoupangProductEditableItem {
  return {
    sellerProductItemId: item.sellerProductItemId ?? previousItem?.sellerProductItemId ?? null,
    vendorItemId: item.vendorItemId ?? previousItem?.vendorItemId ?? null,
    itemId: item.itemId ?? previousItem?.itemId ?? null,
    itemName: item.itemName,
    offerCondition: item.offerCondition ?? previousItem?.offerCondition ?? null,
    offerDescription: item.offerDescription ?? previousItem?.offerDescription ?? null,
    originalPrice: item.originalPrice ?? previousItem?.originalPrice ?? null,
    supplyPrice: previousItem?.supplyPrice ?? null,
    salePrice: item.salePrice ?? previousItem?.salePrice ?? null,
    maximumBuyCount: item.maximumBuyCount ?? previousItem?.maximumBuyCount ?? null,
    maximumBuyForPerson: item.maximumBuyForPerson ?? previousItem?.maximumBuyForPerson ?? null,
    maximumBuyForPersonPeriod:
      item.maximumBuyForPersonPeriod ?? previousItem?.maximumBuyForPersonPeriod ?? null,
    outboundShippingTimeDay:
      item.outboundShippingTimeDay ?? previousItem?.outboundShippingTimeDay ?? null,
    unitCount: item.unitCount ?? previousItem?.unitCount ?? null,
    adultOnly: item.adultOnly ?? previousItem?.adultOnly ?? null,
    taxType: item.taxType ?? previousItem?.taxType ?? null,
    parallelImported: item.parallelImported ?? previousItem?.parallelImported ?? null,
    overseasPurchased: item.overseasPurchased ?? previousItem?.overseasPurchased ?? null,
    externalVendorSku: item.externalVendorSku ?? previousItem?.externalVendorSku ?? null,
    barcode: item.barcode ?? previousItem?.barcode ?? null,
    emptyBarcode: item.emptyBarcode ?? previousItem?.emptyBarcode ?? null,
    emptyBarcodeReason: item.emptyBarcodeReason ?? previousItem?.emptyBarcodeReason ?? null,
    modelNo: item.modelNo ?? previousItem?.modelNo ?? null,
    saleAgentCommission: item.saleAgentCommission ?? previousItem?.saleAgentCommission ?? null,
    bestPriceGuaranteed3P: previousItem?.bestPriceGuaranteed3P ?? null,
    pccNeeded: item.pccNeeded ?? previousItem?.pccNeeded ?? null,
    saleStatus: previousItem?.saleStatus ?? "UNKNOWN",
    inventoryCount: previousItem?.inventoryCount ?? null,
    images: normalizeImages(item.images),
    notices: normalizeNotices(item.notices),
    attributes: normalizeAttributes(item.attributes),
    contents: normalizeContents(item.contents),
    rawData: structuredClone(asObject(item.rawData) ?? previousItem?.rawData ?? null),
  };
}

function patchCachedDetailDeliveryInfo(
  response: CoupangProductDetailResponse | null,
  input: CoupangProductPartialEditPayload | CoupangProductFullEditPayload,
) {
  return patchCachedDetailResponse(response, (item) => {
    const deliveryInfo = { ...item.deliveryInfo };
    const patch = input as Partial<CoupangProductPartialEditPayload & CoupangProductFullEditPayload>;

    if (hasOwnField(input, "deliveryMethod")) deliveryInfo.deliveryMethod = patch.deliveryMethod ?? null;
    if (hasOwnField(input, "deliveryCompanyCode")) {
      deliveryInfo.deliveryCompanyCode = patch.deliveryCompanyCode ?? null;
    }
    if (hasOwnField(input, "deliveryChargeType")) {
      deliveryInfo.deliveryChargeType = patch.deliveryChargeType ?? null;
    }
    if (hasOwnField(input, "deliveryCharge")) deliveryInfo.deliveryCharge = patch.deliveryCharge ?? null;
    if (hasOwnField(input, "freeShipOverAmount")) {
      deliveryInfo.freeShipOverAmount = patch.freeShipOverAmount ?? null;
    }
    if (hasOwnField(input, "deliveryChargeOnReturn")) {
      deliveryInfo.deliveryChargeOnReturn = patch.deliveryChargeOnReturn ?? null;
    }
    if (hasOwnField(input, "deliverySurcharge")) {
      deliveryInfo.deliverySurcharge = patch.deliverySurcharge ?? null;
    }
    if (hasOwnField(input, "remoteAreaDeliverable")) {
      deliveryInfo.remoteAreaDeliverable = patch.remoteAreaDeliverable ?? null;
    }
    if (hasOwnField(input, "unionDeliveryType")) {
      deliveryInfo.unionDeliveryType = patch.unionDeliveryType ?? null;
    }
    if (hasOwnField(input, "returnCenterCode")) {
      deliveryInfo.returnCenterCode = patch.returnCenterCode ?? null;
    }
    if (hasOwnField(input, "returnChargeName")) {
      deliveryInfo.returnChargeName = patch.returnChargeName ?? null;
    }
    if (hasOwnField(input, "companyContactNumber")) {
      deliveryInfo.companyContactNumber = patch.companyContactNumber ?? null;
    }
    if (hasOwnField(input, "returnZipCode")) deliveryInfo.returnZipCode = patch.returnZipCode ?? null;
    if (hasOwnField(input, "returnAddress")) deliveryInfo.returnAddress = patch.returnAddress ?? null;
    if (hasOwnField(input, "returnAddressDetail")) {
      deliveryInfo.returnAddressDetail = patch.returnAddressDetail ?? null;
    }
    if (hasOwnField(input, "returnCharge")) deliveryInfo.returnCharge = patch.returnCharge ?? null;
    if (hasOwnField(input, "outboundShippingPlaceCode")) {
      deliveryInfo.outboundShippingPlaceCode = patch.outboundShippingPlaceCode ?? null;
    }
    if (hasOwnField(input, "outboundShippingTimeDay")) {
      deliveryInfo.outboundShippingTimeDay = patch.outboundShippingTimeDay ?? null;
    }
    if (hasOwnField(input, "pccNeeded")) deliveryInfo.pccNeeded = patch.pccNeeded ?? null;
    if (hasOwnField(input, "extraInfoMessage")) {
      deliveryInfo.extraInfoMessage = patch.extraInfoMessage ?? null;
    }

    return {
      ...item,
      deliveryInfo,
    };
  });
}

function patchCachedDetailWithFullPayload(
  response: CoupangProductDetailResponse | null,
  input: CoupangProductFullEditPayload,
) {
  const deliveryPatched = patchCachedDetailDeliveryInfo(response, input);
  return patchCachedDetailResponse(deliveryPatched, (item) => {
    const previousItems = new Map(
      item.items.map((existingItem) => [
        existingItem.vendorItemId || existingItem.sellerProductItemId || existingItem.itemName,
        existingItem,
      ]),
    );
    const images = normalizeImages(input.images);
    const notices = normalizeNotices(input.notices);
    const contents = normalizeContents(input.contents);

    return {
      ...item,
      sellerProductId: input.sellerProductId || item.sellerProductId,
      sellerProductName: input.sellerProductName ?? item.sellerProductName,
      displayCategoryCode: input.displayCategoryCode ?? item.displayCategoryCode,
      displayProductName: input.displayProductName ?? item.displayProductName,
      brand: input.brand ?? item.brand,
      generalProductName: input.generalProductName ?? item.generalProductName,
      productGroup: input.productGroup ?? item.productGroup,
      manufacture: input.manufacture ?? item.manufacture,
      saleStartedAt: input.saleStartedAt ?? item.saleStartedAt,
      saleEndedAt: input.saleEndedAt ?? item.saleEndedAt,
      requested: input.requestApproval,
      vendorUserId: input.vendorUserId ?? item.vendorUserId,
      searchTags: structuredClone(input.searchTags ?? item.searchTags),
      images,
      notices,
      contents,
      items: input.items.map((nextItem) => {
        const key = nextItem.vendorItemId ?? nextItem.sellerProductItemId ?? nextItem.itemName;
        return buildPatchedEditableItem(nextItem, previousItems.get(key) ?? null);
      }),
      previewHtml: extractPreviewHtml(contents) ?? item.previewHtml,
      previewImages: images.map((image) => image.url).filter((url): url is string => Boolean(url)),
      rawData: structuredClone(asObject(input.rawData) ?? item.rawData ?? null),
    };
  });
}

function getDetailRequestKey(storeId: string, sellerProductId: string) {
  return `${storeId}:${sellerProductId}`;
}

function getFetchedAtAgeMs(fetchedAt: string) {
  const parsed = new Date(fetchedAt).getTime();
  return Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : Number.POSITIVE_INFINITY;
}

function isDetailWarm(detail: CoupangProductDetailResponse) {
  return !detail.servedFromFallback && getFetchedAtAgeMs(detail.fetchedAt) <= DETAIL_BACKGROUND_FRESH_TTL_MS;
}

function getExplorerHydrationPriority(row: CoupangProductExplorerRow) {
  let score = 0;

  if (!row.thumbnailUrl) score += 5;
  if (!row.previewHtml) score += 5;
  if (!row.vendorItems.length) score += 4;
  if (row.deliveryCharge === null) score += 3;
  if (!row.deliveryChargeType) score += 2;
  if (row.totalInventory === null) score += 2;
  if (row.minSalePrice === null || row.maxSalePrice === null) score += 2;

  return score;
}

function hasWarmExplorerRichFields(row: CoupangProductExplorerRow) {
  return Boolean(
    row.thumbnailUrl &&
      row.previewHtml &&
      row.vendorItems.length &&
      row.deliveryChargeType &&
      row.deliveryCharge !== null &&
      row.totalInventory !== null &&
      row.minSalePrice !== null &&
      row.maxSalePrice !== null,
  );
}

function mergeExplorerRowWithCachedDetailResponse(
  row: CoupangProductExplorerRow,
  response: CoupangProductDetailResponse,
) {
  const detail = response.item;
  if (!detail) {
    return row;
  }

  const vendorItems = detail.items.map((item) => normalizeQuickEditOptionRow(item));

  return applyExplorerRowFallbacks(
    rebuildExplorerRowFromVendorItems(
      {
        ...row,
        sellerProductId: detail.sellerProductId || row.sellerProductId,
        productId: detail.productId ?? row.productId ?? null,
        sellerProductName: detail.sellerProductName || row.sellerProductName,
        vendorId: detail.vendorId ?? row.vendorId,
        displayCategoryCode: detail.displayCategoryCode ?? row.displayCategoryCode,
        displayCategoryName: detail.displayCategoryName ?? row.displayCategoryName,
        brand: detail.brand ?? row.brand,
        status: detail.status ?? row.status,
        statusName: detail.statusName ?? row.statusName,
        violationTypes: detail.violationTypes,
        exposureState: detail.exposureState,
        saleStartedAt: detail.saleStartedAt ?? row.saleStartedAt,
        saleEndedAt: detail.saleEndedAt ?? row.saleEndedAt,
        createdAt: detail.createdAt ?? row.createdAt,
        deliveryCharge: detail.deliveryInfo.deliveryCharge,
        deliveryChargeType: detail.deliveryInfo.deliveryChargeType,
        thumbnailUrl: detail.previewImages[0] ?? detail.images[0]?.url ?? row.thumbnailUrl,
        previewHtml: detail.previewHtml,
      },
      vendorItems,
    ),
    row,
  );
}

async function collectViolationTypesBySellerProductId(store: StoredCoupangStore) {
  const violationTypesBySellerProductId = new Map<string, Set<CoupangProductViolationType>>();

  for (const violationType of COUPANG_PRODUCT_VIOLATION_TYPES) {
    let nextToken: string | null = null;

    try {
      do {
        const payload = await requestProductList(store, {
          maxPerPage: 100,
          nextToken,
          violationTypes: [violationType],
          violationTypeAndOr: "OR",
        });
        const summaries = asArray(payload.data)
          .map((item) => asObject(item))
          .filter((item): item is LooseObject => Boolean(item));

        for (const summary of summaries) {
          const sellerProductId = asString(summary.sellerProductId);
          if (!sellerProductId) {
            continue;
          }

          const normalizedTypes = extractViolationTypes(summary, [violationType]);
          const existingTypes =
            violationTypesBySellerProductId.get(sellerProductId) ??
            new Set<CoupangProductViolationType>();

          for (const normalizedType of normalizedTypes.length
            ? normalizedTypes
            : [violationType]) {
            existingTypes.add(normalizedType);
          }

          violationTypesBySellerProductId.set(sellerProductId, existingTypes);
        }

        nextToken = asString(payload.nextToken);
      } while (nextToken);
    } catch {
      nextToken = null;
    }
  }

  return new Map(
    Array.from(violationTypesBySellerProductId.entries()).map(([sellerProductId, violationTypes]) => [
      sellerProductId,
      sortViolationTypes(violationTypes),
    ]),
  );
}

function applyViolationTypesToExplorerRows(
  rows: CoupangProductExplorerRow[],
  violationTypesBySellerProductId: ReadonlyMap<string, CoupangProductViolationType[]>,
) {
  return rows.map((row) => {
    const violationTypes = sortViolationTypes([
      ...row.violationTypes,
      ...(violationTypesBySellerProductId.get(row.sellerProductId) ?? []),
    ]);

    return {
      ...row,
      violationTypes,
      exposureState: violationTypes.length ? resolveExposureState(violationTypes) : "normal",
    };
  });
}

function getOrCreateExplorerHydrationController(storeId: string) {
  const existing = explorerHydrationControllers.get(storeId);
  if (existing) {
    return existing;
  }

  const controller: ExplorerHydrationController = {
    queue: [],
    queued: new Set(),
    running: new Set(),
    retryAfter: new Map(),
    retryTimer: null,
    hydrated: new Map(),
  };

  explorerHydrationControllers.set(storeId, controller);
  return controller;
}

function disposeExplorerHydrationController(storeId: string, controller: ExplorerHydrationController) {
  if (controller.queue.length || controller.running.size || controller.retryTimer || controller.hydrated.size) {
    return;
  }

  explorerHydrationControllers.delete(storeId);
}

function scheduleExplorerHydrationRetry(
  store: StoredCoupangStore,
  controller: ExplorerHydrationController,
) {
  if (controller.retryTimer || controller.running.size) {
    return;
  }

  const now = Date.now();
  const nextRetryAt = controller.queue.reduce<number>((soonest, sellerProductId) => {
    const retryAt = controller.retryAfter.get(sellerProductId);
    if (!retryAt || retryAt <= now) {
      return soonest;
    }
    return Math.min(soonest, retryAt);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(nextRetryAt)) {
    disposeExplorerHydrationController(store.id, controller);
    return;
  }

  controller.retryTimer = setTimeout(() => {
    controller.retryTimer = null;
    pumpExplorerBackgroundHydration(store);
  }, Math.max(250, nextRetryAt - now));
  controller.retryTimer.unref?.();
}

async function hydrateExplorerRowInBackground(
  store: StoredCoupangStore,
  sellerProductId: string,
  controller: ExplorerHydrationController,
) {
  controller.running.add(sellerProductId);

  try {
    const [snapshot, cachedDetail] = await Promise.all([
      coupangProductCacheStore.getExplorer(store.id),
      coupangProductCacheStore.getDetail(store.id, sellerProductId),
    ]);
    const row = snapshot?.items.find((item) => item.sellerProductId === sellerProductId) ?? null;

    if (!row) {
      controller.retryAfter.delete(sellerProductId);
      return;
    }

    if (cachedDetail && isDetailWarm(cachedDetail)) {
      if (!hasWarmExplorerRichFields(row)) {
        await coupangProductCacheStore.patchExplorerRow(store.id, sellerProductId, (currentRow) =>
          mergeExplorerRowWithCachedDetailResponse(currentRow, cachedDetail),
        );
      }

      controller.retryAfter.delete(sellerProductId);
      markExplorerRowHydrated(controller, row);
      return;
    }

    await getProductDetail({
      storeId: store.id,
      sellerProductId,
      refresh: Boolean(cachedDetail),
    });
    controller.retryAfter.delete(sellerProductId);
    markExplorerRowHydrated(controller, row);
  } catch {
    controller.retryAfter.set(sellerProductId, Date.now() + EXPLORER_BACKGROUND_RETRY_MS);
    if (!controller.queued.has(sellerProductId)) {
      controller.queue.push(sellerProductId);
      controller.queued.add(sellerProductId);
    }
  } finally {
    controller.running.delete(sellerProductId);
    pumpExplorerBackgroundHydration(store);
  }
}
function pumpExplorerBackgroundHydration(store: StoredCoupangStore) {
  const controller = getOrCreateExplorerHydrationController(store.id);

  if (isExplorerHydrationSuspended(store.id)) {
    return;
  }

  if (controller.retryTimer) {
    clearTimeout(controller.retryTimer);
    controller.retryTimer = null;
  }

  let scanned = controller.queue.length;
  while (
    controller.running.size < EXPLORER_BACKGROUND_HYDRATION_CONCURRENCY &&
    controller.queue.length &&
    scanned > 0
  ) {
    const sellerProductId = controller.queue.shift()!;
    controller.queued.delete(sellerProductId);
    scanned -= 1;

    const retryAt = controller.retryAfter.get(sellerProductId);
    if (retryAt && retryAt > Date.now()) {
      controller.queue.push(sellerProductId);
      controller.queued.add(sellerProductId);
      continue;
    }

    void hydrateExplorerRowInBackground(store, sellerProductId, controller);
  }

  if (!controller.running.size) {
    scheduleExplorerHydrationRetry(store, controller);
  }
}
function scheduleExplorerBackgroundHydration(
  store: StoredCoupangStore,
  snapshot: ExplorerSnapshot,
) {
  if (
    snapshot.servedFromFallback ||
    snapshot.source === "fallback" ||
    isExplorerHydrationSuspended(store.id)
  ) {
    return;
  }

  const controller = getOrCreateExplorerHydrationController(store.id);
  const activeProductIds = new Set(snapshot.items.map((row) => row.sellerProductId));

  for (const sellerProductId of Array.from(controller.hydrated.keys())) {
    if (!activeProductIds.has(sellerProductId)) {
      controller.hydrated.delete(sellerProductId);
      controller.retryAfter.delete(sellerProductId);
    }
  }

  const orderedRows = [...snapshot.items]
    .filter((row) => shouldHydrateExplorerRow(controller, row))
    .sort((left, right) => {
    const priorityDelta = getExplorerHydrationPriority(right) - getExplorerHydrationPriority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return compareNullableDates(right.lastModifiedAt, left.lastModifiedAt);
    });

  queueExplorerHydrationTargets(
    store,
    orderedRows.map((row) => row.sellerProductId),
  );
}

async function buildExplorerSnapshot(
  store: StoredCoupangStore,
  previousSnapshot?: ExplorerSnapshot | null,
): Promise<ExplorerSnapshot> {
  try {
    const previousById = new Map(
      (previousSnapshot?.items ?? []).map((row) => [row.sellerProductId, row] as const),
    );
    const rows: CoupangProductExplorerRow[] = [];
    let nextToken: string | null = null;

    do {
      const payload = await requestProductList(store, {
        maxPerPage: 100,
        nextToken,
      });

      const summaries = asArray(payload.data)
        .map((item) => asObject(item))
        .filter((item): item is LooseObject => Boolean(item));

      rows.push(
        ...summaries.map((summary) =>
          buildExplorerSummaryRow({
            summary,
            previousRow:
              previousById.get(asString(summary.sellerProductId) ?? "") ?? null,
            vendorIdFallback: store.vendorId,
          }),
        ),
      );

      nextToken = asString(payload.nextToken);
    } while (nextToken);

    const needsCategoryPathResolution = rows.some(
      (row) => !normalizeDisplayCategoryName(row.displayCategoryName) && row.displayCategoryCode,
    );
    const rowsWithCategoryNames = needsCategoryPathResolution
      ? applyExplorerCategoryPaths(rows, await getCachedCategoryPaths(store.id))
      : rows;
    const rowsWithViolationTypes = rowsWithCategoryNames.length
      ? applyViolationTypesToExplorerRows(
          rowsWithCategoryNames,
          await collectViolationTypesBySellerProductId(store),
        )
      : rowsWithCategoryNames;

    return {
      store: mapStoreRef(store),
      items: rowsWithViolationTypes.filter((row) => row.status !== "DELETED"),
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: rowsWithViolationTypes.length ? null : "조회된 쿠팡 상품이 없습니다.",
      source: "live",
    };
  } catch (error) {
      const message =
        error instanceof Error
        ? `${error.message} 연결에 실패해 fallback 상품 목록을 표시합니다.`
        : "쿠팡 상품 목록 조회에 실패해 fallback 데이터를 표시합니다.";
    return buildFallbackExplorerSnapshot(store, message);
  }
}

async function updateByPath(
  store: StoredCoupangStore,
  input: {
    path: string;
    query?: URLSearchParams | string;
    successMessage: string;
    vendorItemId: string;
    sellerProductId?: string | null;
    patchExplorerRow?: ((row: CoupangProductExplorerRow) => CoupangProductExplorerRow) | null;
    patchDetail?:
      | ((response: CoupangProductDetailResponse | null) => CoupangProductDetailResponse | null)
      | null;
    skipBackgroundHydration?: boolean;
  },
) {
  await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "PUT",
    path: input.path,
    query: input.query,
  });

  if (input.sellerProductId) {
    await Promise.all([
      input.patchExplorerRow
        ? coupangProductCacheStore.patchExplorerRow(store.id, input.sellerProductId, input.patchExplorerRow)
        : Promise.resolve(),
      input.patchDetail
        ? coupangProductCacheStore.updateDetail(store.id, input.sellerProductId, input.patchDetail)
        : Promise.resolve(),
    ]);
    if (!input.skipBackgroundHydration) {
      queueExplorerHydrationTargets(store, [input.sellerProductId], { force: true });
    }
  }

  return {
    vendorItemId: input.vendorItemId,
    sellerProductId: input.sellerProductId ?? null,
    status: "succeeded",
    message: input.successMessage,
    appliedAt: new Date().toISOString(),
  } satisfies CoupangVendorItemActionResult;
}

function buildProductMutationResult(
  sellerProductId: string,
  message: string,
  status: CoupangProductMutationResult["status"] = "succeeded",
) {
  return {
    sellerProductId,
    status,
    message,
    appliedAt: new Date().toISOString(),
  } satisfies CoupangProductMutationResult;
}

function buildBatchSummary(items: CoupangActionItemResult[]) {
  return {
    total: items.length,
    succeededCount: items.filter((item) => item.status === "succeeded").length,
    failedCount: items.filter((item) => item.status === "failed").length,
    warningCount: items.filter((item) => item.status === "warning").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
  };
}

async function runProductBatch<TItem>(input: {
  storeId: string;
  items: TItem[];
  action: CoupangActionItemResult["action"];
  runOne: (item: TItem) => Promise<{
    targetId: string;
    vendorItemId?: string | null;
    sellerProductId?: string | null;
    message: string;
  }>;
}) {
  const results = await mapWithConcurrency(input.items, PRODUCT_BATCH_CONCURRENCY, async (item) => {
    try {
      const result = await input.runOne(item);
      return {
        targetId: result.targetId,
        action: input.action,
        shipmentBoxId: null,
        orderId: null,
        receiptId: result.sellerProductId ?? null,
        vendorItemId: result.vendorItemId ?? null,
        status: "succeeded",
        resultCode: null,
        retryRequired: false,
        message: result.message,
        appliedAt: new Date().toISOString(),
      } satisfies CoupangActionItemResult;
    } catch (error) {
      return {
        targetId: asString(asObject(item)?.vendorItemId) ?? "unknown",
        action: input.action,
        shipmentBoxId: null,
        orderId: null,
        receiptId: asString(asObject(item)?.sellerProductId) ?? null,
        vendorItemId: asString(asObject(item)?.vendorItemId) ?? null,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: error instanceof Error ? error.message : "쿠팡 상품 작업에 실패했습니다.",
        appliedAt: new Date().toISOString(),
      } satisfies CoupangActionItemResult;
    }
  });

  return {
    items: results,
    summary: buildBatchSummary(results),
    completedAt: new Date().toISOString(),
  } satisfies CoupangBatchActionResponse;
}

export async function testConnection(input: {
  storeId?: string;
  vendorId?: string;
  accessKey?: string;
  secretKey?: string;
  baseUrl?: string;
}): Promise<ConnectionTestResult> {
  const testedAt = new Date().toISOString();

  try {
    const store = input.storeId ? await getStoreOrThrow(input.storeId) : null;
    const accessKey = input.accessKey?.trim() || store?.credentials.accessKey || "";
    const secretKey = input.secretKey?.trim() || store?.credentials.secretKey || "";
    const vendorId = input.vendorId?.trim() || store?.vendorId || "";
    const baseUrl = normalizeCoupangBaseUrl(input.baseUrl || store?.baseUrl);

    if (!accessKey || !secretKey || !vendorId) {
      throw new Error("vendorId, accessKey, secretKey가 모두 필요합니다.");
    }

    await requestCoupangJson({
      credentials: { accessKey, secretKey, baseUrl },
      method: "GET",
      path: "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products",
      query: new URLSearchParams({
        vendorId,
        maxPerPage: "1",
      }),
    });

    return {
      status: "success",
      testedAt,
      message: "Coupang API ?곌껐???뺤씤?덉뒿?덈떎.",
    };
  } catch (error) {
    return {
      status: "failed",
      testedAt,
      message: error instanceof Error ? error.message : "Unexpected error during Coupang request.",
    };
  }
}

export async function listProducts(input: {
  storeId: string;
  maxPerPage?: number;
  nextToken?: string | null;
  sellerProductName?: string;
  status?: string;
  detailLevel?: ProductHydrationMode;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const detailLevel = input.detailLevel === "summary" ? "summary" : "full";

  try {
    const payload = await requestProductList(store, {
      maxPerPage: input.maxPerPage,
      nextToken: input.nextToken,
      sellerProductName: input.sellerProductName,
      status: input.status,
    });
    const summaries = Array.isArray(payload.data) ? payload.data : [];
    const hydratedItems = await mapWithConcurrency(
      summaries,
      PRODUCT_SUMMARY_CONCURRENCY,
      async (summary) => normalizeProductSummary(store, summary, detailLevel),
    );
    const search = (input.sellerProductName || "").trim().toLowerCase();
    const items = hydratedItems.filter((item) => {
      if (search && !item.sellerProductName.toLowerCase().includes(search)) {
        return false;
      }

      if (input.status && item.statusName !== input.status) {
        return false;
      }

      return true;
    });

    return {
      store: mapStoreRef(store),
      items,
      nextToken: asString(payload.nextToken),
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: items.length ? null : "조회된 쿠팡 상품이 없습니다.",
      source: "live",
    } satisfies CoupangProductListResponse;
  } catch (error) {
      const message =
        error instanceof Error
        ? `${error.message} 연결에 실패해 샘플 상품 데이터를 표시합니다.`
        : "Coupang 상품 조회에 실패해 샘플 데이터를 표시합니다.";
    return fallbackProducts(store, message);
  }
}

export async function listProductExplorer(input: {
  storeId: string;
  searchField?: CoupangProductSearchField;
  searchQuery?: string;
  status?: string;
  exposureCard?: CoupangProductExplorerExposureCard;
  operationCard?: CoupangProductExplorerOperationCard;
  createdAtFrom?: string;
  salePeriodFrom?: string;
  salePeriodTo?: string;
  sortField?: CoupangProductExplorerSortField;
  sortDirection?: CoupangSortDirection;
  page?: number;
  pageSize?: number;
  refresh?: boolean;
}) {
  const { store, snapshot, servedFromCache } = await loadExplorerSnapshotForRead({
    storeId: input.storeId,
    refresh: input.refresh,
    scheduleBackgroundHydration: true,
  });

  const response = buildCoupangProductExplorerPage({
    snapshot,
    searchField: input.searchField ?? "all",
    searchQuery: input.searchQuery ?? "",
    status: input.status,
    exposureCard: input.exposureCard,
    operationCard: input.operationCard,
    createdAtFrom: input.createdAtFrom,
    salePeriodFrom: input.salePeriodFrom,
    salePeriodTo: input.salePeriodTo,
    sortField: input.sortField ?? "lastModifiedAt",
    sortDirection: input.sortDirection ?? "desc",
    page: input.page,
    pageSize: input.pageSize,
    servedFromCache,
  });

  queueExplorerHydrationTargets(
    store,
    response.items.map((row) => row.sellerProductId),
    { front: true },
  );

  return response;
}

async function loadExplorerSnapshotForRead(input: {
  storeId: string;
  refresh?: boolean;
  scheduleBackgroundHydration?: boolean;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const cached = await coupangProductCacheStore.getExplorer(input.storeId);

  let snapshot: ExplorerSnapshot;
  let servedFromCache = false;

  if (input.refresh) {
    snapshot = await refreshExplorerSnapshot(store, cached);
  } else if (!cached) {
    snapshot = await refreshExplorerSnapshot(store);
  } else if (isExplorerSnapshotFresh(cached)) {
    snapshot = cached;
    servedFromCache = true;
  } else {
    snapshot = cached;
    servedFromCache = true;
    scheduleExplorerSnapshotRefresh(store, cached);
  }

  if (input.scheduleBackgroundHydration ?? true) {
    scheduleExplorerBackgroundHydration(store, snapshot);
  }

  return {
    store,
    snapshot,
    servedFromCache,
  };
}

export async function listAllProductExplorerRows(input: {
  storeId: string;
  refresh?: boolean;
}) {
  const { snapshot, servedFromCache } = await loadExplorerSnapshotForRead({
    storeId: input.storeId,
    refresh: input.refresh,
    scheduleBackgroundHydration: false,
  });

  return {
    store: snapshot.store,
    items: snapshot.items.filter((row) => row.status !== "DELETED"),
    fetchedAt: snapshot.fetchedAt,
    servedFromCache,
    servedFromFallback: snapshot.servedFromFallback,
    message: snapshot.message,
    source: snapshot.source,
  };
}

export async function getProductDetail(input: {
  storeId: string;
  sellerProductId: string;
  refresh?: boolean;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const detailRequestKey = getDetailRequestKey(input.storeId, input.sellerProductId);
  const cached =
    input.refresh || !input.sellerProductId
      ? null
      : await coupangProductCacheStore.getDetail(input.storeId, input.sellerProductId);

  if (cached) {
    if (!input.refresh && !isDetailWarm(cached) && !inFlightProductDetails.has(detailRequestKey)) {
      void getProductDetail({ ...input, refresh: true }).catch(() => undefined);
    }

    return cached;
  }

  const inFlightRequest = inFlightProductDetails.get(detailRequestKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const requestPromise = (async () => {
    try {
      const [detailPayload, partialPayload] = await Promise.all([
        requestProductDetail(store, input.sellerProductId),
        requestPartialProductDetail(store, input.sellerProductId),
      ]);
      const detailData = asObject(detailPayload.data) ?? {};
      const partialData = asObject(partialPayload.data) ?? {};
      const itemObjects = asArray(detailData.items)
        .map((item) => asObject(item))
        .filter((item): item is LooseObject => Boolean(item));
      const items = await mapWithConcurrency(itemObjects, PRODUCT_VENDOR_INVENTORY_CONCURRENCY, async (item) => {
        const vendorItemId = asString(item.vendorItemId);
        let inventoryData: LooseObject | null = null;

        if (vendorItemId) {
          try {
            const inventoryPayload = await requestVendorItemInventory(store, vendorItemId);
            inventoryData = asObject(inventoryPayload.data);
          } catch {
            inventoryData = null;
          }
        }

        return normalizeEditableItem(item, inventoryData);
      });

      const images = normalizeImages(detailData.images);
      const fallbackImages = items.flatMap((item) => item.images);
      const productImages = images.length ? images : fallbackImages;
      const contents = normalizeContents(detailData.contents);
      const fallbackContents = items.flatMap((item) => item.contents);
      const notices = normalizeNotices(detailData.notices);

      const detail: CoupangProductDetail = {
        sellerProductId: asString(detailData.sellerProductId) ?? input.sellerProductId,
        sellerProductName: asString(detailData.sellerProductName) ?? "상품명 없음",
        displayCategoryCode: asString(detailData.displayCategoryCode),
        displayCategoryName: asString(detailData.displayCategoryName),
        categoryId: asString(detailData.categoryId),
        productId: asString(detailData.productId),
        vendorId: asString(detailData.vendorId) ?? store.vendorId,
        status: asString(detailData.status),
        statusName: asString(detailData.statusName) ?? asString(detailData.status),
        violationTypes: extractViolationTypes(detailData),
        exposureState: resolveExposureState(extractViolationTypes(detailData)),
        brand: asString(detailData.brand),
        manufacture: asString(detailData.manufacture),
        displayProductName: asString(detailData.displayProductName),
        generalProductName: asString(detailData.generalProductName),
        productGroup: asString(detailData.productGroup),
        saleStartedAt: asString(detailData.saleStartedAt),
        saleEndedAt: asString(detailData.saleEndedAt),
        createdAt: asString(detailData.createdAt),
        requested: asBoolean(detailData.requested),
        vendorUserId: asString(detailData.vendorUserId),
        searchTags: asArray(detailData.searchTags)
          .map((tag) => asString(tag))
          .filter((tag): tag is string => Boolean(tag)),
        deliveryInfo: {
          deliveryMethod: asString(partialData.deliveryMethod ?? detailData.deliveryMethod),
          deliveryCompanyCode: asString(
            partialData.deliveryCompanyCode ?? detailData.deliveryCompanyCode,
          ),
          deliveryChargeType: asString(
            partialData.deliveryChargeType ?? detailData.deliveryChargeType,
          ),
          deliveryCharge: asNumber(partialData.deliveryCharge ?? detailData.deliveryCharge),
          freeShipOverAmount: asNumber(
            partialData.freeShipOverAmount ?? detailData.freeShipOverAmount,
          ),
          deliveryChargeOnReturn: asNumber(
            partialData.deliveryChargeOnReturn ?? detailData.deliveryChargeOnReturn,
          ),
          deliverySurcharge: asNumber(partialData.deliverySurcharge ?? detailData.deliverySurcharge),
          remoteAreaDeliverable: asString(
            partialData.remoteAreaDeliverable ?? detailData.remoteAreaDeliverable,
          ),
          unionDeliveryType: asString(
            partialData.unionDeliveryType ?? detailData.unionDeliveryType,
          ),
          outboundShippingPlaceCode: asString(
            partialData.outboundShippingPlaceCode ?? detailData.outboundShippingPlaceCode,
          ),
          outboundShippingTimeDay: asNumber(
            partialData.outboundShippingTimeDay ?? detailData.outboundShippingTimeDay,
          ),
          pccNeeded: asBoolean(partialData.pccNeeded ?? detailData.pccNeeded),
          returnCenterCode: asString(partialData.returnCenterCode ?? detailData.returnCenterCode),
          returnChargeName: asString(partialData.returnChargeName ?? detailData.returnChargeName),
          companyContactNumber: asString(
            partialData.companyContactNumber ?? detailData.companyContactNumber,
          ),
          returnZipCode: asString(partialData.returnZipCode ?? detailData.returnZipCode),
          returnAddress: asString(partialData.returnAddress ?? detailData.returnAddress),
          returnAddressDetail: asString(
            partialData.returnAddressDetail ?? detailData.returnAddressDetail,
          ),
          returnCharge: asNumber(partialData.returnCharge ?? detailData.returnCharge),
          extraInfoMessage: asString(partialData.extraInfoMessage ?? detailData.extraInfoMessage),
        },
        images: productImages,
        notices,
        contents: contents.length ? contents : fallbackContents,
        items,
        previewHtml: extractPreviewHtml(contents.length ? contents : fallbackContents),
        previewImages: productImages.map((image) => image.url).filter((url): url is string => Boolean(url)),
        rawData: structuredClone(detailData),
        canEdit: true,
        editLocks: [],
      };

      const response: CoupangProductDetailResponse = {
        store: mapStoreRef(store),
        item: detail,
        fetchedAt: new Date().toISOString(),
        servedFromFallback: false,
        message: null,
        source: "live",
      };

      await Promise.all([
        coupangProductCacheStore.setDetail(input.storeId, input.sellerProductId, response),
        coupangProductCacheStore.patchExplorerRow(input.storeId, input.sellerProductId, (row) =>
          mergeExplorerRowWithDetail({
            row,
            detailData,
            partialData,
            itemRows: items,
          }),
        ),
      ]);
      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.message} 연결에 실패해 fallback 상품 상세를 표시합니다.`
          : "쿠팡 상품 상세 조회에 실패해 fallback 데이터를 표시합니다.";
      const fallback = buildFallbackDetail(store, input.sellerProductId, message);
      await coupangProductCacheStore.setDetail(input.storeId, input.sellerProductId, fallback);
      return fallback;
    }
  })().finally(() => {
    inFlightProductDetails.delete(detailRequestKey);
  });

  inFlightProductDetails.set(detailRequestKey, requestPromise);
  return requestPromise;
}
function buildQuickOptionAttributeLabels(attributes: unknown) {
  return normalizeAttributes(attributes)
    .map((attribute) =>
      attribute.attributeTypeName && attribute.attributeValueName
        ? `${attribute.attributeTypeName}: ${attribute.attributeValueName}`
        : attribute.attributeValueName ?? attribute.attributeTypeName ?? null,
    )
    .filter((value): value is string => Boolean(value));
}

function hasOwnField(target: object, field: string) {
  return Object.prototype.hasOwnProperty.call(target, field);
}

function buildQuickOptionsFromFullPayload(
  input: CoupangProductFullEditPayload,
  previousRow: CoupangProductExplorerRow,
) {
  const previousItems = new Map(
    previousRow.vendorItems.map((item) => [
      item.vendorItemId || item.sellerProductItemId || item.itemId || item.itemName,
      item,
    ]),
  );

  return input.items.map((item) => {
    const key = item.vendorItemId ?? item.sellerProductItemId ?? item.itemId ?? item.itemName;
    const previousItem = previousItems.get(key);

    return {
      vendorItemId: item.vendorItemId ?? previousItem?.vendorItemId ?? "",
      sellerProductItemId: item.sellerProductItemId ?? previousItem?.sellerProductItemId ?? null,
      itemId: item.itemId ?? previousItem?.itemId ?? null,
      itemName: item.itemName,
      externalVendorSku: item.externalVendorSku ?? previousItem?.externalVendorSku ?? null,
      barcode: item.barcode ?? previousItem?.barcode ?? null,
      originalPrice: item.originalPrice ?? previousItem?.originalPrice ?? null,
      supplyPrice: previousItem?.supplyPrice ?? null,
      salePrice: item.salePrice ?? previousItem?.salePrice ?? null,
      saleAgentCommission: previousItem?.saleAgentCommission ?? null,
      bestPriceGuaranteed3P: previousItem?.bestPriceGuaranteed3P ?? null,
      maximumBuyCount: item.maximumBuyCount ?? previousItem?.maximumBuyCount ?? null,
      inventoryCount: previousItem?.inventoryCount ?? null,
      saleStatus: previousItem?.saleStatus ?? "UNKNOWN",
      lastModifiedAt: previousItem?.lastModifiedAt ?? previousRow.lastModifiedAt,
      attributes: buildQuickOptionAttributeLabels(item.attributes),
    } satisfies CoupangQuickEditOptionRow;
  });
}

function patchExplorerRowWithFullPayload(
  row: CoupangProductExplorerRow,
  input: CoupangProductFullEditPayload,
) {
  const images = normalizeImages(input.images);
  const thumbnailUrl =
    images.find((image) => image.imageType === "REPRESENTATION")?.url ??
    images[0]?.url ??
    row.thumbnailUrl;
  const previewHtml = extractPreviewHtml(normalizeContents(input.contents)) ?? row.previewHtml;
  const vendorItems = buildQuickOptionsFromFullPayload(input, row);
  const nextRow = {
    ...row,
    sellerProductName: input.sellerProductName ?? row.sellerProductName,
    displayCategoryCode: input.displayCategoryCode ?? row.displayCategoryCode,
    brand: input.brand ?? row.brand,
    saleStartedAt: input.saleStartedAt ?? row.saleStartedAt,
    saleEndedAt: input.saleEndedAt ?? row.saleEndedAt,
    lastModifiedAt: new Date().toISOString(),
    deliveryCharge:
      hasOwnField(input, "deliveryCharge") ? input.deliveryCharge ?? null : row.deliveryCharge,
    deliveryChargeType: hasOwnField(input, "deliveryChargeType")
      ? input.deliveryChargeType ?? null
      : row.deliveryChargeType,
    thumbnailUrl,
    previewHtml,
  } satisfies CoupangProductExplorerRow;

  return vendorItems.length ? rebuildExplorerRowFromVendorItems(nextRow, vendorItems) : nextRow;
}

export function buildVendorItemPriceUpdateRequest(input: {
  vendorItemId: string;
  price: number;
}) {
  return {
    path:
      `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${encodeURIComponent(
        input.vendorItemId,
      )}` + `/prices/${encodeURIComponent(String(input.price))}`,
    query: new URLSearchParams({
      forceSalePriceUpdate: "true",
    }),
  };
}

export async function updateOptionPrice(input: {
  storeId: string;
  sellerProductId?: string | null;
  vendorItemId: string;
  price: number;
  skipBackgroundHydration?: boolean;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const patchedAt = new Date().toISOString();
  const requestTarget = buildVendorItemPriceUpdateRequest({
    vendorItemId: input.vendorItemId,
    price: input.price,
  });
  return updateByPath(store, {
    vendorItemId: input.vendorItemId,
    sellerProductId: input.sellerProductId,
    successMessage: "쿠팡 옵션 가격을 변경했습니다.",
    path: requestTarget.path,
    query: requestTarget.query,
    patchExplorerRow: (row) =>
      patchExplorerVendorItem(row, input.vendorItemId, (item) => ({
        ...item,
        salePrice: input.price,
        lastModifiedAt: patchedAt,
      })),
    patchDetail: (response) =>
      patchCachedDetailVendorItem(response, input.vendorItemId, (item) => ({
        ...item,
        salePrice: input.price,
      })),
    skipBackgroundHydration: input.skipBackgroundHydration,
  });
}

export async function updateOptionQuantity(input: {
  storeId: string;
  sellerProductId?: string | null;
  vendorItemId: string;
  quantity: number;
  skipBackgroundHydration?: boolean;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const patchedAt = new Date().toISOString();
  return updateByPath(store, {
    vendorItemId: input.vendorItemId,
    sellerProductId: input.sellerProductId,
    successMessage: "쿠팡 옵션 재고를 변경했습니다.",
    path:
      `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${encodeURIComponent(
        input.vendorItemId,
      )}` + `/quantities/${encodeURIComponent(String(input.quantity))}`,
    patchExplorerRow: (row) =>
      patchExplorerVendorItem(row, input.vendorItemId, (item) => ({
        ...item,
        inventoryCount: input.quantity,
        lastModifiedAt: patchedAt,
      })),
    patchDetail: (response) =>
      patchCachedDetailVendorItem(response, input.vendorItemId, (item) => ({
        ...item,
        inventoryCount: input.quantity,
      })),
    skipBackgroundHydration: input.skipBackgroundHydration,
  });
}

export async function updateSaleStatus(input: {
  storeId: string;
  sellerProductId?: string | null;
  vendorItemId: string;
  saleStatus: "ONSALE" | "SUSPENDED";
  skipBackgroundHydration?: boolean;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const patchedAt = new Date().toISOString();
  return updateByPath(store, {
    vendorItemId: input.vendorItemId,
    sellerProductId: input.sellerProductId,
    successMessage:
      input.saleStatus === "ONSALE"
        ? "쿠팡 옵션 판매를 재개했습니다."
        : "쿠팡 옵션 판매를 중지했습니다.",
    path:
      `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${encodeURIComponent(
        input.vendorItemId,
      )}` + (input.saleStatus === "ONSALE" ? "/sales/resume" : "/sales/stop"),
    patchExplorerRow: (row) =>
      patchExplorerVendorItem(row, input.vendorItemId, (item) => ({
        ...item,
        saleStatus: input.saleStatus,
        lastModifiedAt: patchedAt,
      })),
    patchDetail: (response) =>
      patchCachedDetailVendorItem(response, input.vendorItemId, (item) => ({
        ...item,
        saleStatus: input.saleStatus,
      })),
    skipBackgroundHydration: input.skipBackgroundHydration,
  });
}

export async function updateOptionPricesBulk(input: {
  storeId: string;
  items: CoupangProductPriceUpdateTarget[];
}) {
  return runProductBatch({
    storeId: input.storeId,
    items: input.items,
    action: "updatePricesBulk",
    runOne: async (item) => {
      const result = await updateOptionPrice({
        storeId: input.storeId,
        sellerProductId: item.sellerProductId ?? null,
        vendorItemId: item.vendorItemId,
        price: item.price,
      });

      return {
        targetId: item.vendorItemId,
        vendorItemId: item.vendorItemId,
        sellerProductId: item.sellerProductId ?? null,
        message: result.message,
      };
    },
  });
}

export async function updateOptionQuantitiesBulk(input: {
  storeId: string;
  items: CoupangProductQuantityUpdateTarget[];
}) {
  return runProductBatch({
    storeId: input.storeId,
    items: input.items,
    action: "updateQuantitiesBulk",
    runOne: async (item) => {
      const result = await updateOptionQuantity({
        storeId: input.storeId,
        sellerProductId: item.sellerProductId ?? null,
        vendorItemId: item.vendorItemId,
        quantity: item.quantity,
      });

      return {
        targetId: item.vendorItemId,
        vendorItemId: item.vendorItemId,
        sellerProductId: item.sellerProductId ?? null,
        message: result.message,
      };
    },
  });
}

export async function updateOptionSaleStatusesBulk(input: {
  storeId: string;
  items: CoupangProductSaleStatusUpdateTarget[];
}) {
  return runProductBatch({
    storeId: input.storeId,
    items: input.items,
    action: "updateSaleStatusBulk",
    runOne: async (item) => {
      const result = await updateSaleStatus({
        storeId: input.storeId,
        sellerProductId: item.sellerProductId ?? null,
        vendorItemId: item.vendorItemId,
        saleStatus: item.saleStatus,
      });

      return {
        targetId: item.vendorItemId,
        vendorItemId: item.vendorItemId,
        sellerProductId: item.sellerProductId ?? null,
        message: result.message,
      };
    },
  });
}

export async function updatePartialProduct(input: CoupangProductPartialEditPayload) {
  const store = await getStoreOrThrow(input.storeId);
  await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "PUT",
    path:
      `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${encodeURIComponent(
        input.sellerProductId,
      )}/partial`,
    body: buildCoupangProductPartialUpdatePayload(input),
  });

  await Promise.all([
    coupangProductCacheStore.patchExplorerRow(input.storeId, input.sellerProductId, (row) => ({
      ...row,
      lastModifiedAt: new Date().toISOString(),
      deliveryCharge: hasOwnField(input, "deliveryCharge") ? input.deliveryCharge ?? null : row.deliveryCharge,
      deliveryChargeType: hasOwnField(input, "deliveryChargeType")
        ? input.deliveryChargeType ?? null
        : row.deliveryChargeType,
    })),
    coupangProductCacheStore.updateDetail(input.storeId, input.sellerProductId, (response) =>
      patchCachedDetailDeliveryInfo(response, input),
    ),
  ]);
  queueExplorerHydrationTargets(store, [input.sellerProductId], { force: true });

  return buildProductMutationResult(input.sellerProductId, "쿠팡 배송/반품 정보를 수정했습니다.");
}

export async function updateFullProduct(input: CoupangProductFullEditPayload) {
  const store = await getStoreOrThrow(input.storeId);
  const payload = buildCoupangProductFullUpdatePayload(input);
  payload.vendorId = store.vendorId;

  await requestCoupangJson({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "PUT",
    path: "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products",
    body: payload,
  });

  await Promise.all([
    coupangProductCacheStore.patchExplorerRow(input.storeId, input.sellerProductId, (row) =>
      patchExplorerRowWithFullPayload(row, input),
    ),
    coupangProductCacheStore.updateDetail(input.storeId, input.sellerProductId, (response) =>
      patchCachedDetailWithFullPayload(response, input),
    ),
  ]);
  queueExplorerHydrationTargets(store, [input.sellerProductId], { force: true });

  return buildProductMutationResult(
    input.sellerProductId,
    input.requestApproval
      ? "쿠팡 상품 전체 수정과 승인 요청을 전송했습니다."
      : "쿠팡 상품 전체 수정을 완료했습니다.",
  );
}
