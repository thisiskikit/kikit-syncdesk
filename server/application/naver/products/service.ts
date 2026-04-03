import {
  NAVER_PRODUCT_LIST_DEFAULT_PAGE,
  NAVER_PRODUCT_LIST_MAX_ITEMS_LIMIT,
  NAVER_PRODUCT_LIST_PAGE_SIZE_MAX,
  type NaverBulkPricePreviewItem,
  type NaverBulkPricePreviewResponse,
  type NaverBulkPriceTarget,
  type NaverBulkPriceUpdateItemResult,
  type NaverBulkPriceUpdateResponse,
  type NaverProductListItem,
  type NaverProductListResponse,
  type NaverProductOptionRow,
  type NaverPriceUpdatePreview,
  type NaverPriceUpdateResult,
} from "@shared/naver-products";
import type { ApiCacheState } from "@shared/api";
import type {
  NaverBulkPriceDisplayStatus,
  NaverBulkPriceSaleStatus,
  NaverBulkPriceTargetSaleStatus,
} from "@shared/naver-bulk-price";
import {
  channelSettingsStore,
  issueNaverAccessToken,
  listProductLibraryMemosByStore,
  naverProductCacheStore,
  naverProductSellerBarcodeCacheStore,
  recordExternalRequestEvent,
} from "../../../infra/naver/product-deps";

const NAVER_API_BASE_URL =
  process.env.NAVER_COMMERCE_API_BASE_URL || "https://api.commerce.naver.com/external";
const NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX = NAVER_PRODUCT_LIST_PAGE_SIZE_MAX;
const NAVER_PRODUCT_FETCH_RETRY_COUNT = 4;
const NAVER_PRODUCT_FETCH_RETRY_DELAY_MS = 1_200;
const NAVER_PRODUCT_UPDATE_RETRY_COUNT = 5;
const NAVER_PRODUCT_UPDATE_RETRY_DELAY_MS = 1_500;
const NAVER_PRODUCT_FETCH_PAGE_CONCURRENCY = 4;
const NAVER_PRODUCT_FETCH_PAGE_STAGGER_MS = 75;
const NAVER_PRODUCT_BARCODE_FETCH_CONCURRENCY = 3;
const NAVER_PRODUCT_BARCODE_FETCH_STAGGER_MS = 125;
const NAVER_PRODUCT_BARCODE_FETCH_RETRY_COUNT = 3;
const NAVER_PRODUCT_BARCODE_FETCH_RETRY_DELAY_MS = 1_000;
const NAVER_PRODUCT_BARCODE_CACHE_TTL_MS = 10 * 60_000;
const NAVER_PRODUCT_SNAPSHOT_STALE_MS = 60_000;

const SALE_STATUS_LABELS: Record<string, string> = {
  WAIT: "Sale pending",
  SALE: "On sale",
  OUTOFSTOCK: "Out of stock",
  UNADMISSION: "Under review",
  REJECTION: "Rejected",
  SUSPENSION: "Sale suspended",
  CLOSE: "Sale ended",
  PROHIBITION: "Sale prohibited",
  DELETE: "Deleted",
};

const DISPLAY_STATUS_LABELS: Record<string, string> = {
  WAIT: "Display pending",
  ON: "Displaying",
  SUSPENSION: "Display suspended",
};

type StoredNaverStore = NonNullable<Awaited<ReturnType<typeof channelSettingsStore.getStore>>>;

type NaverChannelProductListRow = Record<string, unknown>;
type NaverProductGroup = {
  originProductNo?: number | string;
  channelProducts?: NaverChannelProductListRow[];
};

type NaverProductListPayload = {
  contents?: NaverProductGroup[];
  page?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
  first?: boolean;
  last?: boolean;
};

type NaverChannelProductDetailPayload = {
  originProduct?: Record<string, unknown>;
  smartstoreChannelProduct?: Record<string, unknown>;
  windowChannelProduct?: Record<string, unknown>;
};

type ConfirmedPricePreview = Pick<
  NaverPriceUpdatePreview,
  | "originProductNo"
  | "channelProductNo"
  | "productName"
  | "currentPrice"
  | "stockQuantity"
  | "saleStatusCode"
  | "saleStatusLabel"
  | "hasOptions"
  | "optionType"
  | "optionCount"
  | "optionHandlingMessage"
  | "modifiedAt"
>;

type NaverRequestContext = {
  store: StoredNaverStore;
  authorization: string;
};

type NaverAvailabilityUpdateResult = {
  messages: string[];
  inventoryUpdated: boolean;
  saleStatusUpdated: boolean;
  displayStatusUpdated: boolean;
};

const naverProductSnapshotWarmups = new Map<string, Promise<void>>();

