import {
  COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE,
  isCoupangInvoiceAlreadyProcessedResult,
  type CoupangActionKey,
  type CoupangActionItemResult,
  type CoupangBatchActionResponse,
  type CoupangCancelOrderTarget,
  type CoupangCancelType,
  type CoupangCustomerServiceSummaryItem,
  type CoupangCustomerServiceSummaryRequestItem,
  type CoupangCustomerServiceSummaryResponse,
  type CoupangExchangeConfirmTarget,
  type CoupangExchangeDetail,
  type CoupangExchangeDetailResponse,
  type CoupangExchangeInvoiceTarget,
  type CoupangExchangeRejectTarget,
  type CoupangExchangeRow,
  type CoupangInvoiceTarget,
  type CoupangOrderDetail,
  type CoupangOrderDetailResponse,
  type CoupangOrderListResponse,
  type CoupangOrderRow,
  type CoupangPrepareTarget,
  type CoupangReturnActionTarget,
  type CoupangReturnCollectionInvoiceTarget,
  type CoupangReturnDetail,
  type CoupangReturnDetailResponse,
  type CoupangReturnRow,
  type CoupangSettlementHistoryRow,
  type CoupangSettlementListResponse,
  type CoupangSettlementRow,
  type CoupangSimpleListResponse,
} from "@shared/coupang";
import {
  buildCoupangCustomerServiceIssueState,
  coupangSettingsStore,
  getSampleCoupangExchangeDetail,
  getSampleCoupangExchanges,
  getSampleCoupangOrderDetail,
  getSampleCoupangOrders,
  getSampleCoupangReturnDetail,
  getSampleCoupangReturns,
  getSampleCoupangSettlements,
  requestCoupangJson,
} from "../../../infra/coupang/order-deps";

type StoredCoupangStore = NonNullable<Awaited<ReturnType<typeof coupangSettingsStore.getStore>>>;
type LooseObject = Record<string, unknown>;
type ActionStatus = CoupangActionItemResult["status"];
type ReturnCancelType = Exclude<CoupangCancelType, "ALL">;

const DEFAULT_RANGE_DAYS = 6;
const RETURN_LOOKUP_RANGE_DAYS = 14;
const MAX_PREPARE_COUNT = 50;
const MAX_SETTLEMENT_PAGE_COUNT = 5;
const ACTION_CONCURRENCY = 4;
const CUSTOMER_SERVICE_SUMMARY_TTL_MS = 10 * 60_000;
const ORDER_SHEET_STATUSES = [
  "ACCEPT",
  "INSTRUCT",
  "DEPARTURE",
  "DELIVERING",
  "FINAL_DELIVERY",
  "NONE_TRACKING",
] as const;
const MAX_ORDER_SHEET_PAGE_COUNT = 100;
const ORDER_SHEET_STATUS_FETCH_CONCURRENCY = 1;

type CustomerServiceLookupSnapshot = {
  relatedReturnRequests: CoupangReturnRow[];
  relatedExchangeRequests: CoupangExchangeRow[];
  fetchedAt: string;
};

type CustomerServiceLookupResult =
  | {
      source: "live";
      servedFromCache: boolean;
      cacheState: "live" | "fresh-cache";
      message: null;
      lookup: CustomerServiceLookupSnapshot;
    }
  | {
      source: "fallback";
      servedFromCache: false;
      cacheState: "stale-cache";
      message: string;
      lookup: null;
    };

const customerServiceLookupCache = new Map<string, CustomerServiceLookupSnapshot>();
const customerServiceLookupInFlight = new Map<string, Promise<CustomerServiceLookupResult>>();

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

function clampPageSize(value: number | undefined, fallback = 20) {
  return Math.max(1, Math.min(value ?? fallback, 50));
}

function readMoney(value: unknown) {
  const objectValue = asObject(value);
  if (!objectValue) {
    return asNumber(value);
  }

  const units = asNumber(objectValue.units) ?? 0;
  const nanos = asNumber(objectValue.nanos) ?? 0;
  return units + nanos / 1_000_000_000;
}

