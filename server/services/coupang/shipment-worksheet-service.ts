import type {
  CollectCoupangShipmentInput,
  CoupangExchangeDetail,
  CoupangExchangeRow,
  CoupangOrderDetail,
  CoupangOrderRow,
  CoupangReturnDetail,
  CoupangReturnRow,
  CoupangShipmentSyncMode,
  CoupangShipmentWorksheetDetailResponse,
  CoupangShipmentWorksheetResponse,
  CoupangShipmentWorksheetRow,
  CoupangShipmentWorksheetSyncSummary,
  PatchCoupangShipmentWorksheetInput,
  PatchCoupangShipmentWorksheetItemInput,
} from "@shared/coupang";
import {
  getExchangeDetail,
  getOrderCustomerServiceSummary,
  getOrderDetail,
  getReturnDetail,
  listExchanges,
  listOrders,
  listReturns,
  markPreparing,
} from "./order-service";
import { buildCoupangCustomerServiceIssueState } from "./customer-service-issues";
import { getProductDetail } from "./product-service";
import { coupangSettingsStore } from "./settings-store";
import {
  coupangShipmentWorksheetStore,
  type CoupangShipmentWorksheetSyncState,
} from "./shipment-worksheet-store";

type StoredCoupangStore = NonNullable<Awaited<ReturnType<typeof coupangSettingsStore.getStore>>>;

function asStoreRef(store: StoredCoupangStore) {
  return {
    id: store.id,
    name: store.storeName,
    vendorId: store.vendorId,
  };
}