function asString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  return null;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getNestedValue(input: Record<string, unknown>, path: string[]) {
  let current: unknown = input;

  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(segment in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function normalizeOptionalCode(value: unknown) {
  const normalized = asString(value)?.trim() ?? "";
  return normalized.length ? normalized : null;
}

function getArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function joinNonEmpty(parts: Array<string | null>) {
  return parts.map((part) => part?.trim() ?? "").filter(Boolean).join(" / ");
}

function extractOptionNameParts(option: Record<string, unknown>) {
  return Array.from({ length: 4 }, (_, index) => asString(option[`optionName${index + 1}`]));
}

function extractOptionSellerManagementCode(option: Record<string, unknown>) {
  return asString(option.sellerManagementCode) ?? asString(option.sellerManagerCode);
}

function extractSellerBarcode(value: Record<string, unknown>) {
  const candidates = [
    value.sellerBarcode,
    getNestedValue(value, ["sellerCodeInfo", "sellerBarcode"]),
    getNestedValue(value, ["detailAttribute", "sellerCodeInfo", "sellerBarcode"]),
    getNestedValue(value, ["originProduct", "sellerCodeInfo", "sellerBarcode"]),
    getNestedValue(value, ["originProduct", "detailAttribute", "sellerCodeInfo", "sellerBarcode"]),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOptionalCode(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractOptionPrice(option: Record<string, unknown>) {
  const candidates = [
    option.price,
    option.salePrice,
    option.optionPrice,
    option.additionalPrice,
    option.additionalAmount,
    option.additionalPriceValue,
    option.additionalSalePrice,
  ];

  for (const candidate of candidates) {
    const value = asNumber(candidate);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function buildCombinationOptionRows(optionInfo: Record<string, unknown>) {
  const combinations = Array.isArray(optionInfo.optionCombinations)
    ? optionInfo.optionCombinations
    : [];

  return combinations.flatMap((value, index) => {
    const option = asObject(value);
    if (!option) {
      return [];
    }

    const label = joinNonEmpty(extractOptionNameParts(option)) || `Option ${index + 1}`;

    return [
      {
        key: `combination-${index + 1}`,
        optionType: "combination",
        label,
        attributeSummary: null,
        sellerManagementCode: extractOptionSellerManagementCode(option),
        stockQuantity: asNumber(option.stockQuantity),
        price: extractOptionPrice(option),
        usable: asBoolean(option.usable),
      } satisfies NaverProductOptionRow,
    ];
  });
}

function buildStandardOptionRows(optionInfo: Record<string, unknown>) {
  const standards = Array.isArray(optionInfo.optionStandards)
    ? optionInfo.optionStandards
    : [];

  return standards.flatMap((value, index) => {
    const option = asObject(value);
    if (!option) {
      return [];
    }

    const label = joinNonEmpty(extractOptionNameParts(option)) || `Option ${index + 1}`;

    return [
      {
        key: `standard-${index + 1}`,
        optionType: "standard",
        label,
        attributeSummary: null,
        sellerManagementCode: extractOptionSellerManagementCode(option),
        stockQuantity: asNumber(option.stockQuantity),
        price: extractOptionPrice(option),
        usable: asBoolean(option.usable),
      } satisfies NaverProductOptionRow,
    ];
  });
}

function buildSimpleOptionRows(optionInfo: Record<string, unknown>) {
  const simpleOptions = Array.isArray(optionInfo.optionSimple) ? optionInfo.optionSimple : [];

  return simpleOptions.flatMap((value, index) => {
    const option = asObject(value);
    if (!option) {
      return [];
    }

    const groupName = asString(option.groupName);
    const optionName = asString(option.name) ?? asString(option.optionName);
    const label = optionName?.trim() || groupName?.trim() || `Option ${index + 1}`;

    return [
      {
        key: `simple-${index + 1}`,
        optionType: "simple",
        label,
        attributeSummary: groupName && optionName && groupName !== optionName ? groupName : null,
        sellerManagementCode: extractOptionSellerManagementCode(option),
        stockQuantity: asNumber(option.stockQuantity),
        price: extractOptionPrice(option),
        usable: asBoolean(option.usable),
      } satisfies NaverProductOptionRow,
    ];
  });
}

function buildCustomOptionRows(optionInfo: Record<string, unknown>) {
  const customOptions = Array.isArray(optionInfo.optionCustom) ? optionInfo.optionCustom : [];

  return customOptions.flatMap((value, index) => {
    const option = asObject(value);
    if (!option) {
      return [];
    }

    const groupName = asString(option.groupName);
    const optionName = asString(option.name) ?? asString(option.optionName);
    const label = optionName?.trim() || groupName?.trim() || `Option ${index + 1}`;

    return [
      {
        key: `custom-${index + 1}`,
        optionType: "custom",
        label,
        attributeSummary: groupName && optionName && groupName !== optionName ? groupName : null,
        sellerManagementCode: extractOptionSellerManagementCode(option),
        stockQuantity: asNumber(option.stockQuantity),
        price: extractOptionPrice(option),
        usable: asBoolean(option.usable),
      } satisfies NaverProductOptionRow,
    ];
  });
}

function buildOptionRows(optionInfo: Record<string, unknown> | null): NaverProductOptionRow[] {
  if (!optionInfo) {
    return [];
  }

  const combinationRows = buildCombinationOptionRows(optionInfo);
  if (combinationRows.length > 0) {
    return combinationRows;
  }

  const standardRows = buildStandardOptionRows(optionInfo);
  if (standardRows.length > 0) {
    return standardRows;
  }

  const simpleRows = buildSimpleOptionRows(optionInfo);
  if (simpleRows.length > 0) {
    return simpleRows;
  }

  return buildCustomOptionRows(optionInfo);
}

function extractErrorMessage(payload: unknown, fallbackStatus: number) {
  if (!payload || typeof payload !== "object") {
    return `Naver API request failed (${fallbackStatus}).`;
  }

  const message =
    ("message" in payload && typeof payload.message === "string" && payload.message) ||
    ("error_description" in payload &&
      typeof payload.error_description === "string" &&
      payload.error_description) ||
    ("error" in payload && typeof payload.error === "string" && payload.error) ||
    ("code" in payload && typeof payload.code === "string" && payload.code) ||
    null;

  return message || `Naver API request failed (${fallbackStatus}).`;
}

function isHtmlPayload(text: string, contentType: string | null) {
  const normalized = text.trim().toLowerCase();

  return (
    (contentType || "").toLowerCase().includes("text/html") ||
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.startsWith("<body")
  );
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  iteratee: (item: TItem, index: number) => Promise<TResult>,
) {
  if (!items.length) {
    return [];
  }

  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

function getRequestedPriceValidationMessage(newPrice: number | null, currentPrice: number | null) {
  if (newPrice === null || !Number.isFinite(newPrice)) {
    return "New price must be a number.";
  }

  if (!Number.isInteger(newPrice)) {
    return "New price must be an integer.";
  }

  if (newPrice <= 0) {
    return "New price must be greater than 0.";
  }

  if (currentPrice === null) {
    return "Current price could not be confirmed.";
  }

  if (newPrice === currentPrice) {
    return "New price is the same as the current price.";
  }

  return null;
}

function buildComparisonText(currentPrice: number | null, newPrice: number | null) {
  if (currentPrice === null || newPrice === null) {
    return null;
  }

  return `${currentPrice} -> ${newPrice}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMaxItems(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);

  if (normalized <= 0) {
    return null;
  }

  return Math.min(normalized, NAVER_PRODUCT_LIST_MAX_ITEMS_LIMIT);
}

function isRetryableNaverProductRequestError(message: string) {
  const normalized = message.toLowerCase();

  return (
    message.includes("요청이 많아") ||
    message.includes("일시적으로 사용할 수 없습니다") ||
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many") ||
    normalized.includes("temporar")
  );
}

async function getNaverStoreOrThrow(storeId: string) {
  const store = await channelSettingsStore.getStore(storeId);

  if (!store) {
    throw new Error("Naver store settings not found.");
  }

  if (store.channel !== "naver") {
    throw new Error("Selected store is not a NAVER store.");
  }

  return store as StoredNaverStore;
}

async function createNaverRequestContext(storeId: string): Promise<NaverRequestContext> {
  const store = await getNaverStoreOrThrow(storeId);
  const token = await issueNaverAccessToken({
    clientId: store.credentials.clientId,
    clientSecret: store.credentials.clientSecret,
  });

  return {
    store,
    authorization: `${token.tokenType} ${token.accessToken}`,
  };
}

async function requestNaverJsonWithContext<T>(input: {
  context: NaverRequestContext;
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: Record<string, unknown>;
}) {
  const startedAt = Date.now();
  let response: Response | null = null;

  try {
    response = await fetch(`${NAVER_API_BASE_URL}${input.path}`, {
      method: input.method,
      headers: {
        Accept: "application/json",
        Authorization: input.context.authorization,
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      if (isHtmlPayload(text, response.headers.get("content-type"))) {
        throw new Error(
          `Expected JSON from NAVER Commerce API ${input.path}, but received HTML. Check NAVER_COMMERCE_API_BASE_URL and your NAVER store credentials.`,
        );
      }

      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, response.status));
    }

    void recordExternalRequestEvent({
      provider: "naver",
      method: input.method,
      path: input.path,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      storeId: input.context.store.id,
    });

    return {
      store: input.context.store,
      payload: (payload ?? null) as T,
    };
  } catch (error) {
    void recordExternalRequestEvent({
      provider: "naver",
      method: input.method,
      path: input.path,
      statusCode: response?.status ?? null,
      durationMs: Date.now() - startedAt,
      storeId: input.context.store.id,
      error,
    });
    throw error;
  }
}

async function requestNaverJson<T>(input: {
  storeId: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: Record<string, unknown>;
}) {
  const context = await createNaverRequestContext(input.storeId);
  return requestNaverJsonWithContext<T>({
    context,
    method: input.method,
    path: input.path,
    body: input.body,
  });
}

function normalizeHasOptionsFromList(channelProduct: Record<string, unknown>) {
  const candidates = [
    channelProduct.hasOption,
    channelProduct.hasOptions,
    channelProduct.optionUsable,
    channelProduct.useOption,
    getNestedValue(channelProduct, ["optionInfo", "optionUsable"]),
    getNestedValue(channelProduct, ["optionInfo", "hasOption"]),
    getNestedValue(channelProduct, ["detailAttribute", "optionInfo", "optionUsable"]),
    getNestedValue(channelProduct, ["detailAttribute", "optionInfo", "hasOption"]),
  ];

  for (const candidate of candidates) {
    const value = asBoolean(candidate);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

const sellerBarcodeCache = new Map<
  string,
  {
    sellerBarcode: string | null;
    cachedAt: number;
  }
>();
const sellerBarcodeInFlightRequests = new Map<string, Promise<string | null>>();

function buildSellerBarcodeCacheKey(storeId: string, originProductNo: string) {
  return `${storeId}::${originProductNo}`;
}

function getCachedSellerBarcode(storeId: string, originProductNo: string) {
  const cacheKey = buildSellerBarcodeCacheKey(storeId, originProductNo);
  const cached = sellerBarcodeCache.get(cacheKey);

  if (!cached) {
    return undefined;
  }

  if (Date.now() - cached.cachedAt > NAVER_PRODUCT_BARCODE_CACHE_TTL_MS) {
    sellerBarcodeCache.delete(cacheKey);
    return undefined;
  }

  return cached.sellerBarcode;
}

function setCachedSellerBarcode(
  storeId: string,
  originProductNo: string,
  sellerBarcode: string | null,
) {
  if (!sellerBarcode) {
    sellerBarcodeCache.delete(buildSellerBarcodeCacheKey(storeId, originProductNo));
    return;
  }

  sellerBarcodeCache.set(buildSellerBarcodeCacheKey(storeId, originProductNo), {
    sellerBarcode,
    cachedAt: Date.now(),
  });
}

function normalizeOriginProductPayload(payload: unknown) {
  const record = asObject(payload) ?? {};
  return asObject(record.originProduct) ?? record;
}

function buildAvailabilityUpdateMessage(input: {
  inventoryUpdated: boolean;
  displayStatusUpdated: boolean;
}) {
  if (input.inventoryUpdated && input.displayStatusUpdated) {
    return "Stock quantity and display status updated.";
  }

  if (input.inventoryUpdated) {
    return "Stock quantity updated.";
  }

  return "Display status updated.";
}

async function fetchSellerBarcodeByOriginProductNo(input: {
  context: NaverRequestContext;
  originProductNo: string;
}) {
  const cacheKey = buildSellerBarcodeCacheKey(input.context.store.id, input.originProductNo);
  const cached = getCachedSellerBarcode(input.context.store.id, input.originProductNo);
  if (cached !== undefined) {
    return cached;
  }

  const inFlightRequest = sellerBarcodeInFlightRequests.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const requestPromise = (async () => {
    let attempt = 0;

    while (true) {
      try {
        const { payload } = await requestNaverJsonWithContext<Record<string, unknown>>({
          context: input.context,
          method: "GET",
          path: `/v2/products/origin-products/${encodeURIComponent(input.originProductNo)}`,
        });
        const sellerBarcode = extractSellerBarcode(normalizeOriginProductPayload(payload));
        setCachedSellerBarcode(input.context.store.id, input.originProductNo, sellerBarcode);
        return sellerBarcode;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load NAVER seller barcode.";
        const canRetry =
          isRetryableNaverProductRequestError(message) &&
          attempt < NAVER_PRODUCT_BARCODE_FETCH_RETRY_COUNT;

        if (!canRetry) {
          throw error;
        }

        const delayMs = NAVER_PRODUCT_BARCODE_FETCH_RETRY_DELAY_MS * (attempt + 1);
        await sleep(delayMs);
        attempt += 1;
      }
    }
  })()
    .finally(() => {
      sellerBarcodeInFlightRequests.delete(cacheKey);
    });

  sellerBarcodeInFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

async function enrichSellerBarcodesForResponse(input: {
  context: NaverRequestContext;
  response: NaverProductListResponse;
}) {
  const missingByOriginProductNo = new Map<string, number[]>();

  input.response.items.forEach((item, index) => {
    if (item.sellerBarcode || !item.originProductNo) {
      return;
    }

    const current = missingByOriginProductNo.get(item.originProductNo) ?? [];
    current.push(index);
    missingByOriginProductNo.set(item.originProductNo, current);
  });

  if (!missingByOriginProductNo.size) {
    return input.response;
  }

  const nextItems = input.response.items.slice();
  const storeId = input.context.store.id;
  const originProductNos = Array.from(missingByOriginProductNo.keys());
  const cachedSellerBarcodes = new Map<string, string>();

  for (const originProductNo of originProductNos) {
    const cachedSellerBarcode = getCachedSellerBarcode(storeId, originProductNo);
    if (cachedSellerBarcode) {
      cachedSellerBarcodes.set(originProductNo, cachedSellerBarcode);
    }
  }

  const unresolvedOriginProductNos = originProductNos.filter(
    (originProductNo) => !cachedSellerBarcodes.has(originProductNo),
  );

  if (unresolvedOriginProductNos.length > 0) {
    const persistedSellerBarcodes = await naverProductSellerBarcodeCacheStore.getMany(
      storeId,
      unresolvedOriginProductNos,
    );

    for (const [originProductNo, sellerBarcode] of Array.from(
      persistedSellerBarcodes.entries(),
    )) {
      cachedSellerBarcodes.set(originProductNo, sellerBarcode);
      setCachedSellerBarcode(storeId, originProductNo, sellerBarcode);
    }
  }

  for (const [originProductNo, sellerBarcode] of Array.from(cachedSellerBarcodes.entries())) {
    for (const index of missingByOriginProductNo.get(originProductNo) ?? []) {
      nextItems[index] = {
        ...nextItems[index]!,
        sellerBarcode,
      };
    }
  }

  const unresolvedAfterCache = originProductNos.filter(
    (originProductNo) => !cachedSellerBarcodes.has(originProductNo),
  );

  if (!unresolvedAfterCache.length) {
    return {
      ...input.response,
      items: nextItems,
    } satisfies NaverProductListResponse;
  }

  const sellerBarcodeEntries = await mapWithConcurrency(
    unresolvedAfterCache,
    NAVER_PRODUCT_BARCODE_FETCH_CONCURRENCY,
    async (originProductNo, index) => {
      const staggerMs =
        NAVER_PRODUCT_BARCODE_FETCH_STAGGER_MS *
        (index % NAVER_PRODUCT_BARCODE_FETCH_CONCURRENCY);
      if (staggerMs > 0) {
        await sleep(staggerMs);
      }

      try {
        return {
          originProductNo,
          sellerBarcode: await fetchSellerBarcodeByOriginProductNo({
            context: input.context,
            originProductNo,
          }),
        };
      } catch {
        return {
          originProductNo,
          sellerBarcode: null,
        };
      }
    },
  );

  const resolvedSellerBarcodes: Array<{ originProductNo: string; sellerBarcode: string }> = [];

  for (const entry of sellerBarcodeEntries) {
    if (!entry.sellerBarcode) {
      continue;
    }

    resolvedSellerBarcodes.push({
      originProductNo: entry.originProductNo,
      sellerBarcode: entry.sellerBarcode,
    });

    for (const index of missingByOriginProductNo.get(entry.originProductNo) ?? []) {
      nextItems[index] = {
        ...nextItems[index]!,
        sellerBarcode: entry.sellerBarcode,
      };
    }
  }

  if (resolvedSellerBarcodes.length > 0) {
    await naverProductSellerBarcodeCacheStore.setMany(storeId, resolvedSellerBarcodes);
  }

  return {
    ...input.response,
    items: nextItems,
  } satisfies NaverProductListResponse;
}

function normalizeChannelProductListItem(input: {
  storeId: string;
  storeName: string;
  fallbackOriginProductNo: string | null;
  channelProduct: NaverChannelProductListRow;
}): NaverProductListItem | null {
  const originProductNo =
    asString(input.channelProduct.originProductNo) ?? input.fallbackOriginProductNo;

  if (!originProductNo) {
    return null;
  }

  const channelProductNo = asString(input.channelProduct.channelProductNo);
  const saleStatusCode = asString(input.channelProduct.statusType);
  const displayStatusCode = asString(input.channelProduct.channelProductDisplayStatusType);

  return {
    id: `naver:${originProductNo}:${channelProductNo ?? "origin"}`,
    storeId: input.storeId,
    storeName: input.storeName,
    originProductNo,
    channelProductNo,
    channelServiceType: asString(input.channelProduct.channelServiceType),
    categoryId: asString(input.channelProduct.categoryId),
    productName: asString(input.channelProduct.name) ?? `Product ${originProductNo}`,
    sellerManagementCode: asString(input.channelProduct.sellerManagementCode),
    sellerBarcode: extractSellerBarcode(input.channelProduct),
    saleStatusCode,
    saleStatusLabel: saleStatusCode ? SALE_STATUS_LABELS[saleStatusCode] ?? saleStatusCode : "-",
    displayStatusCode,
    displayStatusLabel: displayStatusCode
      ? DISPLAY_STATUS_LABELS[displayStatusCode] ?? displayStatusCode
      : null,
    salePrice: asNumber(input.channelProduct.salePrice),
    discountedPrice: asNumber(input.channelProduct.discountedPrice),
    deliveryFee: asNumber(input.channelProduct.deliveryFee),
    stockQuantity: asNumber(input.channelProduct.stockQuantity),
    hasOptions: normalizeHasOptionsFromList(input.channelProduct),
    memo: null,
    createdAt: asString(input.channelProduct.regDate),
    modifiedAt: asString(input.channelProduct.modifiedDate),
    saleStartDate: asString(input.channelProduct.saleStartDate),
    saleEndDate: asString(input.channelProduct.saleEndDate),
  };
}

function normalizeSearchResponse(input: {
  store: StoredNaverStore;
  data: NaverProductListPayload;
  fallbackPage: number;
  fallbackSize: number;
}) {
  const items: NaverProductListItem[] = [];

  for (const group of Array.isArray(input.data.contents) ? input.data.contents : []) {
    const fallbackOriginProductNo = asString(group.originProductNo);
    const channelProducts = Array.isArray(group.channelProducts) ? group.channelProducts : [];

    for (const channelProduct of channelProducts) {
      const normalized = normalizeChannelProductListItem({
        storeId: input.store.id,
        storeName: input.store.storeName,
        fallbackOriginProductNo,
        channelProduct,
      });

      if (normalized) {
        items.push(normalized);
      }
    }
  }

  const totalElements = asNumber(input.data.totalElements) ?? items.length;

  return {
    store: {
      id: input.store.id,
      name: input.store.storeName,
    },
    items,
    page: asNumber(input.data.page) ?? input.fallbackPage,
    size: asNumber(input.data.size) ?? input.fallbackSize,
    totalElements,
    availableTotalElements: totalElements,
    totalPages: asNumber(input.data.totalPages) ?? 1,
    first: asBoolean(input.data.first) ?? input.fallbackPage <= 1,
    last: asBoolean(input.data.last) ?? true,
    loadedCount: items.length,
    isTruncated: totalElements > items.length,
    appliedMaxItems: null,
    limitedByMaxItems: false,
    fetchedAt: new Date().toISOString(),
    servedFromCache: false,
  } satisfies NaverProductListResponse;
}

function mergeSearchResponses(pages: NaverProductListResponse[]) {
  const [firstPage] = pages;

  if (!firstPage) {
    throw new Error("At least one NAVER product page is required.");
  }

  const items = pages.flatMap((page) => page.items);
  const totalElements = Math.max(firstPage.totalElements, items.length);

  return {
    store: firstPage.store,
    items,
    page: 1,
    size: NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX,
    totalElements,
    availableTotalElements: totalElements,
    totalPages: firstPage.totalPages,
    first: true,
    last: items.length >= totalElements,
    loadedCount: items.length,
    isTruncated: items.length < totalElements,
    appliedMaxItems: null,
    limitedByMaxItems: false,
    fetchedAt: new Date().toISOString(),
    servedFromCache: false,
  } satisfies NaverProductListResponse;
}

function resolveNaverProductCacheState(input: {
  fetchedAt: string;
  servedFromCache?: boolean;
}): ApiCacheState {
  if (!input.servedFromCache) {
    return "live";
  }

  const fetchedAtMs = Date.parse(input.fetchedAt);
  if (Number.isNaN(fetchedAtMs)) {
    return "fresh-cache";
  }

  return Date.now() - fetchedAtMs > NAVER_PRODUCT_SNAPSHOT_STALE_MS
    ? "stale-cache"
    : "fresh-cache";
}

function withNaverProductCacheState(
  response: NaverProductListResponse,
  servedFromCache = response.servedFromCache ?? false,
) {
  return {
    ...response,
    servedFromCache,
    cacheState: resolveNaverProductCacheState({
      fetchedAt: response.fetchedAt,
      servedFromCache,
    }),
  } as NaverProductListResponse;
}

function paginateNaverProductSnapshot(input: {
  response: NaverProductListResponse;
  page?: number;
  size?: number;
  maxItems?: number | null;
}) {
  const normalizedMaxItems = normalizeMaxItems(input.maxItems);
  const currentPage = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(
    1,
    Math.min(input.size ?? NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX, NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX),
  );
  const availableTotalElements = Math.max(
    input.response.availableTotalElements ?? input.response.totalElements,
    input.response.items.length,
  );
  const totalElements =
    normalizedMaxItems === null
      ? availableTotalElements
      : Math.min(availableTotalElements, normalizedMaxItems);
  const totalPages = totalElements === 0 ? 1 : Math.ceil(totalElements / pageSize);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const items =
    pageStartIndex >= totalElements
      ? []
      : input.response.items.slice(pageStartIndex, Math.min(pageStartIndex + pageSize, totalElements));
  const loadedCount = items.length;

  return {
    ...input.response,
    items,
    page: currentPage,
    size: pageSize,
    totalElements,
    availableTotalElements,
    totalPages,
    first: currentPage <= 1,
    last:
      totalElements === 0 ||
      currentPage >= totalPages ||
      pageStartIndex + loadedCount >= totalElements,
    loadedCount,
    isTruncated: pageStartIndex + loadedCount < totalElements,
    appliedMaxItems: normalizedMaxItems,
    limitedByMaxItems:
      normalizedMaxItems !== null && availableTotalElements > totalElements,
  } satisfies NaverProductListResponse;
}

function applyVisibleItemLimit(
  response: NaverProductListResponse,
  maxItems?: number | null,
): NaverProductListResponse {
  const normalizedMaxItems = normalizeMaxItems(maxItems);
  const pageSize = Math.max(1, response.size);
  const currentPage = Math.max(1, response.page);
  const availableTotalElements = Math.max(
    response.availableTotalElements ?? response.totalElements,
    response.items.length,
  );
  const totalElements =
    normalizedMaxItems === null
      ? availableTotalElements
      : Math.min(availableTotalElements, normalizedMaxItems);
  const totalPages = totalElements === 0 ? 1 : Math.ceil(totalElements / pageSize);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const items =
    pageStartIndex >= totalElements
      ? []
      : response.items.slice(0, Math.max(0, totalElements - pageStartIndex));
  const loadedCount = items.length;

  return {
    ...response,
    items,
    size: pageSize,
    totalElements,
    availableTotalElements,
    totalPages,
    first: currentPage <= 1,
    last:
      totalElements === 0 ||
      currentPage >= totalPages ||
      pageStartIndex + loadedCount >= totalElements,
    loadedCount,
    isTruncated: pageStartIndex + loadedCount < totalElements,
    appliedMaxItems: normalizedMaxItems,
    limitedByMaxItems:
      normalizedMaxItems !== null && availableTotalElements > totalElements,
    servedFromCache: response.servedFromCache ?? false,
  };
}

async function attachProductMemos(response: NaverProductListResponse) {
  const memoByOriginProductNo = await listProductLibraryMemosByStore({
    channel: "naver",
    storeId: response.store.id,
  });

  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      memo: memoByOriginProductNo.get(item.originProductNo) ?? null,
    })),
  } satisfies NaverProductListResponse;
}

function detectOptionSummary(optionInfo: Record<string, unknown> | null) {
  if (!optionInfo) {
    return {
      hasOptions: false,
      optionType: "none" as const,
      optionCount: 0,
      optionHandlingMessage: "Base sale price will be updated for this product.",
    };
  }

  const combinationCount = getArrayLength(optionInfo.optionCombinations);
  if (combinationCount > 0) {
    return {
      hasOptions: true,
      optionType: "combination" as const,
      optionCount: combinationCount,
      optionHandlingMessage:
        "This is an option product. Only the base sale price will be changed in this step.",
    };
  }

  const standardCount = getArrayLength(optionInfo.optionStandards);
  if (standardCount > 0) {
    return {
      hasOptions: true,
      optionType: "standard" as const,
      optionCount: standardCount,
      optionHandlingMessage:
        "This is an option product. Standard option price differences are left unchanged.",
    };
  }

  const simpleCount = getArrayLength(optionInfo.optionSimple);
  if (simpleCount > 0) {
    return {
      hasOptions: true,
      optionType: "simple" as const,
      optionCount: simpleCount,
      optionHandlingMessage:
        "This is an option product. Only the base sale price will be changed in this step.",
    };
  }

  const customCount = getArrayLength(optionInfo.optionCustom);
  if (customCount > 0) {
    return {
      hasOptions: true,
      optionType: "custom" as const,
      optionCount: customCount,
      optionHandlingMessage:
        "This is an option product. Custom option price values are left unchanged.",
    };
  }

  return {
    hasOptions: false,
    optionType: "none" as const,
    optionCount: 0,
    optionHandlingMessage: "Base sale price will be updated for this product.",
  };
}

function buildPricePreviewFromDetail(input: {
  store: StoredNaverStore;
  channelProductNo: string | null;
  fallbackOriginProductNo: string | null;
  payload: NaverChannelProductDetailPayload;
}): NaverPriceUpdatePreview {
  const originProduct = asObject(input.payload.originProduct) ?? {};
  const optionInfo = asObject(getNestedValue(originProduct, ["detailAttribute", "optionInfo"]));
  const optionSummary = detectOptionSummary(optionInfo);
  const optionRows = buildOptionRows(optionInfo);
  const originProductNo =
    asString(originProduct.originProductNo) ?? input.fallbackOriginProductNo ?? "";
  const saleStatusCode = asString(originProduct.statusType);

  if (!originProductNo) {
    throw new Error("Naver product detail did not include originProductNo.");
  }

  return {
    storeId: input.store.id,
    storeName: input.store.storeName,
    originProductNo,
    channelProductNo: input.channelProductNo,
    productName: asString(originProduct.name) ?? `Product ${originProductNo}`,
    currentPrice: asNumber(originProduct.salePrice),
    stockQuantity: asNumber(originProduct.stockQuantity),
    saleStatusCode,
    saleStatusLabel: saleStatusCode ? SALE_STATUS_LABELS[saleStatusCode] ?? saleStatusCode : "-",
    hasOptions: optionSummary.hasOptions,
    optionType: optionSummary.optionType,
    optionCount: Math.max(optionSummary.optionCount, optionRows.length),
    optionHandlingMessage: optionSummary.optionHandlingMessage,
    optionRows,
    modifiedAt: asString(getNestedValue(originProduct, ["modifiedDate"])),
  };
}

function buildPricePreviewFromListItem(row: NaverProductListItem): NaverPriceUpdatePreview {
  const hasOptions = row.hasOptions === true;

  return {
    storeId: row.storeId,
    storeName: row.storeName,
    originProductNo: row.originProductNo,
    channelProductNo: row.channelProductNo,
    productName: row.productName,
    currentPrice: row.salePrice,
    stockQuantity: row.stockQuantity,
    saleStatusCode: row.saleStatusCode,
    saleStatusLabel: row.saleStatusLabel,
    hasOptions,
    optionType: row.hasOptions === null ? "unknown" : hasOptions ? "unknown" : "none",
    optionCount: 0,
    optionHandlingMessage: hasOptions
      ? "Option product detected from list data. Only the base sale price will be changed."
      : row.hasOptions === null
        ? "Option structure could not be fully confirmed from list data."
        : "Base sale price will be updated for this product.",
    optionRows: [],
    modifiedAt: row.modifiedAt,
  };
}

async function searchNaverProductsPage(input: {
  context: NaverRequestContext;
  page?: number;
  size?: number;
  orderType?: string;
  originProductNos?: number[];
}) {
  const page = Math.max(1, input.page ?? 1);
  const size = Math.max(1, Math.min(input.size ?? NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX, NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX));
  const { store, payload } = await requestNaverJsonWithContext<NaverProductListPayload>({
    context: input.context,
    method: "POST",
    path: "/v1/products/search",
    body: {
      page,
      size,
      orderType: input.orderType ?? "MOD_DATE",
      ...(input.originProductNos ? { originProductNos: input.originProductNos } : {}),
    },
  });

  return normalizeSearchResponse({
    store,
    data: payload ?? {},
    fallbackPage: page,
    fallbackSize: size,
  });
}

async function searchNaverProductsPageWithRetry(input: {
  context: NaverRequestContext;
  page?: number;
  size?: number;
  orderType?: string;
  originProductNos?: number[];
}) {
  let attempt = 0;

  while (true) {
    try {
      return await searchNaverProductsPage(input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load NAVER product list.";
      const canRetry =
        isRetryableNaverProductRequestError(message) &&
        attempt < NAVER_PRODUCT_FETCH_RETRY_COUNT;

      if (!canRetry) {
        throw error;
      }

      const delayMs = NAVER_PRODUCT_FETCH_RETRY_DELAY_MS * (attempt + 1);
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

async function fetchNaverProductSnapshot(input: {
  context: NaverRequestContext;
  includeSellerBarcodes: boolean;
}) {
  const firstPage = await searchNaverProductsPageWithRetry({
    context: input.context,
    page: 1,
    size: NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX,
  });

  const enrichedFirstPage = input.includeSellerBarcodes
    ? await enrichSellerBarcodesForResponse({
        context: input.context,
        response: firstPage,
      })
    : firstPage;

  if (
    enrichedFirstPage.totalPages <= 1 ||
    enrichedFirstPage.totalElements <= firstPage.items.length
  ) {
    return withNaverProductCacheState(enrichedFirstPage, false);
  }

  const cappedTotalPages = Math.min(
    firstPage.totalPages,
    Math.ceil(enrichedFirstPage.totalElements / NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX),
  );
  const remainingPages = Array.from(
    { length: Math.max(0, cappedTotalPages - 1) },
    (_, index) => index + 2,
  );
  const nextPages = await mapWithConcurrency(
    remainingPages,
    NAVER_PRODUCT_FETCH_PAGE_CONCURRENCY,
    async (page, index) => {
      const staggerMs =
        NAVER_PRODUCT_FETCH_PAGE_STAGGER_MS * (index % NAVER_PRODUCT_FETCH_PAGE_CONCURRENCY);
      if (staggerMs > 0) {
        await sleep(staggerMs);
      }

      return searchNaverProductsPageWithRetry({
        context: input.context,
        page,
        size: NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX,
      });
    },
  );

  const merged = mergeSearchResponses([firstPage, ...nextPages]);
  const enrichedMerged = input.includeSellerBarcodes
    ? await enrichSellerBarcodesForResponse({
        context: input.context,
        response: merged,
      })
    : merged;

  return withNaverProductCacheState(enrichedMerged, false);
}

function getNaverProductSnapshotWarmupKey(storeId: string, includeSellerBarcodes: boolean) {
  return `${storeId}:${includeSellerBarcodes ? "barcodes" : "plain"}`;
}

async function warmNaverProductSnapshot(input: {
  storeId: string;
  includeSellerBarcodes: boolean;
}) {
  const warmupKey = getNaverProductSnapshotWarmupKey(
    input.storeId,
    input.includeSellerBarcodes,
  );
  const existing = naverProductSnapshotWarmups.get(warmupKey);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    try {
      const context = await createNaverRequestContext(input.storeId);
      const snapshot = await fetchNaverProductSnapshot({
        context,
        includeSellerBarcodes: input.includeSellerBarcodes,
      });
      await naverProductCacheStore.set(
        input.storeId,
        withNaverProductCacheState(snapshot, false),
      );
    } finally {
      naverProductSnapshotWarmups.delete(warmupKey);
    }
  })().catch(() => undefined);

  naverProductSnapshotWarmups.set(warmupKey, request);
  return request;
}

function scheduleNaverProductSnapshotWarmup(input: {
  storeId: string;
  includeSellerBarcodes: boolean;
}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  setTimeout(() => {
    void warmNaverProductSnapshot(input);
  }, 0);
}

export async function fetchNaverProducts(input: {
  storeId: string;
  page?: number;
  size?: number;
  maxItems?: number | null;
  all?: boolean;
  refresh?: boolean;
  includeSellerBarcodes?: boolean;
}) {
  const needsSellerBarcodes = input.includeSellerBarcodes === true;
  let contextPromise: Promise<NaverRequestContext> | null = null;

  const getContext = () => {
    if (!contextPromise) {
      contextPromise = createNaverRequestContext(input.storeId);
    }

      return contextPromise;
  };

  if (!input.refresh) {
    const cached = await naverProductCacheStore.get(input.storeId);

    if (cached) {
      const response =
        needsSellerBarcodes
          ? await enrichSellerBarcodesForResponse({
              context: await getContext(),
              response: cached,
            })
          : cached;

      if (response !== cached) {
        await naverProductCacheStore.set(input.storeId, response);
      }

      const cachedSnapshot = withNaverProductCacheState(response, true);

      if (resolveNaverProductCacheState(cachedSnapshot) === "stale-cache") {
        scheduleNaverProductSnapshotWarmup({
          storeId: input.storeId,
          includeSellerBarcodes: needsSellerBarcodes,
        });
      }

      const visibleResponse = input.all
        ? applyVisibleItemLimit(cachedSnapshot, input.maxItems)
        : paginateNaverProductSnapshot({
            response: cachedSnapshot,
            page: input.page,
            size: input.size,
            maxItems: input.maxItems,
          });

      return attachProductMemos(visibleResponse);
    }
  }

  const context = await getContext();

  if (!input.all) {
    const pageResponse = await searchNaverProductsPageWithRetry({
      context,
      page: input.page,
      size: input.size,
    });
    const enrichedPageResponse =
      needsSellerBarcodes
        ? await enrichSellerBarcodesForResponse({
            context,
            response: pageResponse,
          })
        : pageResponse;

    scheduleNaverProductSnapshotWarmup({
      storeId: input.storeId,
      includeSellerBarcodes: needsSellerBarcodes,
    });

    return attachProductMemos(
      applyVisibleItemLimit(
        withNaverProductCacheState(enrichedPageResponse, false),
        input.maxItems,
      ),
    );
  }

  if (
    input.maxItems !== null &&
    input.maxItems !== undefined &&
    input.maxItems <= NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX
  ) {
    const firstPage = await searchNaverProductsPageWithRetry({
      context,
      page: NAVER_PRODUCT_LIST_DEFAULT_PAGE,
      size: Math.min(NAVER_PRODUCT_SEARCH_PAGE_SIZE_MAX, input.maxItems),
    });
    const enrichedFirstPage =
      needsSellerBarcodes
        ? await enrichSellerBarcodesForResponse({
            context,
            response: firstPage,
          })
        : firstPage;

    if (!input.refresh) {
      scheduleNaverProductSnapshotWarmup({
        storeId: input.storeId,
        includeSellerBarcodes: needsSellerBarcodes,
      });
    }

    return attachProductMemos(
      applyVisibleItemLimit(
        withNaverProductCacheState(enrichedFirstPage, false),
        input.maxItems,
      ),
    );
  }

  const snapshot = await fetchNaverProductSnapshot({
    context,
    includeSellerBarcodes: needsSellerBarcodes,
  });
  await naverProductCacheStore.set(input.storeId, withNaverProductCacheState(snapshot, false));
  return attachProductMemos(applyVisibleItemLimit(snapshot, input.maxItems));
}

async function fetchNaverProductPricePreviewWithContext(input: {
  context: NaverRequestContext;
  originProductNo?: string | null;
  channelProductNo?: string | null;
}) {
  if (input.channelProductNo) {
    const { store, payload } = await requestNaverJsonWithContext<NaverChannelProductDetailPayload>({
      context: input.context,
      method: "GET",
      path: `/v2/products/channel-products/${encodeURIComponent(input.channelProductNo)}`,
    });

    return buildPricePreviewFromDetail({
      store,
      channelProductNo: input.channelProductNo,
      fallbackOriginProductNo: input.originProductNo ?? null,
      payload: payload ?? {},
    });
  }

  const numericOriginProductNo = Number(input.originProductNo ?? "");

  if (!Number.isInteger(numericOriginProductNo) || numericOriginProductNo <= 0) {
    throw new Error("originProductNo is required.");
  }

  const searchResult = await searchNaverProductsPage({
    context: input.context,
    page: 1,
    size: 100,
    originProductNos: [numericOriginProductNo],
  });

  const row =
    searchResult.items.find((item) => item.originProductNo === String(numericOriginProductNo)) ?? null;

  if (!row) {
    throw new Error("Product not found.");
  }

  return buildPricePreviewFromListItem(row);
}

export async function fetchNaverProductPricePreview(input: {
  storeId: string;
  originProductNo?: string | null;
  channelProductNo?: string | null;
}) {
  const context = await createNaverRequestContext(input.storeId);
  return fetchNaverProductPricePreviewWithContext({
    context,
    originProductNo: input.originProductNo,
    channelProductNo: input.channelProductNo,
  });
}

function buildBulkPreviewErrorItem(
  target: NaverBulkPriceTarget,
  message: string,
): NaverBulkPricePreviewItem {
  return {
    rowId: target.rowId,
    originProductNo: target.originProductNo,
    channelProductNo: target.channelProductNo,
    productName: `Product ${target.originProductNo}`,
    currentPrice: null,
    stockQuantity: null,
    newPrice: target.newPrice,
    saleStatusCode: null,
    saleStatusLabel: "-",
    hasOptions: false,
    optionType: "unknown",
    optionCount: 0,
    optionHandlingMessage: "Product preview could not be loaded.",
    modifiedAt: null,
    status: "error",
    validationMessage: message,
    comparisonText: null,
  };
}

function buildBulkPreviewItem(
  target: NaverBulkPriceTarget,
  preview: ConfirmedPricePreview,
): NaverBulkPricePreviewItem {
  const validationMessage = getRequestedPriceValidationMessage(target.newPrice, preview.currentPrice);

  return {
    rowId: target.rowId,
    originProductNo: preview.originProductNo,
    channelProductNo: preview.channelProductNo,
    productName: preview.productName,
    currentPrice: preview.currentPrice,
    stockQuantity: preview.stockQuantity,
    newPrice: target.newPrice,
    saleStatusCode: preview.saleStatusCode,
    saleStatusLabel: preview.saleStatusLabel,
    hasOptions: preview.hasOptions,
    optionType: preview.optionType,
    optionCount: preview.optionCount,
    optionHandlingMessage: preview.optionHandlingMessage,
    modifiedAt: preview.modifiedAt,
    status: validationMessage ? "invalid" : "ready",
    validationMessage,
    comparisonText: buildComparisonText(preview.currentPrice, target.newPrice),
  };
}

function buildBulkUpdateResult(
  preview: NaverBulkPricePreviewItem,
  status: NaverBulkPriceUpdateItemResult["status"],
  message: string,
  appliedAt: string | null,
): NaverBulkPriceUpdateItemResult {
  return {
    rowId: preview.rowId,
    originProductNo: preview.originProductNo,
    channelProductNo: preview.channelProductNo,
    productName: preview.productName,
    currentPrice: preview.currentPrice,
    requestedPrice: preview.newPrice,
    saleStatusCode: preview.saleStatusCode,
    saleStatusLabel: preview.saleStatusLabel,
    hasOptions: preview.hasOptions,
    optionType: preview.optionType,
    optionCount: preview.optionCount,
    optionHandlingMessage: preview.optionHandlingMessage,
    status,
    message,
    appliedAt,
  };
}

async function applyConfirmedSalePriceUpdate(input: {
  context: NaverRequestContext;
  preview: ConfirmedPricePreview;
  newPrice: number;
}) {
  const validationMessage = getRequestedPriceValidationMessage(
    input.newPrice,
    input.preview.currentPrice,
  );

  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const numericOriginProductNo = Number(input.preview.originProductNo);

  if (!Number.isInteger(numericOriginProductNo) || numericOriginProductNo <= 0) {
    throw new Error("originProductNo is invalid.");
  }

  let attempt = 0;

  while (true) {
    try {
      await requestNaverJsonWithContext({
        context: input.context,
        method: "PUT",
        path: "/v1/products/origin-products/bulk-update",
        body: {
          originProductNos: [numericOriginProductNo],
          productBulkUpdateType: "SALE_PRICE",
          productSalePrice: {
            value: input.newPrice,
            productSalePriceChangerType: "TO",
            productSalePriceChangerUnitType: "WON",
          },
        },
      });
      break;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update NAVER sale price.";
      const canRetry =
        isRetryableNaverProductRequestError(message) &&
        attempt < NAVER_PRODUCT_UPDATE_RETRY_COUNT;

      if (!canRetry) {
        throw error;
      }

      const delayMs = NAVER_PRODUCT_UPDATE_RETRY_DELAY_MS * (attempt + 1);
      await sleep(delayMs);
      attempt += 1;
    }
  }

  return {
    before: {
      storeId: input.context.store.id,
      storeName: input.context.store.storeName,
      optionRows: [],
      ...input.preview,
    },
    requestedPrice: input.newPrice,
    updatePath: "bulk_origin_sale_price",
    appliedAt: new Date().toISOString(),
    message: input.preview.hasOptions
      ? "Base sale price updated. Option-level price differences were left unchanged."
      : "Sale price updated.",
  } satisfies NaverPriceUpdateResult;
}

export async function updateNaverProductSalePriceFromPreview(input: {
  storeId: string;
  preview: NaverPriceUpdatePreview;
  newPrice: number;
}) {
  const context = await createNaverRequestContext(input.storeId);
  return applyConfirmedSalePriceUpdate({
    context,
    preview: input.preview,
    newPrice: input.newPrice,
  });
}

async function fetchNaverProductSaleStatusSnapshotWithContext(input: {
  context: NaverRequestContext;
  originProductNo: string;
  channelProductNo?: string | null;
}) {
  const numericOriginProductNo = Number(input.originProductNo ?? "");

  if (!Number.isInteger(numericOriginProductNo) || numericOriginProductNo <= 0) {
    throw new Error("originProductNo is required.");
  }

  const response = await searchNaverProductsPage({
    context: input.context,
    page: 1,
    size: 100,
    originProductNos: [numericOriginProductNo],
  });

  const exactMatch =
    response.items.find(
      (item) =>
        item.originProductNo === String(numericOriginProductNo) &&
        item.channelProductNo === (input.channelProductNo ?? null),
    ) ?? null;
  const fallbackMatch =
    response.items.find(
      (item) => item.originProductNo === String(numericOriginProductNo),
    ) ?? null;
  const row = exactMatch ?? fallbackMatch;

  if (!row) {
    throw new Error("Product not found.");
  }

  return {
    originProductNo: row.originProductNo,
    channelProductNo: row.channelProductNo,
    productName: row.productName,
    saleStatusCode: row.saleStatusCode as NaverBulkPriceSaleStatus | null,
    saleStatusLabel: row.saleStatusLabel,
    displayStatusCode: row.displayStatusCode as NaverBulkPriceDisplayStatus | null,
    stockQuantity: row.stockQuantity,
    modifiedAt: row.modifiedAt,
  };
}

async function applyConfirmedSaleStatusUpdate(input: {
  context: NaverRequestContext;
  originProductNo: string;
  targetSaleStatus: NaverBulkPriceTargetSaleStatus;
  currentSaleStatus: NaverBulkPriceSaleStatus | null;
  stockQuantity: number | null;
}) {
  const numericOriginProductNo = Number(input.originProductNo);

  if (!Number.isInteger(numericOriginProductNo) || numericOriginProductNo <= 0) {
    throw new Error("originProductNo is invalid.");
  }

  const requestBody: Record<string, unknown> = {
    statusType: input.targetSaleStatus,
  };

  if (input.stockQuantity !== null) {
    if (input.stockQuantity < 0) {
      throw new Error("stockQuantity must be zero or greater.");
    }

    if (input.targetSaleStatus === "SALE" && input.stockQuantity <= 0) {
      throw new Error(
        "NAVER requires stock quantity greater than 0 to change OUTOFSTOCK to SALE.",
      );
    }

    requestBody.stockQuantity = Math.trunc(input.stockQuantity);
  } else if (
    input.targetSaleStatus === "SALE" &&
    input.currentSaleStatus === "OUTOFSTOCK"
  ) {
    throw new Error(
      "NAVER requires stock quantity greater than 0 to change OUTOFSTOCK to SALE.",
    );
  }

  let attempt = 0;

  while (true) {
    try {
      await requestNaverJsonWithContext({
        context: input.context,
        method: "PUT",
        path: `/v1/products/origin-products/${encodeURIComponent(input.originProductNo)}/change-status`,
        body: requestBody,
      });
      break;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update NAVER sale status.";
      const canRetry =
        isRetryableNaverProductRequestError(message) &&
        attempt < NAVER_PRODUCT_UPDATE_RETRY_COUNT;

      if (!canRetry) {
        throw error;
      }

      const delayMs = NAVER_PRODUCT_UPDATE_RETRY_DELAY_MS * (attempt + 1);
      await sleep(delayMs);
      attempt += 1;
    }
  }

  return {
    message:
      input.targetSaleStatus === "OUTOFSTOCK"
        ? "Sale status updated to out of stock."
        : "Sale status updated to on sale.",
  };
}

async function applyConfirmedChannelProductAvailabilityUpdate(input: {
  context: NaverRequestContext;
  channelProductNo: string;
  targetStockQuantity: number | null;
  targetSaleStatus: NaverBulkPriceTargetSaleStatus | null;
  targetDisplayStatus: Extract<NaverBulkPriceDisplayStatus, "ON"> | null;
  inventoryUpdated: boolean;
  displayStatusUpdated: boolean;
}) {
  let attempt = 0;

  while (true) {
    try {
      const { payload } =
        await requestNaverJsonWithContext<NaverChannelProductDetailPayload>({
          context: input.context,
          method: "GET",
          path: `/v2/products/channel-products/${encodeURIComponent(input.channelProductNo)}`,
        });
      const detailPayload = asObject(payload) ?? {};
      const originProduct = asObject(detailPayload.originProduct);
      if (!originProduct) {
        throw new Error("NAVER channel product detail did not include originProduct.");
      }

      const smartstoreChannelProduct = asObject(detailPayload.smartstoreChannelProduct);
      if (!smartstoreChannelProduct) {
        throw new Error(
          "NAVER channel product detail did not include smartstoreChannelProduct.",
        );
      }

      const requestBody: Record<string, unknown> = {
        ...detailPayload,
        originProduct: {
          ...originProduct,
          ...(input.targetSaleStatus !== null
            ? { statusType: input.targetSaleStatus }
            : {}),
          ...(input.targetStockQuantity !== null
            ? { stockQuantity: Math.trunc(input.targetStockQuantity) }
            : {}),
        },
        smartstoreChannelProduct: {
          ...smartstoreChannelProduct,
          ...(input.targetDisplayStatus !== null
            ? { channelProductDisplayStatusType: input.targetDisplayStatus }
            : {}),
        },
      };

      await requestNaverJsonWithContext({
        context: input.context,
        method: "PUT",
        path: `/v2/products/channel-products/${encodeURIComponent(input.channelProductNo)}`,
        body: requestBody,
      });

      return {
        message: buildAvailabilityUpdateMessage({
          inventoryUpdated: input.inventoryUpdated,
          displayStatusUpdated: input.displayStatusUpdated,
        }),
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update NAVER availability.";
      const canRetry =
        isRetryableNaverProductRequestError(message) &&
        attempt < NAVER_PRODUCT_UPDATE_RETRY_COUNT;

      if (!canRetry) {
        throw error;
      }

      const delayMs = NAVER_PRODUCT_UPDATE_RETRY_DELAY_MS * (attempt + 1);
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

export async function updateNaverProductSalePrice(input: {
  storeId: string;
  originProductNo: string;
  channelProductNo?: string | null;
  newPrice: number;
}) {
  const context = await createNaverRequestContext(input.storeId);
  const before = await fetchNaverProductPricePreviewWithContext({
    context,
    originProductNo: input.originProductNo,
    channelProductNo: input.channelProductNo ?? null,
  });

  return applyConfirmedSalePriceUpdate({
    context,
    preview: before,
    newPrice: input.newPrice,
  });
}

export async function updateNaverProductSaleStatus(input: {
  storeId: string;
  originProductNo: string;
  channelProductNo?: string | null;
  saleStatus: NaverBulkPriceTargetSaleStatus;
  stockQuantity?: number | null;
}) {
  const context = await createNaverRequestContext(input.storeId);
  const current = await fetchNaverProductSaleStatusSnapshotWithContext({
    context,
    originProductNo: input.originProductNo,
    channelProductNo: input.channelProductNo ?? null,
  });

  return applyConfirmedSaleStatusUpdate({
    context,
    originProductNo: current.originProductNo,
    targetSaleStatus: input.saleStatus,
    currentSaleStatus: current.saleStatusCode,
    stockQuantity: input.stockQuantity ?? current.stockQuantity,
  });
}

export async function syncNaverProductAvailability(input: {
  storeId: string;
  originProductNo: string;
  channelProductNo?: string | null;
  targetSaleStatus?: NaverBulkPriceTargetSaleStatus | null;
  targetStockQuantity?: number | null;
  targetDisplayStatus?: Extract<NaverBulkPriceDisplayStatus, "ON"> | null;
}): Promise<NaverAvailabilityUpdateResult> {
  const context = await createNaverRequestContext(input.storeId);
  const current = await fetchNaverProductSaleStatusSnapshotWithContext({
    context,
    originProductNo: input.originProductNo,
    channelProductNo: input.channelProductNo ?? null,
  });

  const targetSaleStatus = input.targetSaleStatus ?? null;
  const targetStockQuantity = input.targetStockQuantity ?? null;
  const targetDisplayStatus = input.targetDisplayStatus ?? null;
  const inventoryUpdated =
    targetStockQuantity !== null && current.stockQuantity !== targetStockQuantity;
  const saleStatusUpdated =
    targetSaleStatus !== null && current.saleStatusCode !== targetSaleStatus;
  const displayStatusUpdated =
    targetDisplayStatus !== null && current.displayStatusCode !== targetDisplayStatus;
  const messages: string[] = [];

  if (targetSaleStatus !== null) {
    const saleStatusResult = await applyConfirmedSaleStatusUpdate({
      context,
      originProductNo: current.originProductNo,
      targetSaleStatus,
      currentSaleStatus: current.saleStatusCode,
      stockQuantity:
        targetStockQuantity !== null ? targetStockQuantity : current.stockQuantity,
    });
    if (saleStatusUpdated) {
      messages.push(saleStatusResult.message);
    }
  }

  if (inventoryUpdated || displayStatusUpdated) {
    const channelProductNo = current.channelProductNo ?? input.channelProductNo ?? null;
    if (!channelProductNo) {
      throw new Error(
        "channelProductNo is required to update NAVER stock or display status.",
      );
    }

    const availabilityResult = await applyConfirmedChannelProductAvailabilityUpdate({
      context,
      channelProductNo,
      targetStockQuantity,
      targetSaleStatus,
      targetDisplayStatus,
      inventoryUpdated,
      displayStatusUpdated,
    });
    messages.push(availabilityResult.message);
  }

  return {
    messages,
    inventoryUpdated,
    saleStatusUpdated,
    displayStatusUpdated,
  };
}

export async function previewNaverProductSalePrices(input: {
  storeId: string;
  items: NaverBulkPriceTarget[];
}) {
  if (!input.items.length) {
    throw new Error("At least one product must be selected.");
  }

  const items = await mapWithConcurrency(input.items, 5, async (target) => {
    try {
      const preview = await fetchNaverProductPricePreview({
        storeId: input.storeId,
        originProductNo: target.originProductNo,
        channelProductNo: target.channelProductNo,
      });

      return buildBulkPreviewItem(target, preview);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load NAVER product preview.";
      return buildBulkPreviewErrorItem(target, message);
    }
  });

  return {
    items,
    summary: {
      total: items.length,
      readyCount: items.filter((item) => item.status === "ready").length,
      invalidCount: items.filter((item) => item.status === "invalid").length,
      errorCount: items.filter((item) => item.status === "error").length,
    },
    previewedAt: new Date().toISOString(),
  } satisfies NaverBulkPricePreviewResponse;
}

export async function bulkUpdateNaverProductSalePrices(input: {
  storeId: string;
  items: NaverBulkPriceTarget[];
}) {
  const previewResponse = await previewNaverProductSalePrices(input);
  const context = await createNaverRequestContext(input.storeId);

  const items = await mapWithConcurrency(previewResponse.items, 4, async (preview) => {
    if (preview.status === "invalid") {
      return buildBulkUpdateResult(
        preview,
        "skipped",
        preview.validationMessage ?? "Validation failed.",
        null,
      );
    }

    if (preview.status === "error") {
      return buildBulkUpdateResult(
        preview,
        "failed",
        preview.validationMessage ?? "Failed to load product preview.",
        null,
      );
    }

    if (preview.newPrice === null) {
      return buildBulkUpdateResult(preview, "skipped", "New price is required.", null);
    }

    try {
      const result = await applyConfirmedSalePriceUpdate({
        context,
        preview,
        newPrice: preview.newPrice,
      });

      return buildBulkUpdateResult(preview, "succeeded", result.message, result.appliedAt);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update NAVER sale price.";
      return buildBulkUpdateResult(preview, "failed", message, null);
    }
  });

  return {
    items,
    summary: {
      total: items.length,
      succeededCount: items.filter((item) => item.status === "succeeded").length,
      failedCount: items.filter((item) => item.status === "failed").length,
      skippedCount: items.filter((item) => item.status === "skipped").length,
    },
    completedAt: new Date().toISOString(),
  } satisfies NaverBulkPriceUpdateResponse;
}