function resolveOrderTotalPrice(input: {
  quantity: number | null;
  salesPrice: number | null;
  orderPrice: number | null;
}) {
  if (input.orderPrice !== null) {
    return input.orderPrice;
  }

  if (input.salesPrice === null || input.quantity === null) {
    return null;
  }

  return input.salesPrice * input.quantity;
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

function formatSeoulDate(date: Date) {
  const seoul = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = seoul.getUTCFullYear();
  const month = String(seoul.getUTCMonth() + 1).padStart(2, "0");
  const day = String(seoul.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSeoulTimeFrame(date: Date, edge: "start" | "end") {
  const day = formatSeoulDate(date);
  return `${day}T${edge === "end" ? "23:59" : "00:00"}`;
}

function normalizeDateRangeInput(value: string | undefined, edge: "start" | "end") {
  if (!value) {
    const date = new Date();
    date.setDate(date.getDate() + (edge === "start" ? -DEFAULT_RANGE_DAYS : 0));
    return formatSeoulDate(date);
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

function normalizeTimeFrameValue(value: string | undefined, edge: "start" | "end") {
  if (!value) {
    const date = new Date();
    date.setDate(date.getDate() + (edge === "start" ? -RETURN_LOOKUP_RANGE_DAYS : 0));
    return formatSeoulTimeFrame(date, edge);
  }

  if (value.includes("T")) {
    return value.slice(0, 16);
  }

  return `${value}T${edge === "end" ? "23:59" : "00:00"}`;
}

function normalizeOrderSheetTimeFrameValue(value: string | undefined, edge: "start" | "end") {
  if (!value) {
    const date = new Date();
    date.setDate(date.getDate() + (edge === "start" ? -DEFAULT_RANGE_DAYS : 0));
    const day = formatSeoulDate(date);
    return `${day}T${edge === "end" ? "23:59:59" : "00:00:00"}+09:00`;
  }

  if (value.includes("+")) {
    return value;
  }

  const normalized = value.includes("T")
    ? value
    : `${value}T${edge === "end" ? "23:59:59" : "00:00:00"}`;

  return `${normalized}+09:00`;
}

function appendMessage(base: string | null, next: string | null) {
  if (!base) {
    return next;
  }

  if (!next) {
    return base;
  }

  return `${base} ${next}`;
}

function resolveOrderClaimLookupRange(referenceAt: string | null | undefined) {
  const today = new Date();
  const parsed = referenceAt ? new Date(referenceAt) : today;
  const baseline = Number.isNaN(parsed.getTime()) ? today : parsed;
  const from = new Date(baseline);
  from.setDate(from.getDate() - 30);

  return {
    createdAtFrom: formatSeoulDate(from),
    createdAtTo: formatSeoulDate(today),
  };
}

function matchesReturnRequestToOrderRow(row: CoupangOrderRow, request: CoupangReturnRow) {
  if (request.orderId && request.orderId !== row.orderId) {
    return false;
  }

  if (request.shipmentBoxId && request.shipmentBoxId !== row.shipmentBoxId) {
    return false;
  }

  if (request.vendorItemId && row.vendorItemId) {
    return request.vendorItemId === row.vendorItemId;
  }

  return true;
}

function matchesExchangeRequestToOrderRow(row: CoupangOrderRow, request: CoupangExchangeRow) {
  if (request.orderId && request.orderId !== row.orderId) {
    return false;
  }

  const shipmentBoxCandidates = [
    request.originalShipmentBoxId,
    request.shipmentBoxId,
  ].filter((value): value is string => Boolean(value));

  if (shipmentBoxCandidates.length > 0 && !shipmentBoxCandidates.includes(row.shipmentBoxId)) {
    return false;
  }

  if (request.vendorItemId && row.vendorItemId) {
    return request.vendorItemId === row.vendorItemId;
  }

  if (request.sellerProductId && row.sellerProductId) {
    return request.sellerProductId === row.sellerProductId;
  }

  return true;
}

function buildUnknownCustomerServiceFields(): Pick<
  CoupangOrderRow,
  | "customerServiceIssueCount"
  | "customerServiceIssueSummary"
  | "customerServiceIssueBreakdown"
  | "customerServiceState"
  | "customerServiceFetchedAt"
> {
  return {
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: "unknown" as const,
    customerServiceFetchedAt: null,
  };
}

function applyUnknownCustomerServiceState(row: CoupangOrderRow): CoupangOrderRow {
  if (
    row.customerServiceIssueCount === 0 &&
    row.customerServiceIssueSummary === null &&
    row.customerServiceIssueBreakdown.length === 0 &&
    row.customerServiceState === "unknown" &&
    row.customerServiceFetchedAt === null
  ) {
    return row;
  }

  return {
    ...row,
    ...buildUnknownCustomerServiceFields(),
  };
}

function applyCustomerServiceLookupToOrderRow(
  row: Pick<CoupangOrderRow, "orderId" | "shipmentBoxId" | "vendorItemId" | "sellerProductId">,
  lookup: CustomerServiceLookupSnapshot,
): Pick<
  CoupangOrderRow,
  | "customerServiceIssueCount"
  | "customerServiceIssueSummary"
  | "customerServiceIssueBreakdown"
  | "customerServiceState"
  | "customerServiceFetchedAt"
> {
  const matchedReturns = lookup.relatedReturnRequests.filter((request) =>
    matchesReturnRequestToOrderRow(row as CoupangOrderRow, request),
  );
  const matchedExchanges = lookup.relatedExchangeRequests.filter((request) =>
    matchesExchangeRequestToOrderRow(row as CoupangOrderRow, request),
  );
  const customerServiceIssueState = buildCoupangCustomerServiceIssueState({
    relatedReturnRequests: matchedReturns,
    relatedExchangeRequests: matchedExchanges,
  });

  return {
    ...customerServiceIssueState,
    customerServiceState: "ready" as const,
    customerServiceFetchedAt: lookup.fetchedAt,
  };
}

function buildCustomerServiceLookupCacheKey(input: {
  storeId: string;
  createdAtFrom?: string;
  createdAtTo?: string;
}) {
  const createdAtFrom = normalizeDateRangeInput(input.createdAtFrom, "start");
  const createdAtTo = normalizeDateRangeInput(input.createdAtTo, "end");
  return [input.storeId, createdAtFrom, createdAtTo].join(":");
}

function isFreshCustomerServiceLookup(snapshot: CustomerServiceLookupSnapshot | null | undefined) {
  if (!snapshot) {
    return false;
  }

  const fetchedAtMs = Date.parse(snapshot.fetchedAt);
  if (Number.isNaN(fetchedAtMs)) {
    return false;
  }

  return Date.now() - fetchedAtMs < CUSTOMER_SERVICE_SUMMARY_TTL_MS;
}

async function loadCustomerServiceLookup(input: {
  storeId: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  forceRefresh?: boolean;
}): Promise<CustomerServiceLookupResult> {
  const normalizedInput = {
    storeId: input.storeId,
    createdAtFrom: normalizeDateRangeInput(input.createdAtFrom, "start"),
    createdAtTo: normalizeDateRangeInput(input.createdAtTo, "end"),
  };
  const cacheKey = buildCustomerServiceLookupCacheKey(normalizedInput);
  const cached = customerServiceLookupCache.get(cacheKey) ?? null;

  if (!input.forceRefresh && cached && isFreshCustomerServiceLookup(cached)) {
    return {
      source: "live",
      servedFromCache: true,
      cacheState: "fresh-cache",
      message: null,
      lookup: structuredClone(cached),
    };
  }

  const inFlight = customerServiceLookupInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const refreshPromise: Promise<CustomerServiceLookupResult> = (async () => {
    const [returnsResult, cancelsResult, exchangesResult] = await Promise.allSettled([
      listReturns({
        storeId: normalizedInput.storeId,
        cancelType: "RETURN",
        createdAtFrom: normalizedInput.createdAtFrom,
        createdAtTo: normalizedInput.createdAtTo,
      }),
      listReturns({
        storeId: normalizedInput.storeId,
        cancelType: "CANCEL",
        createdAtFrom: normalizedInput.createdAtFrom,
        createdAtTo: normalizedInput.createdAtTo,
      }),
      listExchanges({
        storeId: normalizedInput.storeId,
        createdAtFrom: normalizedInput.createdAtFrom,
        createdAtTo: normalizedInput.createdAtTo,
        maxPerPage: 50,
      }),
    ]);

    const claimLookupFailed =
      returnsResult.status !== "fulfilled" ||
      cancelsResult.status !== "fulfilled" ||
      exchangesResult.status !== "fulfilled" ||
      returnsResult.value.source !== "live" ||
      cancelsResult.value.source !== "live" ||
      exchangesResult.value.source !== "live";

    if (claimLookupFailed) {
      return {
        source: "fallback" as const,
        servedFromCache: false as const,
        cacheState: "stale-cache" as const,
        message: "CS/클레임 조회에 실패해 목록 상태를 갱신하지 못했습니다.",
        lookup: null,
      };
    }

    const snapshot = {
      relatedReturnRequests: [...returnsResult.value.items, ...cancelsResult.value.items],
      relatedExchangeRequests: exchangesResult.value.items,
      fetchedAt: new Date().toISOString(),
    } satisfies CustomerServiceLookupSnapshot;

    customerServiceLookupCache.set(cacheKey, structuredClone(snapshot));

    return {
      source: "live" as const,
      servedFromCache: false as const,
      cacheState: "live" as const,
      message: null,
      lookup: snapshot,
    };
  })().finally(() => {
    customerServiceLookupInFlight.delete(cacheKey);
  });

  customerServiceLookupInFlight.set(cacheKey, refreshPromise);
  return refreshPromise;
}

async function enrichOrdersWithCustomerServiceIssues(input: {
  storeId: string;
  rows: CoupangOrderRow[];
  createdAtFrom?: string;
}): Promise<{
  items: CoupangOrderRow[];
  message: string | null;
}> {
  if (!input.rows.length) {
    return {
      items: input.rows,
      message: null,
    };
  }

  const lookupResult = await loadCustomerServiceLookup({
    storeId: input.storeId,
    createdAtFrom: input.createdAtFrom,
    createdAtTo: formatSeoulDate(new Date()),
  });

  if (lookupResult.source !== "live" || !lookupResult.lookup) {
    return {
      items: input.rows.map(applyUnknownCustomerServiceState),
      message: "CS/클레임 조회에 실패해 상태 표시는 생략했습니다.",
    };
  }

  const relatedReturnRequests = lookupResult.lookup.relatedReturnRequests;
  const relatedExchangeRequests = lookupResult.lookup.relatedExchangeRequests;

  return {
    items: input.rows.map((row) => {
      const matchedReturns = relatedReturnRequests.filter((request) =>
        matchesReturnRequestToOrderRow(row, request),
      );
      const matchedExchanges = relatedExchangeRequests.filter((request) =>
        matchesExchangeRequestToOrderRow(row, request),
      );
      const customerServiceIssueState = buildCoupangCustomerServiceIssueState({
        relatedReturnRequests: matchedReturns,
        relatedExchangeRequests: matchedExchanges,
      });

      return {
        ...row,
        ...customerServiceIssueState,
        customerServiceState: "ready",
        customerServiceFetchedAt: lookupResult.lookup.fetchedAt,
      };
    }),
    message: null,
  };
}

function formatReceiverAddress(receiver: LooseObject | null) {
  const addr1 = asString(receiver?.addr1);
  const addr2 = asString(receiver?.addr2);
  if (addr1 && addr2) {
    return `${addr1} ${addr2}`;
  }

  return addr1 ?? addr2 ?? null;
}

function normalizeText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function stripSellerProductNamePrefix(
  candidate: string | null | undefined,
  sellerProductName: string | null | undefined,
) {
  const normalizedCandidate = normalizeText(candidate);
  const normalizedSellerProductName = normalizeText(sellerProductName);

  if (!normalizedCandidate) {
    return null;
  }

  if (!normalizedSellerProductName) {
    return normalizedCandidate;
  }

  if (normalizedCandidate === normalizedSellerProductName) {
    return null;
  }

  const separators = [" / ", ", ", " - ", " | ", "/", ",", "-", "|"];

  for (const separator of separators) {
    const prefix = `${normalizedSellerProductName}${separator}`;
    if (!normalizedCandidate.startsWith(prefix)) {
      continue;
    }

    const stripped = normalizeText(normalizedCandidate.slice(prefix.length));
    if (stripped && stripped !== normalizedSellerProductName) {
      return stripped;
    }
  }

  return normalizedCandidate;
}

function resolveOrderOptionName(input: {
  item: LooseObject | null;
  shipment: LooseObject;
  sellerProductName: string | null;
}) {
  const itemName = normalizeText(asString(input.item?.itemName));
  if (itemName) {
    return itemName;
  }

  const vendorItemCandidates = [
    asString(input.item?.vendorItemName),
    asString(input.shipment.vendorItemName),
  ];

  for (const candidate of vendorItemCandidates) {
    const optionName = stripSellerProductNamePrefix(candidate, input.sellerProductName);
    if (optionName) {
      return optionName;
    }
  }

  return null;
}

function stringifyDigits(value: string, field: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${field} must be a numeric string.`);
  }

  return normalized;
}

function quoteJson(value: string) {
  return JSON.stringify(value);
}

function getActionMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
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

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function summarizeActionItems(items: CoupangActionItemResult[]) {
  return {
    total: items.length,
    succeededCount: items.filter((item) => item.status === "succeeded").length,
    failedCount: items.filter((item) => item.status === "failed").length,
    warningCount: items.filter((item) => item.status === "warning").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
  };
}

function buildActionResponse(items: CoupangActionItemResult[]): CoupangBatchActionResponse {
  return {
    items,
    summary: summarizeActionItems(items),
    completedAt: new Date().toISOString(),
  };
}

function isRetryableOrderSheetLookupError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const retryable =
    "retryable" in error && typeof error.retryable === "boolean" ? error.retryable : false;
  if (retryable) {
    return true;
  }

  const status = "status" in error && typeof error.status === "number" ? error.status : null;
  return status === 429 || status === 503 || status === 504;
}

async function requestOrdersForStatus(
  store: StoredCoupangStore,
  input: {
    createdAtFrom?: string;
    createdAtTo?: string;
    status: (typeof ORDER_SHEET_STATUSES)[number];
    maxPerPage: number;
    fetchAllPages: boolean;
  },
) {
  const execute = async () =>
    input.fetchAllPages
      ? requestAllOrderPages(store, {
          createdAtFrom: input.createdAtFrom,
          createdAtTo: input.createdAtTo,
          status: input.status,
          maxPerPage: input.maxPerPage,
        })
      : requestOrders(store, {
          createdAtFrom: input.createdAtFrom,
          createdAtTo: input.createdAtTo,
          status: input.status,
          maxPerPage: input.maxPerPage,
        });

  try {
    return await execute();
  } catch (error) {
    if (!isRetryableOrderSheetLookupError(error)) {
      throw error;
    }

    return execute();
  }
}

function createActionItem(input: {
  action: CoupangActionKey;
  targetId: string;
  shipmentBoxId?: string | null;
  orderId?: string | null;
  receiptId?: string | null;
  vendorItemId?: string | null;
  status: ActionStatus;
  resultCode?: string | null;
  retryRequired?: boolean;
  message: string;
  appliedAt?: string | null;
}): CoupangActionItemResult {
  return {
    targetId: input.targetId,
    action: input.action,
    shipmentBoxId: input.shipmentBoxId ?? null,
    orderId: input.orderId ?? null,
    receiptId: input.receiptId ?? null,
    vendorItemId: input.vendorItemId ?? null,
    status: input.status,
    resultCode: input.resultCode ?? null,
    retryRequired: input.retryRequired ?? false,
    message: input.message,
    appliedAt: input.appliedAt ?? null,
  };
}

function buildOrderAvailableActions(input: {
  status: string | null;
  invoiceNumber: string | null;
}) {
  const status = (input.status ?? "").toUpperCase();
  const actions: CoupangActionKey[] = [];

  if (status === "ACCEPT") {
    actions.push("markPreparing", "cancelOrderItem");
  }

  if (status === "INSTRUCT") {
    actions.push("uploadInvoice", "cancelOrderItem");
  }

  if (["DEPARTURE", "DELIVERING", "FINAL_DELIVERY", "NONE_TRACKING"].includes(status)) {
    actions.push("updateInvoice");
  }

  if (!input.invoiceNumber && status === "INSTRUCT" && !actions.includes("uploadInvoice")) {
    actions.push("uploadInvoice");
  }

  return actions;
}

function parseSortableTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareOrderRowsByRecency(left: CoupangOrderRow, right: CoupangOrderRow) {
  const rightTime = Math.max(
    parseSortableTimestamp(right.orderedAt),
    parseSortableTimestamp(right.paidAt),
  );
  const leftTime = Math.max(
    parseSortableTimestamp(left.orderedAt),
    parseSortableTimestamp(left.paidAt),
  );

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  const rightDateText = right.orderedAt ?? right.paidAt ?? "";
  const leftDateText = left.orderedAt ?? left.paidAt ?? "";
  if (rightDateText !== leftDateText) {
    return rightDateText.localeCompare(leftDateText);
  }

  const rightKey = `${right.shipmentBoxId}:${right.orderId}:${right.vendorItemId ?? right.productName}`;
  const leftKey = `${left.shipmentBoxId}:${left.orderId}:${left.vendorItemId ?? left.productName}`;
  return rightKey.localeCompare(leftKey);
}

function buildOrderRowIdentity(row: CoupangOrderRow) {
  return [
    row.shipmentBoxId,
    row.orderId,
    row.vendorItemId ?? "",
    row.sellerProductId ?? "",
    row.externalVendorSku ?? "",
    row.productName,
  ].join("|");
}

function mergeOrderRows(rows: CoupangOrderRow[], maxItems = Number.MAX_SAFE_INTEGER) {
  const deduped = new Map<string, CoupangOrderRow>();

  for (const row of [...rows].sort(compareOrderRowsByRecency)) {
    const key = buildOrderRowIdentity(row);
    if (!deduped.has(key)) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values()).slice(0, maxItems);
}

function normalizeOrderRow(input: {
  shipment: LooseObject;
  item: LooseObject | null;
  fallbackKey: string;
}): CoupangOrderRow {
  const shipment = input.shipment;
  const item = input.item;
  const receiver = asObject(shipment.receiver);
  const shipmentBoxId = asString(shipment.shipmentBoxId);
  const orderId = asString(shipment.orderId);
  const vendorItemId = asString(item?.vendorItemId) ?? asString(shipment.vendorItemId);
  const sellerProductId = asString(item?.sellerProductId) ?? asString(shipment.sellerProductId);
  const sellerProductName = asString(item?.sellerProductName) ?? asString(shipment.sellerProductName);
  const quantity =
    asNumber(item?.shippingCount) ??
    asNumber(item?.orderItemQuantity) ??
    asNumber(shipment.orderItemQuantity) ??
    asNumber(shipment.purchaseCount);
  const salesPrice = readMoney(item?.salesPrice ?? shipment.salesPrice);
  const orderPrice = resolveOrderTotalPrice({
    quantity,
    salesPrice,
    orderPrice: readMoney(item?.orderPrice),
  });
  const uniqueItemKey =
    vendorItemId ??
    sellerProductId ??
    asString(item?.externalVendorSkuCode) ??
    asString(item?.externalVendorSku) ??
    input.fallbackKey;

  return {
    id: `${shipmentBoxId ?? orderId ?? "order"}:${uniqueItemKey}`,
    shipmentBoxId: shipmentBoxId ?? "-",
    orderId: orderId ?? "-",
    orderedAt: asString(shipment.orderedAt),
    paidAt: asString(shipment.paidAt),
    status: asString(shipment.status) ?? "-",
    ordererName: asString(asObject(shipment.orderer)?.name),
    receiverName: asString(receiver?.name),
    receiverSafeNumber: asString(receiver?.safeNumber),
    receiverAddress: formatReceiverAddress(receiver),
    receiverPostCode: asString(receiver?.postCode),
    productName:
      asString(item?.vendorItemName) ??
      sellerProductName ??
      asString(shipment.vendorItemName) ??
      "주문 상품",
    optionName: resolveOrderOptionName({
      item,
      shipment,
      sellerProductName,
    }),
    sellerProductId,
    sellerProductName,
    vendorItemId,
    externalVendorSku: asString(item?.externalVendorSkuCode) ?? asString(item?.externalVendorSku),
    quantity,
    salesPrice,
    orderPrice,
    discountPrice: readMoney(item?.discountPrice),
    cancelCount: asNumber(item?.cancelCount),
    holdCountForCancel: asNumber(item?.holdCountForCancel),
    deliveryCompanyName: asString(shipment.deliveryCompanyName),
    deliveryCompanyCode: asString(shipment.deliveryCompanyCode),
    invoiceNumber: asString(shipment.invoiceNumber),
    invoiceNumberUploadDate: asString(item?.invoiceNumberUploadDate),
    estimatedShippingDate: asString(item?.estimatedShippingDate),
    inTransitDateTime: asString(shipment.inTrasitDateTime) ?? asString(shipment.inTransitDateTime),
    deliveredDate: asString(shipment.deliveredDate),
    shipmentType: asString(shipment.shipmentType),
    splitShipping: asBoolean(shipment.splitShipping),
    ableSplitShipping: asBoolean(shipment.ableSplitShipping),
    ...buildUnknownCustomerServiceFields(),
    availableActions: buildOrderAvailableActions({
      status: asString(shipment.status),
      invoiceNumber: asString(shipment.invoiceNumber),
    }),
  };
}

function flattenOrderRows(payload: unknown) {
  return asArray(asObject(payload)?.data)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .flatMap((shipment, shipmentIndex) => {
      const orderItems = asArray(shipment.orderItems)
        .map((item) => asObject(item))
        .filter((item): item is LooseObject => Boolean(item));

      if (!orderItems.length) {
        return [
          normalizeOrderRow({
            shipment,
            item: null,
            fallbackKey: String(shipmentIndex),
          }),
        ];
      }

      return orderItems.map((item, itemIndex) =>
        normalizeOrderRow({
          shipment,
          item,
          fallbackKey: `${shipmentIndex}:${itemIndex}`,
        }),
      );
    });
}

async function requestOrders(
  store: StoredCoupangStore,
  input: {
    createdAtFrom?: string;
    createdAtTo?: string;
    status?: string;
    nextToken?: string | null;
    maxPerPage?: number;
  },
) {
  const query = new URLSearchParams({
    createdAtFrom: normalizeOrderSheetTimeFrameValue(input.createdAtFrom, "start"),
    createdAtTo: normalizeOrderSheetTimeFrameValue(input.createdAtTo, "end"),
    maxPerPage: String(clampPageSize(input.maxPerPage)),
  });

  if (input.status) {
    query.set("status", input.status);
  }

  if (input.nextToken) {
    query.set("nextToken", input.nextToken);
  }

  return requestCoupangJson<{
    data?: LooseObject[];
    nextToken?: string;
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path: `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(store.vendorId)}/ordersheets`,
    query,
  });
}

async function requestAllOrderPages(
  store: StoredCoupangStore,
  input: {
    createdAtFrom?: string;
    createdAtTo?: string;
    status?: string;
    nextToken?: string | null;
    maxPerPage?: number;
  },
) {
  const rows: CoupangOrderRow[] = [];
  let nextToken = input.nextToken ?? null;
  let pageCount = 0;

  while (pageCount < MAX_ORDER_SHEET_PAGE_COUNT) {
    const payload = await requestOrders(store, {
      ...input,
      nextToken,
    });
    rows.push(...flattenOrderRows(payload));

    const receivedNextToken = asString(payload.nextToken);
    pageCount += 1;

    if (!receivedNextToken || receivedNextToken === nextToken) {
      return {
        items: mergeOrderRows(rows),
        nextToken: null,
      };
    }

    nextToken = receivedNextToken;
  }

  return {
    items: mergeOrderRows(rows),
    nextToken,
  };
}

async function requestOrderByShipmentBoxId(store: StoredCoupangStore, shipmentBoxId: string) {
  return requestCoupangJson<{
    data?: LooseObject;
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path:
      `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(store.vendorId)}` +
      `/ordersheets/${encodeURIComponent(shipmentBoxId)}`,
  });
}

async function requestOrderByOrderId(store: StoredCoupangStore, orderId: string) {
  return requestCoupangJson<{
    data?: LooseObject[] | LooseObject;
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path:
      `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(store.vendorId)}` +
      `/${encodeURIComponent(orderId)}/ordersheets`,
  });
}

async function requestReturnReceipts(
  store: StoredCoupangStore,
  input: {
    createdAtFrom?: string;
    createdAtTo?: string;
    status?: string;
    orderId?: string;
    cancelType?: Exclude<CoupangCancelType, "ALL">;
  },
) {
  const cancelType = input.cancelType ?? "RETURN";
  const query = new URLSearchParams({
    searchType: "timeFrame",
    createdAtFrom: normalizeTimeFrameValue(input.createdAtFrom, "start"),
    createdAtTo: normalizeTimeFrameValue(input.createdAtTo, "end"),
    cancelType,
  });

  if (input.status && cancelType !== "CANCEL") {
    query.set("status", input.status);
  }

  if (input.orderId) {
    query.set("orderId", input.orderId);
  }

  return requestCoupangJson<{
    data?: LooseObject[];
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path: `/v2/providers/openapi/apis/api/v6/vendors/${encodeURIComponent(store.vendorId)}/returnRequests`,
    query,
  });
}

async function requestReturnDetail(store: StoredCoupangStore, receiptId: string) {
  return requestCoupangJson<{
    data?: LooseObject;
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path:
      `/v2/providers/openapi/apis/api/v6/vendors/${encodeURIComponent(store.vendorId)}` +
      `/returnRequests/${encodeURIComponent(receiptId)}`,
  });
}

async function requestRevenueHistory(
  store: StoredCoupangStore,
  input: {
    recognitionDateFrom?: string;
    recognitionDateTo?: string;
    token?: string | null;
    maxPerPage?: number;
  },
) {
  const query = new URLSearchParams({
    vendorId: store.vendorId,
    recognitionDateFrom: normalizeDateRangeInput(input.recognitionDateFrom, "start"),
    recognitionDateTo: normalizeDateRangeInput(input.recognitionDateTo, "end"),
    token: input.token ?? "",
    maxPerPage: String(Math.max(1, Math.min(input.maxPerPage ?? 50, 50))),
  });

  return requestCoupangJson<{
    data?: LooseObject[];
    hasNext?: boolean;
    nextToken?: string;
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path: "/v2/providers/openapi/apis/api/v1/revenue-history",
    query,
  });
}

async function requestSettlementHistories(
  store: StoredCoupangStore,
  revenueRecognitionYearMonth: string,
) {
  return requestCoupangJson<{
    data?: LooseObject[];
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path: "/v2/providers/marketplace_openapi/apis/api/v1/settlement-histories",
    query: new URLSearchParams({
      revenueRecognitionYearMonth,
    }),
  });
}

function monthRangeBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);
  const items: string[] = [];

  while (cursor <= endCursor) {
    items.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return items;
}

function buildReturnActionAvailability(row: {
  status: string | null;
  releaseStatus: string | null;
  cancelType: ReturnCancelType;
}) {
  const status = (row.status ?? "").toUpperCase();
  const releaseStatus = (row.releaseStatus ?? "").toUpperCase();
  const cancelType = row.cancelType;
  const releasePending = releaseStatus === "N";
  const canManageStop =
    cancelType === "CANCEL" &&
    (status === "RU" ||
      status === "UC" ||
      status === "RELEASE_STOP_UNCHECKED" ||
      status === "RETURNS_UNCHECKED");
  const canConfirmInbound = cancelType === "RETURN" && status === "RETURNS_UNCHECKED";
  const canApproveReturn =
    cancelType === "RETURN" &&
    (status === "VENDOR_WAREHOUSE_CONFIRM" || status === "REQUEST_COUPANG_CHECK");
  const canUploadCollectionInvoice = cancelType === "RETURN" && status === "RETURNS_UNCHECKED";

  return {
    canMarkShipmentStopped: canManageStop && releasePending,
    canMarkAlreadyShipped: canManageStop && releasePending,
    canApproveReturn,
    canConfirmInbound,
    canUploadCollectionInvoice,
  };
}

function normalizeReturnRows(
  payload: unknown,
  input: {
    cancelType?: ReturnCancelType;
  },
) {
  return asArray(asObject(payload)?.data)
    .map((receipt) => asObject(receipt))
    .filter((receipt): receipt is LooseObject => Boolean(receipt))
    .flatMap((receipt, receiptIndex) => {
      const deliveryInfo = asObject(asArray(receipt.returnDeliveryDtos)[0]);
      const items = asArray(receipt.returnItems)
        .map((item) => asObject(item))
        .filter((item): item is LooseObject => Boolean(item));

      return items.map((item, itemIndex) => {
        const cancelType =
          (asString(receipt.cancelType) as ReturnCancelType | null) ??
          input.cancelType ??
          "RETURN";
        const availability = buildReturnActionAvailability({
          status: asString(receipt.status),
          releaseStatus: asString(item.releaseStatus),
          cancelType,
        });

        return {
          id: `${asString(receipt.receiptId) ?? "receipt"}:${receiptIndex}:${itemIndex}`,
          receiptId: asString(receipt.receiptId) ?? "-",
          orderId: asString(receipt.orderId),
          status: asString(receipt.status) ?? "-",
          cancelType,
          receiptType: asString(receipt.receiptType),
          returnDeliveryType: asString(receipt.returnDeliveryType),
          releaseStatus: asString(item.releaseStatus),
          releaseStatusName: asString(item.releaseStatusName),
          productName:
            asString(item.sellerProductName) ??
            asString(item.vendorItemPackageName) ??
            asString(item.vendorItemName) ??
            "취소/환불 상품",
          sellerProductId: asString(item.sellerProductId),
          sellerProductName: asString(item.sellerProductName),
          vendorItemId: asString(item.vendorItemId),
          vendorItemName: asString(item.vendorItemName),
          shipmentBoxId: asString(item.shipmentBoxId),
          purchaseCount: asNumber(item.purchaseCount),
          cancelCount: asNumber(item.cancelCount),
          createdAt: asString(receipt.createdAt),
          modifiedAt: asString(receipt.modifiedAt),
          completeConfirmDate: asString(receipt.completeConfirmDate),
          completeConfirmType: asString(receipt.completeConfirmType),
          reasonCode: asString(receipt.reasonCode),
          reason: asString(receipt.reasonCodeText) ?? asString(receipt.reason),
          faultByType: asString(receipt.faultByType),
          preRefund: asBoolean(receipt.preRefund),
          requesterName: asString(receipt.returnCustomerName),
          requesterPhone: asString(receipt.returnPhone),
          requesterMobile: asString(receipt.returnMobile),
          requesterAddress:
            [asString(receipt.returnAddress), asString(receipt.returnAddressDetail)]
              .filter(Boolean)
              .join(" ") || null,
          requesterPostCode: asString(receipt.returnAddressZipCode),
          deliveryCompanyCode: asString(deliveryInfo?.deliveryCompanyCode),
          deliveryInvoiceNo: asString(deliveryInfo?.deliveryInvoiceNo),
          retrievalChargeAmount:
            readMoney(receipt.retrievalChargeAmount) ??
            readMoney(receipt.returnChargeAmount) ??
            asNumber(receipt.returnCharge),
          canMarkShipmentStopped: availability.canMarkShipmentStopped,
          canMarkAlreadyShipped: availability.canMarkAlreadyShipped,
          canApproveReturn: availability.canApproveReturn,
          canConfirmInbound: availability.canConfirmInbound,
          canUploadCollectionInvoice: availability.canUploadCollectionInvoice,
        };
      });
    });
}

function buildExchangeActionAvailability(row: {
  status: string | null;
  collectStatus: string | null;
  invoiceNumber: string | null;
}) {
  const status = (row.status ?? "").toUpperCase();
  const collectStatus = (row.collectStatus ?? "").toUpperCase();
  const canConfirmInbound =
    collectStatus === "COMPLETECOLLECT" ||
    collectStatus === "COMPLETE_COLLECT" ||
    collectStatus === "COLLECT_COMPLETED";
  const canReject = status === "RECEIPT" || status === "PROGRESS";
  const canUploadExchangeInvoice =
    (status === "PROGRESS" || status === "RECEIPT") && !row.invoiceNumber;

  return {
    canConfirmInbound,
    canReject,
    canUploadExchangeInvoice,
  };
}

function normalizeExchangeRows(payload: unknown) {
  return asArray(asObject(payload)?.data)
    .map((row) => asObject(row))
    .filter((row): row is LooseObject => row !== null)
    .map((row, rowIndex) => {
      const invoiceGroup = asObject(asArray(row.deliveryInvoiceGroupDtos)[0]);
      const deliveryInvoice = asObject(asArray(invoiceGroup?.deliveryInvoiceDtos)[0]);
      const invoiceItem = asObject(asArray(deliveryInvoice?.invoiceVendorItemDtos)[0]);
      const exchangeItem = asObject(asArray(row.exchangeItems)[0]);
      const availability = buildExchangeActionAvailability({
        status: asString(row.exchangeStatus) ?? asString(row.exchangeStatusLabel),
        collectStatus:
          asString(row.collectStatus) ?? asString(exchangeItem?.collectStatus) ?? null,
        invoiceNumber: asString(deliveryInvoice?.invoiceNumber),
      });

      return {
        exchangeId: asString(row.exchangeId) ?? `exchange-${rowIndex}`,
        orderId: asString(row.orderId),
        status: asString(row.exchangeStatus) ?? asString(row.exchangeStatusLabel) ?? "-",
        orderDeliveryStatusCode: asString(row.orderDeliveryStatusCode),
        collectStatus: asString(row.collectStatus) ?? asString(exchangeItem?.collectStatus),
        collectCompleteDate: asString(row.collectCompleteDate),
        createdAt: asString(row.createdAt),
        modifiedAt: asString(row.modifiedAt),
        reasonCode: asString(row.exchangeReasonCode),
        reason:
          asString(row.reasonCodeText) ??
          asString(row.exchangeReasonText) ??
          asString(row.reason) ??
          null,
        reasonDetail: asString(row.reasonEtcDetail),
        productName:
          asString(exchangeItem?.orderItemName) ??
          asString(row.orderItemName) ??
          asString(invoiceItem?.vendorItemName) ??
          "교환 상품",
        vendorItemId:
          asString(exchangeItem?.vendorItemId) ??
          asString(invoiceItem?.vendorItemId) ??
          asString(row.vendorItemId),
        vendorItemName:
          asString(exchangeItem?.vendorItemName) ??
          asString(invoiceItem?.vendorItemName),
        sellerProductId:
          asString(exchangeItem?.sellerProductId) ?? asString(invoiceItem?.sellerProductId),
        sellerProductName:
          asString(exchangeItem?.sellerProductName) ?? asString(invoiceItem?.sellerProductName),
        shipmentBoxId: asString(invoiceGroup?.shipmentBoxId),
        originalShipmentBoxId: asString(exchangeItem?.shipmentBoxId),
        quantity: asNumber(exchangeItem?.exchangeCount) ?? asNumber(exchangeItem?.count),
        returnCustomerName: asString(row.returnCustomerName),
        returnMobile: asString(row.returnMobile),
        returnAddress:
          [asString(row.returnAddress), asString(row.returnAddressDetail)]
            .filter(Boolean)
            .join(" ") || null,
        deliveryCustomerName: asString(row.deliveryCustomerName),
        deliveryMobile: asString(row.deliveryMobile),
        deliveryAddress:
          [asString(row.deliveryAddress), asString(row.deliveryAddressDetail)]
            .filter(Boolean)
            .join(" ") || null,
        deliverCode: asString(deliveryInvoice?.deliverCode),
        invoiceNumber: asString(deliveryInvoice?.invoiceNumber),
        canConfirmInbound: availability.canConfirmInbound,
        canReject: availability.canReject,
        canUploadExchangeInvoice: availability.canUploadExchangeInvoice,
      } satisfies CoupangExchangeRow;
    });
}

async function requestExchanges(
  store: StoredCoupangStore,
  input?: {
    createdAtFrom?: string;
    createdAtTo?: string;
    status?: string;
    orderId?: string;
    maxPerPage?: number;
  },
) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    createdAtFrom:
      input?.createdAtFrom && input.createdAtFrom.includes("T")
        ? input.createdAtFrom
        : `${normalizeDateRangeInput(input?.createdAtFrom, "start")}T00:00:00`,
    createdAtTo:
      input?.createdAtTo && input.createdAtTo.includes("T")
        ? input.createdAtTo
        : `${normalizeDateRangeInput(input?.createdAtTo, "end")}T23:59:59`,
    maxPerPage: String(Math.max(1, Math.min(input?.maxPerPage ?? 20, 50))),
  });

  if (!input?.createdAtFrom) {
    query.set("createdAtFrom", `${formatSeoulDate(weekAgo)}T00:00:00`);
  }
  if (!input?.createdAtTo) {
    query.set("createdAtTo", `${formatSeoulDate(now)}T23:59:59`);
  }
  if (input?.status) {
    query.set("status", input.status);
  }
  if (input?.orderId) {
    query.set("orderId", input.orderId);
  }

  return requestCoupangJson<{
    data?: LooseObject[];
  }>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: "GET",
    path: `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}/exchangeRequests`,
    query,
  });
}

function buildPrepareBody(vendorId: string, items: CoupangPrepareTarget[]) {
  return `{"vendorId":${quoteJson(vendorId)},"shipmentBoxIds":[${items
    .map((item) => stringifyDigits(item.shipmentBoxId, "shipmentBoxId"))
    .join(",")} ]}`.replace(" ]}", "]}");
}

function buildInvoiceBody(vendorId: string, items: CoupangInvoiceTarget[]) {
  const rows = items.map((item) => {
    const estimatedShippingDate =
      item.estimatedShippingDate && item.estimatedShippingDate.trim()
        ? quoteJson(item.estimatedShippingDate.trim())
        : quoteJson("");

    return `{"shipmentBoxId":${stringifyDigits(item.shipmentBoxId, "shipmentBoxId")},"orderId":${stringifyDigits(
      item.orderId,
      "orderId",
    )},"vendorItemId":${stringifyDigits(
      item.vendorItemId,
      "vendorItemId",
    )},"deliveryCompanyCode":${quoteJson(
      item.deliveryCompanyCode.trim(),
    )},"invoiceNumber":${quoteJson(item.invoiceNumber.trim())},"splitShipping":${String(
      Boolean(item.splitShipping),
    )},"preSplitShipped":${String(Boolean(item.preSplitShipped))},"estimatedShippingDate":${estimatedShippingDate}}`;
  });

  return `{"vendorId":${quoteJson(vendorId)},"orderSheetInvoiceApplyDtos":[${rows.join(",")}]}`;
}

function buildReturnStopBody(vendorId: string, item: CoupangReturnActionTarget) {
  const cancelCount = Number(item.cancelCount ?? 0);
  if (!Number.isFinite(cancelCount) || cancelCount <= 0) {
    throw new Error("cancelCount must be greater than 0.");
  }

  return `{"vendorId":${quoteJson(vendorId)},"receiptId":${stringifyDigits(
    item.receiptId,
    "receiptId",
  )},"cancelCount":${Math.floor(cancelCount)}}`;
}

function buildAlreadyShippedBody(vendorId: string, item: CoupangReturnActionTarget) {
  if (!item.deliveryCompanyCode?.trim()) {
    throw new Error("deliveryCompanyCode is required.");
  }

  if (!item.invoiceNumber?.trim()) {
    throw new Error("invoiceNumber is required.");
  }

  return `{"vendorId":${quoteJson(vendorId)},"receiptId":${stringifyDigits(
    item.receiptId,
    "receiptId",
  )},"deliveryCompanyCode":${quoteJson(
    item.deliveryCompanyCode.trim(),
  )},"invoiceNumber":${quoteJson(item.invoiceNumber.trim())}}`;
}

function buildReturnReceiveConfirmationBody(vendorId: string, item: CoupangReturnActionTarget) {
  return `{"vendorId":${quoteJson(vendorId)},"receiptId":${stringifyDigits(
    item.receiptId,
    "receiptId",
  )}}`;
}

function buildReturnApprovalBody(vendorId: string, item: CoupangReturnActionTarget) {
  const cancelCount = Number(item.cancelCount ?? 0);
  if (!Number.isFinite(cancelCount) || cancelCount <= 0) {
    throw new Error("cancelCount must be greater than 0.");
  }

  return `{"vendorId":${quoteJson(vendorId)},"receiptId":${stringifyDigits(
    item.receiptId,
    "receiptId",
  )},"cancelCount":${Math.floor(cancelCount)}}`;
}

function buildReturnCollectionInvoiceBody(item: CoupangReturnCollectionInvoiceTarget) {
  if (!item.deliveryCompanyCode.trim()) {
    throw new Error("deliveryCompanyCode is required.");
  }
  if (!item.invoiceNumber.trim()) {
    throw new Error("invoiceNumber is required.");
  }

  return `{"returnExchangeDeliveryType":${quoteJson(
    item.returnExchangeDeliveryType,
  )},"receiptId":${stringifyDigits(item.receiptId, "receiptId")},"deliveryCompanyCode":${quoteJson(
    item.deliveryCompanyCode.trim(),
  )},"invoiceNumber":${quoteJson(item.invoiceNumber.trim())},"regNumber":${quoteJson(
    item.regNumber?.trim() ?? "",
  )}}`;
}

function buildExchangeReceiveConfirmationBody(vendorId: string, item: CoupangExchangeConfirmTarget) {
  return `{"vendorId":${quoteJson(vendorId)},"exchangeId":${stringifyDigits(
    item.exchangeId,
    "exchangeId",
  )}}`;
}

function buildExchangeRejectBody(vendorId: string, item: CoupangExchangeRejectTarget) {
  return `{"vendorId":${quoteJson(vendorId)},"exchangeId":${stringifyDigits(
    item.exchangeId,
    "exchangeId",
  )},"exchangeRejectCode":${quoteJson(item.exchangeRejectCode)}}`;
}

function buildExchangeInvoiceBody(vendorId: string, items: CoupangExchangeInvoiceTarget[]) {
  const rows = items.map((item) => {
    if (!item.goodsDeliveryCode.trim()) {
      throw new Error("goodsDeliveryCode is required.");
    }
    if (!item.invoiceNumber.trim()) {
      throw new Error("invoiceNumber is required.");
    }
    return `{"exchangeId":${stringifyDigits(item.exchangeId, "exchangeId")},"vendorId":${quoteJson(
      vendorId,
    )},"shipmentBoxId":${stringifyDigits(
      item.shipmentBoxId,
      "shipmentBoxId",
    )},"goodsDeliveryCode":${quoteJson(
      item.goodsDeliveryCode.trim(),
    )},"invoiceNumber":${quoteJson(item.invoiceNumber.trim())}}`;
  });

  return `[${rows.join(",")}]`;
}

function buildCancelOrderBody(vendorId: string, item: CoupangCancelOrderTarget) {
  if (!item.userId.trim()) {
    throw new Error("userId is required.");
  }

  if (!Number.isFinite(item.receiptCount) || item.receiptCount <= 0) {
    throw new Error("receiptCount must be greater than 0.");
  }

  return `{"orderId":${stringifyDigits(item.orderId, "orderId")},"vendorItemIds":[${stringifyDigits(
    item.vendorItemId,
    "vendorItemId",
  )}],"receiptCounts":[${Math.floor(
    item.receiptCount,
  )}],"bigCancelCode":"CANERR","middleCancelCode":${quoteJson(
    item.middleCancelCode,
  )},"userId":${quoteJson(item.userId.trim())},"vendorId":${quoteJson(vendorId)}}`;
}

function normalizeBatchResponseList(
  payload: unknown,
  input: {
    action: CoupangActionKey;
    orderIdByShipmentBox?: Map<string, string | null>;
    vendorItemIdByShipmentBox?: Map<string, string | null>;
  },
) {
  const data = asObject(asObject(payload)?.data);
  const responseList = asArray(data?.responseList)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item));

  return responseList.map((item) => {
    const shipmentBoxId = asString(item.shipmentBoxId) ?? null;
    const resultCode = asString(item.resultCode);
    const retryRequired = asBoolean(item.retryRequired) ?? false;
    const succeed = asBoolean(item.succeed) ?? false;
    const message =
      asString(item.resultMessage) ?? (succeed ? "泥섎━?섏뿀?듬땲??" : "泥섎━???ㅽ뙣?덉뒿?덈떎.");
    const alreadyProcessed =
      !succeed &&
      !retryRequired &&
      (input.action === "uploadInvoice" || input.action === "updateInvoice") &&
      isCoupangInvoiceAlreadyProcessedResult({
        resultCode,
        message,
      });

    return createActionItem({
      action: input.action,
      targetId: shipmentBoxId ?? resultCode ?? "unknown",
      shipmentBoxId,
      orderId: shipmentBoxId ? input.orderIdByShipmentBox?.get(shipmentBoxId) ?? null : null,
      vendorItemId: shipmentBoxId ? input.vendorItemIdByShipmentBox?.get(shipmentBoxId) ?? null : null,
      status: succeed || alreadyProcessed ? "succeeded" : retryRequired ? "warning" : "failed",
      resultCode,
      retryRequired: alreadyProcessed ? false : retryRequired,
      // @ts-expect-error Duplicate invoice responses are normalized below via spread overrides.
      message: asString(item.resultMessage) ?? (succeed ? "처리되었습니다." : "처리에 실패했습니다."),
      // @ts-expect-error Duplicate invoice responses are normalized below via spread overrides.
      appliedAt: succeed ? new Date().toISOString() : null,
      ...(alreadyProcessed
        ? {
            message: COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE,
            appliedAt: new Date().toISOString(),
          }
        : {
            message,
            appliedAt: succeed ? new Date().toISOString() : null,
          }),
    });
  });
}

function normalizeReturnDetail(payload: unknown, fallbackSummary?: CoupangReturnRow | null) {
  const receipt = asObject(asObject(payload)?.data);
  if (!receipt) {
    return null;
  }

  const deliveries = asArray(receipt.returnDeliveryDtos)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item) => ({
      deliveryCompanyCode: asString(item.deliveryCompanyCode),
      deliveryInvoiceNo: asString(item.deliveryInvoiceNo),
      returnDeliveryId: asString(item.returnDeliveryId),
      returnExchangeDeliveryType: asString(item.returnExchangeDeliveryType),
      regNumber: asString(item.regNumber),
    }));

  const items = asArray(receipt.returnItems)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item) => ({
      vendorItemId: asString(item.vendorItemId),
      vendorItemName: asString(item.vendorItemName),
      sellerProductId: asString(item.sellerProductId),
      sellerProductName: asString(item.sellerProductName),
      shipmentBoxId: asString(item.shipmentBoxId),
      purchaseCount: asNumber(item.purchaseCount),
      cancelCount: asNumber(item.cancelCount),
      releaseStatus: asString(item.releaseStatus),
      releaseStatusName: asString(item.releaseStatusName),
    }));

  return {
    receiptId: asString(receipt.receiptId) ?? "-",
    orderId: asString(receipt.orderId),
    status: asString(receipt.status) ?? "-",
    cancelType: ((asString(receipt.cancelType) as ReturnCancelType | null) ?? "RETURN"),
    receiptType: asString(receipt.receiptType),
    returnDeliveryType: asString(receipt.returnDeliveryType),
    completeConfirmDate: asString(receipt.completeConfirmDate),
    completeConfirmType: asString(receipt.completeConfirmType),
    createdAt: asString(receipt.createdAt),
    modifiedAt: asString(receipt.modifiedAt),
    reasonCode: asString(receipt.reasonCode),
    reason: asString(receipt.reasonCodeText) ?? asString(receipt.reason),
    faultByType: asString(receipt.faultByType),
    preRefund: asBoolean(receipt.preRefund),
    requester: {
      name: asString(receipt.returnCustomerName),
      phone: asString(receipt.returnPhone),
      mobile: asString(receipt.returnMobile),
      postCode: asString(receipt.returnAddressZipCode),
      address: asString(receipt.returnAddress),
      addressDetail: asString(receipt.returnAddressDetail),
    },
    returnCharge: {
      amount:
        readMoney(receipt.retrievalChargeAmount) ??
        readMoney(receipt.returnChargeAmount) ??
        asNumber(receipt.returnCharge),
      rawText: asString(receipt.returnChargeText),
    },
    items,
    deliveries,
    summaryRow: fallbackSummary ?? null,
  } satisfies CoupangReturnDetail;
}

function normalizeExchangeDetail(
  row: LooseObject,
  fallbackSummary?: CoupangExchangeRow | null,
) {
  const invoices = asArray(row.deliveryInvoiceGroupDtos)
    .map((group) => asObject(group))
    .filter((group): group is LooseObject => Boolean(group))
    .flatMap((group) => {
      const shipmentBoxId = asString(group.shipmentBoxId);
      return asArray(group.deliveryInvoiceDtos)
        .map((invoice) => asObject(invoice))
        .filter((invoice): invoice is LooseObject => Boolean(invoice))
        .map((invoice) => ({
          shipmentBoxId,
          orderId: asString(group.orderId),
          orderType: asString(group.orderType),
          shippingDeliveryType: asString(group.shippingDeliveryType),
          invoiceNumber: asString(invoice.invoiceNumber),
          estimatedDeliveryDate: asString(invoice.estimatedDeliveryDate),
          deliveredDate: asString(invoice.deliveredDate),
          statusCode: asString(invoice.statusCode),
          deliverCode: asString(invoice.deliverCode),
          invoiceNumberUploadDate: asString(invoice.invoiceNumberUploadDate),
          invoiceModifiable: asBoolean(invoice.deliveryInvoiceModifiable),
        }));
    });

  const items = asArray(row.exchangeItems)
    .map((item) => asObject(item))
    .filter((item): item is LooseObject => Boolean(item))
    .map((item) => ({
      vendorItemId: asString(item.vendorItemId),
      vendorItemName: asString(item.vendorItemName),
      orderItemName: asString(item.orderItemName),
      targetItemName: asString(item.targetItemName),
      quantity: asNumber(item.exchangeCount) ?? asNumber(item.count),
      shipmentBoxId: asString(item.shipmentBoxId),
      releaseStatus: asString(item.releaseStatus),
      collectStatus: asString(item.collectStatus),
    }));

  return {
    exchangeId: asString(row.exchangeId) ?? "-",
    orderId: asString(row.orderId),
    status: asString(row.exchangeStatus) ?? asString(row.exchangeStatusLabel) ?? "-",
    orderDeliveryStatusCode: asString(row.orderDeliveryStatusCode),
    collectStatus:
      asString(row.collectStatus) ?? asString(asObject(asArray(row.exchangeItems)[0])?.collectStatus),
    collectCompleteDate: asString(row.collectCompleteDate),
    createdAt: asString(row.createdAt),
    modifiedAt: asString(row.modifiedAt),
    reasonCode: asString(row.exchangeReasonCode),
    reason:
      asString(row.reasonCodeText) ?? asString(row.exchangeReasonText) ?? asString(row.reason),
    reasonDetail: asString(row.reasonEtcDetail),
    requester: {
      name: asString(row.returnCustomerName),
      phone: asString(row.returnPhone),
      mobile: asString(row.returnMobile),
      postCode: asString(row.returnAddressZipCode),
      address: asString(row.returnAddress),
      addressDetail: asString(row.returnAddressDetail),
      memo: asString(row.returnMemo),
    },
    recipient: {
      name: asString(row.deliveryCustomerName),
      phone: asString(row.deliveryPhone),
      mobile: asString(row.deliveryMobile),
      postCode: asString(row.deliveryAddressZipCode),
      address: asString(row.deliveryAddress),
      addressDetail: asString(row.deliveryAddressDetail),
      memo: asString(row.deliveryMemo),
    },
    items,
    invoices,
    summaryRow: fallbackSummary ?? null,
  };
}

function normalizeSettlementRow(
  sale: LooseObject,
  item: LooseObject,
  index: number,
): CoupangSettlementRow {
  const deliveryFee = asObject(sale.deliveryFee);
  const recognitionDate = asString(sale.recognitionDate);

  return {
    settlementId:
      `${asString(sale.orderId) ?? "order"}:${asString(item.vendorItemId) ?? index}:${recognitionDate ?? "recognition"}`,
    orderId: asString(sale.orderId),
    saleType: asString(sale.saleType),
    saleDate: asString(sale.saleDate),
    recognitionDate,
    settlementDate: asString(sale.settlementDate),
    finalSettlementDate: asString(sale.finalSettlementDate),
    productName: asString(item.productName) ?? "정산 상품",
    vendorItemName: asString(item.vendorItemName),
    vendorItemId: asString(item.vendorItemId),
    externalSellerSkuCode: asString(item.externalSellerSkuCode),
    quantity: asNumber(item.quantity),
    salesAmount: asNumber(item.salePrice),
    saleAmount: asNumber(item.saleAmount),
    settlementAmount: asNumber(item.settlementAmount),
    serviceFee: asNumber(item.serviceFee),
    serviceFeeVat: asNumber(item.serviceFeeVat),
    serviceFeeRatio: asNumber(item.serviceFeeRatio),
    sellerDiscountCoupon: asNumber(item.sellerDiscountCoupon),
    downloadableCoupon: asNumber(item.downloadableCoupon),
    deliveryFeeAmount: asNumber(deliveryFee?.amount),
    deliveryFeeSettlementAmount: asNumber(deliveryFee?.settlementAmount),
    taxType: asString(item.taxType),
    status: asString(sale.saleType) ?? "-",
    settledAt: asString(sale.settlementDate),
  };
}

function normalizeSettlementHistoryRows(payload: unknown) {
  return asArray(asObject(payload)?.data)
    .map((row) => asObject(row))
    .filter((row): row is LooseObject => Boolean(row))
    .map((row) => ({
      settlementType: asString(row.settlementType) ?? "-",
      settlementDate: asString(row.settlementDate),
      revenueRecognitionYearMonth: asString(row.revenueRecognitionYearMonth),
      revenueRecognitionDateFrom: asString(row.revenueRecognitionDateFrom),
      revenueRecognitionDateTo: asString(row.revenueRecognitionDateTo),
      totalSale: asNumber(row.totalSale),
      serviceFee: asNumber(row.serviceFee),
      settlementTargetAmount: asNumber(row.settlementTargetAmount),
      settlementAmount: asNumber(row.settlementAmount),
      lastAmount: asNumber(row.lastAmount),
      pendingReleasedAmount: asNumber(row.pendingReleasedAmount),
      sellerDiscountCoupon: asNumber(row.sellerDiscountCoupon),
      downloadableCoupon: asNumber(row.downloadableCoupon),
      deductionAmount: asNumber(row.deductionAmount),
    })) satisfies CoupangSettlementHistoryRow[];
}

function parseActionResultPayload(
  payload: unknown,
  fallbackSuccessMessage: string,
) {
  const objectPayload = asObject(payload);
  const data = asObject(objectPayload?.data);
  const resultCode = asString(data?.resultCode) ?? asString(objectPayload?.code);
  const message =
    asString(data?.resultMessage) ??
    asString(objectPayload?.message) ??
    fallbackSuccessMessage;

  return {
    resultCode,
    message,
    status:
      resultCode && resultCode !== "200" && resultCode.toUpperCase() === "FAIL"
        ? ("failed" as const)
        : ("succeeded" as const),
  };
}

export async function listOrders(input: {
  storeId: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  status?: string;
  nextToken?: string | null;
  maxPerPage?: number;
  fetchAllPages?: boolean;
  includeCustomerService?: boolean;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const normalizedStatus = input.status?.trim();
  const pageSize = clampPageSize(input.maxPerPage);
  const fetchAllPages = input.fetchAllPages === true;
  const includeCustomerService = input.includeCustomerService === true;

  if (normalizedStatus === "CANCEL") {
    return {
      store: mapStoreRef(store),
      items: [],
      nextToken: null,
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: "취소 주문은 반품/취소 메뉴에서 확인해 주세요.",
      source: "live",
    } satisfies CoupangOrderListResponse;
  }

  try {
    if (normalizedStatus) {
    const payload = fetchAllPages
      ? await requestAllOrderPages(store, {
          ...input,
          status: normalizedStatus,
          maxPerPage: pageSize,
        })
      : await requestOrders(store, {
          ...input,
          status: normalizedStatus,
          maxPerPage: pageSize,
        });
    const baseItems = "items" in payload ? payload.items : flattenOrderRows(payload);
    const enriched = includeCustomerService
      ? await enrichOrdersWithCustomerServiceIssues({
          storeId: input.storeId,
          rows: baseItems,
          createdAtFrom: input.createdAtFrom,
        })
      : {
          items: baseItems.map(applyUnknownCustomerServiceState),
          message: null,
        };
    const items = enriched.items;

    return {
      store: mapStoreRef(store),
      items: enriched.items,
      nextToken: "items" in payload ? payload.nextToken : asString(payload.nextToken),
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: items.length ? null : "조회된 주문이 없습니다.",
      source: "live",
    } satisfies CoupangOrderListResponse;

    }

    const results = await mapWithConcurrency(
      [...ORDER_SHEET_STATUSES],
      ORDER_SHEET_STATUS_FETCH_CONCURRENCY,
      async (status) => {
        try {
          const value = await requestOrdersForStatus(store, {
            createdAtFrom: input.createdAtFrom,
            createdAtTo: input.createdAtTo,
            status,
            maxPerPage: pageSize,
            fetchAllPages,
          });
          return {
            status: "fulfilled",
            value,
          } satisfies PromiseFulfilledResult<
            Awaited<ReturnType<typeof requestOrders>> | Awaited<ReturnType<typeof requestAllOrderPages>>
          >;
        } catch (reason) {
          return {
            status: "rejected",
            reason,
          } satisfies PromiseRejectedResult;
        }
      },
    );

    const baseItems = mergeOrderRows(
      results
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<
            Awaited<ReturnType<typeof requestOrders>> | Awaited<ReturnType<typeof requestAllOrderPages>>
          > => result.status === "fulfilled",
        )
        .flatMap((result) =>
          "items" in result.value ? result.value.items : flattenOrderRows(result.value),
        ),
      fetchAllPages ? Number.MAX_SAFE_INTEGER : pageSize,
    );

    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => getActionMessage(result.reason, "Order sheet lookup failed."));

    if (!baseItems.length && failures.length) {
      throw new Error(failures[0]);
    }

    const enriched = includeCustomerService
      ? await enrichOrdersWithCustomerServiceIssues({
          storeId: input.storeId,
          rows: baseItems,
          createdAtFrom: input.createdAtFrom,
        })
      : {
          items: baseItems.map(applyUnknownCustomerServiceState),
          message: null,
        };
    const items = enriched.items;

    return {
      store: mapStoreRef(store),
      items,
      nextToken: null,
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: failures.length
        ? `일부 주문 상태 조회에 실패했습니다. ${failures[0]}`
        : items.length
          ? null
          : "조회된 주문이 없습니다.",
      source: "live",
    } satisfies CoupangOrderListResponse;
  } catch (error) {
    const fallback = getSampleCoupangOrders();
    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 실연동 실패로 샘플 주문 데이터를 표시합니다.`
          : "Coupang 주문 조회에 실패해 샘플 주문 데이터를 표시합니다.",
    } satisfies CoupangOrderListResponse;
  }
}