function normalizeWhitespace(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function normalizeDeliveryCode(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeInvoiceNumber(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeNullableDeliveryCode(value: string | null | undefined) {
  const trimmed = normalizeDeliveryCode(value);
  return trimmed || null;
}

function normalizeNullableInvoiceNumber(value: string | null | undefined) {
  const trimmed = normalizeInvoiceNumber(value);
  return trimmed || null;
}

function normalizePersonalClearanceCode(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().toUpperCase();
  return trimmed || null;
}

function composeReceiverName(
  baseName: string | null | undefined,
  personalClearanceCode: string | null | undefined,
  isOverseas: boolean,
) {
  const normalizedBaseName = normalizeWhitespace(baseName) ?? "-";
  const normalizedCode = normalizePersonalClearanceCode(personalClearanceCode);

  if (!isOverseas || !normalizedCode) {
    return normalizedBaseName;
  }

  return `${normalizedBaseName}_${normalizedCode}`;
}

function parseReceiverName(
  receiverName: string | null | undefined,
  isOverseas: boolean,
  fallbackBaseName?: string | null,
) {
  const normalizedReceiverName = normalizeWhitespace(receiverName);

  if (!isOverseas) {
    return {
      receiverName: normalizedReceiverName ?? "-",
      receiverBaseName: normalizedReceiverName ?? null,
      personalClearanceCode: null,
    };
  }

  if (!normalizedReceiverName) {
    return {
      receiverName: composeReceiverName(fallbackBaseName, null, true),
      receiverBaseName: normalizeWhitespace(fallbackBaseName),
      personalClearanceCode: null,
    };
  }

  const delimiterIndex = normalizedReceiverName.lastIndexOf("_");
  if (delimiterIndex <= 0 || delimiterIndex === normalizedReceiverName.length - 1) {
    return {
      receiverName: composeReceiverName(normalizedReceiverName, null, true),
      receiverBaseName: normalizedReceiverName,
      personalClearanceCode: null,
    };
  }

  const baseName = normalizedReceiverName.slice(0, delimiterIndex).trim();
  const personalClearanceCode = normalizePersonalClearanceCode(
    normalizedReceiverName.slice(delimiterIndex + 1),
  );

  return {
    receiverName: composeReceiverName(baseName, personalClearanceCode, true),
    receiverBaseName: normalizeWhitespace(baseName),
    personalClearanceCode,
  };
}

function buildSourceKey(storeId: string, row: CoupangOrderRow) {
  return [
    storeId,
    row.shipmentBoxId,
    row.vendorItemId ?? row.sellerProductId ?? row.externalVendorSku ?? row.id,
  ].join(":");
}

function toSeoulDateParts(value: string | null | undefined) {
  const parsed = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const seoul = new Date(safeDate.getTime() + 9 * 60 * 60 * 1000);
  const year = seoul.getUTCFullYear();
  const month = String(seoul.getUTCMonth() + 1).padStart(2, "0");
  const day = String(seoul.getUTCDate()).padStart(2, "0");

  return {
    key: `${year}${month}${day}`,
    text: `${month}/${day}`,
  };
}

function buildAddress(detail: CoupangOrderDetail | null, row: CoupangOrderRow) {
  const addr1 = normalizeWhitespace(detail?.receiver.addr1);
  const addr2 = normalizeWhitespace(detail?.receiver.addr2);

  if (addr1 && addr2) {
    return `${addr1} ${addr2}`;
  }

  return addr1 ?? addr2 ?? row.receiverAddress ?? null;
}

function buildExposedProductName(productName: string, optionName: string | null | undefined) {
  const normalizedOptionName = normalizeWhitespace(optionName);
  if (!normalizedOptionName) {
    return productName;
  }

  return `${productName}, ${normalizedOptionName}`;
}

function normalizeWorksheetOptionName(
  optionName: string | null | undefined,
  productName: string | null | undefined,
) {
  const normalizedOptionName = normalizeWhitespace(optionName);
  if (!normalizedOptionName) {
    return null;
  }

  const normalizedProductName = normalizeWhitespace(productName);
  if (!normalizedProductName) {
    return normalizedOptionName;
  }

  if (normalizedOptionName === normalizedProductName) {
    return null;
  }

  if (normalizedOptionName.includes(normalizedProductName)) {
    const firstCommaIndex = normalizedOptionName.indexOf(",");
    if (firstCommaIndex >= 0) {
      const stripped = normalizeWhitespace(normalizedOptionName.slice(firstCommaIndex + 1));
      if (stripped) {
        return stripped;
      }
    }
  }

  return normalizedOptionName;
}

function hasMixedWorksheetOptionName(
  optionName: string | null | undefined,
  productName: string | null | undefined,
  exposedProductName?: string | null | undefined,
) {
  const normalizedOptionName = normalizeWhitespace(optionName);
  if (!normalizedOptionName) {
    return false;
  }

  const sanitizedOptionName = normalizeWorksheetOptionName(normalizedOptionName, productName);
  if (sanitizedOptionName !== normalizedOptionName) {
    return true;
  }

  const normalizedExposedProductName = normalizeWhitespace(exposedProductName);
  return Boolean(normalizedExposedProductName && normalizedOptionName === normalizedExposedProductName);
}

function isWorksheetPlaceholderProductName(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);
  return !normalized || normalized === "주문 상품";
}

function resolvePlatformKey(store: StoredCoupangStore) {
  if (store.shipmentPlatformKey) {
    return {
      key: store.shipmentPlatformKey,
      warning: null,
    };
  }

  const derivedKey = (store.storeName.toUpperCase().match(/[A-Z0-9]/) ?? [])[0] ?? "A";
  return {
    key: derivedKey,
    warning: `배송 KEY가 비어 있어 임시 KEY ${derivedKey}를 사용했습니다. 연결 관리에서 설정해 주세요.`,
  };
}

function extractSequence(value: string) {
  const matched = value.match(/(\d{4})$/);
  if (!matched) {
    return 0;
  }

  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createSelpickAllocator(rows: CoupangShipmentWorksheetRow[]) {
  const counters = new Map<string, number>();

  for (const row of rows) {
    const counterKey = `${row.collectedAccountName}|${row.orderDateKey}`;
    const current = counters.get(counterKey) ?? 0;
    counters.set(counterKey, Math.max(current, extractSequence(row.selpickOrderNumber)));
  }

  return {
    next(collectedAccountName: string, orderDateKey: string, platformKey: string) {
      const counterKey = `${collectedAccountName}|${orderDateKey}`;
      const nextSequence = (counters.get(counterKey) ?? 0) + 1;
      counters.set(counterKey, nextSequence);
      return `O${orderDateKey}${platformKey}${String(nextSequence).padStart(4, "0")}`;
    },
  };
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

function mergeMessages(values: Array<string | null | undefined>) {
  const items = values
    .map((value) => normalizeWhitespace(value))
    .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  return items.length ? items.join(" ") : null;
}

const LEGACY_SHIPMENT_KEY_WARNING_START = "諛곗넚 KEY媛 鍮꾩뼱";
const LEGACY_SHIPMENT_KEY_WARNING_FOLLOWUP = "?곌껐 愿由ъ뿉";
const LEGACY_SHIPMENT_KEY_WARNING_END = "?덈떎.";

function normalizeLegacyWorksheetMessage(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const legacyStart = normalized.indexOf(LEGACY_SHIPMENT_KEY_WARNING_START);
  if (legacyStart < 0) {
    return normalized;
  }

  const legacySegment = normalized.slice(legacyStart);
  const followupStart = normalized.indexOf(LEGACY_SHIPMENT_KEY_WARNING_FOLLOWUP, legacyStart);
  const legacyEndSearchStart = followupStart >= 0 ? followupStart : legacyStart;
  const legacyEnd = normalized.indexOf(LEGACY_SHIPMENT_KEY_WARNING_END, legacyEndSearchStart);
  if (legacyEnd < 0) {
    return normalized;
  }

  const keyMatch = legacySegment.match(/KEY ([A-Z0-9]+)瑜/);
  const replacement =
    `배송 KEY가 비어 있어 임시 KEY ${keyMatch?.[1] ?? "A"}를 사용했습니다. ` +
    "연결 관리에서 설정해 주세요.";
  const legacyEndIndex = legacyEnd + LEGACY_SHIPMENT_KEY_WARNING_END.length;

  return `${normalized.slice(0, legacyStart)}${replacement}${normalized.slice(legacyEndIndex)}`
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function getStoreOrThrow(storeId: string) {
  const store = await coupangSettingsStore.getStore(storeId);
  if (!store) {
    throw new Error("Coupang store settings not found.");
  }

  return store as StoredCoupangStore;
}

type WorksheetStoreSheet = Awaited<ReturnType<typeof coupangShipmentWorksheetStore.getStoreSheet>>;

function buildWorksheetResponse(
  store: StoredCoupangStore,
  sheet: WorksheetStoreSheet,
  messageOverride?: string | null,
): CoupangShipmentWorksheetResponse {
  const nowIso = new Date().toISOString();

  return {
    store: asStoreRef(store),
    items: sheet.items.map((row) => decorateWorksheetRowCustomerServiceState(normalizeWorksheetRow(row), nowIso)),
    fetchedAt: new Date().toISOString(),
    collectedAt: sheet.collectedAt,
    message: normalizeLegacyWorksheetMessage(messageOverride ?? sheet.message),
    source: sheet.source,
    syncSummary: sheet.syncSummary,
  };
}

const DEFAULT_SYNC_MODE: CoupangShipmentSyncMode = "incremental";
const CUSTOMER_SERVICE_READY_TTL_MS = 10 * 60_000;
const INCREMENTAL_OVERLAP_HOURS = 24;
const FULL_RECONCILE_STALE_HOURS = 12;
const ORDER_DETAIL_REFRESH_HOURS = 6;
const SHIPMENT_WORKSHEET_STATUSES = new Set([
  "ACCEPT",
  "INSTRUCT",
  "DEPARTURE",
  "DELIVERING",
  "FINAL_DELIVERY",
  "NONE_TRACKING",
]);

type ShipmentWorksheetCandidateRow = Pick<
  CoupangOrderRow,
  "shipmentBoxId" | "orderId" | "status" | "availableActions" | "invoiceNumber"
>;

type ShipmentWorksheetCollectionCandidate = {
  row: CoupangOrderRow;
  sourceKey: string;
  currentRow: CoupangShipmentWorksheetRow | undefined;
  shouldHydrateOrder: boolean;
  shouldHydrateProduct: boolean;
  claimOnly?: boolean;
};

type ShipmentWorksheetClaimGroup = {
  sourceKey: string;
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string | null;
  sellerProductId: string | null;
  returns: CoupangReturnRow[];
  exchanges: CoupangExchangeRow[];
  matchedCandidateSourceKey: string | null;
  currentRow: CoupangShipmentWorksheetRow | undefined;
};

type ShipmentWorksheetSyncPlan = {
  mode: CoupangShipmentSyncMode;
  autoExpanded: boolean;
  fetchCreatedAtFrom: string;
  fetchCreatedAtTo: string;
  statusFilter: string | null;
};

function createEmptySyncState(): CoupangShipmentWorksheetSyncState {
  return {
    lastIncrementalCollectedAt: null,
    lastFullCollectedAt: null,
    coveredCreatedAtFrom: null,
    coveredCreatedAtTo: null,
    lastStatusFilter: null,
  };
}

function normalizeStatusFilter(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().toUpperCase();
  return trimmed || null;
}

function formatSeoulDateOnly(value: Date) {
  const shifted = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function offsetSeoulDateOnly(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatSeoulDateOnly(date);
}

function resolveClaimLookupDate(value: string | null | undefined, fallbackOffsetDays: number) {
  const parsed = value ? new Date(value) : new Date();
  if (!Number.isNaN(parsed.getTime())) {
    return formatSeoulDateOnly(parsed);
  }

  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + fallbackOffsetDays);
  return formatSeoulDateOnly(fallback);
}

function normalizeCreatedAtDate(value: string | undefined, fallbackOffsetDays: number) {
  const trimmed = (value ?? "").trim();
  if (trimmed) {
    return trimmed.includes("T") ? trimmed.slice(0, 10) : trimmed;
  }

  const date = new Date();
  date.setUTCDate(date.getUTCDate() + fallbackOffsetDays);
  return formatSeoulDateOnly(date);
}

function subtractHours(value: string, hours: number) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Date(parsed.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function isTimestampOlderThanHours(
  value: string | null | undefined,
  nowIso: string,
  hours: number,
) {
  if (!value) {
    return true;
  }

  const parsed = new Date(value);
  const now = new Date(nowIso);
  if (Number.isNaN(parsed.getTime()) || Number.isNaN(now.getTime())) {
    return true;
  }

  return now.getTime() - parsed.getTime() >= hours * 60 * 60 * 1000;
}

function isTimestampOlderThanMs(
  value: string | null | undefined,
  nowIso: string,
  thresholdMs: number,
) {
  if (!value) {
    return true;
  }

  const parsed = new Date(value);
  const now = new Date(nowIso);
  if (Number.isNaN(parsed.getTime()) || Number.isNaN(now.getTime())) {
    return true;
  }

  return now.getTime() - parsed.getTime() >= thresholdMs;
}

function resolveWorksheetCustomerServiceState(
  row: CoupangShipmentWorksheetRow | undefined,
  nowIso: string,
) {
  if (!row) {
    return {
      customerServiceIssueCount: 0,
      customerServiceIssueSummary: null,
      customerServiceIssueBreakdown: [],
      customerServiceState: "unknown" as const,
      customerServiceFetchedAt: null,
    };
  }

  const fetchedAt = row.customerServiceFetchedAt ?? row.lastOrderHydratedAt ?? null;
  if (!fetchedAt) {
    return {
      customerServiceIssueCount: row.customerServiceIssueCount ?? 0,
      customerServiceIssueSummary: row.customerServiceIssueSummary ?? null,
      customerServiceIssueBreakdown: row.customerServiceIssueBreakdown ?? [],
      customerServiceState: "unknown" as const,
      customerServiceFetchedAt: null,
    };
  }

  return {
    customerServiceIssueCount: row.customerServiceIssueCount ?? 0,
    customerServiceIssueSummary: row.customerServiceIssueSummary ?? null,
    customerServiceIssueBreakdown: row.customerServiceIssueBreakdown ?? [],
    customerServiceState: isTimestampOlderThanMs(fetchedAt, nowIso, CUSTOMER_SERVICE_READY_TTL_MS)
      ? ("stale" as const)
      : ("ready" as const),
    customerServiceFetchedAt: fetchedAt,
  };
}

function minDate(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return left.localeCompare(right) <= 0 ? left : right;
}

function maxDate(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return left.localeCompare(right) >= 0 ? left : right;
}

function maxRequestedDate(left: string, right: string) {
  return left.localeCompare(right) >= 0 ? left : right;
}

function resolveSyncPlan(
  input: CollectCoupangShipmentInput,
  currentSheet: WorksheetStoreSheet,
  nowIso: string,
): ShipmentWorksheetSyncPlan {
  const currentSyncState = currentSheet.syncState ?? createEmptySyncState();
  const requestedMode = input.syncMode === "full" ? "full" : DEFAULT_SYNC_MODE;
  const selectedCreatedAtFrom = normalizeCreatedAtDate(input.createdAtFrom, -3);
  const selectedCreatedAtTo = normalizeCreatedAtDate(input.createdAtTo, 0);
  const statusFilter = normalizeStatusFilter(input.status);
  const isFirstSync =
    !currentSheet.items.length || !currentSyncState.lastIncrementalCollectedAt;
  const expandedEarlierRange =
    Boolean(currentSyncState.coveredCreatedAtFrom) &&
    selectedCreatedAtFrom.localeCompare(currentSyncState.coveredCreatedAtFrom ?? "") < 0;
  const statusChanged = currentSyncState.lastStatusFilter !== statusFilter;
  const fullSyncStale = isTimestampOlderThanHours(
    currentSyncState.lastFullCollectedAt,
    nowIso,
    FULL_RECONCILE_STALE_HOURS,
  );

  if (requestedMode === "full") {
    return {
      mode: "full",
      autoExpanded: false,
      fetchCreatedAtFrom: selectedCreatedAtFrom,
      fetchCreatedAtTo: selectedCreatedAtTo,
      statusFilter,
    };
  }

  if (isFirstSync || expandedEarlierRange || statusChanged || fullSyncStale) {
    return {
      mode: "full",
      autoExpanded: true,
      fetchCreatedAtFrom: selectedCreatedAtFrom,
      fetchCreatedAtTo: selectedCreatedAtTo,
      statusFilter,
    };
  }

  const overlapStart = normalizeCreatedAtDate(
    subtractHours(currentSyncState.lastIncrementalCollectedAt ?? nowIso, INCREMENTAL_OVERLAP_HOURS),
    -1,
  );

  return {
    mode: "incremental",
    autoExpanded: false,
    fetchCreatedAtFrom: maxRequestedDate(selectedCreatedAtFrom, overlapStart),
    fetchCreatedAtTo: selectedCreatedAtTo,
    statusFilter,
  };
}

function buildReadCustomerServiceSyncPlan(currentSheet: WorksheetStoreSheet): ShipmentWorksheetSyncPlan {
  const syncState = currentSheet.syncState ?? createEmptySyncState();
  const syncSummary = currentSheet.syncSummary;

  return {
    mode: DEFAULT_SYNC_MODE,
    autoExpanded: false,
    fetchCreatedAtFrom:
      syncSummary?.fetchCreatedAtFrom ??
      syncState.coveredCreatedAtFrom ??
      offsetSeoulDateOnly(-30),
    fetchCreatedAtTo:
      syncSummary?.fetchCreatedAtTo ?? syncState.coveredCreatedAtTo ?? formatSeoulDateOnly(new Date()),
    statusFilter: syncSummary?.statusFilter ?? syncState.lastStatusFilter,
  };
}

function shouldHydrateOrderRow(
  row: CoupangOrderRow,
  currentRow: CoupangShipmentWorksheetRow | undefined,
  nowIso: string,
) {
  if (!currentRow) {
    return true;
  }

  if (normalizeStatusFilter(row.status) !== normalizeStatusFilter(currentRow.orderStatus)) {
    return true;
  }

  if (!currentRow.lastOrderHydratedAt) {
    return true;
  }

  if (isTimestampOlderThanHours(currentRow.lastOrderHydratedAt, nowIso, ORDER_DETAIL_REFRESH_HOURS)) {
    return true;
  }

  return !(
    normalizeWhitespace(currentRow.contact) &&
    normalizeWhitespace(currentRow.receiverAddress) &&
    normalizeWhitespace(currentRow.deliveryRequest) &&
    normalizeWhitespace(currentRow.buyerPhoneNumber)
  );
}

function shouldHydrateProductRow(
  row: CoupangOrderRow,
  currentRow: CoupangShipmentWorksheetRow | undefined,
) {
  if (!row.sellerProductId) {
    return false;
  }

  if (!currentRow) {
    return true;
  }

  if (currentRow.sellerProductId !== row.sellerProductId || currentRow.vendorItemId !== row.vendorItemId) {
    return true;
  }

  if (!currentRow.lastProductHydratedAt) {
    return true;
  }

  if (
    hasMixedWorksheetOptionName(
      currentRow.optionName,
      currentRow.productName,
      currentRow.exposedProductName,
    )
  ) {
    return true;
  }

  return !(normalizeWhitespace(currentRow.productName) && normalizeWhitespace(currentRow.optionName));
}

function resolveClaimSourceDescriptor(input: {
  storeId: string;
  shipmentBoxId?: string | null;
  orderId?: string | null;
  vendorItemId?: string | null;
  sellerProductId?: string | null;
  fallbackId: string;
}) {
  const shipmentBoxId =
    normalizeWhitespace(input.shipmentBoxId) ??
    normalizeWhitespace(input.orderId) ??
    `claim-${input.fallbackId}`;
  const itemKey =
    normalizeWhitespace(input.vendorItemId) ??
    normalizeWhitespace(input.sellerProductId) ??
    `claim-${input.fallbackId}`;

  return {
    shipmentBoxId,
    sourceKey: [input.storeId, shipmentBoxId, itemKey].join(":"),
  };
}

function matchReturnClaimCandidate(
  candidates: ShipmentWorksheetCollectionCandidate[],
  request: CoupangReturnRow,
) {
  return (
    candidates.find((candidate) =>
      matchesReturnRequestToCustomerServiceTarget(candidate.row, request),
    ) ?? null
  );
}

function matchExchangeClaimCandidate(
  candidates: ShipmentWorksheetCollectionCandidate[],
  request: CoupangExchangeRow,
) {
  return (
    candidates.find((candidate) =>
      matchesExchangeRequestToCustomerServiceTarget(candidate.row, request),
    ) ?? null
  );
}

function matchReturnWorksheetRow(
  rows: CoupangShipmentWorksheetRow[],
  request: CoupangReturnRow,
) {
  return rows.find((row) => matchesReturnRequestToCustomerServiceTarget(row, request)) ?? null;
}

function matchExchangeWorksheetRow(
  rows: CoupangShipmentWorksheetRow[],
  request: CoupangExchangeRow,
) {
  return rows.find((row) => matchesExchangeRequestToCustomerServiceTarget(row, request)) ?? null;
}

function buildClaimOnlyCollectionRow(input: {
  issueFetchedAt: string;
  currentRow: CoupangShipmentWorksheetRow | undefined;
  issueState: ReturnType<typeof buildCoupangCustomerServiceIssueState>;
  claimGroup: ShipmentWorksheetClaimGroup;
}): CoupangOrderRow {
  const primaryReturn = input.claimGroup.returns[0] ?? null;
  const primaryExchange = input.claimGroup.exchanges[0] ?? null;
  const productName =
    primaryReturn?.sellerProductName ??
    primaryExchange?.sellerProductName ??
    primaryReturn?.productName ??
    primaryExchange?.productName ??
    input.currentRow?.productName ??
    "클레임 주문";
  const optionName = normalizeWorksheetOptionName(
    primaryReturn?.vendorItemName ?? primaryExchange?.vendorItemName ?? input.currentRow?.optionName,
    productName,
  );

  return {
    id: input.currentRow?.id ?? input.claimGroup.sourceKey,
    shipmentBoxId: input.claimGroup.shipmentBoxId,
    orderId: input.claimGroup.orderId,
    orderedAt:
      primaryReturn?.createdAt ??
      primaryExchange?.createdAt ??
      input.currentRow?.orderedAtRaw ??
      null,
    paidAt: null,
    status:
      input.currentRow?.orderStatus ??
      normalizeStatusFilter(primaryReturn?.status ?? primaryExchange?.status ?? "CLAIM") ??
      "CLAIM",
    ordererName: input.currentRow?.ordererName ?? null,
    receiverName:
      primaryExchange?.deliveryCustomerName ??
      primaryReturn?.requesterName ??
      input.currentRow?.receiverBaseName ??
      input.currentRow?.receiverName ??
      "-",
    receiverSafeNumber:
      primaryExchange?.deliveryMobile ??
      primaryReturn?.requesterMobile ??
      primaryReturn?.requesterPhone ??
      input.currentRow?.contact ??
      null,
    receiverAddress:
      primaryExchange?.deliveryAddress ??
      primaryReturn?.requesterAddress ??
      input.currentRow?.receiverAddress ??
      null,
    receiverPostCode: primaryReturn?.requesterPostCode ?? null,
    productName,
    optionName,
    sellerProductId: input.claimGroup.sellerProductId,
    sellerProductName:
      primaryReturn?.sellerProductName ??
      primaryExchange?.sellerProductName ??
      input.currentRow?.productName ??
      productName,
    vendorItemId: input.claimGroup.vendorItemId,
    externalVendorSku: input.currentRow?.sellerProductCode ?? null,
    quantity:
      primaryReturn?.cancelCount ??
      primaryReturn?.purchaseCount ??
      primaryExchange?.quantity ??
      input.currentRow?.quantity ??
      1,
    salesPrice: input.currentRow?.salePrice ?? null,
    orderPrice: input.currentRow?.salePrice ?? null,
    discountPrice: 0,
    cancelCount: primaryReturn?.cancelCount ?? 0,
    holdCountForCancel: 0,
    deliveryCompanyName: null,
    deliveryCompanyCode:
      primaryExchange?.deliverCode ??
      primaryReturn?.deliveryCompanyCode ??
      input.currentRow?.coupangDeliveryCompanyCode ??
      null,
    invoiceNumber:
      primaryExchange?.invoiceNumber ??
      primaryReturn?.deliveryInvoiceNo ??
      input.currentRow?.coupangInvoiceNumber ??
      null,
    invoiceNumberUploadDate: input.currentRow?.coupangInvoiceUploadedAt ?? null,
    estimatedShippingDate: input.currentRow?.estimatedShippingDate ?? null,
    inTransitDateTime: null,
    deliveredDate: null,
    shipmentType: null,
    splitShipping: input.currentRow?.splitShipping ?? false,
    ableSplitShipping: false,
    customerServiceIssueCount: input.issueState.customerServiceIssueCount,
    customerServiceIssueSummary: input.issueState.customerServiceIssueSummary,
    customerServiceIssueBreakdown: input.issueState.customerServiceIssueBreakdown,
    customerServiceState: "ready",
    customerServiceFetchedAt: input.issueFetchedAt,
    availableActions: input.currentRow?.availableActions ?? [],
  };
}

function buildNextSyncState(
  currentSyncState: CoupangShipmentWorksheetSyncState,
  plan: ShipmentWorksheetSyncPlan,
  nowIso: string,
): CoupangShipmentWorksheetSyncState {
  return {
    lastIncrementalCollectedAt: nowIso,
    lastFullCollectedAt: plan.mode === "full" ? nowIso : currentSyncState.lastFullCollectedAt,
    coveredCreatedAtFrom: minDate(currentSyncState.coveredCreatedAtFrom, plan.fetchCreatedAtFrom),
    coveredCreatedAtTo: maxDate(currentSyncState.coveredCreatedAtTo, plan.fetchCreatedAtTo),
    lastStatusFilter: plan.statusFilter,
  };
}

function hasPersistedWorksheetCustomerServiceIssue(row: CoupangShipmentWorksheetRow) {
  return Boolean(normalizeWhitespace(row.customerServiceIssueSummary)) || row.customerServiceIssueCount > 0;
}

async function refreshWorksheetCustomerServiceStatuses(input: {
  storeId: string;
  rows: CoupangShipmentWorksheetRow[];
  syncPlan: ShipmentWorksheetSyncPlan;
  forceRefresh?: boolean;
}) {
  if (!input.rows.length) {
    return {
      rows: input.rows,
      message: null,
    };
  }

  const createdAtFrom = minDate(input.syncPlan.fetchCreatedAtFrom, offsetSeoulDateOnly(-30));
  const createdAtTo = formatSeoulDateOnly(new Date());

  try {
    const response = await getOrderCustomerServiceSummary({
      storeId: input.storeId,
      createdAtFrom: createdAtFrom ?? offsetSeoulDateOnly(-30),
      createdAtTo,
      forceRefresh: input.forceRefresh,
      items: input.rows.map((row) => ({
        rowKey: row.id,
        orderId: row.orderId,
        shipmentBoxId: row.shipmentBoxId,
        vendorItemId: row.vendorItemId,
        sellerProductId: row.sellerProductId,
      })),
    });

    if (response.source !== "live") {
      return {
        rows: input.rows,
        message:
          response.message ??
          "취소/반품 상태를 확인하지 못해 기존 쿠팡 상태를 유지했습니다.",
      };
    }

    const summaryByRowKey = new Map(response.items.map((item) => [item.rowKey, item] as const));

    return {
      rows: input.rows.map((row) => {
        const summary = summaryByRowKey.get(row.id);
        if (!summary) {
          return row;
        }

        const shouldPreserveExistingIssue =
          summary.customerServiceIssueCount === 0 && hasPersistedWorksheetCustomerServiceIssue(row);

        const nextRow = normalizeWorksheetRow({
          ...row,
          customerServiceIssueCount: shouldPreserveExistingIssue
            ? row.customerServiceIssueCount
            : summary.customerServiceIssueCount,
          customerServiceIssueSummary: shouldPreserveExistingIssue
            ? row.customerServiceIssueSummary
            : summary.customerServiceIssueSummary,
          customerServiceIssueBreakdown: shouldPreserveExistingIssue
            ? row.customerServiceIssueBreakdown
            : summary.customerServiceIssueBreakdown,
          customerServiceState: shouldPreserveExistingIssue
            ? row.customerServiceState
            : summary.customerServiceState,
          customerServiceFetchedAt: shouldPreserveExistingIssue
            ? row.customerServiceFetchedAt
            : summary.customerServiceFetchedAt,
        });

        return hasWorksheetRowChanged(row, nextRow) ? nextRow : row;
      }),
      message: response.message,
    };
  } catch (error) {
    return {
      rows: input.rows,
      message:
        error instanceof Error
          ? `취소/반품 상태를 갱신하지 못했습니다. ${error.message}`
          : "취소/반품 상태를 갱신하지 못했습니다.",
    };
  }
}

function hasManualDeliveryRequest(
  row: CoupangShipmentWorksheetRow | undefined,
) {
  if (!row?.lastOrderHydratedAt) {
    return Boolean(normalizeWhitespace(row?.deliveryRequest));
  }

  return row.updatedAt.localeCompare(row.lastOrderHydratedAt) > 0;
}

function resolveWorksheetActions(
  row: CoupangOrderRow,
  currentRow: CoupangShipmentWorksheetRow | undefined,
  preparedShipmentBoxIds: Set<string>,
) {
  if (preparedShipmentBoxIds.has(row.shipmentBoxId)) {
    return updateWorksheetActionsAfterPrepare(row.availableActions);
  }

  if (isPrepareTargetStatus(row.status) && currentRow?.availableActions.includes("uploadInvoice")) {
    return updateWorksheetActionsAfterPrepare(currentRow.availableActions);
  }

  return row.availableActions;
}

function hasWorksheetRowChanged(
  currentRow: CoupangShipmentWorksheetRow | undefined,
  nextRow: CoupangShipmentWorksheetRow,
) {
  if (!currentRow) {
    return true;
  }

  return JSON.stringify({ ...currentRow, updatedAt: nextRow.updatedAt }) !== JSON.stringify(nextRow);
}

function buildSyncSummary(input: {
  plan: ShipmentWorksheetSyncPlan;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedHydrationCount: number;
}): CoupangShipmentWorksheetSyncSummary {
  return {
    mode: input.plan.mode,
    fetchedCount: input.fetchedCount,
    insertedCount: input.insertedCount,
    updatedCount: input.updatedCount,
    skippedHydrationCount: input.skippedHydrationCount,
    autoExpanded: input.plan.autoExpanded,
    fetchCreatedAtFrom: input.plan.fetchCreatedAtFrom,
    fetchCreatedAtTo: input.plan.fetchCreatedAtTo,
    statusFilter: input.plan.statusFilter,
  };
}

export function isShipmentWorksheetCandidate(row: ShipmentWorksheetCandidateRow) {
  const normalizedStatus = (row.status ?? "").trim().toUpperCase();
  const hasShipmentIdentity =
    Boolean(normalizeWhitespace(row.shipmentBoxId)) &&
    row.shipmentBoxId !== "-" &&
    Boolean(normalizeWhitespace(row.orderId)) &&
    row.orderId !== "-";
  const hasInvoiceAction =
    row.availableActions.includes("uploadInvoice") ||
    row.availableActions.includes("updateInvoice");
  const hasInvoiceNumber = Boolean(normalizeInvoiceNumber(row.invoiceNumber));

  if (!hasShipmentIdentity) {
    return false;
  }

  return (
    hasInvoiceAction ||
    hasInvoiceNumber ||
    SHIPMENT_WORKSHEET_STATUSES.has(normalizedStatus)
  );
}

function isPrepareTargetStatus(status: string | null | undefined) {
  return (status ?? "").trim().toUpperCase() === "ACCEPT";
}

function buildPrepareTargets(rows: ShipmentWorksheetCollectionCandidate[]) {
  const targetByShipmentBoxId = new Map<
    string,
    {
      shipmentBoxId: string;
      orderId: string | null;
      productName: string | null;
    }
  >();

  for (const row of rows) {
    if (!isPrepareTargetStatus(row.row.status)) {
      continue;
    }

    const shipmentBoxId = normalizeWhitespace(row.row.shipmentBoxId);
    if (!shipmentBoxId || shipmentBoxId === "-") {
      continue;
    }

    if (!targetByShipmentBoxId.has(shipmentBoxId)) {
      targetByShipmentBoxId.set(shipmentBoxId, {
        shipmentBoxId,
        orderId: normalizeWhitespace(row.row.orderId),
        productName: normalizeWhitespace(row.row.productName),
      });
    }
  }

  return Array.from(targetByShipmentBoxId.values());
}

function updateWorksheetActionsAfterPrepare(actions: CoupangOrderRow["availableActions"]) {
  const nextActions = actions.filter((action) => action !== "markPreparing");

  if (!nextActions.includes("uploadInvoice")) {
    nextActions.unshift("uploadInvoice");
  }

  return nextActions;
}

function resolveProductOverseasFlag(
  detail: Awaited<ReturnType<typeof getProductDetail>> | null,
  row: CoupangOrderRow,
) {
  if (!detail?.item) {
    return false;
  }

  const vendorItem = detail.item.items.find((item) => item.vendorItemId === row.vendorItemId);
  return vendorItem?.pccNeeded ?? detail.item.deliveryInfo.pccNeeded ?? false;
}

function resolveWorksheetProductName(
  orderDetail: CoupangOrderDetail | null,
  detail: Awaited<ReturnType<typeof getProductDetail>> | null,
  row: CoupangOrderRow,
  currentRow: CoupangShipmentWorksheetRow | undefined,
) {
  const detailRow =
    orderDetail?.items.find((item) => item.vendorItemId && item.vendorItemId === row.vendorItemId) ??
    orderDetail?.items.find((item) => item.orderId === row.orderId && item.shipmentBoxId === row.shipmentBoxId) ??
    null;
  const detailProductName = normalizeWhitespace(detailRow?.sellerProductName);
  const detailFallbackName = isWorksheetPlaceholderProductName(detailRow?.productName)
    ? null
    : normalizeWhitespace(detailRow?.productName);
  const rowFallbackName = isWorksheetPlaceholderProductName(row.productName)
    ? null
    : normalizeWhitespace(row.productName);

  return (
    normalizeWhitespace(detail?.item?.sellerProductName) ??
    normalizeWhitespace(row.sellerProductName) ??
    detailProductName ??
    detailFallbackName ??
    rowFallbackName ??
    currentRow?.productName ??
    row.productName
  );
}

function resolveWorksheetOptionName(
  orderDetail: CoupangOrderDetail | null,
  detail: Awaited<ReturnType<typeof getProductDetail>> | null,
  row: CoupangOrderRow,
  currentRow: CoupangShipmentWorksheetRow | undefined,
  productName: string,
) {
  const detailRow =
    orderDetail?.items.find((item) => item.vendorItemId && item.vendorItemId === row.vendorItemId) ??
    orderDetail?.items.find((item) => item.orderId === row.orderId && item.shipmentBoxId === row.shipmentBoxId) ??
    null;
  const registeredOptionName = detail?.item?.items.find(
    (item) => item.vendorItemId === row.vendorItemId,
  )?.itemName;

  return (
    normalizeWorksheetOptionName(registeredOptionName, productName) ??
    normalizeWorksheetOptionName(detailRow?.optionName, productName) ??
    normalizeWorksheetOptionName(row.optionName, productName) ??
    normalizeWorksheetOptionName(currentRow?.optionName, productName) ??
    null
  );
}

function normalizeWorksheetRow(row: CoupangShipmentWorksheetRow): CoupangShipmentWorksheetRow {
  const optionName = normalizeWorksheetOptionName(row.optionName, row.productName);
  const exposedProductName = buildExposedProductName(row.productName, optionName);
  const customerServiceIssueCount = Number.isFinite(row.customerServiceIssueCount)
    ? Math.max(0, Math.trunc(row.customerServiceIssueCount))
    : 0;
  const customerServiceIssueSummary = normalizeWhitespace(row.customerServiceIssueSummary);
  const customerServiceIssueBreakdown = Array.isArray(row.customerServiceIssueBreakdown)
    ? (() => {
        const items = row.customerServiceIssueBreakdown;
        const hasInvalidItem = items.some(
          (item) =>
            !item ||
            (item.type !== "shipment_stop_requested" &&
              item.type !== "shipment_stop_handled" &&
              item.type !== "cancel" &&
              item.type !== "return" &&
              item.type !== "exchange") ||
            !Number.isFinite(item.count) ||
            typeof item.label !== "string",
        );
        return hasInvalidItem
          ? items.filter(
              (item): item is typeof item =>
                Boolean(item) &&
                (item.type === "shipment_stop_requested" ||
                  item.type === "shipment_stop_handled" ||
                  item.type === "cancel" ||
                  item.type === "return" ||
                  item.type === "exchange") &&
                Number.isFinite(item.count) &&
                typeof item.label === "string",
            )
          : items;
      })()
    : [];
  const coupangDeliveryCompanyCode = null;
  const coupangInvoiceNumber = null;
  const coupangInvoiceUploadedAt = null;

  if (
    optionName === row.optionName &&
    exposedProductName === row.exposedProductName &&
    customerServiceIssueCount === row.customerServiceIssueCount &&
    customerServiceIssueSummary === row.customerServiceIssueSummary &&
    customerServiceIssueBreakdown === row.customerServiceIssueBreakdown &&
    coupangDeliveryCompanyCode === row.coupangDeliveryCompanyCode &&
    coupangInvoiceNumber === row.coupangInvoiceNumber &&
    coupangInvoiceUploadedAt === row.coupangInvoiceUploadedAt
  ) {
    return row;
  }

  return {
    ...row,
    optionName,
    exposedProductName,
    customerServiceIssueCount,
    customerServiceIssueSummary,
    customerServiceIssueBreakdown,
    coupangDeliveryCompanyCode,
    coupangInvoiceNumber,
    coupangInvoiceUploadedAt,
  };
}

type CustomerServiceMatchTarget = {
  orderId?: string | null;
  shipmentBoxId?: string | null;
  vendorItemId?: string | null;
  sellerProductId?: string | null;
};

function matchesReturnRequestToCustomerServiceTarget(
  target: CustomerServiceMatchTarget,
  request: Pick<CoupangReturnRow, "orderId" | "shipmentBoxId" | "vendorItemId">,
) {
  if (request.orderId && target.orderId && request.orderId !== target.orderId) {
    return false;
  }

  if (
    request.shipmentBoxId &&
    target.shipmentBoxId &&
    request.shipmentBoxId !== target.shipmentBoxId
  ) {
    return false;
  }

  if (request.vendorItemId && target.vendorItemId) {
    return request.vendorItemId === target.vendorItemId;
  }

  return true;
}

function matchesExchangeRequestToCustomerServiceTarget(
  target: CustomerServiceMatchTarget,
  request: Pick<
    CoupangExchangeRow,
    "orderId" | "shipmentBoxId" | "originalShipmentBoxId" | "vendorItemId" | "sellerProductId"
  >,
) {
  if (request.orderId && target.orderId && request.orderId !== target.orderId) {
    return false;
  }

  const shipmentBoxCandidates = [request.originalShipmentBoxId, request.shipmentBoxId].filter(
    (value): value is string => Boolean(value),
  );

  if (
    shipmentBoxCandidates.length > 0 &&
    target.shipmentBoxId &&
    !shipmentBoxCandidates.includes(target.shipmentBoxId)
  ) {
    return false;
  }

  if (request.vendorItemId && target.vendorItemId) {
    return request.vendorItemId === target.vendorItemId;
  }

  if (request.sellerProductId && target.sellerProductId) {
    return request.sellerProductId === target.sellerProductId;
  }

  return true;
}

function buildShipmentWorksheetDetailCustomerServiceState(input: {
  orderDetail: Pick<CoupangOrderDetail, "relatedReturnRequests" | "relatedExchangeRequests"> | null;
  returns: CoupangReturnRow[];
  exchanges: CoupangExchangeRow[];
  hasLiveReturns: boolean;
  hasLiveExchanges: boolean;
}) {
  const relatedReturnRequests =
    input.hasLiveReturns || input.returns.length > 0
      ? input.returns
      : input.orderDetail?.relatedReturnRequests ?? [];
  const relatedExchangeRequests =
    input.hasLiveExchanges || input.exchanges.length > 0
      ? input.exchanges
      : input.orderDetail?.relatedExchangeRequests ?? [];
  const issueState = buildCoupangCustomerServiceIssueState({
    relatedReturnRequests,
    relatedExchangeRequests,
  });
  const hasReliableNoClaimSnapshot = input.hasLiveReturns && input.hasLiveExchanges;

  return {
    ...issueState,
    customerServiceState:
      hasReliableNoClaimSnapshot || issueState.customerServiceIssueCount > 0 ? "ready" : "unknown",
  } as const;
}

function decorateWorksheetRowCustomerServiceState(
  row: CoupangShipmentWorksheetRow,
  nowIso: string,
): CoupangShipmentWorksheetRow {
  return {
    ...row,
    ...resolveWorksheetCustomerServiceState(row, nowIso),
  };
}

export async function getShipmentWorksheet(storeId: string) {
  const store = await getStoreOrThrow(storeId);
  const currentSheet = await coupangShipmentWorksheetStore.getStoreSheet(storeId);
  if (!currentSheet.items.length) {
    return buildWorksheetResponse(store, currentSheet);
  }

  const refreshed = await refreshWorksheetCustomerServiceStatuses({
    storeId,
    rows: currentSheet.items.map(normalizeWorksheetRow),
    syncPlan: buildReadCustomerServiceSyncPlan(currentSheet),
    forceRefresh: true,
  });
  const hasRowChanges = refreshed.rows.some((row, index) =>
    hasWorksheetRowChanged(currentSheet.items[index], row),
  );
  const nextMessage = normalizeLegacyWorksheetMessage(refreshed.message ?? currentSheet.message);
  const messageChanged = nextMessage !== normalizeLegacyWorksheetMessage(currentSheet.message);

  if (!hasRowChanges && !messageChanged) {
    return buildWorksheetResponse(store, currentSheet, refreshed.message);
  }

  const sheet = await coupangShipmentWorksheetStore.setStoreSheet({
    ...currentSheet,
    storeId,
    items: refreshed.rows,
    message: refreshed.message ?? currentSheet.message,
  });

  return buildWorksheetResponse(store, sheet, refreshed.message);
}

export async function getShipmentWorksheetDetail(input: {
  storeId: string;
  shipmentBoxId?: string;
  orderId?: string;
  vendorItemId?: string | null;
  sellerProductId?: string | null;
  orderedAtRaw?: string | null;
}) {
  const store = await getStoreOrThrow(input.storeId);

  if (!input.shipmentBoxId && !input.orderId) {
    throw new Error("shipmentBoxId or orderId is required.");
  }

  const claimLookupCreatedAtFrom = resolveClaimLookupDate(input.orderedAtRaw, -30);
  const claimLookupCreatedAtTo = formatSeoulDateOnly(new Date());
  const [orderDetailResponse, returnsResponse, exchangesResponse] = await Promise.all([
    getOrderDetail({
      storeId: input.storeId,
      shipmentBoxId: input.shipmentBoxId,
      orderId: input.orderId,
    }),
    listReturns({
      storeId: input.storeId,
      orderId: input.orderId,
      cancelType: "ALL",
      createdAtFrom: claimLookupCreatedAtFrom,
      createdAtTo: claimLookupCreatedAtTo,
    }),
    listExchanges({
      storeId: input.storeId,
      orderId: input.orderId,
      createdAtFrom: claimLookupCreatedAtFrom,
      createdAtTo: claimLookupCreatedAtTo,
      maxPerPage: 50,
    }),
  ]);
  const claimMatchTarget: CustomerServiceMatchTarget = {
    orderId: input.orderId ?? null,
    shipmentBoxId: input.shipmentBoxId ?? null,
    vendorItemId: input.vendorItemId ?? null,
    sellerProductId: input.sellerProductId ?? null,
  };
  const orderDetail =
    orderDetailResponse.source === "live" && orderDetailResponse.item
      ? {
          ...orderDetailResponse.item,
          relatedReturnRequests: (orderDetailResponse.item.relatedReturnRequests ?? []).filter((request) =>
            matchesReturnRequestToCustomerServiceTarget(claimMatchTarget, request),
          ),
          relatedExchangeRequests: (orderDetailResponse.item.relatedExchangeRequests ?? []).filter(
            (request) => matchesExchangeRequestToCustomerServiceTarget(claimMatchTarget, request),
          ),
        }
      : null;
  const returns =
    returnsResponse.source === "live"
      ? returnsResponse.items.filter((row) =>
          matchesReturnRequestToCustomerServiceTarget(claimMatchTarget, row),
        )
      : [];
  const exchanges =
    exchangesResponse.source === "live"
      ? exchangesResponse.items.filter((row) =>
          matchesExchangeRequestToCustomerServiceTarget(claimMatchTarget, row),
        )
      : [];
  const detailCustomerServiceState = buildShipmentWorksheetDetailCustomerServiceState({
    orderDetail,
    returns,
    exchanges,
    hasLiveReturns: returnsResponse.source === "live",
    hasLiveExchanges: exchangesResponse.source === "live",
  });
  const returnDetailResults = await mapWithConcurrency(returns, 3, async (row) => {
    try {
      const response = await getReturnDetail({
        storeId: input.storeId,
        receiptId: row.receiptId,
      });

      return {
        item: response.source === "live" ? response.item : null,
        message: response.message,
      };
    } catch (error) {
      return {
        item: null,
        message:
          error instanceof Error
            ? `${row.receiptId}: ${error.message}`
            : `${row.receiptId}: 반품 상세를 불러오지 못했습니다.`,
      };
    }
  });
  const exchangeDetailResults = await mapWithConcurrency(exchanges, 3, async (row) => {
    try {
      const response = await getExchangeDetail({
        storeId: input.storeId,
        exchangeId: row.exchangeId,
        orderId: input.orderId ?? row.orderId ?? undefined,
        createdAtFrom: claimLookupCreatedAtFrom,
        createdAtTo: claimLookupCreatedAtTo,
      });

      return {
        item: response.source === "live" ? response.item : null,
        message: response.message,
      };
    } catch (error) {
      return {
        item: null,
        message:
          error instanceof Error
            ? `${row.exchangeId}: ${error.message}`
            : `${row.exchangeId}: 교환 상세를 불러오지 못했습니다.`,
      };
    }
  });

  return {
    store: asStoreRef(store),
    item: {
      orderDetail,
      returns,
      returnDetails: returnDetailResults
        .map((result) => result.item)
        .filter((item): item is CoupangReturnDetail => Boolean(item)),
      exchanges,
      exchangeDetails: exchangeDetailResults
        .map((result) => result.item)
        .filter((item): item is CoupangExchangeDetail => Boolean(item)),
      customerServiceIssueCount: detailCustomerServiceState.customerServiceIssueCount,
      customerServiceIssueSummary: detailCustomerServiceState.customerServiceIssueSummary,
      customerServiceIssueBreakdown: detailCustomerServiceState.customerServiceIssueBreakdown,
      customerServiceState: detailCustomerServiceState.customerServiceState,
      claimLookupCreatedAtFrom,
      claimLookupCreatedAtTo,
    },
    fetchedAt: new Date().toISOString(),
    message: mergeMessages([
      orderDetailResponse.message,
      returnsResponse.message,
      exchangesResponse.message,
      ...returnDetailResults.map((result) => result.message),
      ...exchangeDetailResults.map((result) => result.message),
    ]),
    source:
      orderDetailResponse.source === "live" &&
      returnsResponse.source === "live" &&
      exchangesResponse.source === "live"
        ? "live"
        : "fallback",
  } satisfies CoupangShipmentWorksheetDetailResponse;
}

export async function collectShipmentWorksheet(input: CollectCoupangShipmentInput) {
  const store = await getStoreOrThrow(input.storeId);
  const currentSheet = await coupangShipmentWorksheetStore.getStoreSheet(input.storeId);
  const currentBySourceKey = new Map(currentSheet.items.map((row) => [row.sourceKey, row] as const));
  const selpickAllocator = createSelpickAllocator(currentSheet.items);
  const platformKey = resolvePlatformKey(store);
  const now = new Date().toISOString();
  const syncPlan = resolveSyncPlan(input, currentSheet, now);
  const listResponse = await listOrders({
    storeId: input.storeId,
    createdAtFrom: syncPlan.fetchCreatedAtFrom,
    createdAtTo: syncPlan.fetchCreatedAtTo,
    status: syncPlan.statusFilter ?? undefined,
    maxPerPage: input.maxPerPage,
    fetchAllPages: true,
    includeCustomerService: false,
  });

  if (listResponse.source !== "live") {
    const fallbackMessage = mergeMessages([
      currentSheet.message,
      listResponse.message,
      "실연동 수집에 실패해 기존 셀픽 워크시트를 유지했습니다.",
    ]);

    return buildWorksheetResponse(
      store,
      {
        ...currentSheet,
        source: "fallback",
      },
      fallbackMessage,
    );
  }

  const candidateRows = listResponse.items.filter(isShipmentWorksheetCandidate);
  const detailWarnings: string[] = [];
  const productWarnings: string[] = [];
  const claimWarnings: string[] = [];
  const prepareMessages: string[] = [];
  const collectionCandidates = candidateRows.map((row) => {
    const sourceKey = buildSourceKey(input.storeId, row);
    const currentRow = currentBySourceKey.get(sourceKey);

    return {
      row,
      sourceKey,
      currentRow,
      shouldHydrateOrder: shouldHydrateOrderRow(row, currentRow, now),
      shouldHydrateProduct: shouldHydrateProductRow(row, currentRow),
    } satisfies ShipmentWorksheetCollectionCandidate;
  });
  const collectionCandidateBySourceKey = new Map(
    collectionCandidates.map((candidate) => [candidate.sourceKey, candidate] as const),
  );
  const claimGroupsBySourceKey = new Map<string, ShipmentWorksheetClaimGroup>();
  const [returnsLookup, exchangesLookup] = await Promise.allSettled([
    listReturns({
      storeId: input.storeId,
      cancelType: "ALL",
      createdAtFrom: syncPlan.fetchCreatedAtFrom,
      createdAtTo: syncPlan.fetchCreatedAtTo,
    }),
    listExchanges({
      storeId: input.storeId,
      createdAtFrom: syncPlan.fetchCreatedAtFrom,
      createdAtTo: syncPlan.fetchCreatedAtTo,
      maxPerPage: 50,
    }),
  ]);

  const appendClaimGroup = (inputGroup: {
    sourceKey: string;
    shipmentBoxId: string;
    orderId: string;
    vendorItemId: string | null;
    sellerProductId: string | null;
    currentRow: CoupangShipmentWorksheetRow | undefined;
    matchedCandidateSourceKey: string | null;
    returnRow?: CoupangReturnRow;
    exchangeRow?: CoupangExchangeRow;
  }) => {
    const existing = claimGroupsBySourceKey.get(inputGroup.sourceKey);
    if (existing) {
      if (inputGroup.returnRow) {
        existing.returns.push(inputGroup.returnRow);
      }
      if (inputGroup.exchangeRow) {
        existing.exchanges.push(inputGroup.exchangeRow);
      }
      if (!existing.matchedCandidateSourceKey && inputGroup.matchedCandidateSourceKey) {
        existing.matchedCandidateSourceKey = inputGroup.matchedCandidateSourceKey;
      }
      return;
    }

    claimGroupsBySourceKey.set(inputGroup.sourceKey, {
      sourceKey: inputGroup.sourceKey,
      shipmentBoxId: inputGroup.shipmentBoxId,
      orderId: inputGroup.orderId,
      vendorItemId: inputGroup.vendorItemId,
      sellerProductId: inputGroup.sellerProductId,
      returns: inputGroup.returnRow ? [inputGroup.returnRow] : [],
      exchanges: inputGroup.exchangeRow ? [inputGroup.exchangeRow] : [],
      matchedCandidateSourceKey: inputGroup.matchedCandidateSourceKey,
      currentRow: inputGroup.currentRow,
    });
  };

  if (returnsLookup.status === "fulfilled" && returnsLookup.value.source === "live") {
    for (const request of returnsLookup.value.items) {
      const matchedCandidate = matchReturnClaimCandidate(collectionCandidates, request);
      const matchedWorksheetRow =
        matchedCandidate?.currentRow ?? matchReturnWorksheetRow(currentSheet.items, request) ?? undefined;
      const descriptor = matchedCandidate
        ? {
            sourceKey: matchedCandidate.sourceKey,
            shipmentBoxId: matchedCandidate.row.shipmentBoxId,
          }
        : matchedWorksheetRow
          ? {
              sourceKey: matchedWorksheetRow.sourceKey,
              shipmentBoxId: matchedWorksheetRow.shipmentBoxId,
            }
          : resolveClaimSourceDescriptor({
              storeId: input.storeId,
              shipmentBoxId: request.shipmentBoxId,
              orderId: request.orderId,
              vendorItemId: request.vendorItemId,
              sellerProductId: request.sellerProductId,
              fallbackId: request.receiptId,
            });

      appendClaimGroup({
        sourceKey: descriptor.sourceKey,
        shipmentBoxId: descriptor.shipmentBoxId,
        orderId:
          normalizeWhitespace(request.orderId) ??
          matchedCandidate?.row.orderId ??
          matchedWorksheetRow?.orderId ??
          descriptor.shipmentBoxId,
        vendorItemId:
          normalizeWhitespace(request.vendorItemId) ??
          matchedCandidate?.row.vendorItemId ??
          matchedWorksheetRow?.vendorItemId ??
          null,
        sellerProductId:
          normalizeWhitespace(request.sellerProductId) ??
          matchedCandidate?.row.sellerProductId ??
          matchedWorksheetRow?.sellerProductId ??
          null,
        currentRow: matchedWorksheetRow,
        matchedCandidateSourceKey: matchedCandidate?.sourceKey ?? null,
        returnRow: request,
      });
    }
  } else {
    claimWarnings.push(
      returnsLookup.status === "fulfilled"
        ? returnsLookup.value.message ?? "취소/반품 클레임을 빠른 수집에 반영하지 못했습니다."
        : returnsLookup.reason instanceof Error
          ? `취소/반품 클레임 조회에 실패했습니다. ${returnsLookup.reason.message}`
          : "취소/반품 클레임 조회에 실패했습니다.",
    );
  }

  if (exchangesLookup.status === "fulfilled" && exchangesLookup.value.source === "live") {
    for (const request of exchangesLookup.value.items) {
      const matchedCandidate = matchExchangeClaimCandidate(collectionCandidates, request);
      const matchedWorksheetRow =
        matchedCandidate?.currentRow ??
        matchExchangeWorksheetRow(currentSheet.items, request) ??
        undefined;
      const descriptor = matchedCandidate
        ? {
            sourceKey: matchedCandidate.sourceKey,
            shipmentBoxId: matchedCandidate.row.shipmentBoxId,
          }
        : matchedWorksheetRow
          ? {
              sourceKey: matchedWorksheetRow.sourceKey,
              shipmentBoxId: matchedWorksheetRow.shipmentBoxId,
            }
          : resolveClaimSourceDescriptor({
              storeId: input.storeId,
              shipmentBoxId: request.originalShipmentBoxId ?? request.shipmentBoxId,
              orderId: request.orderId,
              vendorItemId: request.vendorItemId,
              sellerProductId: request.sellerProductId,
              fallbackId: request.exchangeId,
            });

      appendClaimGroup({
        sourceKey: descriptor.sourceKey,
        shipmentBoxId: descriptor.shipmentBoxId,
        orderId:
          normalizeWhitespace(request.orderId) ??
          matchedCandidate?.row.orderId ??
          matchedWorksheetRow?.orderId ??
          descriptor.shipmentBoxId,
        vendorItemId:
          normalizeWhitespace(request.vendorItemId) ??
          matchedCandidate?.row.vendorItemId ??
          matchedWorksheetRow?.vendorItemId ??
          null,
        sellerProductId:
          normalizeWhitespace(request.sellerProductId) ??
          matchedCandidate?.row.sellerProductId ??
          matchedWorksheetRow?.sellerProductId ??
          null,
        currentRow: matchedWorksheetRow,
        matchedCandidateSourceKey: matchedCandidate?.sourceKey ?? null,
        exchangeRow: request,
      });
    }
  } else {
    claimWarnings.push(
      exchangesLookup.status === "fulfilled"
        ? exchangesLookup.value.message ?? "교환 클레임을 빠른 수집에 반영하지 못했습니다."
        : exchangesLookup.reason instanceof Error
          ? `교환 클레임 조회에 실패했습니다. ${exchangesLookup.reason.message}`
          : "교환 클레임 조회에 실패했습니다.",
    );
  }

  const claimFetchedAt = now;
  let quickCollectClaimInsertCount = 0;
  let quickCollectClaimMatchedCount = 0;

  for (const claimGroup of Array.from(claimGroupsBySourceKey.values())) {
    const issueState = buildCoupangCustomerServiceIssueState({
      relatedReturnRequests: claimGroup.returns,
      relatedExchangeRequests: claimGroup.exchanges,
    });

    if (claimGroup.matchedCandidateSourceKey) {
      const matchedCandidate = collectionCandidateBySourceKey.get(claimGroup.matchedCandidateSourceKey);
      if (matchedCandidate) {
        matchedCandidate.row = {
          ...matchedCandidate.row,
          ...issueState,
          customerServiceState: "ready",
          customerServiceFetchedAt: claimFetchedAt,
        };
        quickCollectClaimMatchedCount += 1;
      }
      continue;
    }

    const claimRow = buildClaimOnlyCollectionRow({
      issueFetchedAt: claimFetchedAt,
      currentRow: claimGroup.currentRow,
      issueState,
      claimGroup,
    });
    const sourceKey = claimGroup.sourceKey;
    const currentRow = currentBySourceKey.get(sourceKey) ?? claimGroup.currentRow;

    const nextCandidate = {
      row: claimRow,
      sourceKey,
      currentRow,
      shouldHydrateOrder: true,
      shouldHydrateProduct: shouldHydrateProductRow(claimRow, currentRow),
      claimOnly: true,
    } satisfies ShipmentWorksheetCollectionCandidate;

    collectionCandidates.push(nextCandidate);
    collectionCandidateBySourceKey.set(sourceKey, nextCandidate);
    quickCollectClaimInsertCount += 1;
  }
  const prepareTargets = buildPrepareTargets(collectionCandidates);
  const preparedShipmentBoxIds = new Set<string>();

  if (prepareTargets.length) {
    try {
      const prepareResponse = await markPreparing({
        storeId: input.storeId,
        items: prepareTargets,
      });

      for (const item of prepareResponse.items) {
        if (item.status === "succeeded" && item.shipmentBoxId) {
          preparedShipmentBoxIds.add(item.shipmentBoxId);
        }
      }

      if (prepareResponse.summary.succeededCount) {
        prepareMessages.push(
          `결제완료 ${prepareResponse.summary.succeededCount}건을 쿠팡 상품준비중으로 변경했습니다.`,
        );
      }

      const prepareFailureCount =
        prepareResponse.summary.failedCount + prepareResponse.summary.warningCount;
      if (prepareFailureCount) {
        prepareMessages.push(
          `상품준비중 변경 실패 ${prepareFailureCount}건은 기존 상태로 남았습니다.`,
        );
      }
    } catch (error) {
      prepareMessages.push(
        error instanceof Error
          ? `결제완료 주문의 상품준비중 변경에 실패했습니다. ${error.message}`
          : "결제완료 주문의 상품준비중 변경에 실패했습니다.",
      );
    }
  }

  const detailTargets = Array.from(
    new Set(
      collectionCandidates
        .filter((candidate) => candidate.shouldHydrateOrder)
        .map((candidate) => normalizeWhitespace(candidate.row.shipmentBoxId))
        .filter((shipmentBoxId): shipmentBoxId is string => Boolean(shipmentBoxId)),
    ),
  );
  const detailResults = await mapWithConcurrency(detailTargets, 4, async (shipmentBoxId) => {
    try {
      const response = await getOrderDetail({
        storeId: input.storeId,
        shipmentBoxId,
        includeCustomerService: false,
      });

      if (response.source !== "live") {
        detailWarnings.push(
          response.message
            ? `${shipmentBoxId}: ${response.message}`
            : `${shipmentBoxId}: 주문 상세 fallback 데이터를 사용하지 않았습니다.`,
        );
        return {
          shipmentBoxId,
          detail: null,
          preserveCustomerService: true,
        };
      }

      if (response.message) {
        detailWarnings.push(`${shipmentBoxId}: ${response.message}`);
      }

      return {
        shipmentBoxId,
        detail: response.item,
        preserveCustomerService: Boolean(response.message),
      };
    } catch (error) {
      detailWarnings.push(
        error instanceof Error
          ? `${shipmentBoxId}: ${error.message}`
          : `${shipmentBoxId}: 주문 상세 조회에 실패했습니다.`,
      );
      return {
        shipmentBoxId,
        detail: null,
        preserveCustomerService: true,
      };
    }
  });
  const detailByShipmentBoxId = new Map(
    detailResults.map((result) => [result.shipmentBoxId, result] as const),
  );

  const productDetailPromiseBySellerProductId = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getProductDetail>> | null>
  >();
  const getProductDetailCached = (row: CoupangOrderRow) => {
    if (!row.sellerProductId) {
      return Promise.resolve(null);
    }

    const cached = productDetailPromiseBySellerProductId.get(row.sellerProductId);
    if (cached) {
      return cached;
    }

    const nextPromise = getProductDetail({
      storeId: input.storeId,
      sellerProductId: row.sellerProductId,
    })
      .then((response) => {
        if (!response || response.source !== "live" || !response.item) {
          productWarnings.push(
            response?.message
              ? `${row.sellerProductId}: ${response.message}`
              : `${row.sellerProductId}: 상품 상세 fallback 데이터를 사용하지 않았습니다.`,
          );
          return null;
        }

        return response;
      })
      .catch((error) => {
        productWarnings.push(
          error instanceof Error
            ? `${row.sellerProductId}: ${error.message}`
            : `${row.sellerProductId}: 상품 상세 조회에 실패했습니다.`,
        );
        return null;
      });

    productDetailPromiseBySellerProductId.set(row.sellerProductId, nextPromise);
    return nextPromise;
  };

  const skippedHydrationCount = collectionCandidates.filter(
    (candidate) => !candidate.shouldHydrateOrder && !candidate.shouldHydrateProduct,
  ).length;
  const fetchedRows = await mapWithConcurrency(collectionCandidates, 4, async (candidate) => {
    const { row, sourceKey, currentRow } = candidate;
    const detailResult = candidate.shouldHydrateOrder
      ? (detailByShipmentBoxId.get(row.shipmentBoxId) ?? null)
      : null;
    const detail = detailResult?.detail ?? null;
    const productDetail = candidate.shouldHydrateProduct ? await getProductDetailCached(row) : null;
    const isOverseas = productDetail
      ? resolveProductOverseasFlag(productDetail, row)
      : currentRow?.isOverseas ?? false;
    const productName = resolveWorksheetProductName(detail, productDetail, row, currentRow);
    const optionName = resolveWorksheetOptionName(
      detail,
      productDetail,
      row,
      currentRow,
      productName,
    );
    const receiverBaseName =
      currentRow?.receiverBaseName ??
      detail?.receiver.name ??
      row.receiverName ??
      currentRow?.receiverName ??
      null;
    const personalClearanceCode = currentRow?.personalClearanceCode ?? null;
    const receiverName = composeReceiverName(receiverBaseName, personalClearanceCode, isOverseas);
    const orderedAtRaw = row.orderedAt ?? row.paidAt ?? currentRow?.orderedAtRaw ?? null;
    const orderDate = toSeoulDateParts(orderedAtRaw ?? currentRow?.createdAt ?? now);
    const preserveDeliveryRequest = hasManualDeliveryRequest(currentRow);
    const refreshedDeliveryRequest = normalizeWhitespace(detail?.parcelPrintMessage);
    const customerServiceIssueState =
      row.customerServiceState === "ready" ||
      row.customerServiceIssueCount > 0 ||
      normalizeWhitespace(row.customerServiceIssueSummary)
        ? {
            customerServiceIssueCount: row.customerServiceIssueCount,
            customerServiceIssueSummary: row.customerServiceIssueSummary,
            customerServiceIssueBreakdown: row.customerServiceIssueBreakdown,
            customerServiceState: row.customerServiceState,
            customerServiceFetchedAt: row.customerServiceFetchedAt,
          }
        : resolveWorksheetCustomerServiceState(currentRow, now);
    const coupangDeliveryCompanyCode = null;
    const coupangInvoiceNumber = null;
    const coupangInvoiceUploadedAt = null;

    return {
      id: currentRow?.id ?? sourceKey,
      sourceKey,
      storeId: store.id,
      storeName: store.storeName,
      orderDateText: orderDate.text,
      orderDateKey: orderDate.key,
      quantity: row.quantity,
      productName,
      optionName,
      productOrderNumber: row.orderId,
      collectedPlatform: "쿠팡",
      ordererName: detail?.orderer.name ?? currentRow?.ordererName ?? row.ordererName ?? null,
      contact:
        detail?.receiver.safeNumber ??
        detail?.receiver.receiverNumber ??
        row.receiverSafeNumber ??
        currentRow?.contact ??
        null,
      receiverName,
      receiverBaseName: normalizeWhitespace(receiverBaseName),
      personalClearanceCode,
      collectedAccountName: store.storeName,
      deliveryCompanyCode: normalizeDeliveryCode(
        currentRow?.deliveryCompanyCode ?? row.deliveryCompanyCode ?? "",
      ),
      selpickOrderNumber:
        currentRow?.selpickOrderNumber ??
        selpickAllocator.next(store.storeName, orderDate.key, platformKey.key),
      invoiceNumber: normalizeInvoiceNumber(currentRow?.invoiceNumber ?? row.invoiceNumber ?? ""),
      coupangDeliveryCompanyCode,
      coupangInvoiceNumber,
      coupangInvoiceUploadedAt,
      salePrice: row.orderPrice ?? row.salesPrice,
      shippingFee: 0,
      receiverAddress:
        (detail ? buildAddress(detail, row) : null) ??
        currentRow?.receiverAddress ??
        row.receiverAddress ??
        null,
      deliveryRequest: preserveDeliveryRequest
        ? currentRow?.deliveryRequest ?? refreshedDeliveryRequest ?? null
        : refreshedDeliveryRequest ?? currentRow?.deliveryRequest ?? null,
      buyerPhoneNumber:
        detail?.orderer.safeNumber ??
        detail?.orderer.ordererNumber ??
        detail?.receiver.safeNumber ??
        row.receiverSafeNumber ??
        currentRow?.buyerPhoneNumber ??
        null,
      productNumber: row.sellerProductId,
      exposedProductName: buildExposedProductName(productName, optionName),
      productOptionNumber: row.vendorItemId,
      sellerProductCode: row.externalVendorSku,
      isOverseas,
      shipmentBoxId: row.shipmentBoxId,
      orderId: row.orderId,
      sellerProductId: row.sellerProductId,
      vendorItemId: row.vendorItemId,
      availableActions: resolveWorksheetActions(row, currentRow, preparedShipmentBoxIds),
      orderStatus: normalizeStatusFilter(row.status),
      customerServiceIssueCount: customerServiceIssueState.customerServiceIssueCount,
      customerServiceIssueSummary: customerServiceIssueState.customerServiceIssueSummary,
      customerServiceIssueBreakdown: customerServiceIssueState.customerServiceIssueBreakdown,
      customerServiceState: customerServiceIssueState.customerServiceState,
      customerServiceFetchedAt: customerServiceIssueState.customerServiceFetchedAt,
      orderedAtRaw,
      lastOrderHydratedAt:
        candidate.shouldHydrateOrder && detail ? now : currentRow?.lastOrderHydratedAt ?? null,
      lastProductHydratedAt:
        candidate.shouldHydrateProduct && productDetail
          ? now
          : currentRow?.lastProductHydratedAt ?? null,
      estimatedShippingDate: row.estimatedShippingDate ?? currentRow?.estimatedShippingDate ?? null,
      splitShipping: row.splitShipping ?? currentRow?.splitShipping ?? null,
      invoiceTransmissionStatus: currentRow?.invoiceTransmissionStatus ?? null,
      invoiceTransmissionMessage: currentRow?.invoiceTransmissionMessage ?? null,
      invoiceTransmissionAt: currentRow?.invoiceTransmissionAt ?? null,
      exportedAt: currentRow?.exportedAt ?? null,
      invoiceAppliedAt: currentRow?.invoiceAppliedAt ?? null,
      createdAt: currentRow?.createdAt ?? now,
      updatedAt: now,
    } satisfies CoupangShipmentWorksheetRow;
  });

  let insertedCount = 0;
  let updatedCount = 0;
  const mergedBySourceKey = new Map(currentSheet.items.map((row) => [row.sourceKey, row] as const));

  for (const nextRow of fetchedRows) {
    const existingRow = mergedBySourceKey.get(nextRow.sourceKey);
    if (!existingRow) {
      insertedCount += 1;
      mergedBySourceKey.set(nextRow.sourceKey, nextRow);
      continue;
    }

    if (hasWorksheetRowChanged(existingRow, nextRow)) {
      updatedCount += 1;
      mergedBySourceKey.set(nextRow.sourceKey, nextRow);
      continue;
    }

    mergedBySourceKey.set(nextRow.sourceKey, existingRow);
  }

  const customerServiceRefresh = await refreshWorksheetCustomerServiceStatuses({
    storeId: input.storeId,
    rows: Array.from(mergedBySourceKey.values()),
    syncPlan,
    forceRefresh: true,
  });

  const syncState = buildNextSyncState(
    currentSheet.syncState ?? createEmptySyncState(),
    syncPlan,
    now,
  );
  const syncSummary = buildSyncSummary({
    plan: syncPlan,
    fetchedCount: collectionCandidates.length,
    insertedCount,
    updatedCount,
    skippedHydrationCount,
  });
  const sheet = await coupangShipmentWorksheetStore.setStoreSheet({
    storeId: input.storeId,
    items: customerServiceRefresh.rows,
    collectedAt: now,
    source: listResponse.source,
    message: mergeMessages([
      listResponse.message,
      platformKey.warning,
      claimWarnings.length ? claimWarnings.join(" ") : null,
      claimGroupsBySourceKey.size
        ? `빠른 수집에 클레임 ${claimGroupsBySourceKey.size}건을 반영했고, 신규 ${quickCollectClaimInsertCount}건을 워크시트에 추가했습니다.${quickCollectClaimMatchedCount ? ` 기존 주문 ${quickCollectClaimMatchedCount}건도 클레임 상태로 갱신했습니다.` : ""}`
        : null,
      detailWarnings.length
        ? `주문 상세 ${detailWarnings.length}건은 일부 정보를 기존 값으로 유지했습니다.`
        : null,
      productWarnings.length
        ? `상품 상세 ${productWarnings.length}건은 쿠팡 주문 원본값으로 보완했습니다.`
        : null,
      customerServiceRefresh.message,
      ...prepareMessages,
    ]),
    syncState,
    syncSummary,
  });

  return buildWorksheetResponse(store, sheet);
}

function normalizePatchAgainstRow(
  row: CoupangShipmentWorksheetRow,
  patch: PatchCoupangShipmentWorksheetItemInput,
): PatchCoupangShipmentWorksheetItemInput {
  const receiverValues =
    patch.receiverName !== undefined ||
    patch.receiverBaseName !== undefined ||
    patch.personalClearanceCode !== undefined
      ? parseReceiverName(
          patch.receiverName ?? patch.receiverBaseName ?? row.receiverName,
          row.isOverseas,
          patch.receiverBaseName ?? row.receiverBaseName ?? row.receiverName,
        )
      : {
          receiverName: row.receiverName,
          receiverBaseName: row.receiverBaseName,
          personalClearanceCode: row.personalClearanceCode,
        };

  return {
    ...patch,
    sourceKey: patch.sourceKey ?? row.sourceKey,
    selpickOrderNumber: patch.selpickOrderNumber ?? row.selpickOrderNumber,
    receiverName: receiverValues.receiverName,
    receiverBaseName: receiverValues.receiverBaseName,
    personalClearanceCode: receiverValues.personalClearanceCode,
    deliveryCompanyCode:
      patch.deliveryCompanyCode !== undefined
        ? normalizeDeliveryCode(patch.deliveryCompanyCode)
        : row.deliveryCompanyCode,
    invoiceNumber:
      patch.invoiceNumber !== undefined
        ? normalizeInvoiceNumber(patch.invoiceNumber)
        : row.invoiceNumber,
    deliveryRequest:
      patch.deliveryRequest !== undefined ? normalizeWhitespace(patch.deliveryRequest) : row.deliveryRequest,
    invoiceTransmissionStatus:
      patch.invoiceTransmissionStatus !== undefined
        ? patch.invoiceTransmissionStatus
        : row.invoiceTransmissionStatus,
    invoiceTransmissionMessage:
      patch.invoiceTransmissionMessage !== undefined
        ? normalizeWhitespace(patch.invoiceTransmissionMessage)
        : row.invoiceTransmissionMessage,
    invoiceTransmissionAt:
      patch.invoiceTransmissionAt !== undefined ? patch.invoiceTransmissionAt : row.invoiceTransmissionAt,
    exportedAt: patch.exportedAt !== undefined ? patch.exportedAt : row.exportedAt,
    invoiceAppliedAt:
      patch.invoiceAppliedAt !== undefined ? patch.invoiceAppliedAt : row.invoiceAppliedAt,
  };
}

export async function patchShipmentWorksheet(input: PatchCoupangShipmentWorksheetInput) {
  if (!input.items.length) {
    throw new Error("업데이트할 배송 시트 항목이 없습니다.");
  }

  const store = await getStoreOrThrow(input.storeId);
  const currentSheet = await coupangShipmentWorksheetStore.getStoreSheet(input.storeId);
  const rowBySourceKey = new Map(currentSheet.items.map((row) => [row.sourceKey, row] as const));
  const rowBySelpickOrderNumber = new Map(
    currentSheet.items.map((row) => [row.selpickOrderNumber, row] as const),
  );
  const normalizedItems = input.items.map((item) => {
    const row =
      (item.sourceKey ? rowBySourceKey.get(item.sourceKey) : undefined) ??
      (item.selpickOrderNumber ? rowBySelpickOrderNumber.get(item.selpickOrderNumber) : undefined);

    return row ? normalizePatchAgainstRow(row, item) : item;
  });

  const result = await coupangShipmentWorksheetStore.patchRows({
    storeId: input.storeId,
    items: normalizedItems,
  });

  return buildWorksheetResponse(
    store,
    result.sheet,
    mergeMessages([
      result.sheet.message,
      result.missingKeys.length
        ? `?쇰? ?됱쓣 李얠? 紐삵뻽?듬땲?? ${result.missingKeys.slice(0, 5).join(", ")}`
        : null,
    ]),
  );
}