export async function getOrderDetail(input: {
  storeId: string;
  shipmentBoxId?: string;
  orderId?: string;
  includeCustomerService?: boolean;
}) {
  const store = await getStoreOrThrow(input.storeId);

  if (!input.shipmentBoxId && !input.orderId) {
    throw new Error("shipmentBoxId or orderId is required.");
  }

  try {
    const payload = input.shipmentBoxId
      ? await requestOrderByShipmentBoxId(store, input.shipmentBoxId)
      : await requestOrderByOrderId(store, input.orderId!);
    const shipment = Array.isArray(payload.data)
      ? asObject(payload.data[0])
      : asObject(payload.data);

    if (!shipment) {
      return {
        store: mapStoreRef(store),
        item: null,
        fetchedAt: new Date().toISOString(),
        servedFromFallback: false,
        message: "상세 조회 결과가 없습니다.",
        source: "live",
      } satisfies CoupangOrderDetailResponse;
    }

    const rows = flattenOrderRows({
      data: [shipment],
    });

    const receiver = asObject(shipment.receiver);
    const orderer = asObject(shipment.orderer);
    const claimLookupRange = resolveOrderClaimLookupRange(
      asString(shipment.orderedAt) ?? asString(shipment.paidAt),
    );
    let relatedReturnRequests: CoupangReturnRow[] = [];
    let relatedExchangeRequests: CoupangExchangeRow[] = [];
    let message: string | null = null;

    if (input.includeCustomerService !== false && asString(shipment.orderId)) {
      const [returnsResult, cancelsResult, exchangesResult] = await Promise.allSettled([
        requestReturnReceipts(store, {
          orderId: asString(shipment.orderId) ?? undefined,
          cancelType: "RETURN",
          createdAtFrom: claimLookupRange.createdAtFrom,
          createdAtTo: claimLookupRange.createdAtTo,
        }),
        requestReturnReceipts(store, {
          orderId: asString(shipment.orderId) ?? undefined,
          cancelType: "CANCEL",
          createdAtFrom: claimLookupRange.createdAtFrom,
          createdAtTo: claimLookupRange.createdAtTo,
        }),
        requestExchanges(store, {
          orderId: asString(shipment.orderId) ?? undefined,
          createdAtFrom: claimLookupRange.createdAtFrom,
          createdAtTo: claimLookupRange.createdAtTo,
          maxPerPage: 50,
        }),
      ]);

      const liveRows: CoupangReturnRow[] = [];
      if (returnsResult.status === "fulfilled") {
        liveRows.push(...normalizeReturnRows(returnsResult.value, { cancelType: "RETURN" }));
      }
      if (cancelsResult.status === "fulfilled") {
        liveRows.push(...normalizeReturnRows(cancelsResult.value, { cancelType: "CANCEL" }));
      }
      if (exchangesResult.status === "fulfilled") {
        relatedExchangeRequests = normalizeExchangeRows(exchangesResult.value);
      } else {
        message = appendMessage(message, "援먰솚 ?곌퀎 議고쉶???ㅽ뙣?덉뒿?덈떎.");
      }

      if (liveRows.length) {
        relatedReturnRequests = liveRows;
      } else if (returnsResult.status === "rejected" || cancelsResult.status === "rejected") {
        message = "취소/환불 연계 조회는 실패했습니다.";
      }
    }

    return {
      store: mapStoreRef(store),
      item: {
        shipmentBoxId: asString(shipment.shipmentBoxId) ?? "-",
        orderId: asString(shipment.orderId) ?? "-",
        orderedAt: asString(shipment.orderedAt),
        paidAt: asString(shipment.paidAt),
        status: asString(shipment.status) ?? "-",
        orderer: {
          name: asString(orderer?.name),
          email: asString(orderer?.email),
          safeNumber: asString(orderer?.safeNumber),
          ordererNumber: asString(orderer?.ordererNumber),
        },
        receiver: {
          name: asString(receiver?.name),
          safeNumber: asString(receiver?.safeNumber),
          receiverNumber: asString(receiver?.receiverNumber),
          addr1: asString(receiver?.addr1),
          addr2: asString(receiver?.addr2),
          postCode: asString(receiver?.postCode),
        },
        deliveryCompanyName: asString(shipment.deliveryCompanyName),
        deliveryCompanyCode: asString(shipment.deliveryCompanyCode),
        invoiceNumber: asString(shipment.invoiceNumber),
        inTransitDateTime:
          asString(shipment.inTrasitDateTime) ?? asString(shipment.inTransitDateTime),
        deliveredDate: asString(shipment.deliveredDate),
        parcelPrintMessage: asString(shipment.parcelPrintMessage),
        shipmentType: asString(shipment.shipmentType),
        splitShipping: asBoolean(shipment.splitShipping),
        ableSplitShipping: asBoolean(shipment.ableSplitShipping),
        items: rows,
        relatedReturnRequests,
        relatedExchangeRequests,
      } satisfies CoupangOrderDetail,
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message,
      source: "live",
    } satisfies CoupangOrderDetailResponse;
  } catch (error) {
    const fallback = getSampleCoupangOrderDetail();
    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 실연동 실패로 샘플 상세를 표시합니다.`
          : "단건 주문 조회에 실패해 샘플 상세를 표시합니다.",
    } satisfies CoupangOrderDetailResponse;
  }
}

export async function getOrderCustomerServiceSummary(input: {
  storeId: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  items: CoupangCustomerServiceSummaryRequestItem[];
  forceRefresh?: boolean;
}) {
  const store = await getStoreOrThrow(input.storeId);

  if (!input.items.length) {
    return {
      store: mapStoreRef(store),
      items: [],
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: null,
      source: "live",
      cacheState: "live",
    } satisfies CoupangCustomerServiceSummaryResponse;
  }

  const lookupResult = await loadCustomerServiceLookup({
    storeId: input.storeId,
    createdAtFrom: input.createdAtFrom,
    createdAtTo: input.createdAtTo ?? formatSeoulDate(new Date()),
    forceRefresh: input.forceRefresh,
  });

  if (lookupResult.source !== "live" || !lookupResult.lookup) {
    return {
      store: mapStoreRef(store),
      items: input.items.map((item) => ({
        rowKey: item.rowKey,
        ...buildUnknownCustomerServiceFields(),
      })),
      fetchedAt: new Date().toISOString(),
      servedFromFallback: true,
      message: lookupResult.message,
      source: "fallback",
      cacheState: "stale-cache",
    } satisfies CoupangCustomerServiceSummaryResponse;
  }

  return {
    store: mapStoreRef(store),
    items: input.items.map((item) => ({
      rowKey: item.rowKey,
      ...applyCustomerServiceLookupToOrderRow(
        {
          orderId: item.orderId ?? "-",
          shipmentBoxId: item.shipmentBoxId ?? "-",
          vendorItemId: item.vendorItemId ?? null,
          sellerProductId: item.sellerProductId ?? null,
        },
        lookupResult.lookup,
      ),
    })) satisfies CoupangCustomerServiceSummaryItem[],
    fetchedAt: lookupResult.lookup.fetchedAt,
    servedFromCache: lookupResult.servedFromCache,
    servedFromFallback: false,
    message: null,
    source: "live",
    cacheState: lookupResult.cacheState,
  } satisfies CoupangCustomerServiceSummaryResponse;
}

export async function listReturns(input: {
  storeId: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  status?: string;
  orderId?: string;
  cancelType?: CoupangCancelType;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const cancelType = input.cancelType ?? "ALL";

  const loadOne = async (targetCancelType: Exclude<CoupangCancelType, "ALL">) => {
    const payload = await requestReturnReceipts(store, {
      createdAtFrom: input.createdAtFrom,
      createdAtTo: input.createdAtTo,
      status: input.status,
      orderId: input.orderId,
      cancelType: targetCancelType,
    });

    return normalizeReturnRows(payload, { cancelType: targetCancelType });
  };

  try {
    const results =
      cancelType === "ALL"
        ? await Promise.allSettled([loadOne("RETURN"), loadOne("CANCEL")])
        : await Promise.allSettled([loadOne(cancelType)]);

    const items = results
      .filter(
        (result): result is PromiseFulfilledResult<CoupangReturnRow[]> =>
          result.status === "fulfilled",
      )
      .flatMap((result) => result.value)
      .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));

    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => getActionMessage(result.reason, "Return request lookup failed."));

    if (!items.length && failures.length) {
      throw new Error(failures[0]);
    }

    return {
      store: mapStoreRef(store),
      items,
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: failures.length
        ? `일부 취소/환불 조회에 실패했습니다. ${failures[0]}`
        : items.length
          ? null
          : "조회된 취소/환불 케이스가 없습니다.",
      source: "live",
    } satisfies CoupangSimpleListResponse<CoupangReturnRow>;
  } catch (error) {
    const fallback = getSampleCoupangReturns();
    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 실연동 실패로 샘플 케이스를 표시합니다.`
          : "취소/환불 조회에 실패해 샘플 케이스를 표시합니다.",
    } satisfies CoupangSimpleListResponse<CoupangReturnRow>;
  }
}

export async function getReturnDetail(input: {
  storeId: string;
  receiptId: string;
}) {
  const store = await getStoreOrThrow(input.storeId);

  if (!input.receiptId) {
    throw new Error("receiptId is required.");
  }

  try {
    const payload = await requestReturnDetail(store, input.receiptId);
    const summaryRow =
      normalizeReturnRows(
        { data: payload.data ? [payload.data] : [] },
        {
          cancelType: "RETURN",
        },
      )[0] ?? null;
    const item = normalizeReturnDetail(payload, summaryRow);

    return {
      store: mapStoreRef(store),
      item,
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: item ? null : "상세 조회 결과가 없습니다.",
      source: "live",
    } satisfies CoupangReturnDetailResponse;
  } catch (error) {
    const fallback = getSampleCoupangReturnDetail();
    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 실연동 실패로 샘플 상세를 표시합니다.`
          : "단건 반품 조회에 실패해 샘플 상세를 표시합니다.",
    } satisfies CoupangReturnDetailResponse;
  }
}

export async function listExchanges(input: {
  storeId: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  status?: string;
  orderId?: string;
  maxPerPage?: number;
}) {
  const store = await getStoreOrThrow(input.storeId);

  try {
    const payload = await requestExchanges(store, input);
    const items = normalizeExchangeRows(payload).sort((left, right) =>
      (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
    );

    return {
      store: mapStoreRef(store),
      items,
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: items.length ? null : "조회된 교환 요청이 없습니다.",
      source: "live",
    } satisfies CoupangSimpleListResponse<CoupangExchangeRow>;
  } catch (error) {
    const fallback = getSampleCoupangExchanges();
    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 실연동 실패로 샘플 교환 데이터를 표시합니다.`
          : "교환 조회에 실패해 샘플 교환 데이터를 표시합니다.",
    } satisfies CoupangSimpleListResponse<CoupangExchangeRow>;
  }
}

export async function getExchangeDetail(input: {
  storeId: string;
  exchangeId: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  orderId?: string;
}) {
  const store = await getStoreOrThrow(input.storeId);

  if (!input.exchangeId) {
    throw new Error("exchangeId is required.");
  }

  try {
    const payload = await requestExchanges(store, {
      createdAtFrom: input.createdAtFrom,
      createdAtTo: input.createdAtTo,
      orderId: input.orderId,
      maxPerPage: 50,
    });
    const rows = asArray(payload.data)
      .map((row) => asObject(row))
      .filter((row): row is LooseObject => row !== null);
    const matched = rows.find((row) => asString(row.exchangeId) === input.exchangeId);
    const summaryRow =
      normalizeExchangeRows({
        data: matched ? [matched] : [],
      })[0] ?? null;

    return {
      store: mapStoreRef(store),
      item: matched ? normalizeExchangeDetail(matched, summaryRow) : null,
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: matched ? null : "상세 조회 결과가 없습니다.",
      source: "live",
    } satisfies CoupangExchangeDetailResponse;
  } catch (error) {
    const fallback = getSampleCoupangExchangeDetail();
    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 실연동 실패로 샘플 상세를 표시합니다.`
          : "단건 교환 조회에 실패해 샘플 상세를 표시합니다.",
    } satisfies CoupangExchangeDetailResponse;
  }
}

export async function listSettlements(input: {
  storeId: string;
  recognitionDateFrom?: string;
  recognitionDateTo?: string;
  token?: string | null;
  maxPerPage?: number;
}) {
  const store = await getStoreOrThrow(input.storeId);
  const recognitionDateFrom = normalizeDateRangeInput(input.recognitionDateFrom, "start");
  const recognitionDateTo = normalizeDateRangeInput(input.recognitionDateTo, "end");

  try {
    const allSales: LooseObject[] = [];
    let nextToken: string | null = input.token ?? "";
    let pageCount = 0;
    let lastPayload: { nextToken?: string | null; hasNext?: boolean } | null = null;

    while (pageCount < MAX_SETTLEMENT_PAGE_COUNT) {
      const payload = await requestRevenueHistory(store, {
        recognitionDateFrom,
        recognitionDateTo,
        token: pageCount === 0 ? input.token ?? "" : nextToken,
        maxPerPage: input.maxPerPage,
      });

      lastPayload = payload;
      allSales.push(
        ...asArray(payload.data)
          .map((row) => asObject(row))
          .filter((row): row is LooseObject => Boolean(row)),
      );

      nextToken = asString(payload.nextToken);
      pageCount += 1;

      if (input.token || !payload.hasNext || !nextToken) {
        break;
      }
    }

    const items = allSales.flatMap((sale, saleIndex) => {
      const saleItems = asArray(sale.items)
        .map((item) => asObject(item))
        .filter((item): item is LooseObject => Boolean(item));

      return saleItems.map((item, itemIndex) =>
        normalizeSettlementRow(sale, item, saleIndex * 100 + itemIndex),
      );
    });

    const months = monthRangeBetween(recognitionDateFrom, recognitionDateTo);
    const historyResults = await Promise.allSettled(
      months.map((yearMonth) => requestSettlementHistories(store, yearMonth)),
    );
    const histories = historyResults
      .filter(
        (result): result is PromiseFulfilledResult<{ data?: LooseObject[] }> =>
          result.status === "fulfilled",
      )
      .flatMap((result) => normalizeSettlementHistoryRows(result.value))
      .sort((left, right) => (right.settlementDate ?? "").localeCompare(left.settlementDate ?? ""));

    const historyFailures = historyResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => getActionMessage(result.reason, "Settlement history lookup failed."));

    const summary = items.reduce(
      (accumulator, item) => {
        accumulator.rowCount += 1;
        accumulator.totalSalesAmount += item.salesAmount ?? 0;
        accumulator.totalSaleAmount += item.saleAmount ?? 0;
        accumulator.totalSettlementAmount += item.settlementAmount ?? 0;
        accumulator.totalServiceFee += item.serviceFee ?? 0;
        accumulator.totalServiceFeeVat += item.serviceFeeVat ?? 0;
        accumulator.totalDeliveryFeeAmount += item.deliveryFeeAmount ?? 0;
        accumulator.totalDeliverySettlementAmount += item.deliveryFeeSettlementAmount ?? 0;
        accumulator.totalSellerDiscountCoupon += item.sellerDiscountCoupon ?? 0;
        accumulator.totalDownloadableCoupon += item.downloadableCoupon ?? 0;
        return accumulator;
      },
      {
        rowCount: 0,
        totalSalesAmount: 0,
        totalSaleAmount: 0,
        totalSettlementAmount: 0,
        totalServiceFee: 0,
        totalServiceFeeVat: 0,
        totalDeliveryFeeAmount: 0,
        totalDeliverySettlementAmount: 0,
        totalSellerDiscountCoupon: 0,
        totalDownloadableCoupon: 0,
        historySettlementAmount: histories.reduce(
          (total, row) => total + (row.settlementAmount ?? 0),
          0,
        ),
        historyFinalizedAmount: histories
          .filter((row) => row.settlementType === "MONTHLY" || row.settlementType === "RESERVE")
          .reduce((total, row) => total + (row.settlementAmount ?? 0), 0),
      },
    );

    return {
      store: mapStoreRef(store),
      items,
      histories,
      summary,
      nextToken:
        lastPayload?.hasNext && asString(lastPayload.nextToken)
          ? asString(lastPayload.nextToken)
          : null,
      fetchedAt: new Date().toISOString(),
      servedFromFallback: false,
      message: historyFailures.length
        ? `일부 정산 히스토리 조회에 실패했습니다. ${historyFailures[0]}`
        : items.length
          ? null
          : "조회된 정산 데이터가 없습니다.",
      source: "live",
    } satisfies CoupangSettlementListResponse;
  } catch (error) {
    const fallback = getSampleCoupangSettlements();

    return {
      ...fallback,
      store: mapStoreRef(store),
      message:
        error instanceof Error
          ? `${error.message} 실연동 실패로 샘플 정산 데이터를 표시합니다.`
          : "정산 조회에 실패해 샘플 정산 데이터를 표시합니다.",
    } satisfies CoupangSettlementListResponse;
  }
}

export async function markPreparing(input: {
  storeId: string;
  items: CoupangPrepareTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);

  if (!input.items.length) {
    return buildActionResponse([]);
  }

  const items: CoupangActionItemResult[] = [];

  for (let index = 0; index < input.items.length; index += MAX_PREPARE_COUNT) {
    const chunk = input.items.slice(index, index + MAX_PREPARE_COUNT);
    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "PUT",
      path:
        `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}` +
        "/ordersheets/acknowledgement",
      body: buildPrepareBody(store.vendorId, chunk),
    });

    const orderIdByShipmentBox = new Map(
      chunk.map((item) => [item.shipmentBoxId, item.orderId ?? null]),
    );
    items.push(
      ...normalizeBatchResponseList(payload, {
        action: "markPreparing",
        orderIdByShipmentBox,
      }),
    );
  }

  return buildActionResponse(items);
}

async function submitInvoiceAction(input: {
  storeId: string;
  items: CoupangInvoiceTarget[];
  mode: "upload" | "update";
}) {
  const store = await getStoreOrThrow(input.storeId);
  if (!input.items.length) {
    return buildActionResponse([]);
  }

  const path =
    input.mode === "upload"
      ? `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}/orders/invoices`
      : `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}/orders/updateInvoices`;

  const action = input.mode === "upload" ? "uploadInvoice" : "updateInvoice";
  const requestBatch = async (items: CoupangInvoiceTarget[]) => {
    const payload = await requestCoupangJson({
      credentials: {
        accessKey: store.credentials.accessKey,
        secretKey: store.credentials.secretKey,
        baseUrl: store.baseUrl,
      },
      method: "POST",
      path,
      body: buildInvoiceBody(store.vendorId, items),
    });

    const orderIdByShipmentBox = new Map(items.map((item) => [item.shipmentBoxId, item.orderId]));
    const vendorItemIdByShipmentBox = new Map(
      items.map((item) => [item.shipmentBoxId, item.vendorItemId]),
    );

    return normalizeBatchResponseList(payload, {
      action,
      orderIdByShipmentBox,
      vendorItemIdByShipmentBox,
    });
  };

  try {
    return buildActionResponse(await requestBatch(input.items));
  } catch {
    const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
      try {
        const [result] = await requestBatch([item]);
        if (result) {
          return result;
        }

        return createActionItem({
          action,
          targetId: item.shipmentBoxId,
          shipmentBoxId: item.shipmentBoxId,
          orderId: item.orderId,
          vendorItemId: item.vendorItemId,
          status: "failed",
          retryRequired: false,
          message: "송장 전송 결과를 확인하지 못했습니다.",
        });
      } catch (error) {
        return createActionItem({
          action,
          targetId: item.shipmentBoxId,
          shipmentBoxId: item.shipmentBoxId,
          orderId: item.orderId,
          vendorItemId: item.vendorItemId,
          status: "failed",
          retryRequired: false,
          message: getActionMessage(
            error,
            input.mode === "upload" ? "송장 업로드에 실패했습니다." : "송장 수정에 실패했습니다.",
          ),
        });
      }
    });

    return buildActionResponse(items);
  }
}

export async function uploadInvoice(input: {
  storeId: string;
  items: CoupangInvoiceTarget[];
}) {
  return submitInvoiceAction({
    storeId: input.storeId,
    items: input.items,
    mode: "upload",
  });
}

export async function updateInvoice(input: {
  storeId: string;
  items: CoupangInvoiceTarget[];
}) {
  return submitInvoiceAction({
    storeId: input.storeId,
    items: input.items,
    mode: "update",
  });
}

export async function confirmReturnInbound(input: {
  storeId: string;
  items: CoupangReturnActionTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
    try {
      const payload = await requestCoupangJson<{
        code?: string;
        message?: string;
        data?: LooseObject;
      }>({
        credentials: {
          accessKey: store.credentials.accessKey,
          secretKey: store.credentials.secretKey,
          baseUrl: store.baseUrl,
        },
        method: "PUT",
        path:
          `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}` +
          `/returnRequests/${encodeURIComponent(item.receiptId)}/receiveConfirmation`,
        body: buildReturnReceiveConfirmationBody(store.vendorId, item),
      });
      const parsed = parseActionResultPayload(payload, "반품 입고 확인이 완료되었습니다.");
      return createActionItem({
        action: "confirmReturnInbound",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: parsed.status,
        resultCode: parsed.resultCode,
        retryRequired: false,
        message: parsed.message,
        appliedAt: parsed.status === "succeeded" ? new Date().toISOString() : null,
      });
    } catch (error) {
      return createActionItem({
        action: "confirmReturnInbound",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: getActionMessage(error, "반품 입고 확인에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function approveReturn(input: {
  storeId: string;
  items: CoupangReturnActionTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
    try {
      const payload = await requestCoupangJson<{
        code?: string;
        message?: string;
        data?: LooseObject;
      }>({
        credentials: {
          accessKey: store.credentials.accessKey,
          secretKey: store.credentials.secretKey,
          baseUrl: store.baseUrl,
        },
        method: "PUT",
        path:
          `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}` +
          `/returnRequests/${encodeURIComponent(item.receiptId)}/approval`,
        body: buildReturnApprovalBody(store.vendorId, item),
      });
      const parsed = parseActionResultPayload(payload, "반품 승인이 완료되었습니다.");
      return createActionItem({
        action: "approveReturn",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: parsed.status,
        resultCode: parsed.resultCode,
        retryRequired: false,
        message: parsed.message,
        appliedAt: parsed.status === "succeeded" ? new Date().toISOString() : null,
      });
    } catch (error) {
      return createActionItem({
        action: "approveReturn",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: getActionMessage(error, "반품 승인에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function uploadReturnCollectionInvoice(input: {
  storeId: string;
  items: CoupangReturnCollectionInvoiceTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
    try {
      const payload = await requestCoupangJson<{
        code?: string;
        message?: string;
        data?: LooseObject;
      }>({
        credentials: {
          accessKey: store.credentials.accessKey,
          secretKey: store.credentials.secretKey,
          baseUrl: store.baseUrl,
        },
        method: "POST",
        path:
          `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}` +
          "/return-exchange-invoices/manual",
        body: buildReturnCollectionInvoiceBody(item),
      });
      const parsed = parseActionResultPayload(payload, "반품 회수 송장 등록이 완료되었습니다.");
      return createActionItem({
        action: "uploadReturnCollectionInvoice",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: parsed.status,
        resultCode: parsed.resultCode,
        retryRequired: false,
        message: parsed.message,
        appliedAt: parsed.status === "succeeded" ? new Date().toISOString() : null,
      });
    } catch (error) {
      return createActionItem({
        action: "uploadReturnCollectionInvoice",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: getActionMessage(error, "반품 회수 송장 등록에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function confirmExchangeInbound(input: {
  storeId: string;
  items: CoupangExchangeConfirmTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
    try {
      const payload = await requestCoupangJson<{
        code?: string;
        message?: string;
        data?: LooseObject;
      }>({
        credentials: {
          accessKey: store.credentials.accessKey,
          secretKey: store.credentials.secretKey,
          baseUrl: store.baseUrl,
        },
        method: "PUT",
        path:
          `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}` +
          `/exchangeRequests/${encodeURIComponent(item.exchangeId)}/receiveConfirmation`,
        body: buildExchangeReceiveConfirmationBody(store.vendorId, item),
      });
      const parsed = parseActionResultPayload(payload, "교환 입고 확인이 완료되었습니다.");
      return createActionItem({
        action: "confirmExchangeInbound",
        targetId: item.exchangeId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.exchangeId,
        vendorItemId: item.vendorItemId,
        status: parsed.status,
        resultCode: parsed.resultCode,
        retryRequired: false,
        message: parsed.message,
        appliedAt: parsed.status === "succeeded" ? new Date().toISOString() : null,
      });
    } catch (error) {
      return createActionItem({
        action: "confirmExchangeInbound",
        targetId: item.exchangeId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.exchangeId,
        vendorItemId: item.vendorItemId,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: getActionMessage(error, "교환 입고 확인에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function rejectExchange(input: {
  storeId: string;
  items: CoupangExchangeRejectTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
    try {
      const payload = await requestCoupangJson<{
        code?: string;
        message?: string;
        data?: LooseObject;
      }>({
        credentials: {
          accessKey: store.credentials.accessKey,
          secretKey: store.credentials.secretKey,
          baseUrl: store.baseUrl,
        },
        method: "PUT",
        path:
          `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}` +
          `/exchangeRequests/${encodeURIComponent(item.exchangeId)}/rejection`,
        body: buildExchangeRejectBody(store.vendorId, item),
      });
      const parsed = parseActionResultPayload(payload, "교환 거부 처리가 완료되었습니다.");
      return createActionItem({
        action: "rejectExchange",
        targetId: item.exchangeId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.exchangeId,
        vendorItemId: item.vendorItemId,
        status: parsed.status,
        resultCode: parsed.resultCode,
        retryRequired: false,
        message: parsed.message,
        appliedAt: parsed.status === "succeeded" ? new Date().toISOString() : null,
      });
    } catch (error) {
      return createActionItem({
        action: "rejectExchange",
        targetId: item.exchangeId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.exchangeId,
        vendorItemId: item.vendorItemId,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: getActionMessage(error, "교환 거부 처리에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function uploadExchangeInvoice(input: {
  storeId: string;
  items: CoupangExchangeInvoiceTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
    try {
      const payload = await requestCoupangJson<{
        code?: string;
        message?: string;
        data?: LooseObject;
      }>({
        credentials: {
          accessKey: store.credentials.accessKey,
          secretKey: store.credentials.secretKey,
          baseUrl: store.baseUrl,
        },
        method: "POST",
        path:
          `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}` +
          `/exchangeRequests/${encodeURIComponent(item.exchangeId)}/invoices`,
        body: buildExchangeInvoiceBody(store.vendorId, [item]),
      });
      const parsed = parseActionResultPayload(payload, "교환상품 송장 업로드가 완료되었습니다.");
      return createActionItem({
        action: "uploadExchangeInvoice",
        targetId: item.exchangeId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId ?? null,
        receiptId: item.exchangeId,
        vendorItemId: item.vendorItemId ?? null,
        status: parsed.status,
        resultCode: parsed.resultCode,
        retryRequired: false,
        message: parsed.message,
        appliedAt: parsed.status === "succeeded" ? new Date().toISOString() : null,
      });
    } catch (error) {
      return createActionItem({
        action: "uploadExchangeInvoice",
        targetId: item.exchangeId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId ?? null,
        receiptId: item.exchangeId,
        vendorItemId: item.vendorItemId ?? null,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: getActionMessage(error, "교환상품 송장 업로드에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function markShipmentStopped(input: {
  storeId: string;
  items: CoupangReturnActionTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
    try {
      const payload = await requestCoupangJson<{
        data?: LooseObject;
      }>({
        credentials: {
          accessKey: store.credentials.accessKey,
          secretKey: store.credentials.secretKey,
          baseUrl: store.baseUrl,
        },
        method: "PUT",
        path:
          `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}` +
          `/returnRequests/${encodeURIComponent(item.receiptId)}/stoppedShipment`,
        body: buildReturnStopBody(store.vendorId, item),
      });
      const data = asObject(payload.data);
      return createActionItem({
        action: "markShipmentStopped",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: asString(data?.resultCode) === "SUCCESS" ? "succeeded" : "failed",
        resultCode: asString(data?.resultCode),
        retryRequired: false,
        message: asString(data?.resultMessage) ?? "출고중지완료 처리가 완료되었습니다.",
        appliedAt: new Date().toISOString(),
      });
    } catch (error) {
      return createActionItem({
        action: "markShipmentStopped",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: getActionMessage(error, "출고중지완료 처리에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function markAlreadyShipped(input: {
  storeId: string;
  items: CoupangReturnActionTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
    try {
      const payload = await requestCoupangJson<{
        data?: LooseObject;
      }>({
        credentials: {
          accessKey: store.credentials.accessKey,
          secretKey: store.credentials.secretKey,
          baseUrl: store.baseUrl,
        },
        method: "PUT",
        path:
          `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}` +
          `/returnRequests/${encodeURIComponent(item.receiptId)}/completedShipment`,
        body: buildAlreadyShippedBody(store.vendorId, item),
      });
      const data = asObject(payload.data);
      return createActionItem({
        action: "markAlreadyShipped",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: asString(data?.resultCode) === "SUCCESS" ? "succeeded" : "failed",
        resultCode: asString(data?.resultCode),
        retryRequired: false,
        message: asString(data?.resultMessage) ?? "이미출고 처리가 완료되었습니다.",
        appliedAt: new Date().toISOString(),
      });
    } catch (error) {
      return createActionItem({
        action: "markAlreadyShipped",
        targetId: item.receiptId,
        shipmentBoxId: item.shipmentBoxId,
        orderId: item.orderId,
        receiptId: item.receiptId,
        vendorItemId: item.vendorItemId,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: getActionMessage(error, "이미출고 처리에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function cancelOrderItem(input: {
  storeId: string;
  items: CoupangCancelOrderTarget[];
}) {
  const store = await getStoreOrThrow(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (item) => {
    try {
      const payload = await requestCoupangJson<{
        code?: string;
        message?: string;
        data?: LooseObject;
      }>({
        credentials: {
          accessKey: store.credentials.accessKey,
          secretKey: store.credentials.secretKey,
          baseUrl: store.baseUrl,
        },
        method: "POST",
        path:
          `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(store.vendorId)}` +
          `/orders/${encodeURIComponent(item.orderId)}/cancel`,
        body: buildCancelOrderBody(store.vendorId, item),
      });

      const data = asObject(payload.data);
      const failedVendorItemIds = asArray(data?.failedVendorItemIds).map((value) => asString(value));
      const failed = failedVendorItemIds.includes(item.vendorItemId);

      return createActionItem({
        action: "cancelOrderItem",
        targetId: `${item.orderId}:${item.vendorItemId}`,
        shipmentBoxId: item.shipmentBoxId ?? null,
        orderId: item.orderId,
        vendorItemId: item.vendorItemId,
        status: failed ? "warning" : "succeeded",
        resultCode: payload.code ?? null,
        retryRequired: false,
        message:
          asString(payload.message) ??
          (failed ? "일부 취소 실패가 포함되어 있습니다." : "주문 취소 요청이 완료되었습니다."),
        appliedAt: failed ? null : new Date().toISOString(),
      });
    } catch (error) {
      return createActionItem({
        action: "cancelOrderItem",
        targetId: `${item.orderId}:${item.vendorItemId}`,
        shipmentBoxId: item.shipmentBoxId ?? null,
        orderId: item.orderId,
        vendorItemId: item.vendorItemId,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: getActionMessage(error, "주문 취소 요청에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}
