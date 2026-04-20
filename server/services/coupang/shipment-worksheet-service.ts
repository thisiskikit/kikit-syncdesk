import type {
  AuditCoupangShipmentWorksheetMissingInput,
  ApplyCoupangShipmentWorksheetInvoiceInput,
  CollectCoupangShipmentInput,
  CoupangExchangeDetail,
  CoupangExchangeRow,
  CoupangOrderDetail,
  CoupangOrderListResponse,
  CoupangOrderRow,
  CoupangReturnDetail,
  CoupangReturnRow,
  CoupangSettlementRow,
  CoupangShipmentWorksheetAuditMissingResponse,
  CoupangShipmentWorksheetBulkResolveMode,
  CoupangShipmentWorksheetBulkResolveResponse,
  CoupangShipmentSyncMode,
  CoupangShipmentWorksheetDetailResponse,
  CoupangShipmentWorksheetInvoiceInputApplyResponse,
  CoupangShipmentWorksheetRefreshResponse,
  CoupangShipmentWorksheetRefreshScope,
  CoupangShipmentWorksheetSyncPhase,
  CoupangShipmentArchiveRow,
  CoupangShipmentArchiveReason,
  CoupangShipmentArchiveViewQuery,
  CoupangShipmentArchiveViewResponse,
  ReconcileCoupangShipmentWorksheetInput,
  ReconcileCoupangShipmentWorksheetResponse,
  CoupangShipmentWorksheetResponse,
  CoupangShipmentWorksheetRow,
  CoupangShipmentWorksheetSyncSummary,
  CoupangShipmentWorksheetViewQuery,
  CoupangShipmentWorksheetViewResponse,
  RefreshCoupangShipmentWorksheetInput,
  RunCoupangShipmentArchiveInput,
  RunCoupangShipmentArchiveResponse,
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
  listSettlementSales,
} from "./order-service";
import { buildCoupangCustomerServiceIssueState } from "./customer-service-issues";
import { getProductDetail } from "./product-service";
import { coupangSettingsStore } from "./settings-store";
import {
  WORKSHEET_ROW_WRITE_CHUNK_SIZE,
  coupangShipmentWorksheetStore,
  type CoupangShipmentWorksheetSyncState,
} from "./shipment-worksheet-store";
import { recordSystemErrorEvent } from "../logs/service";
import {
  buildShipmentWorksheetViewData,
  getShipmentWorksheetRowHiddenReason,
  getShipmentWorksheetBulkResolveTargetRows,
  hasShipmentWorksheetClaimIssue,
  isShipmentWorksheetPostDispatchRow,
  matchesShipmentWorksheetQuery,
  resolveShipmentWorksheetFilteredRows,
  resolveShipmentWorksheetRows,
} from "./shipment-worksheet-view";
import {
  buildWorksheetRawFieldCatalog,
  buildWorksheetRawFields,
  ensureWorksheetRawFields,
  resolveWorksheetDisplayProductNameFromRawFields,
  resolveWorksheetOptionNameFromRawFields,
  resolveWorksheetOverseasFlagFromRawFields,
  resolveWorksheetProductNameFromRawFields,
} from "./shipment-worksheet-raw-fields";

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

function resolveStoredWorksheetOptionName(
  currentRow: CoupangShipmentWorksheetRow | undefined,
  productName: string,
) {
  if (!currentRow) {
    return null;
  }

  if (
    hasMixedWorksheetOptionName(
      currentRow.optionName,
      currentRow.productName,
      currentRow.exposedProductName,
    )
  ) {
    return null;
  }

  return normalizeWorksheetOptionName(currentRow.optionName, productName);
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
    const counterKey = row.collectedAccountName;
    const current = counters.get(counterKey) ?? 0;
    counters.set(counterKey, Math.max(current, extractSequence(row.selpickOrderNumber)));
  }

  return {
    next(collectedAccountName: string, orderDateKey: string, platformKey: string) {
      const counterKey = collectedAccountName;
      const nextSequence = (counters.get(counterKey) ?? 0) + 1;
      counters.set(counterKey, nextSequence);
      return `O${orderDateKey}${platformKey}${String(nextSequence).padStart(4, "0")}`;
    },
  };
}

function resolveWorksheetOrderDateParts(input: {
  orderedAt: string | null | undefined;
  paidAt: string | null | undefined;
  currentOrderedAtRaw?: string | null;
  currentCreatedAt?: string | null;
  nowIso: string;
}) {
  return toSeoulDateParts(
    input.orderedAt ?? input.paidAt ?? input.currentOrderedAtRaw ?? input.currentCreatedAt ?? input.nowIso,
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
type ArchiveWorksheetRows = Awaited<ReturnType<typeof coupangShipmentWorksheetStore.getArchivedRows>>;

function buildWorksheetRows(sheet: WorksheetStoreSheet) {
  const nowIso = new Date().toISOString();
  return sheet.items.map((row) =>
    decorateWorksheetRowCustomerServiceState(normalizeWorksheetRow(row), nowIso),
  );
}

function hasWorksheetInvoicePayload(
  row: Pick<CoupangShipmentWorksheetRow, "deliveryCompanyCode" | "invoiceNumber">,
) {
  return Boolean(
    normalizeDeliveryCode(row.deliveryCompanyCode) && normalizeInvoiceNumber(row.invoiceNumber),
  );
}

function shouldRehydrateBulkResolveRow(
  row: Pick<
    CoupangShipmentWorksheetRow,
    "shipmentBoxId" | "availableActions" | "deliveryCompanyCode" | "invoiceNumber" | "invoiceTransmissionStatus"
  >,
  mode: CoupangShipmentWorksheetBulkResolveMode,
) {
  if (!normalizeWhitespace(row.shipmentBoxId)) {
    return false;
  }

  if (mode === "prepare_ready") {
    return row.availableActions.includes("markPreparing");
  }

  if (mode === "invoice_ready") {
    return (
      hasWorksheetInvoicePayload(row) &&
      row.invoiceTransmissionStatus !== "pending" &&
      row.invoiceTransmissionStatus !== "succeeded"
    );
  }

  return false;
}

function buildWorksheetResponse(
  store: StoredCoupangStore,
  sheet: WorksheetStoreSheet,
  messageOverride?: string | null,
): CoupangShipmentWorksheetResponse {
  const rows = buildWorksheetRows(sheet);
  return {
    store: asStoreRef(store),
    items: rows,
    rawFieldCatalog: buildWorksheetRawFieldCatalog(rows),
    fetchedAt: new Date().toISOString(),
    collectedAt: sheet.collectedAt,
    message: normalizeLegacyWorksheetMessage(messageOverride ?? sheet.message),
    source: sheet.source,
    syncSummary: sheet.syncSummary,
  };
}

function normalizeShipmentArchiveQuery(
  query: Partial<CoupangShipmentArchiveViewQuery> | null | undefined,
) {
  return {
    storeId: query?.storeId ?? "",
    page: Number.isFinite(query?.page) && (query?.page ?? 0) > 0 ? Math.floor(query!.page!) : 1,
    pageSize:
      Number.isFinite(query?.pageSize) && (query?.pageSize ?? 0) > 0
        ? Math.floor(query!.pageSize!)
        : SHIPMENT_ARCHIVE_DEFAULT_PAGE_SIZE,
    query: normalizeWhitespace(query?.query) ?? "",
  };
}

function buildArchiveRows(rows: ArchiveWorksheetRows) {
  const nowIso = new Date().toISOString();
  return rows.map((row) => ({
    ...decorateWorksheetRowCustomerServiceState(normalizeWorksheetRow(row), nowIso),
    archivedAt: row.archivedAt,
    archiveReason: row.archiveReason,
  }));
}

function buildShipmentArchiveViewResponse(
  store: StoredCoupangStore,
  rows: ArchiveWorksheetRows,
  query: Partial<CoupangShipmentArchiveViewQuery> | null | undefined,
  messageOverride?: string | null,
): CoupangShipmentArchiveViewResponse {
  const normalizedQuery = normalizeShipmentArchiveQuery(query);
  const allRows = buildArchiveRows(rows);
  const rawFieldCatalog = buildWorksheetRawFieldCatalog(allRows);
  const filteredRows = normalizedQuery.query
    ? allRows.filter((row) => matchesShipmentWorksheetQuery(row, normalizedQuery.query))
    : allRows;
  const sortedRows = filteredRows.slice().sort((left, right) => {
    const archivedCompared = right.archivedAt.localeCompare(left.archivedAt);
    if (archivedCompared !== 0) {
      return archivedCompared;
    }
    return left.id.localeCompare(right.id);
  });
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / normalizedQuery.pageSize));
  const page = Math.min(normalizedQuery.page, totalPages);
  const pageStart = (page - 1) * normalizedQuery.pageSize;

  return {
    store: asStoreRef(store),
    items: sortedRows.slice(pageStart, pageStart + normalizedQuery.pageSize),
    rawFieldCatalog,
    fetchedAt: new Date().toISOString(),
    message: normalizeLegacyWorksheetMessage(messageOverride),
    page,
    pageSize: normalizedQuery.pageSize,
    totalPages,
    totalRowCount: allRows.length,
    filteredRowCount: sortedRows.length,
  };
}

function buildWorksheetViewResponse(
  store: StoredCoupangStore,
  sheet: WorksheetStoreSheet,
  query: Partial<CoupangShipmentWorksheetViewQuery> | null | undefined,
  messageOverride?: string | null,
): CoupangShipmentWorksheetViewResponse {
  const rows = buildWorksheetRows(sheet);
  const view = buildShipmentWorksheetViewData(rows, query);

  return {
    store: asStoreRef(store),
    items: view.items,
    rawFieldCatalog: buildWorksheetRawFieldCatalog(rows),
    fetchedAt: new Date().toISOString(),
    collectedAt: sheet.collectedAt,
    message: normalizeLegacyWorksheetMessage(messageOverride ?? sheet.message),
    source: sheet.source,
    syncSummary: sheet.syncSummary,
    scope: view.scope,
    page: view.page,
    pageSize: view.pageSize,
    totalPages: view.totalPages,
    totalRowCount: view.totalRowCount,
    scopeRowCount: view.scopeRowCount,
    filteredRowCount: view.filteredRowCount,
    invoiceReadyCount: view.invoiceReadyCount,
    decisionCounts: view.decisionCounts,
    decisionPreviewGroups: view.decisionPreviewGroups,
    scopeCounts: view.scopeCounts,
    invoiceCounts: view.invoiceCounts,
    orderCounts: view.orderCounts,
    outputCounts: view.outputCounts,
  };
}

const DEFAULT_SYNC_MODE: CoupangShipmentSyncMode = "incremental";
const CUSTOMER_SERVICE_READY_TTL_MS = 10 * 60_000;
const INCREMENTAL_OVERLAP_HOURS = 24;
const FULL_RECONCILE_STALE_HOURS = 12;
const ORDER_DETAIL_REFRESH_HOURS = 6;
const QUICK_COLLECT_REQUIRED_STATUSES = ["INSTRUCT", "ACCEPT"] as const;
const QUICK_COLLECT_PAGE_SIZE = 50;
const QUICK_COLLECT_MAX_PAGES = 10;
const WORKSHEET_CHECKPOINT_FLUSH_SIZE = 100;
const WORKSHEET_AUDIT_STATUSES = ["INSTRUCT", "ACCEPT"] as const;
const WORKSHEET_AUDIT_MAX_RANGE_DAYS = 7;
const WORKSHEET_AUDIT_PAGE_SIZE = 50;
const PURCHASE_CONFIRM_MAX_RANGE_DAYS = 31;
const PURCHASE_CONFIRM_PAGE_SIZE = 50;
const PURCHASE_CONFIRM_SAFE_PAGE_CAP = 100;
const PURCHASE_CONFIRM_SOURCE = "revenue_history_sale";
const PURCHASE_CONFIRM_TARGET_STATUSES = new Set([
  "DEPARTURE",
  "DELIVERING",
  "FINAL_DELIVERY",
  "NONE_TRACKING",
]);
const SHIPMENT_ARCHIVE_RETENTION_DAYS = 30;
const SHIPMENT_ARCHIVE_DEFAULT_PAGE_SIZE = 50;
const SHIPMENT_WORKSHEET_STATUSES = new Set([
  "ACCEPT",
  "INSTRUCT",
  "DEPARTURE",
  "DELIVERING",
  "FINAL_DELIVERY",
  "NONE_TRACKING",
]);
const COLLECT_COMPLETED_PHASES = ["worksheet_collect"] as const satisfies readonly CoupangShipmentWorksheetSyncPhase[];
const COLLECT_PENDING_PHASES = [
  "order_detail_hydration",
  "product_detail_hydration",
  "customer_service_refresh",
] as const satisfies readonly CoupangShipmentWorksheetSyncPhase[];

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

type ShipmentWorksheetRefreshPhaseState = {
  completedPhases: CoupangShipmentWorksheetSyncPhase[];
  pendingPhases: CoupangShipmentWorksheetSyncPhase[];
  warningPhases: CoupangShipmentWorksheetSyncPhase[];
};

type ShipmentQuickCollectStatusBatch = {
  status: string;
  items: CoupangOrderRow[];
};

type ShipmentOrderLookupResult = Pick<CoupangOrderListResponse, "items" | "source" | "message"> & {
  hasRequiredFailure?: boolean;
  failedStatuses?: string[];
  statusBatches?: ShipmentQuickCollectStatusBatch[];
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

function parseDateOnlyTimestamp(value: string) {
  const parsed = Date.parse(`${value}T00:00:00+09:00`);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function validateDateOnlyRange(createdAtFrom: string, createdAtTo: string) {
  const fromTimestamp = parseDateOnlyTimestamp(createdAtFrom);
  const toTimestamp = parseDateOnlyTimestamp(createdAtTo);

  if (!Number.isFinite(fromTimestamp) || !Number.isFinite(toTimestamp)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  if (fromTimestamp > toTimestamp) {
    throw new Error("시작일은 종료일보다 늦을 수 없습니다.");
  }

  return { fromTimestamp, toTimestamp };
}

function validateShipmentWorksheetAuditRange(createdAtFrom: string, createdAtTo: string) {
  const { fromTimestamp, toTimestamp } = validateDateOnlyRange(createdAtFrom, createdAtTo);

  const daySpan = Math.floor((toTimestamp - fromTimestamp) / (24 * 60 * 60 * 1000)) + 1;
  if (daySpan > WORKSHEET_AUDIT_MAX_RANGE_DAYS) {
    throw new Error(`누락 검수는 최대 ${WORKSHEET_AUDIT_MAX_RANGE_DAYS}일 범위까지만 지원합니다.`);
  }
}

function buildShipmentWorksheetAuditRanges(createdAtFrom: string, createdAtTo: string) {
  return buildDateOnlyRanges({
    dateFrom: createdAtFrom,
    dateTo: createdAtTo,
    maxRangeDays: WORKSHEET_AUDIT_MAX_RANGE_DAYS,
  });
}

function buildDateOnlyRanges(input: {
  dateFrom: string;
  dateTo: string;
  maxRangeDays: number;
}) {
  const { fromTimestamp, toTimestamp } = validateDateOnlyRange(input.dateFrom, input.dateTo);

  const ranges: Array<{ createdAtFrom: string; createdAtTo: string }> = [];
  const dayInMilliseconds = 24 * 60 * 60 * 1000;
  const chunkSpan = input.maxRangeDays * dayInMilliseconds;

  for (let cursor = fromTimestamp; cursor <= toTimestamp; cursor += chunkSpan) {
    const chunkToTimestamp = Math.min(
      cursor + (input.maxRangeDays - 1) * dayInMilliseconds,
      toTimestamp,
    );

    ranges.push({
      createdAtFrom: formatSeoulDateOnly(new Date(cursor)),
      createdAtTo: formatSeoulDateOnly(new Date(chunkToTimestamp)),
    });
  }

  return ranges;
}

function normalizePurchaseConfirmName(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized.replace(/\s+/g, " ").toLowerCase() : null;
}

function buildPurchaseConfirmFallbackNameKeys(row: CoupangShipmentWorksheetRow) {
  return Array.from(
    new Set(
      [row.exposedProductName, row.productName]
        .map((value) => normalizePurchaseConfirmName(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function buildPurchaseConfirmSettlementNameKeys(row: Pick<
  CoupangSettlementRow,
  "vendorItemName" | "productName"
>) {
  return Array.from(
    new Set(
      [row.vendorItemName, row.productName]
        .map((value) => normalizePurchaseConfirmName(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function buildPurchaseConfirmVendorItemKey(
  orderId: string | null | undefined,
  vendorItemId: string | null | undefined,
) {
  const normalizedOrderId = normalizeWhitespace(orderId);
  const normalizedVendorItemId = normalizeWhitespace(vendorItemId);
  if (!normalizedOrderId || !normalizedVendorItemId) {
    return null;
  }

  return `${normalizedOrderId}::${normalizedVendorItemId}`;
}

function resolveWorksheetRowDateKey(row: CoupangShipmentWorksheetRow) {
  const fromOrderedAt = normalizeWhitespace(row.orderedAtRaw)?.slice(0, 10);
  const orderDate = fromOrderedAt?.replaceAll("-", "") ?? row.orderDateKey;
  return orderDate && orderDate.length === 8 ? orderDate : null;
}

function matchesWorksheetRowDateRange(
  row: CoupangShipmentWorksheetRow,
  createdAtFrom: string,
  createdAtTo: string,
) {
  validateDateOnlyRange(createdAtFrom, createdAtTo);

  const rowDateKey = resolveWorksheetRowDateKey(row);
  if (!rowDateKey) {
    return false;
  }

  const fromKey = createdAtFrom.replaceAll("-", "");
  const toKey = createdAtTo.replaceAll("-", "");
  return rowDateKey >= fromKey && rowDateKey <= toKey;
}

function isOlderThanDays(value: string | null | undefined, days: number, now: Date) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return false;
  }

  return now.getTime() - parsed.getTime() >= days * 24 * 60 * 60 * 1000;
}

function isShipmentWorksheetArchiveEligible(row: CoupangShipmentWorksheetRow, now: Date) {
  return (
    Boolean(normalizeWhitespace(row.exportedAt)) &&
    isShipmentWorksheetPostDispatchRow(row) &&
    !hasShipmentWorksheetClaimIssue(row) &&
    isOlderThanDays(row.exportedAt, SHIPMENT_ARCHIVE_RETENTION_DAYS, now)
  );
}

function isShipmentWorksheetCompletedClaimArchiveCandidate(
  row: Pick<CoupangShipmentWorksheetRow, "customerServiceState" | "customerServiceTerminalStatus">,
) {
  return row.customerServiceState === "ready" && row.customerServiceTerminalStatus !== null;
}

function resolveCompletedClaimArchiveReason(
  row: Pick<CoupangShipmentWorksheetRow, "customerServiceTerminalStatus">,
): Extract<CoupangShipmentArchiveReason, "cancel_completed" | "return_completed"> | null {
  if (row.customerServiceTerminalStatus === "return_completed") {
    return "return_completed";
  }

  if (row.customerServiceTerminalStatus === "cancel_completed") {
    return "cancel_completed";
  }

  return null;
}

function buildShipmentWorksheetArchiveRows(
  rows: CoupangShipmentWorksheetRow[],
  input: {
    archivedAt: string;
    reasonResolver: (row: CoupangShipmentWorksheetRow) => CoupangShipmentArchiveReason | null;
  },
): CoupangShipmentArchiveRow[] {
  return rows
    .map((row) => {
      const archiveReason = input.reasonResolver(row);
      if (!archiveReason) {
        return null;
      }

      return {
        ...row,
        archivedAt: input.archivedAt,
        archiveReason,
      } satisfies CoupangShipmentArchiveRow;
    })
    .filter((row): row is CoupangShipmentArchiveRow => Boolean(row));
}

async function applyCompletedClaimAutoArchive(input: {
  storeId: string;
  rows: CoupangShipmentWorksheetRow[];
  message: string | null;
  archivedAt: string;
  persistToStore: boolean;
}) {
  const normalizedRows = input.rows.map(normalizeWorksheetRow);
  if (!input.persistToStore) {
    return {
      rows: normalizedRows,
      removedSourceKeys: new Set<string>(),
      message: input.message,
    };
  }

  const archiveRows = buildShipmentWorksheetArchiveRows(normalizedRows, {
    archivedAt: input.archivedAt,
    reasonResolver: resolveCompletedClaimArchiveReason,
  }).filter((row) => isShipmentWorksheetCompletedClaimArchiveCandidate(row));

  if (!archiveRows.length) {
    return {
      rows: normalizedRows,
      removedSourceKeys: new Set<string>(),
      message: input.message,
    };
  }

  const removedSourceKeys = new Set(archiveRows.map((row) => row.sourceKey));

  try {
    await coupangShipmentWorksheetStore.archiveRows({
      storeId: input.storeId,
      items: archiveRows,
      archivedAt: input.archivedAt,
    });

    return {
      rows: normalizedRows.filter((row) => !removedSourceKeys.has(row.sourceKey)),
      removedSourceKeys,
      message: mergeMessages([
        input.message,
        `완료된 취소/반품 ${archiveRows.length}건을 보관함으로 이동했습니다.`,
      ]),
    };
  } catch (error) {
    return {
      rows: normalizedRows,
      removedSourceKeys: new Set<string>(),
      message: mergeMessages([
        input.message,
        error instanceof Error
          ? `완료된 취소/반품 자동 보관 ${archiveRows.length}건에 실패해 워크시트에 그대로 유지했습니다. ${error.message}`
          : `완료된 취소/반품 자동 보관 ${archiveRows.length}건에 실패해 워크시트에 그대로 유지했습니다.`,
      ]),
    };
  }
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
      customerServiceTerminalStatus: null,
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
      customerServiceTerminalStatus: row.customerServiceTerminalStatus ?? null,
      customerServiceState: "unknown" as const,
      customerServiceFetchedAt: null,
    };
  }

  return {
    customerServiceIssueCount: row.customerServiceIssueCount ?? 0,
    customerServiceIssueSummary: row.customerServiceIssueSummary ?? null,
    customerServiceIssueBreakdown: row.customerServiceIssueBreakdown ?? [],
    customerServiceTerminalStatus: row.customerServiceTerminalStatus ?? null,
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
  const requestedStatusFilter = normalizeStatusFilter(input.status);
  const requestedMode =
    input.syncMode === "full"
      ? "full"
      : input.syncMode === "new_only"
        ? "new_only"
        : DEFAULT_SYNC_MODE;
  const selectedCreatedAtFrom = normalizeCreatedAtDate(input.createdAtFrom, -3);
  const selectedCreatedAtTo = normalizeCreatedAtDate(input.createdAtTo, 0);
  const isFirstSync =
    !currentSheet.items.length || !currentSyncState.lastIncrementalCollectedAt;
  const expandedEarlierRange =
    Boolean(currentSyncState.coveredCreatedAtFrom) &&
    selectedCreatedAtFrom.localeCompare(currentSyncState.coveredCreatedAtFrom ?? "") < 0;
  const statusChanged = currentSyncState.lastStatusFilter !== requestedStatusFilter;
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
      statusFilter: requestedStatusFilter,
    };
  }

  if (requestedMode === "new_only") {
    const quickCollectReferenceAt =
      currentSyncState.lastIncrementalCollectedAt ?? currentSheet.collectedAt ?? null;
    const quickCollectOverlapStart = quickCollectReferenceAt
      ? normalizeCreatedAtDate(
          subtractHours(quickCollectReferenceAt, INCREMENTAL_OVERLAP_HOURS),
          -1,
        )
      : selectedCreatedAtFrom;

    return {
      mode: "new_only",
      autoExpanded: false,
      fetchCreatedAtFrom: maxRequestedDate(selectedCreatedAtFrom, quickCollectOverlapStart),
      fetchCreatedAtTo: selectedCreatedAtTo,
      statusFilter: null,
    };
  }

  if (isFirstSync || expandedEarlierRange || statusChanged || fullSyncStale) {
    return {
      mode: "full",
      autoExpanded: true,
      fetchCreatedAtFrom: selectedCreatedAtFrom,
      fetchCreatedAtTo: selectedCreatedAtTo,
      statusFilter: requestedStatusFilter,
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
    statusFilter: requestedStatusFilter,
  };
}

async function fetchQuickCollectOrders(input: {
  storeId: string;
  fetchCreatedAtFrom: string;
  fetchCreatedAtTo: string;
  statusFilter: string | null;
  maxPerPage?: number;
}) {
  const statusFilter = normalizeStatusFilter(input.statusFilter);
  const requiredStatuses = statusFilter
    ? [statusFilter]
    : [...QUICK_COLLECT_REQUIRED_STATUSES];
  const collectedBySourceKey = new Map<string, CoupangOrderRow>();
  const failures: string[] = [];
  const statusBatches: ShipmentQuickCollectStatusBatch[] = [];
  let hasRequiredFailure = false;
  let succeededStatusCount = 0;
  const quickCollectPageSize = Math.max(QUICK_COLLECT_PAGE_SIZE, input.maxPerPage ?? QUICK_COLLECT_PAGE_SIZE);
  const getStatusPriority = (status: string | null | undefined) => {
    const normalized = normalizeStatusFilter(status);
    if (normalized === "INSTRUCT") {
      return 2;
    }
    if (normalized === "ACCEPT") {
      return 1;
    }
    return 0;
  };

  const fetchOne = async (status: string, required: boolean) => {
    try {
      const response = await listOrders({
        storeId: input.storeId,
        createdAtFrom: input.fetchCreatedAtFrom,
        createdAtTo: input.fetchCreatedAtTo,
        status,
        maxPerPage: quickCollectPageSize,
        fetchAllPages: true,
        maxPages: QUICK_COLLECT_MAX_PAGES,
        includeCustomerService: false,
      });

      if (response.source !== "live") {
        void recordSystemErrorEvent({
          source: "coupang.shipment.quick-collect.status",
          channel: "coupang",
          error: new Error(
            `${status} quick-collect lookup returned ${response.source}.${response.message ? ` ${response.message}` : ""}`,
          ),
          meta: {
            phase: "quick_collect",
            mode: "new_only",
            status,
            required,
            storeId: input.storeId,
            createdAtFrom: input.fetchCreatedAtFrom,
            createdAtTo: input.fetchCreatedAtTo,
            responseSource: response.source,
          },
        });
        failures.push(
          `${status} 신규 주문 조회에 실패했습니다.${response.message ? ` ${response.message}` : ""}`,
        );
        if (required) {
          hasRequiredFailure = true;
        }
        return;
      }

      statusBatches.push({
        status,
        items: response.items,
      });

      for (const row of response.items) {
        const sourceKey = buildSourceKey(input.storeId, row);
        const existing = collectedBySourceKey.get(sourceKey);
        if (!existing || getStatusPriority(row.status) >= getStatusPriority(existing.status)) {
          collectedBySourceKey.set(sourceKey, row);
        }
      }

      succeededStatusCount += 1;
    } catch (error) {
      void recordSystemErrorEvent({
        source: "coupang.shipment.quick-collect.status",
        channel: "coupang",
        error,
        meta: {
          phase: "quick_collect",
          mode: "new_only",
          status,
          required,
          storeId: input.storeId,
          createdAtFrom: input.fetchCreatedAtFrom,
          createdAtTo: input.fetchCreatedAtTo,
        },
      });
      failures.push(
        error instanceof Error
          ? `${status} 신규 주문 조회에 실패했습니다. ${error.message}`
          : `${status} 신규 주문 조회에 실패했습니다.`,
      );
      if (required) {
        hasRequiredFailure = true;
      }
    }
  };

  for (const status of requiredStatuses) {
    await fetchOne(status, true);
  }

  const partialSuccess = succeededStatusCount > 0 && failures.length > 0;
  const failedStatuses = requiredStatuses.filter((status) =>
    failures.some((message) => message.startsWith(`${status} `)),
  );

  return {
    items: Array.from(collectedBySourceKey.values()),
    source: succeededStatusCount > 0 || !hasRequiredFailure ? "live" : "fallback",
    message: mergeMessages([
      partialSuccess ? "실패한 주문 상태를 제외한 결과만 반영했습니다." : null,
      ...failures,
    ]),
    hasRequiredFailure,
    failedStatuses,
    statusBatches,
  } satisfies ShipmentOrderLookupResult;
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

function mergeWorksheetRowsBySourceKey(
  currentRows: CoupangShipmentWorksheetRow[],
  updates: CoupangShipmentWorksheetRow[],
) {
  const merged = new Map(currentRows.map((row) => [row.sourceKey, row] as const));

  for (const nextRow of updates) {
    merged.set(nextRow.sourceKey, nextRow);
  }

  return Array.from(merged.values());
}

function resolvePurchaseConfirmRefreshTargetRows(input: {
  rows: CoupangShipmentWorksheetRow[];
  createdAtFrom?: string;
  createdAtTo?: string;
}) {
  const createdAtFrom = normalizeWhitespace(input.createdAtFrom);
  const createdAtTo = normalizeWhitespace(input.createdAtTo);

  if (!createdAtFrom || !createdAtTo) {
    throw new Error("구매확정 sync에는 현재 조회 시작일과 종료일이 모두 필요합니다.");
  }

  validateDateOnlyRange(createdAtFrom, createdAtTo);

  return input.rows.filter((row) => {
    const status = normalizeWhitespace(row.orderStatus)?.toUpperCase() ?? "";
    return (
      PURCHASE_CONFIRM_TARGET_STATUSES.has(status) &&
      !row.purchaseConfirmedAt &&
      matchesWorksheetRowDateRange(row, createdAtFrom, createdAtTo)
    );
  });
}

function resolveReconcileShipmentWorksheetTargetRows(input: {
  storeId: string;
  rows: CoupangShipmentWorksheetRow[];
  createdAtFrom: string;
  createdAtTo: string;
  viewQuery?: ReconcileCoupangShipmentWorksheetInput["viewQuery"];
}) {
  validateDateOnlyRange(input.createdAtFrom, input.createdAtTo);

  const { filteredRows } = resolveShipmentWorksheetFilteredRows(input.rows, {
    ...input.viewQuery,
    storeId: input.storeId,
  });

  return filteredRows.filter((row) =>
    matchesWorksheetRowDateRange(row, input.createdAtFrom, input.createdAtTo),
  );
}

function resolveShipmentWorksheetRefreshTargets(input: {
  rows: CoupangShipmentWorksheetRow[];
  scope: RefreshCoupangShipmentWorksheetInput["scope"];
  shipmentBoxIds: string[];
  nowIso: string;
  createdAtFrom?: string;
  createdAtTo?: string;
}) {
  if (input.scope === "purchase_confirmed") {
    return {
      rows: resolvePurchaseConfirmRefreshTargetRows({
        rows: input.rows,
        createdAtFrom: input.createdAtFrom,
        createdAtTo: input.createdAtTo,
      }),
      phases: ["purchase_confirm_refresh"] as CoupangShipmentWorksheetSyncPhase[],
    };
  }

  if (input.scope === "customer_service") {
    return {
      rows: input.rows,
      phases: ["customer_service_refresh"] as CoupangShipmentWorksheetSyncPhase[],
    };
  }

  if (input.scope === "shipment_boxes") {
    const shipmentBoxIdSet = new Set(
      input.shipmentBoxIds
        .map((value) => normalizeWhitespace(value))
        .filter((value): value is string => Boolean(value)),
    );

    return {
      rows: input.rows.filter((row) => shipmentBoxIdSet.has(row.shipmentBoxId)),
      phases: [
        "order_detail_hydration",
        "product_detail_hydration",
        "customer_service_refresh",
      ] as CoupangShipmentWorksheetSyncPhase[],
    };
  }

  return {
    rows: input.rows.filter(
      (row) =>
        shouldRefreshWorksheetOrderDetail(row, input.nowIso) ||
        shouldRefreshWorksheetProductDetail(row) ||
        shouldRefreshWorksheetCustomerService(row, input.nowIso),
    ),
    phases: [
      "order_detail_hydration",
      "product_detail_hydration",
      "customer_service_refresh",
    ] as CoupangShipmentWorksheetSyncPhase[],
  };
}

function buildShipmentWorksheetRefreshResponse(
  store: StoredCoupangStore,
  sheet: WorksheetStoreSheet,
  input: {
    scope: RefreshCoupangShipmentWorksheetInput["scope"];
    updatedRows: CoupangShipmentWorksheetRow[];
    refreshedCount: number;
    updatedCount: number;
    completedPhases: CoupangShipmentWorksheetSyncPhase[];
    pendingPhases: CoupangShipmentWorksheetSyncPhase[];
    warningPhases: CoupangShipmentWorksheetSyncPhase[];
    message: string | null;
  },
): CoupangShipmentWorksheetRefreshResponse {
  return {
    store: asStoreRef(store),
    scope: input.scope,
    items: buildWorksheetRowsSnapshot(input.updatedRows),
    fetchedAt: new Date().toISOString(),
    message: normalizeLegacyWorksheetMessage(input.message ?? sheet.message),
    source: sheet.source,
    syncSummary: sheet.syncSummary,
    refreshedCount: input.refreshedCount,
    updatedCount: input.updatedCount,
    completedPhases: input.completedPhases,
    pendingPhases: input.pendingPhases,
    warningPhases: input.warningPhases,
  };
}

function buildReconcileShipmentWorksheetResponse(
  store: StoredCoupangStore,
  sheet: WorksheetStoreSheet,
  input: {
    archivedCount: number;
    refreshedCount: number;
    warningCount: number;
    warnings: string[];
    message: string | null;
  },
): ReconcileCoupangShipmentWorksheetResponse {
  return {
    store: asStoreRef(store),
    archivedCount: input.archivedCount,
    refreshedCount: input.refreshedCount,
    warningCount: input.warningCount,
    warnings: input.warnings,
    fetchedAt: new Date().toISOString(),
    message: normalizeLegacyWorksheetMessage(input.message ?? sheet.message),
    source: sheet.source,
  };
}

function pushUniqueWorksheetWarning(warnings: string[], value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);
  if (normalized && !warnings.includes(normalized)) {
    warnings.push(normalized);
  }
}

function buildPurchaseConfirmFallbackIndex(rows: readonly CoupangShipmentWorksheetRow[]) {
  const index = new Map<string, Map<string, CoupangShipmentWorksheetRow[]>>();

  for (const row of rows) {
    const orderId = normalizeWhitespace(row.orderId);
    if (!orderId) {
      continue;
    }

    const keys = buildPurchaseConfirmFallbackNameKeys(row);
    if (!keys.length) {
      continue;
    }

    let nameMap = index.get(orderId);
    if (!nameMap) {
      nameMap = new Map<string, CoupangShipmentWorksheetRow[]>();
      index.set(orderId, nameMap);
    }

    for (const key of keys) {
      const current = nameMap.get(key) ?? [];
      current.push(row);
      nameMap.set(key, current);
    }
  }

  return index;
}

function resolvePurchaseConfirmedSettlementTarget(input: {
  settlement: CoupangSettlementRow;
  rowByVendorKey: Map<string, CoupangShipmentWorksheetRow>;
  fallbackIndex: Map<string, Map<string, CoupangShipmentWorksheetRow[]>>;
  matchedRowIds: Set<string>;
  warnings: string[];
}) {
  const vendorKey = buildPurchaseConfirmVendorItemKey(
    input.settlement.orderId,
    input.settlement.vendorItemId,
  );
  if (vendorKey) {
    const matched = input.rowByVendorKey.get(vendorKey);
    if (matched && !input.matchedRowIds.has(matched.id)) {
      return matched;
    }
    return null;
  }

  const orderId = normalizeWhitespace(input.settlement.orderId);
  if (!orderId) {
    return null;
  }

  const nameIndex = input.fallbackIndex.get(orderId);
  if (!nameIndex) {
    return null;
  }

  const matchedRows = new Map<string, CoupangShipmentWorksheetRow>();
  for (const key of buildPurchaseConfirmSettlementNameKeys(input.settlement)) {
    for (const candidate of nameIndex.get(key) ?? []) {
      if (!input.matchedRowIds.has(candidate.id)) {
        matchedRows.set(candidate.id, candidate);
      }
    }
  }

  if (matchedRows.size === 1) {
    return Array.from(matchedRows.values())[0] ?? null;
  }

  if (matchedRows.size > 1) {
    pushUniqueWorksheetWarning(
      input.warnings,
      `주문 ${orderId} 구매확정 매칭을 건너뛰었습니다. vendorItemId가 없어 상품명 fallback 후보가 ${matchedRows.size}건으로 겹칩니다.`,
    );
  }

  return null;
}

async function refreshPurchaseConfirmedWorksheetRows(input: {
  store: StoredCoupangStore;
  currentSheet: WorksheetStoreSheet;
  request: RefreshCoupangShipmentWorksheetInput & {
    persistToStore?: boolean;
  };
  refreshTargets: {
    rows: CoupangShipmentWorksheetRow[];
    phases: CoupangShipmentWorksheetSyncPhase[];
  };
  nowIso: string;
}) {
  const warnings: string[] = [];
  const today = formatSeoulDateOnly(new Date());
  const createdAtFrom = normalizeWhitespace(input.request.createdAtFrom);
  const createdAtTo = normalizeWhitespace(input.request.createdAtTo);

  if (!createdAtFrom || !createdAtTo) {
    throw new Error("구매확정 sync에는 현재 조회 기간이 필요합니다.");
  }

  validateDateOnlyRange(createdAtFrom, createdAtTo);

  const targetRows = input.refreshTargets.rows;
  const rowByVendorKey = new Map<string, CoupangShipmentWorksheetRow>();
  for (const row of targetRows) {
    const vendorKey = buildPurchaseConfirmVendorItemKey(row.orderId, row.vendorItemId);
    if (vendorKey) {
      rowByVendorKey.set(vendorKey, row);
    }
  }
  const fallbackIndex = buildPurchaseConfirmFallbackIndex(targetRows);
  const matchedRowIds = new Set<string>();
  const updatedRowsBySourceKey = new Map<string, CoupangShipmentWorksheetRow>();
  const recognitionRanges = buildDateOnlyRanges({
    dateFrom: createdAtFrom,
    dateTo: today,
    maxRangeDays: PURCHASE_CONFIRM_MAX_RANGE_DAYS,
  });

  for (const range of recognitionRanges) {
    if (matchedRowIds.size >= targetRows.length) {
      break;
    }

    const response = await listSettlementSales({
      storeId: input.request.storeId,
      recognitionDateFrom: range.createdAtFrom,
      recognitionDateTo: range.createdAtTo,
      maxPerPage: PURCHASE_CONFIRM_PAGE_SIZE,
      maxPageCount: PURCHASE_CONFIRM_SAFE_PAGE_CAP,
    });

    pushUniqueWorksheetWarning(warnings, response.message);
    if (response.source !== "live") {
      continue;
    }

    for (const settlement of response.items) {
      if (normalizeWhitespace(settlement.saleType)?.toUpperCase() !== "SALE") {
        continue;
      }

      const matchedRow = resolvePurchaseConfirmedSettlementTarget({
        settlement,
        rowByVendorKey,
        fallbackIndex,
        matchedRowIds,
        warnings,
      });
      if (!matchedRow || matchedRowIds.has(matchedRow.id)) {
        continue;
      }

      const purchaseConfirmedAt =
        normalizeWhitespace(settlement.recognitionDate) ??
        normalizeWhitespace(settlement.settlementDate) ??
        normalizeWhitespace(settlement.finalSettlementDate) ??
        input.nowIso;
      const nextRow = normalizeWorksheetRow({
        ...matchedRow,
        purchaseConfirmedAt,
        purchaseConfirmedSyncedAt: input.nowIso,
        purchaseConfirmedFinalSettlementDate:
          normalizeWhitespace(settlement.finalSettlementDate) ??
          matchedRow.purchaseConfirmedFinalSettlementDate ??
          null,
        purchaseConfirmedSource: PURCHASE_CONFIRM_SOURCE,
        updatedAt: input.nowIso,
      });

      updatedRowsBySourceKey.set(nextRow.sourceKey, nextRow);
      matchedRowIds.add(matchedRow.id);
    }
  }

  const mergedRows = mergeWorksheetRowsBySourceKey(
    input.currentSheet.items,
    Array.from(updatedRowsBySourceKey.values()),
  );
  const nextMessage = mergeMessages([
    input.currentSheet.message,
    warnings.length > 0 ? `구매확정 sync 중 경고 ${warnings.length}건이 있습니다.` : null,
  ]);
  const autoArchiveResult = await applyCompletedClaimAutoArchive({
    storeId: input.request.storeId,
    rows: mergedRows,
    message: nextMessage,
    archivedAt: input.nowIso,
    persistToStore: input.request.persistToStore !== false,
  });
  const persistedSheet =
    input.request.persistToStore === false
      ? {
          ...input.currentSheet,
          items: autoArchiveResult.rows,
          message: autoArchiveResult.message,
          updatedAt: input.nowIso,
        }
      : await coupangShipmentWorksheetStore.setStoreSheet({
          storeId: input.request.storeId,
          items: autoArchiveResult.rows,
          collectedAt: input.currentSheet.collectedAt,
          source: input.currentSheet.source,
          message: autoArchiveResult.message,
          syncState: input.currentSheet.syncState ?? createEmptySyncState(),
          syncSummary: input.currentSheet.syncSummary,
        });
  const updatedRows = Array.from(updatedRowsBySourceKey.values()).filter(
    (row) => !autoArchiveResult.removedSourceKeys.has(row.sourceKey),
  );
  const warningPhases =
    warnings.length > 0
      ? (["purchase_confirm_refresh"] as CoupangShipmentWorksheetSyncPhase[])
      : [];
  const completedPhases =
    warnings.length > 0
      ? []
      : (["purchase_confirm_refresh"] as CoupangShipmentWorksheetSyncPhase[]);

  return buildShipmentWorksheetRefreshResponse(input.store, persistedSheet, {
    scope: input.request.scope,
    updatedRows,
    refreshedCount: targetRows.length,
    updatedCount: updatedRowsBySourceKey.size,
    completedPhases,
    pendingPhases: [],
    warningPhases,
    message: autoArchiveResult.message,
  });
}

async function refreshShipmentWorksheetRows(
  input: RefreshCoupangShipmentWorksheetInput & {
    currentSheet?: WorksheetStoreSheet;
    persistToStore?: boolean;
    skipProductDetailHydration?: boolean;
  },
) {
  const store = await getStoreOrThrow(input.storeId);
  const currentSheet =
    input.currentSheet ?? (await coupangShipmentWorksheetStore.getStoreSheet(input.storeId));
  const now = new Date().toISOString();
  const syncPlan = buildReadCustomerServiceSyncPlan(currentSheet);
  const refreshTargets = resolveShipmentWorksheetRefreshTargets({
    rows: currentSheet.items.map(normalizeWorksheetRow),
    scope: input.scope,
    shipmentBoxIds: input.shipmentBoxIds ?? [],
    nowIso: now,
    createdAtFrom: input.createdAtFrom,
    createdAtTo: input.createdAtTo,
  });

  if (!refreshTargets.rows.length) {
    const completedPhases =
      input.scope === "pending_after_collect"
        ? currentSheet.syncSummary?.completedPhases ?? []
        : [];
    const pendingPhases =
      input.scope === "pending_after_collect"
        ? currentSheet.syncSummary?.pendingPhases ?? []
        : [];
    const warningPhases =
      input.scope === "pending_after_collect"
        ? currentSheet.syncSummary?.warningPhases ?? []
        : [];

    return buildShipmentWorksheetRefreshResponse(store, currentSheet, {
      scope: input.scope,
      updatedRows: [],
      refreshedCount: 0,
      updatedCount: 0,
      completedPhases,
      pendingPhases,
      warningPhases,
      message: null,
    });
  }

  if (input.scope === "purchase_confirmed") {
    return refreshPurchaseConfirmedWorksheetRows({
      store,
      currentSheet,
      request: input,
      refreshTargets,
      nowIso: now,
    });
  }

  const phaseSet = new Set(refreshTargets.phases);
  if (input.skipProductDetailHydration) {
    phaseSet.delete("product_detail_hydration");
  }
  const detailWarnings: string[] = [];
  const productWarnings: string[] = [];
  const detailByShipmentBoxId = new Map<
    string,
    {
      detail: CoupangOrderDetail | null;
      preserveCustomerService: boolean;
    }
  >();

  if (phaseSet.has("order_detail_hydration")) {
    const detailTargets = Array.from(
      new Set(
        refreshTargets.rows
          .filter((row) =>
            input.scope === "shipment_boxes" ? true : shouldRefreshWorksheetOrderDetail(row, now),
          )
          .map((row) => normalizeWhitespace(row.shipmentBoxId))
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

    for (const result of detailResults) {
      detailByShipmentBoxId.set(result.shipmentBoxId, {
        detail: result.detail,
        preserveCustomerService: result.preserveCustomerService,
      });
    }
  }

  const productDetailPromiseBySellerProductId = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getProductDetail>> | null>
  >();
  const getProductDetailCached = (row: CoupangShipmentWorksheetRow) => {
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

  const refreshedRows = await mapWithConcurrency(refreshTargets.rows, 4, async (currentRow) => {
    const detailResult = detailByShipmentBoxId.get(currentRow.shipmentBoxId) ?? null;
    const detail = detailResult?.detail ?? null;
    const detailItem =
      detail?.items.find(
        (item) =>
          item.vendorItemId === currentRow.vendorItemId ||
          (item.orderId === currentRow.orderId && item.shipmentBoxId === currentRow.shipmentBoxId),
      ) ?? null;
    const sourceRow = detailItem ?? buildOrderRowFromWorksheetRow(currentRow);
    const productDetail =
      phaseSet.has("product_detail_hydration") && shouldRefreshWorksheetProductDetail(currentRow)
        ? await getProductDetailCached(currentRow)
        : null;

    return buildWorksheetRow({
      store,
      row: sourceRow,
      currentRow,
      nowIso: now,
      detail,
      productDetail,
      selpickOrderNumber: currentRow.selpickOrderNumber,
    });
  });

  const customerServiceRefresh =
    phaseSet.has("customer_service_refresh")
      ? await refreshWorksheetCustomerServiceStatuses({
          storeId: input.storeId,
          rows: refreshedRows,
          syncPlan,
          forceRefresh: true,
        })
      : {
          rows: refreshedRows,
          message: null,
        };

  const finalRows = customerServiceRefresh.rows;
  const updatedCount = finalRows.filter((row, index) =>
    hasWorksheetRowChanged(refreshTargets.rows[index], row),
  ).length;
  const activePhases = refreshTargets.phases.filter((phase) => phaseSet.has(phase));
  const warningPhases = uniqueShipmentSyncPhases([
    ...(detailWarnings.length > 0 ? (["order_detail_hydration"] as const) : []),
    ...(productWarnings.length > 0 ? (["product_detail_hydration"] as const) : []),
    ...(customerServiceRefresh.message ? (["customer_service_refresh"] as const) : []),
  ]);
  const completedPhases = activePhases.filter(
    (phase) => !warningPhases.includes(phase),
  );
  const nextSyncSummary =
    input.scope === "pending_after_collect" && currentSheet.syncSummary
      ? {
          ...currentSheet.syncSummary,
          ...mergeShipmentWorksheetSyncPhases(currentSheet.syncSummary, {
            completedPhases: uniqueShipmentSyncPhases([
              ...(currentSheet.syncSummary.completedPhases ?? []),
              ...completedPhases,
            ]),
            pendingPhases: currentSheet.syncSummary.pendingPhases.filter(
              (phase) => !refreshTargets.phases.includes(phase),
            ),
            warningPhases: uniqueShipmentSyncPhases([
              ...(currentSheet.syncSummary.warningPhases ?? []),
              ...warningPhases,
            ]),
          }),
        }
      : currentSheet.syncSummary;
  const nextMessage = mergeMessages([
    currentSheet.message,
    detailWarnings.length
      ? `주문 상세 ${detailWarnings.length}건은 기존 정보로 유지했습니다.`
      : null,
    productWarnings.length
      ? `상품 상세 ${productWarnings.length}건은 주문 기본값으로 유지했습니다.`
      : null,
    customerServiceRefresh.message,
  ]);
  const mergedRows = mergeWorksheetRowsBySourceKey(currentSheet.items, finalRows);
  const autoArchiveResult = await applyCompletedClaimAutoArchive({
    storeId: input.storeId,
    rows: mergedRows,
    message: nextMessage,
    archivedAt: now,
    persistToStore: input.persistToStore !== false,
  });
  const updatedRows = finalRows.filter(
    (row) => !autoArchiveResult.removedSourceKeys.has(row.sourceKey),
  );
  const nextSheet =
    input.persistToStore === false
      ? {
          ...currentSheet,
          items: autoArchiveResult.rows,
          message: autoArchiveResult.message,
          syncSummary: nextSyncSummary,
          updatedAt: new Date().toISOString(),
        }
      : await coupangShipmentWorksheetStore.setStoreSheet({
          storeId: input.storeId,
          items: autoArchiveResult.rows,
          collectedAt: currentSheet.collectedAt,
          source: currentSheet.source,
          message: autoArchiveResult.message,
          syncState: currentSheet.syncState ?? createEmptySyncState(),
          syncSummary: nextSyncSummary,
        });

  return buildShipmentWorksheetRefreshResponse(store, nextSheet, {
    scope: input.scope,
    updatedRows,
    refreshedCount: refreshTargets.rows.length,
    updatedCount,
    completedPhases:
      input.scope === "pending_after_collect"
        ? nextSheet.syncSummary?.completedPhases ?? completedPhases
        : completedPhases,
    pendingPhases:
      input.scope === "pending_after_collect"
        ? nextSheet.syncSummary?.pendingPhases ?? []
        : [],
    warningPhases:
      input.scope === "pending_after_collect"
        ? nextSheet.syncSummary?.warningPhases ?? warningPhases
        : warningPhases,
    message: autoArchiveResult.message,
  });
}

export async function refreshShipmentWorksheet(
  input: RefreshCoupangShipmentWorksheetInput,
): Promise<CoupangShipmentWorksheetRefreshResponse> {
  return refreshShipmentWorksheetRows(input);
}

export async function reconcileShipmentWorksheetLive(
  input: ReconcileCoupangShipmentWorksheetInput,
): Promise<ReconcileCoupangShipmentWorksheetResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const currentSheet = await coupangShipmentWorksheetStore.getStoreSheet(input.storeId);
  const createdAtFrom = normalizeWhitespace(input.createdAtFrom);
  const createdAtTo = normalizeWhitespace(input.createdAtTo);

  if (!createdAtFrom || !createdAtTo) {
    throw new Error("미조회 정리는 현재 조회 시작일과 종료일이 모두 필요합니다.");
  }

  const worksheetRows = buildWorksheetRows(currentSheet);
  const targetRows = resolveReconcileShipmentWorksheetTargetRows({
    storeId: input.storeId,
    rows: worksheetRows,
    createdAtFrom,
    createdAtTo,
    viewQuery: input.viewQuery,
  });

  if (!targetRows.length) {
    return buildReconcileShipmentWorksheetResponse(store, currentSheet, {
      archivedCount: 0,
      refreshedCount: 0,
      warningCount: 0,
      warnings: [],
      message: "현재 화면 필터와 조회 기간에서 정리할 주문이 없습니다.",
    });
  }

  const nowIso = new Date().toISOString();
  const warningMessages: string[] = [];
  const warningSourceKeys = new Set<string>();
  const liveMissingRows: CoupangShipmentWorksheetRow[] = [];

  const liveCheckResults = await mapWithConcurrency(targetRows, 4, async (row) => {
    try {
      const response = await getOrderDetail({
        storeId: input.storeId,
        shipmentBoxId: row.shipmentBoxId,
        includeCustomerService: false,
      });

      if (response.source === "live" && !response.item) {
        return {
          row,
          shouldArchive: true,
          warning: null,
        };
      }

      if (response.source !== "live") {
        return {
          row,
          shouldArchive: false,
          warning:
            response.message ??
            `${row.shipmentBoxId}: 쿠팡 live 상세 조회가 fallback으로 내려와 제외하지 않았습니다.`,
        };
      }

      return {
        row,
        shouldArchive: false,
        warning: null,
      };
    } catch (error) {
      return {
        row,
        shouldArchive: false,
        warning:
          error instanceof Error
            ? `${row.shipmentBoxId}: ${error.message}`
            : `${row.shipmentBoxId}: 쿠팡 live 상세 조회에 실패해 제외하지 않았습니다.`,
      };
    }
  });

  for (const result of liveCheckResults) {
    if (result.shouldArchive) {
      liveMissingRows.push(result.row);
      continue;
    }

    if (result.warning) {
      warningSourceKeys.add(result.row.sourceKey);
      pushUniqueWorksheetWarning(warningMessages, result.warning);
    }
  }

  let archivedCount = 0;
  let archivedSourceKeys = new Set<string>();
  let workingRows = worksheetRows;

  if (liveMissingRows.length) {
    const archiveRows = buildShipmentWorksheetArchiveRows(liveMissingRows, {
      archivedAt: nowIso,
      reasonResolver: () => "not_found_in_coupang",
    });

    try {
      const archiveResult = await coupangShipmentWorksheetStore.archiveRows({
        storeId: input.storeId,
        items: archiveRows,
        archivedAt: nowIso,
      });
      archivedCount = archiveResult.archivedCount;
      archivedSourceKeys = new Set(archiveResult.archivedSourceKeys);
      workingRows = worksheetRows.filter((row) => !archivedSourceKeys.has(row.sourceKey));

      const unresolvedRows = liveMissingRows.filter(
        (row) => !archivedSourceKeys.has(row.sourceKey),
      );
      if (unresolvedRows.length) {
        for (const row of unresolvedRows) {
          warningSourceKeys.add(row.sourceKey);
        }
        pushUniqueWorksheetWarning(
          warningMessages,
          `쿠팡 live 미조회 ${unresolvedRows.length}건은 보관함으로 옮기지 못해 워크시트에 남겼습니다.`,
        );
      }
    } catch (error) {
      for (const row of liveMissingRows) {
        warningSourceKeys.add(row.sourceKey);
      }
      pushUniqueWorksheetWarning(
        warningMessages,
        error instanceof Error
          ? `쿠팡 live 미조회 ${liveMissingRows.length}건을 보관함으로 이동하지 못했습니다. ${error.message}`
          : `쿠팡 live 미조회 ${liveMissingRows.length}건을 보관함으로 이동하지 못했습니다.`,
      );
    }
  }

  const baseMessage = mergeMessages([
    currentSheet.message,
    archivedCount > 0
      ? `쿠팡 live 상세에서 조회되지 않은 ${archivedCount}건을 보관함으로 이동했습니다.`
      : null,
    warningSourceKeys.size > 0
      ? `제외하지 못한 경고 ${warningSourceKeys.size}건이 있어 워크시트에 유지했습니다.`
      : null,
  ]);

  const remainingShipmentBoxIds = Array.from(
    new Set(
      targetRows
        .filter((row) => !archivedSourceKeys.has(row.sourceKey))
        .map((row) => normalizeWhitespace(row.shipmentBoxId))
        .filter((shipmentBoxId): shipmentBoxId is string => Boolean(shipmentBoxId)),
    ),
  );

  if (!remainingShipmentBoxIds.length) {
    const nextSheet = await coupangShipmentWorksheetStore.setStoreSheet({
      storeId: input.storeId,
      items: workingRows,
      collectedAt: currentSheet.collectedAt,
      source: currentSheet.source,
      message: baseMessage,
      syncState: currentSheet.syncState ?? createEmptySyncState(),
      syncSummary: currentSheet.syncSummary,
    });

    return buildReconcileShipmentWorksheetResponse(store, nextSheet, {
      archivedCount,
      refreshedCount: 0,
      warningCount: warningSourceKeys.size,
      warnings: warningMessages,
      message: baseMessage,
    });
  }

  const refreshResult = await refreshShipmentWorksheetRows({
    storeId: input.storeId,
    scope: "shipment_boxes",
    shipmentBoxIds: remainingShipmentBoxIds,
    currentSheet: {
      ...currentSheet,
      items: workingRows,
      message: baseMessage,
      updatedAt: nowIso,
    },
    persistToStore: true,
    skipProductDetailHydration: true,
  });
  if (refreshResult.warningPhases.length > 0 && refreshResult.message) {
    pushUniqueWorksheetWarning(warningMessages, refreshResult.message);
  }
  const nextSheet = await coupangShipmentWorksheetStore.getStoreSheet(input.storeId);

  return buildReconcileShipmentWorksheetResponse(store, nextSheet, {
    archivedCount,
    refreshedCount: refreshResult.refreshedCount,
    warningCount: warningSourceKeys.size,
    warnings: warningMessages,
    message: refreshResult.message,
  });
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

function shouldHydrateWorksheetOptionDuringCollect(
  currentRow: CoupangShipmentWorksheetRow | undefined,
) {
  if (!currentRow) {
    return true;
  }

  if (!normalizeWhitespace(currentRow.optionName)) {
    return true;
  }

  return hasMixedWorksheetOptionName(
    currentRow.optionName,
    currentRow.productName,
    currentRow.exposedProductName,
  );
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
    customerServiceTerminalStatus: input.issueState.customerServiceTerminalStatus,
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
  return (
    Boolean(normalizeWhitespace(row.customerServiceIssueSummary)) ||
    row.customerServiceIssueCount > 0 ||
    row.customerServiceTerminalStatus !== null
  );
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
          customerServiceTerminalStatus: shouldPreserveExistingIssue
            ? row.customerServiceTerminalStatus
            : summary.customerServiceTerminalStatus,
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

function uniqueShipmentSyncPhases(
  phases: readonly CoupangShipmentWorksheetSyncPhase[] | null | undefined,
) {
  return Array.from(new Set((phases ?? []).filter(Boolean)));
}

function buildCollectPhaseState(input: {
  hasCollectWarnings: boolean;
  hasOrderDetailHydration: boolean;
  hasProductDetailHydration: boolean;
  hasCustomerServiceRefresh: boolean;
}): ShipmentWorksheetRefreshPhaseState {
  const pendingPhases = COLLECT_PENDING_PHASES.filter((phase) => {
    if (phase === "order_detail_hydration") {
      return input.hasOrderDetailHydration;
    }
    if (phase === "product_detail_hydration") {
      return input.hasProductDetailHydration;
    }
    if (phase === "customer_service_refresh") {
      return input.hasCustomerServiceRefresh;
    }
    return false;
  });

  return {
    completedPhases: input.hasCollectWarnings ? [] : [...COLLECT_COMPLETED_PHASES],
    pendingPhases: uniqueShipmentSyncPhases(pendingPhases),
    warningPhases: input.hasCollectWarnings ? ["worksheet_collect"] : [],
  };
}

function mergeShipmentWorksheetSyncPhases(
  summary: CoupangShipmentWorksheetSyncSummary | null | undefined,
  patch: Partial<ShipmentWorksheetRefreshPhaseState>,
): ShipmentWorksheetRefreshPhaseState {
  return {
    completedPhases: uniqueShipmentSyncPhases(
      patch.completedPhases ?? summary?.completedPhases ?? [],
    ),
    pendingPhases: uniqueShipmentSyncPhases(
      patch.pendingPhases ?? summary?.pendingPhases ?? [],
    ),
    warningPhases: uniqueShipmentSyncPhases(
      patch.warningPhases ?? summary?.warningPhases ?? [],
    ),
  };
}

function buildWorksheetRowsSnapshot(rows: CoupangShipmentWorksheetRow[]) {
  const nowIso = new Date().toISOString();
  return rows.map((row) =>
    decorateWorksheetRowCustomerServiceState(normalizeWorksheetRow(row), nowIso),
  );
}

function buildSyncSummary(input: {
  plan: ShipmentWorksheetSyncPlan;
  fetchedCount: number;
  insertedCount: number;
  insertedSourceKeys?: string[];
  updatedCount: number;
  skippedHydrationCount: number;
  phaseState: ShipmentWorksheetRefreshPhaseState;
  degraded?: boolean;
  failedStatuses?: string[];
  autoAuditRecommended?: boolean;
  checkpointCount?: number;
  checkpointPersistedCount?: number;
  lastCheckpointAt?: string | null;
}): CoupangShipmentWorksheetSyncSummary {
  return {
    mode: input.plan.mode,
    fetchedCount: input.fetchedCount,
    insertedCount: input.insertedCount,
    insertedSourceKeys:
      input.plan.mode === "new_only" ? [...(input.insertedSourceKeys ?? [])] : [],
    updatedCount: input.updatedCount,
    skippedHydrationCount: input.skippedHydrationCount,
    autoExpanded: input.plan.autoExpanded,
    fetchCreatedAtFrom: input.plan.fetchCreatedAtFrom,
    fetchCreatedAtTo: input.plan.fetchCreatedAtTo,
    statusFilter: input.plan.statusFilter,
    completedPhases: input.phaseState.completedPhases,
    pendingPhases: input.phaseState.pendingPhases,
    warningPhases: input.phaseState.warningPhases,
    degraded: input.degraded === true,
    failedStatuses: input.failedStatuses ?? [],
    autoAuditRecommended: input.autoAuditRecommended === true,
    checkpointCount:
      input.plan.mode === "new_only" ? Math.max(0, input.checkpointCount ?? 0) : 0,
    checkpointPersistedCount:
      input.plan.mode === "new_only" ? Math.max(0, input.checkpointPersistedCount ?? 0) : 0,
    lastCheckpointAt:
      input.plan.mode === "new_only" ? input.lastCheckpointAt ?? null : null,
  };
}

type ShipmentWorksheetPersistContext = {
  operation: "set" | "upsert";
  storeId: string;
  mode: CoupangShipmentSyncMode;
  persistRowCount: number;
  createdAtFrom: string;
  createdAtTo: string;
};

function getWorksheetPersistChunkCount(rowCount: number) {
  if (rowCount <= 0) {
    return 0;
  }

  return Math.ceil(rowCount / WORKSHEET_ROW_WRITE_CHUNK_SIZE);
}

function extractWorksheetDatabaseErrorInfo(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      code: null,
      constraint: null,
      column: null,
      detail: null,
    };
  }

  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : null,
    constraint: typeof record.constraint === "string" ? record.constraint : null,
    column: typeof record.column === "string" ? record.column : null,
    detail: typeof record.detail === "string" ? record.detail : null,
  };
}

function buildWorksheetPersistErrorMessage(
  context: ShipmentWorksheetPersistContext,
  error: unknown,
) {
  const info = extractWorksheetDatabaseErrorInfo(error);
  const chunkCount = getWorksheetPersistChunkCount(context.persistRowCount);

  if (info.code === "23505") {
    return `배송 시트 저장 중 중복 키 충돌이 발생했습니다. 제약=${info.constraint ?? "unknown"}, mode=${context.mode}, storeId=${context.storeId}`;
  }

  if (info.code === "23502") {
    return `배송 시트 저장 중 필수 컬럼 누락이 발생했습니다. 컬럼=${info.column ?? "unknown"}, mode=${context.mode}, storeId=${context.storeId}`;
  }

  return `배송 시트 저장 중 DB 쓰기 오류가 발생했습니다. rows=${context.persistRowCount}, chunks=${chunkCount}, mode=${context.mode}, storeId=${context.storeId}`;
}

async function recordWorksheetPersistError(
  context: ShipmentWorksheetPersistContext,
  error: unknown,
) {
  const info = extractWorksheetDatabaseErrorInfo(error);
  const chunkCount = getWorksheetPersistChunkCount(context.persistRowCount);

  await recordSystemErrorEvent({
    source: "coupang.shipment.collect.persist",
    channel: "coupang",
    error,
    meta: {
      phase: "worksheet_persist",
      operation: context.operation,
      storeId: context.storeId,
      mode: context.mode,
      persistRowCount: context.persistRowCount,
      chunkSize: WORKSHEET_ROW_WRITE_CHUNK_SIZE,
      chunkCount,
      createdAtFrom: context.createdAtFrom,
      createdAtTo: context.createdAtTo,
      dbCode: info.code,
      constraint: info.constraint,
      column: info.column,
      detail: info.detail,
    },
  });
}

async function setWorksheetStoreSheetWithDiagnostics(
  input: Parameters<typeof coupangShipmentWorksheetStore.setStoreSheet>[0],
  context: Omit<ShipmentWorksheetPersistContext, "operation" | "persistRowCount">,
) {
  try {
    return await coupangShipmentWorksheetStore.setStoreSheet(input);
  } catch (error) {
    await recordWorksheetPersistError(
      {
        ...context,
        operation: "set",
        persistRowCount: input.items.length,
      },
      error,
    );
    throw new Error(
      buildWorksheetPersistErrorMessage(
        {
          ...context,
          operation: "set",
          persistRowCount: input.items.length,
        },
        error,
      ),
    );
  }
}

async function upsertWorksheetStoreRowsWithDiagnostics(
  input: Parameters<typeof coupangShipmentWorksheetStore.upsertStoreRows>[0],
  context: Omit<ShipmentWorksheetPersistContext, "operation" | "persistRowCount">,
) {
  try {
    return await coupangShipmentWorksheetStore.upsertStoreRows(input);
  } catch (error) {
    await recordWorksheetPersistError(
      {
        ...context,
        operation: "upsert",
        persistRowCount: input.items.length,
      },
      error,
    );
    throw new Error(
      buildWorksheetPersistErrorMessage(
        {
          ...context,
          operation: "upsert",
          persistRowCount: input.items.length,
        },
        error,
      ),
    );
  }
}

async function buildCollectedWorksheetRows(input: {
  store: StoredCoupangStore;
  collectionCandidates: ShipmentWorksheetCollectionCandidate[];
  nowIso: string;
  selpickAllocator: ReturnType<typeof createSelpickAllocator>;
  platformKey: ReturnType<typeof resolvePlatformKey>;
  shouldHydrateOptionsDuringCollect: (
    currentRow: CoupangShipmentWorksheetRow | undefined,
  ) => boolean;
}) {
  const optionHydrationCandidates = input.collectionCandidates.filter((candidate) =>
    input.shouldHydrateOptionsDuringCollect(candidate.currentRow),
  );
  const optionDetailByShipmentBoxId = new Map<string, CoupangOrderDetail | null>();

  if (optionHydrationCandidates.length) {
    const detailTargets = Array.from(
      new Set(
        optionHydrationCandidates
          .map((candidate) => normalizeWhitespace(candidate.row.shipmentBoxId))
          .filter((shipmentBoxId): shipmentBoxId is string => Boolean(shipmentBoxId)),
      ),
    );

    const detailResults = await mapWithConcurrency(detailTargets, 4, async (shipmentBoxId) => {
      try {
        const response = await getOrderDetail({
          storeId: input.store.id,
          shipmentBoxId,
          includeCustomerService: false,
        });

        return response.source === "live" ? response.item : null;
      } catch {
        return null;
      }
    });

    detailTargets.forEach((shipmentBoxId, index) => {
      optionDetailByShipmentBoxId.set(shipmentBoxId, detailResults[index] ?? null);
    });
  }

  const collectProductDetailPromiseBySellerProductId = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getProductDetail>> | null>
  >();
  const getCollectProductDetailCached = (row: CoupangOrderRow) => {
    if (!row.sellerProductId) {
      return Promise.resolve(null);
    }

    const cached = collectProductDetailPromiseBySellerProductId.get(row.sellerProductId);
    if (cached) {
      return cached;
    }

    const nextPromise = getProductDetail({
      storeId: input.store.id,
      sellerProductId: row.sellerProductId,
    })
      .then((response) => (response?.source === "live" && response.item ? response : null))
      .catch(() => null);

    collectProductDetailPromiseBySellerProductId.set(row.sellerProductId, nextPromise);
    return nextPromise;
  };

  return mapWithConcurrency(input.collectionCandidates, 4, async (candidate) =>
    buildWorksheetRow({
      store: input.store,
      row: candidate.row,
      currentRow: candidate.currentRow,
      nowIso: input.nowIso,
      detail: input.shouldHydrateOptionsDuringCollect(candidate.currentRow)
        ? optionDetailByShipmentBoxId.get(candidate.row.shipmentBoxId) ?? null
        : null,
      productDetail: input.shouldHydrateOptionsDuringCollect(candidate.currentRow)
        ? await getCollectProductDetailCached(candidate.row)
        : null,
      selpickOrderNumber:
        candidate.currentRow?.selpickOrderNumber ??
        input.selpickAllocator.next(
          input.store.storeName,
          resolveWorksheetOrderDateParts({
            orderedAt: candidate.row.orderedAt,
            paidAt: candidate.row.paidAt,
            currentOrderedAtRaw: candidate.currentRow?.orderedAtRaw,
            currentCreatedAt: candidate.currentRow?.createdAt,
            nowIso: input.nowIso,
          }).key,
          input.platformKey.key,
        ),
    }),
  );
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

function updateWorksheetActionsAfterPrepare(actions: CoupangOrderRow["availableActions"]) {
  const nextActions = actions.filter((action) => action !== "markPreparing");

  if (!nextActions.includes("uploadInvoice")) {
    nextActions.unshift("uploadInvoice");
  }

  return nextActions;
}

function buildOrderRowFromWorksheetRow(row: CoupangShipmentWorksheetRow): CoupangOrderRow {
  return {
    id: row.id,
    shipmentBoxId: row.shipmentBoxId,
    orderId: row.orderId,
    orderedAt: row.orderedAtRaw,
    paidAt: row.orderedAtRaw,
    status: row.orderStatus ?? "",
    ordererName: row.ordererName,
    receiverName: row.receiverBaseName ?? row.receiverName,
    receiverSafeNumber: row.contact,
    receiverAddress: row.receiverAddress,
    receiverPostCode: null,
    productName: row.productName,
    optionName: row.optionName,
    sellerProductId: row.sellerProductId,
    sellerProductName: row.productName,
    vendorItemId: row.vendorItemId,
    externalVendorSku: row.sellerProductCode,
    quantity: row.quantity,
    salesPrice: row.salePrice,
    orderPrice: row.salePrice,
    discountPrice: 0,
    cancelCount: 0,
    holdCountForCancel: 0,
    deliveryCompanyName: null,
    deliveryCompanyCode: normalizeWhitespace(row.deliveryCompanyCode),
    invoiceNumber: normalizeWhitespace(row.invoiceNumber),
    invoiceNumberUploadDate: row.coupangInvoiceUploadedAt,
    estimatedShippingDate: row.estimatedShippingDate,
    inTransitDateTime: null,
    deliveredDate: null,
    shipmentType: null,
    splitShipping: row.splitShipping,
    ableSplitShipping: false,
    customerServiceIssueCount: row.customerServiceIssueCount,
    customerServiceIssueSummary: row.customerServiceIssueSummary,
    customerServiceIssueBreakdown: row.customerServiceIssueBreakdown,
    customerServiceTerminalStatus: row.customerServiceTerminalStatus,
    customerServiceState: row.customerServiceState,
    customerServiceFetchedAt: row.customerServiceFetchedAt,
    availableActions: row.availableActions,
  };
}

function buildWorksheetRow(input: {
  store: StoredCoupangStore;
  row: CoupangOrderRow;
  currentRow: CoupangShipmentWorksheetRow | undefined;
  nowIso: string;
  detail: CoupangOrderDetail | null;
  productDetail: Awaited<ReturnType<typeof getProductDetail>> | null;
  selpickOrderNumber: string;
  preparedShipmentBoxIds?: Set<string>;
}) {
  const { store, row, currentRow, nowIso, detail, productDetail, selpickOrderNumber } = input;
  const preparedShipmentBoxIds = input.preparedShipmentBoxIds ?? new Set<string>();
  const isOverseasHint = productDetail
    ? resolveProductOverseasFlag(productDetail, row)
    : currentRow?.isOverseas ?? false;
  const rawFields = buildWorksheetRawFields({
    row,
    detail,
    productDetail,
    currentRow,
    selpickOrderNumber,
    isOverseas: isOverseasHint,
  });
  const isOverseas = resolveWorksheetOverseasFlagFromRawFields({
    rawFields,
    currentRow,
  });
  const productName = resolveWorksheetProductNameFromRawFields({
    rawFields,
    currentRow,
  });
  const optionName = resolveWorksheetOptionNameFromRawFields({
    rawFields,
    currentRow,
    productName,
  });
  const coupangDisplayProductName = resolveWorksheetDisplayProductNameFromRawFields({
    rawFields,
    currentRow,
  });
  const receiverBaseName =
    currentRow?.receiverBaseName ??
    detail?.receiver.name ??
    row.receiverName ??
    currentRow?.receiverName ??
    null;
  const personalClearanceCode = currentRow?.personalClearanceCode ?? null;
  const receiverName = composeReceiverName(receiverBaseName, personalClearanceCode, isOverseas);
  const orderedAtRaw = row.orderedAt ?? row.paidAt ?? currentRow?.orderedAtRaw ?? null;
  const orderDate = resolveWorksheetOrderDateParts({
    orderedAt: row.orderedAt,
    paidAt: row.paidAt,
    currentOrderedAtRaw: currentRow?.orderedAtRaw,
    currentCreatedAt: currentRow?.createdAt,
    nowIso,
  });
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
          customerServiceTerminalStatus: row.customerServiceTerminalStatus,
          customerServiceState: row.customerServiceState,
          customerServiceFetchedAt: row.customerServiceFetchedAt,
        }
      : resolveWorksheetCustomerServiceState(currentRow, nowIso);

  return {
    id: currentRow?.id ?? buildSourceKey(store.id, row),
    sourceKey: currentRow?.sourceKey ?? buildSourceKey(store.id, row),
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
    selpickOrderNumber,
    invoiceNumber: normalizeInvoiceNumber(currentRow?.invoiceNumber ?? row.invoiceNumber ?? ""),
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
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
    coupangDisplayProductName,
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
    customerServiceTerminalStatus: customerServiceIssueState.customerServiceTerminalStatus,
    customerServiceState: customerServiceIssueState.customerServiceState,
    customerServiceFetchedAt: customerServiceIssueState.customerServiceFetchedAt,
    purchaseConfirmedAt: currentRow?.purchaseConfirmedAt ?? null,
    purchaseConfirmedSyncedAt: currentRow?.purchaseConfirmedSyncedAt ?? null,
    purchaseConfirmedFinalSettlementDate:
      currentRow?.purchaseConfirmedFinalSettlementDate ?? null,
    purchaseConfirmedSource: currentRow?.purchaseConfirmedSource ?? null,
    orderedAtRaw,
    lastOrderHydratedAt: detail ? nowIso : currentRow?.lastOrderHydratedAt ?? null,
    lastProductHydratedAt: productDetail ? nowIso : currentRow?.lastProductHydratedAt ?? null,
    estimatedShippingDate: row.estimatedShippingDate ?? currentRow?.estimatedShippingDate ?? null,
    splitShipping: row.splitShipping ?? currentRow?.splitShipping ?? null,
    invoiceTransmissionStatus: currentRow?.invoiceTransmissionStatus ?? null,
    invoiceTransmissionMessage: currentRow?.invoiceTransmissionMessage ?? null,
    invoiceTransmissionAt: currentRow?.invoiceTransmissionAt ?? null,
    exportedAt: currentRow?.exportedAt ?? null,
    invoiceAppliedAt: currentRow?.invoiceAppliedAt ?? null,
    createdAt: currentRow?.createdAt ?? nowIso,
    updatedAt: nowIso,
    rawFields,
  } satisfies CoupangShipmentWorksheetRow;
}

async function collectShipmentWorksheetNewOnly(input: {
  request: CollectCoupangShipmentInput;
  store: StoredCoupangStore;
  currentSheet: WorksheetStoreSheet;
  archivedSourceKeys: Set<string>;
  selpickAllocator: ReturnType<typeof createSelpickAllocator>;
  platformKey: ReturnType<typeof resolvePlatformKey>;
  nowIso: string;
  syncPlan: ShipmentWorksheetSyncPlan & { mode: "new_only" };
  listResponse: ShipmentOrderLookupResult;
  failedStatuses: string[];
  syncModeLabel: string;
}) {
  const mergedBySourceKey = new Map(
    input.currentSheet.items.map((row) => [row.sourceKey, row] as const),
  );
  const statusBatches =
    input.listResponse.statusBatches ??
    (input.listResponse.items.length
      ? [
          {
            status: input.syncPlan.statusFilter ?? "UNKNOWN",
            items: input.listResponse.items,
          },
        ]
      : []);
  const checkpointSyncState = input.currentSheet.syncState ?? createEmptySyncState();
  const finalSyncState = buildNextSyncState(checkpointSyncState, input.syncPlan, input.nowIso);
  const buildBaseMessage = () =>
    mergeMessages([
      input.listResponse.message,
      input.platformKey.warning,
      collectionCandidateCount > 0
        ? "워크시트 반영 후 주문 상세, 상품 상세, CS 상태 보강이 이어서 진행됩니다."
        : null,
    ]);

  let collectionCandidateCount = 0;
  let insertedCount = 0;
  const insertedSourceKeys: string[] = [];
  let skippedHydrationCount = 0;
  let checkpointCount = 0;
  let checkpointPersistedCount = 0;
  let lastCheckpointAt: string | null = null;
  let pendingCheckpointRows: CoupangShipmentWorksheetRow[] = [];

  const buildPhaseState = () =>
    buildCollectPhaseState({
      hasCollectWarnings: Boolean(input.listResponse.message || input.platformKey.warning),
      hasOrderDetailHydration: collectionCandidateCount > 0,
      hasProductDetailHydration: collectionCandidateCount > 0,
      hasCustomerServiceRefresh: collectionCandidateCount > 0,
    });
  const buildSummary = (override?: {
    checkpointCount?: number;
    checkpointPersistedCount?: number;
    lastCheckpointAt?: string | null;
  }) =>
    buildSyncSummary({
      plan: input.syncPlan,
      fetchedCount: collectionCandidateCount,
      insertedCount,
      insertedSourceKeys,
      updatedCount: 0,
      skippedHydrationCount,
      phaseState: buildPhaseState(),
      degraded: input.failedStatuses.length > 0,
      failedStatuses: input.failedStatuses,
      autoAuditRecommended: input.failedStatuses.length > 0,
      checkpointCount: override?.checkpointCount ?? checkpointCount,
      checkpointPersistedCount:
        override?.checkpointPersistedCount ?? checkpointPersistedCount,
      lastCheckpointAt: override?.lastCheckpointAt ?? lastCheckpointAt,
    });
  const persistCheckpoint = async (rows: CoupangShipmentWorksheetRow[]) => {
    if (!rows.length) {
      return;
    }

    const nextCheckpointCount = checkpointCount + 1;
    const nextCheckpointPersistedCount = checkpointPersistedCount + rows.length;
    const checkpointAt = new Date().toISOString();

    await upsertWorksheetStoreRowsWithDiagnostics(
      {
        storeId: input.request.storeId,
        items: rows,
        collectedAt: input.nowIso,
        source: input.listResponse.source,
        message: buildBaseMessage(),
        syncState: checkpointSyncState,
        syncSummary: buildSummary({
          checkpointCount: nextCheckpointCount,
          checkpointPersistedCount: nextCheckpointPersistedCount,
          lastCheckpointAt: checkpointAt,
        }),
      },
      {
        storeId: input.request.storeId,
        mode: input.syncPlan.mode,
        createdAtFrom: input.syncPlan.fetchCreatedAtFrom,
        createdAtTo: input.syncPlan.fetchCreatedAtTo,
      },
    );

    checkpointCount = nextCheckpointCount;
    checkpointPersistedCount = nextCheckpointPersistedCount;
    lastCheckpointAt = checkpointAt;
  };
  const flushPendingCheckpointRows = async (force = false) => {
    while (pendingCheckpointRows.length >= WORKSHEET_CHECKPOINT_FLUSH_SIZE) {
      const rows = pendingCheckpointRows.slice(0, WORKSHEET_CHECKPOINT_FLUSH_SIZE);
      await persistCheckpoint(rows);
      pendingCheckpointRows = pendingCheckpointRows.slice(WORKSHEET_CHECKPOINT_FLUSH_SIZE);
    }

    if (force && pendingCheckpointRows.length) {
      const rows = pendingCheckpointRows;
      pendingCheckpointRows = [];
      await persistCheckpoint(rows);
    }
  };

  for (const statusBatch of statusBatches) {
    const batchCandidates: ShipmentWorksheetCollectionCandidate[] = statusBatch.items
      .filter(isShipmentWorksheetCandidate)
      .map((row) => {
        const sourceKey = buildSourceKey(input.request.storeId, row);
        const currentRow = mergedBySourceKey.get(sourceKey);

        return {
          row,
          sourceKey,
          currentRow,
          shouldHydrateOrder: shouldHydrateOrderRow(row, currentRow, input.nowIso),
          shouldHydrateProduct: shouldHydrateProductRow(row, currentRow),
        } satisfies ShipmentWorksheetCollectionCandidate;
      })
      .filter((candidate) => !input.archivedSourceKeys.has(candidate.sourceKey))
      .filter((candidate) => !candidate.currentRow);

    if (!batchCandidates.length) {
      continue;
    }

    collectionCandidateCount += batchCandidates.length;
    skippedHydrationCount += batchCandidates.filter(
      (candidate) => !candidate.shouldHydrateOrder && !candidate.shouldHydrateProduct,
    ).length;

    const batchRows = await buildCollectedWorksheetRows({
      store: input.store,
      collectionCandidates: batchCandidates,
      nowIso: input.nowIso,
      selpickAllocator: input.selpickAllocator,
      platformKey: input.platformKey,
      shouldHydrateOptionsDuringCollect: () => false,
    });

    for (const row of batchRows) {
      insertedCount += 1;
      insertedSourceKeys.push(row.sourceKey);
      mergedBySourceKey.set(row.sourceKey, row);
      pendingCheckpointRows.push(row);
    }

    await flushPendingCheckpointRows(true);
  }

  const finalMessage = mergeMessages([
    buildBaseMessage(),
    insertedCount > 0
      ? `${input.syncModeLabel}에서 신규 주문 ${insertedCount}건을 워크시트에 추가했습니다.`
      : "이미 동일한 신규 주문 정보가 반영되어 있어 변경한 내용이 없습니다.",
  ]);
  const finalSummary = buildSummary();
  const autoArchiveResult = await applyCompletedClaimAutoArchive({
    storeId: input.request.storeId,
    rows: Array.from(mergedBySourceKey.values()),
    message: finalMessage,
    archivedAt: input.nowIso,
    persistToStore: true,
  });

  await upsertWorksheetStoreRowsWithDiagnostics(
    {
      storeId: input.request.storeId,
      items: [],
      collectedAt: input.nowIso,
      source: input.listResponse.source,
      message: autoArchiveResult.message,
      syncState: finalSyncState,
      syncSummary: finalSummary,
    },
    {
      storeId: input.request.storeId,
      mode: input.syncPlan.mode,
      createdAtFrom: input.syncPlan.fetchCreatedAtFrom,
      createdAtTo: input.syncPlan.fetchCreatedAtTo,
    },
  );

  return buildWorksheetResponse(
    input.store,
    {
      ...input.currentSheet,
      items: autoArchiveResult.rows,
      collectedAt: input.nowIso,
      source: input.listResponse.source,
      message: autoArchiveResult.message,
      syncState: finalSyncState,
      syncSummary: finalSummary,
      updatedAt: input.nowIso,
    },
    autoArchiveResult.message,
  );
}

function shouldRefreshWorksheetOrderDetail(
  row: CoupangShipmentWorksheetRow,
  nowIso: string,
) {
  if (!row.shipmentBoxId || row.shipmentBoxId === "-") {
    return false;
  }

  if (!row.lastOrderHydratedAt) {
    return true;
  }

  if (row.updatedAt.localeCompare(row.lastOrderHydratedAt) > 0) {
    return true;
  }

  if (isTimestampOlderThanHours(row.lastOrderHydratedAt, nowIso, ORDER_DETAIL_REFRESH_HOURS)) {
    return true;
  }

  return !(
    normalizeWhitespace(row.contact) &&
    normalizeWhitespace(row.receiverAddress) &&
    normalizeWhitespace(row.deliveryRequest) &&
    normalizeWhitespace(row.buyerPhoneNumber)
  );
}

function shouldRefreshWorksheetProductDetail(row: CoupangShipmentWorksheetRow) {
  if (!row.sellerProductId) {
    return false;
  }

  if (!row.lastProductHydratedAt) {
    return true;
  }

  if (row.updatedAt.localeCompare(row.lastProductHydratedAt) > 0) {
    return true;
  }

  if (
    hasMixedWorksheetOptionName(
      row.optionName,
      row.productName,
      row.exposedProductName,
    )
  ) {
    return true;
  }

  return !(normalizeWhitespace(row.productName) && normalizeWhitespace(row.optionName));
}

function shouldRefreshWorksheetCustomerService(
  row: CoupangShipmentWorksheetRow,
  nowIso: string,
) {
  const resolved = resolveWorksheetCustomerServiceState(row, nowIso);
  if (resolved.customerServiceState !== "ready") {
    return true;
  }

  if (!resolved.customerServiceFetchedAt) {
    return true;
  }

  return row.updatedAt.localeCompare(resolved.customerServiceFetchedAt) > 0;
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
    resolveStoredWorksheetOptionName(currentRow, productName) ??
    null
  );
}

function resolveWorksheetCoupangDisplayProductName(
  detail: Awaited<ReturnType<typeof getProductDetail>> | null,
  currentRow: CoupangShipmentWorksheetRow | undefined,
) {
  return (
    normalizeWhitespace(detail?.item?.displayProductName) ??
    normalizeWhitespace(currentRow?.coupangDisplayProductName) ??
    null
  );
}

function normalizeWorksheetRow(row: CoupangShipmentWorksheetRow): CoupangShipmentWorksheetRow {
  const optionName = normalizeWorksheetOptionName(row.optionName, row.productName);
  const exposedProductName = buildExposedProductName(row.productName, optionName);
  const coupangDisplayProductName = normalizeWhitespace(row.coupangDisplayProductName);
  const rawFields = ensureWorksheetRawFields(row);
  const customerServiceIssueCount = Number.isFinite(row.customerServiceIssueCount)
    ? Math.max(0, Math.trunc(row.customerServiceIssueCount))
    : 0;
  const customerServiceIssueSummary = normalizeWhitespace(row.customerServiceIssueSummary);
  const purchaseConfirmedAt = normalizeWhitespace(row.purchaseConfirmedAt);
  const purchaseConfirmedSyncedAt = normalizeWhitespace(row.purchaseConfirmedSyncedAt);
  const purchaseConfirmedFinalSettlementDate = normalizeWhitespace(
    row.purchaseConfirmedFinalSettlementDate,
  );
  const purchaseConfirmedSource = normalizeWhitespace(row.purchaseConfirmedSource);
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
    purchaseConfirmedAt === row.purchaseConfirmedAt &&
    purchaseConfirmedSyncedAt === row.purchaseConfirmedSyncedAt &&
    purchaseConfirmedFinalSettlementDate === row.purchaseConfirmedFinalSettlementDate &&
    purchaseConfirmedSource === row.purchaseConfirmedSource &&
    coupangDeliveryCompanyCode === row.coupangDeliveryCompanyCode &&
    coupangInvoiceNumber === row.coupangInvoiceNumber &&
    coupangInvoiceUploadedAt === row.coupangInvoiceUploadedAt &&
    rawFields === row.rawFields
  ) {
    return row;
  }

  return {
    ...row,
    optionName,
    exposedProductName,
    coupangDisplayProductName,
    customerServiceIssueCount,
    customerServiceIssueSummary,
    customerServiceIssueBreakdown,
    purchaseConfirmedAt,
    purchaseConfirmedSyncedAt,
    purchaseConfirmedFinalSettlementDate,
    purchaseConfirmedSource,
    coupangDeliveryCompanyCode,
    coupangInvoiceNumber,
    coupangInvoiceUploadedAt,
    rawFields,
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
    forceRefresh: false,
  });
  const hasRowChanges = refreshed.rows.some((row, index) =>
    hasWorksheetRowChanged(currentSheet.items[index], row),
  );
  const nextMessage = normalizeLegacyWorksheetMessage(refreshed.message ?? currentSheet.message);
  const messageChanged = nextMessage !== normalizeLegacyWorksheetMessage(currentSheet.message);

  if (!hasRowChanges && !messageChanged) {
    return buildWorksheetResponse(store, currentSheet, refreshed.message);
  }

  const sheet = {
    ...currentSheet,
    items: refreshed.rows,
    message: refreshed.message ?? currentSheet.message,
  };

  return buildWorksheetResponse(store, sheet, refreshed.message);
}

export async function getShipmentWorksheetView(
  query: CoupangShipmentWorksheetViewQuery,
): Promise<CoupangShipmentWorksheetViewResponse> {
  const store = await getStoreOrThrow(query.storeId);
  const currentSheet = await coupangShipmentWorksheetStore.getStoreSheet(query.storeId);
  return buildWorksheetViewResponse(store, currentSheet, query);
}

export async function getShipmentArchiveView(
  query: CoupangShipmentArchiveViewQuery,
): Promise<CoupangShipmentArchiveViewResponse> {
  const store = await getStoreOrThrow(query.storeId);
  const archivedRows = await coupangShipmentWorksheetStore.getArchivedRows(query.storeId);

  return buildShipmentArchiveViewResponse(
    store,
    archivedRows,
    query,
    archivedRows.length ? null : "보관함에 저장된 주문이 없습니다.",
  );
}

export async function getShipmentArchiveDetail(input: {
  storeId: string;
  shipmentBoxId?: string;
  orderId?: string;
  vendorItemId?: string | null;
  sellerProductId?: string | null;
  orderedAtRaw?: string | null;
}) {
  return getShipmentWorksheetDetail(input);
}

export async function runShipmentArchive(
  input: RunCoupangShipmentArchiveInput,
): Promise<RunCoupangShipmentArchiveResponse> {
  const storeSummaries = await coupangSettingsStore.listStoreSummaries();
  const targetStores = input.storeId
    ? storeSummaries.filter((store) => store.id === input.storeId)
    : storeSummaries;

  if (input.storeId && !targetStores.length) {
    throw new Error("보관함 정리 대상 스토어를 찾을 수 없습니다.");
  }

  const now = new Date();
  const archivedAt = now.toISOString();
  const dryRun = input.dryRun === true;
  const stores: RunCoupangShipmentArchiveResponse["stores"] = [];
  let archivedRowCount = 0;
  let skippedRowCount = 0;

  for (const storeSummary of targetStores) {
    const currentSheet = await coupangShipmentWorksheetStore.getStoreSheet(storeSummary.id);
    const eligibleRows = buildShipmentWorksheetArchiveRows(buildWorksheetRows(currentSheet), {
      archivedAt,
      reasonResolver: (row) =>
        isShipmentWorksheetArchiveEligible(row, now) ? "retention_post_dispatch" : null,
    });
    const result = await coupangShipmentWorksheetStore.archiveRows({
      storeId: storeSummary.id,
      items: eligibleRows,
      archivedAt,
      dryRun,
    });

    archivedRowCount += result.archivedCount;
    skippedRowCount += result.skippedCount;
    stores.push({
      storeId: storeSummary.id,
      storeName: storeSummary.storeName,
      eligibleRowCount: eligibleRows.length,
      archivedRowCount: result.archivedCount,
      skippedRowCount: result.skippedCount,
      dryRun,
      message:
        eligibleRows.length === 0
          ? "이관 대상이 없습니다."
          : dryRun
            ? `이관 대상 ${eligibleRows.length}건을 확인했습니다.`
            : `${result.archivedCount}건을 보관함으로 이동했습니다.`,
    });
  }

  return {
    processedStoreCount: stores.length,
    archivedRowCount,
    skippedRowCount,
    dryRun,
    stores,
    message:
      stores.length === 0
        ? "정리할 쿠팡 스토어가 없습니다."
        : dryRun
          ? `보관함 이관 예정 ${archivedRowCount}건을 확인했습니다.`
          : `보관함 이관 ${archivedRowCount}건을 완료했습니다.`,
  };
}

export async function auditShipmentWorksheetMissing(
  input: AuditCoupangShipmentWorksheetMissingInput,
): Promise<CoupangShipmentWorksheetAuditMissingResponse> {
  const createdAtFrom = normalizeWhitespace(input.createdAtFrom);
  const createdAtTo = normalizeWhitespace(input.createdAtTo);

  if (!createdAtFrom || !createdAtTo) {
    throw new Error("누락 검수에는 시작일과 종료일이 모두 필요합니다.");
  }

  const auditRanges = buildShipmentWorksheetAuditRanges(createdAtFrom, createdAtTo);

  await getStoreOrThrow(input.storeId);
  const currentSheet = await coupangShipmentWorksheetStore.getStoreSheet(input.storeId);
  const worksheetRows = buildWorksheetRows(currentSheet);
  const worksheetRowBySourceKey = new Map(worksheetRows.map((row) => [row.sourceKey, row] as const));
  const liveRowBySourceKey = new Map<string, CoupangOrderRow>();
  const getStatusPriority = (status: string | null | undefined) =>
    normalizeStatusFilter(status) === "INSTRUCT" ? 2 : normalizeStatusFilter(status) === "ACCEPT" ? 1 : 0;

  for (const status of WORKSHEET_AUDIT_STATUSES) {
    for (const auditRange of auditRanges) {
    const response = await listOrders({
      storeId: input.storeId,
      createdAtFrom: auditRange.createdAtFrom,
      createdAtTo: auditRange.createdAtTo,
      status,
      maxPerPage: WORKSHEET_AUDIT_PAGE_SIZE,
      fetchAllPages: true,
      includeCustomerService: false,
    });

    if (response.source !== "live") {
      throw new Error(response.message ?? `${status} 상태 live 주문 조회에 실패했습니다.`);
    }

    for (const row of response.items) {
      if (!isShipmentWorksheetCandidate(row)) {
        continue;
      }

      const sourceKey = buildSourceKey(input.storeId, row);
      const existing = liveRowBySourceKey.get(sourceKey);
      if (!existing || getStatusPriority(row.status) >= getStatusPriority(existing.status)) {
        liveRowBySourceKey.set(sourceKey, row);
      }
    }
    }
  }

  const missingItems: CoupangShipmentWorksheetAuditMissingResponse["missingItems"] = [];
  const hiddenItems: CoupangShipmentWorksheetAuditMissingResponse["hiddenItems"] = [];
  let worksheetMatchedCount = 0;

  for (const [sourceKey, liveRow] of Array.from(liveRowBySourceKey.entries())) {
    const worksheetRow = worksheetRowBySourceKey.get(sourceKey);
    if (!worksheetRow) {
      missingItems.push({
        sourceKey,
        shipmentBoxId: liveRow.shipmentBoxId,
        orderId: liveRow.orderId,
        vendorItemId: liveRow.vendorItemId ?? null,
        sellerProductId: liveRow.sellerProductId ?? null,
        status: normalizeStatusFilter(liveRow.status),
        productName: liveRow.productName,
        orderedAt: liveRow.orderedAt ?? liveRow.paidAt ?? null,
      });
      continue;
    }

    worksheetMatchedCount += 1;
    const hiddenReason = getShipmentWorksheetRowHiddenReason(worksheetRow, {
      storeId: input.storeId,
      scope: input.viewQuery?.scope,
      query: input.viewQuery?.query,
      invoiceStatusCard: input.viewQuery?.invoiceStatusCard,
      orderStatusCard: input.viewQuery?.orderStatusCard,
      outputStatusCard: input.viewQuery?.outputStatusCard,
    });

    if (hiddenReason) {
      hiddenItems.push({
        sourceKey,
        rowId: worksheetRow.id,
        status: normalizeStatusFilter(worksheetRow.orderStatus),
        productName: worksheetRow.exposedProductName || worksheetRow.productName,
        hiddenReason,
      });
    }
  }

  const liveCount = liveRowBySourceKey.size;
  const missingCount = missingItems.length;
  const hiddenCount = hiddenItems.length;
  const message =
    liveCount === 0
      ? "선택한 기간의 상품준비중/주문접수 live 주문이 없습니다."
      : missingCount === 0 && hiddenCount === 0
        ? `live 주문 ${liveCount}건이 모두 현재 worksheet와 화면 조건에서 확인됩니다.`
        : `live ${liveCount}건 / worksheet 매칭 ${worksheetMatchedCount}건 / 누락 ${missingCount}건 / 현재 뷰 숨김 ${hiddenCount}건`;

  return {
    auditedStatuses: [...WORKSHEET_AUDIT_STATUSES],
    liveCount,
    worksheetMatchedCount,
    missingCount,
    hiddenCount,
    missingItems,
    hiddenItems,
    message,
  };
}

export async function resolveShipmentWorksheetBulkRows(input: {
  storeId: string;
  viewQuery?: Partial<CoupangShipmentWorksheetViewQuery> | null;
  mode: CoupangShipmentWorksheetBulkResolveMode;
}): Promise<CoupangShipmentWorksheetBulkResolveResponse> {
  const store = await getStoreOrThrow(input.storeId);
  let sheetForResolve = await coupangShipmentWorksheetStore.getStoreSheet(input.storeId);
  let refreshMessage: string | null = null;
  let didRefreshTargetRows = false;
  if (!sheetForResolve.items.length) {
    return {
      store: asStoreRef(store),
      mode: input.mode,
      items: [],
      blockedItems: [],
      fetchedAt: new Date().toISOString(),
      message: normalizeLegacyWorksheetMessage(sheetForResolve.message),
      source: sheetForResolve.source,
      matchedCount: 0,
      resolvedCount: 0,
    };
  }

  const worksheetRows = buildWorksheetRows(sheetForResolve);
  let rowsForResolve = worksheetRows;

  if (input.mode === "prepare_ready" || input.mode === "invoice_ready") {
    const { filteredRows } = resolveShipmentWorksheetFilteredRows(worksheetRows, {
      ...input.viewQuery,
      storeId: input.storeId,
    });
    const shipmentBoxIds = Array.from(
      new Set(
        filteredRows
          .filter((row) => shouldRehydrateBulkResolveRow(row, input.mode))
          .map((row) => normalizeWhitespace(row.shipmentBoxId))
          .filter((shipmentBoxId): shipmentBoxId is string => Boolean(shipmentBoxId)),
      ),
    );

    if (shipmentBoxIds.length > 0) {
      const refreshResult = await refreshShipmentWorksheetRows({
        storeId: input.storeId,
        scope: "shipment_boxes",
        shipmentBoxIds,
        currentSheet: sheetForResolve,
        persistToStore: false,
        skipProductDetailHydration: true,
      });
      refreshMessage = normalizeLegacyWorksheetMessage(refreshResult.message ?? sheetForResolve.message);
      rowsForResolve = mergeWorksheetRowsBySourceKey(worksheetRows, refreshResult.items);
      didRefreshTargetRows = refreshResult.refreshedCount > 0;
    }
  }

  const { filteredRows } = resolveShipmentWorksheetFilteredRows(rowsForResolve, {
    ...input.viewQuery,
    storeId: input.storeId,
  });
  const customerServiceTargetRows = getShipmentWorksheetBulkResolveTargetRows(
    filteredRows,
    input.mode,
  );

  if (!didRefreshTargetRows && customerServiceTargetRows.length > 0) {
    const refreshed = await refreshWorksheetCustomerServiceStatuses({
      storeId: input.storeId,
      rows: customerServiceTargetRows,
      syncPlan: buildReadCustomerServiceSyncPlan(sheetForResolve),
      forceRefresh: false,
    });
    const refreshedRowsById = new Map(refreshed.rows.map((row) => [row.id, row] as const));
    rowsForResolve = rowsForResolve.map((row) => refreshedRowsById.get(row.id) ?? row);
    refreshMessage = normalizeLegacyWorksheetMessage(refreshed.message ?? sheetForResolve.message);
  }

  const resolved = resolveShipmentWorksheetRows(
    rowsForResolve,
    {
      ...input.viewQuery,
      storeId: input.storeId,
    },
    input.mode,
  );

  return {
    store: asStoreRef(store),
    mode: input.mode,
    items: resolved.items,
    blockedItems: resolved.blockedItems,
    fetchedAt: new Date().toISOString(),
    message: normalizeLegacyWorksheetMessage(refreshMessage ?? sheetForResolve.message),
    source: sheetForResolve.source,
    matchedCount: resolved.matchedCount,
    resolvedCount: resolved.resolvedCount,
  };
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
  const archivedSourceKeys = new Set(
    await coupangShipmentWorksheetStore.getArchivedSourceKeys(input.storeId),
  );
  const selpickAllocator = createSelpickAllocator(currentSheet.items);
  const platformKey = resolvePlatformKey(store);
  const now = new Date().toISOString();
  const syncPlan = resolveSyncPlan(input, currentSheet, now);
  const insertOnlyMode = syncPlan.mode === "new_only";
  const syncModeLabel =
    syncPlan.mode === "full" ? "전체 재동기화" : syncPlan.mode === "incremental" ? "전체 재수집" : "빠른 수집";
  const listResponse = insertOnlyMode
    ? await fetchQuickCollectOrders({
        storeId: input.storeId,
        fetchCreatedAtFrom: syncPlan.fetchCreatedAtFrom,
        fetchCreatedAtTo: syncPlan.fetchCreatedAtTo,
        statusFilter: syncPlan.statusFilter,
        maxPerPage: input.maxPerPage,
      })
    : await listOrders({
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
      insertOnlyMode
        ? "필수 신규 주문 상태를 확인하지 못해 기존 셀픽 워크시트를 유지했습니다."
        : "실연동 수집에 실패해 기존 셀픽 워크시트를 유지했습니다.",
    ]);
    const fallbackSyncSummary = {
      mode: syncPlan.mode,
      fetchedCount: 0,
      insertedCount: 0,
      insertedSourceKeys: [],
      updatedCount: 0,
      skippedHydrationCount: 0,
      autoExpanded: syncPlan.autoExpanded,
      fetchCreatedAtFrom: syncPlan.fetchCreatedAtFrom,
      fetchCreatedAtTo: syncPlan.fetchCreatedAtTo,
      statusFilter: syncPlan.statusFilter,
      completedPhases: [],
      pendingPhases: [],
      warningPhases: ["worksheet_collect"],
      degraded: false,
      failedStatuses: [],
      autoAuditRecommended: false,
    } satisfies CoupangShipmentWorksheetSyncSummary;

    return buildWorksheetResponse(
      store,
      {
        ...currentSheet,
        source: "fallback",
        syncSummary: fallbackSyncSummary,
      },
      fallbackMessage,
    );
  }

  const failedStatuses =
    insertOnlyMode && "failedStatuses" in listResponse ? listResponse.failedStatuses ?? [] : [];
  if (insertOnlyMode) {
    return collectShipmentWorksheetNewOnly({
      request: input,
      store,
      currentSheet,
      archivedSourceKeys,
      selpickAllocator,
      platformKey,
      nowIso: now,
      syncPlan: {
        ...syncPlan,
        mode: "new_only",
      },
      listResponse,
      failedStatuses,
      syncModeLabel,
    });
  }

  const candidateRows = listResponse.items.filter(isShipmentWorksheetCandidate);
  const claimWarnings: string[] = [];
  const collectionCandidates: ShipmentWorksheetCollectionCandidate[] = candidateRows
    .map((row) => {
      const sourceKey = buildSourceKey(input.storeId, row);
      const currentRow = currentBySourceKey.get(sourceKey);

      return {
        row,
        sourceKey,
        currentRow,
        shouldHydrateOrder: shouldHydrateOrderRow(row, currentRow, now),
        shouldHydrateProduct: shouldHydrateProductRow(row, currentRow),
      } satisfies ShipmentWorksheetCollectionCandidate;
    })
    .filter((candidate) => !archivedSourceKeys.has(candidate.sourceKey));
  const collectionCandidateBySourceKey = new Map(
    collectionCandidates.map((candidate) => [candidate.sourceKey, candidate] as const),
  );
  const claimGroupsBySourceKey = new Map<string, ShipmentWorksheetClaimGroup>();
  const shouldLookupClaimsDuringCollect = true;
  let returnsLookup: PromiseSettledResult<Awaited<ReturnType<typeof listReturns>>> | null = null;
  let exchangesLookup: PromiseSettledResult<Awaited<ReturnType<typeof listExchanges>>> | null = null;

  if (shouldLookupClaimsDuringCollect) {
    [returnsLookup, exchangesLookup] = await Promise.allSettled([
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
  }

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
    if (archivedSourceKeys.has(inputGroup.sourceKey)) {
      return;
    }

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

  if (shouldLookupClaimsDuringCollect && returnsLookup && exchangesLookup) {
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

  }

  const claimFetchedAt = now;
  let quickCollectClaimInsertCount = 0;
  let quickCollectClaimMatchedCount = 0;

  for (const claimGroup of Array.from(claimGroupsBySourceKey.values())) {
    const issueState = buildCoupangCustomerServiceIssueState({
      relatedReturnRequests: claimGroup.returns,
      relatedExchangeRequests: claimGroup.exchanges,
    });

    if (insertOnlyMode && !claimGroup.matchedCandidateSourceKey && claimGroup.currentRow) {
      continue;
    }

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
  const skippedHydrationCount = collectionCandidates.filter((candidate) => {
    if (!candidate.currentRow) {
      return false;
    }

    return (
      !candidate.shouldHydrateOrder &&
      !candidate.shouldHydrateProduct &&
      !shouldRefreshWorksheetCustomerService(candidate.currentRow, now)
    );
  }).length;
  /* legacy collect-side prepare/detail hydration flow removed

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
    const coupangDisplayProductName = resolveWorksheetCoupangDisplayProductName(
      productDetail,
      currentRow,
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
      coupangDisplayProductName,
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

  */
  const fetchedRows = await buildCollectedWorksheetRows({
    store,
    collectionCandidates,
    nowIso: now,
    selpickAllocator,
    platformKey,
    shouldHydrateOptionsDuringCollect: (currentRow) =>
      shouldHydrateWorksheetOptionDuringCollect(currentRow),
  });

  let insertedCount = 0;
  const insertedSourceKeys: string[] = [];
  let updatedCount = 0;
  const mergedBySourceKey = new Map(currentSheet.items.map((row) => [row.sourceKey, row] as const));

  for (const nextRow of fetchedRows) {
    const existingRow = mergedBySourceKey.get(nextRow.sourceKey);
    if (!existingRow) {
      insertedCount += 1;
      insertedSourceKeys.push(nextRow.sourceKey);
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

  const syncState = buildNextSyncState(
    currentSheet.syncState ?? createEmptySyncState(),
    syncPlan,
    now,
  );
  const phaseState = buildCollectPhaseState({
    hasCollectWarnings: Boolean(listResponse.message || platformKey.warning || claimWarnings.length),
    hasOrderDetailHydration: collectionCandidates.some((candidate) => candidate.shouldHydrateOrder),
    hasProductDetailHydration: collectionCandidates.some((candidate) => candidate.shouldHydrateProduct),
    hasCustomerServiceRefresh: collectionCandidates.length > 0,
  });
  const syncSummary = buildSyncSummary({
    plan: syncPlan,
    fetchedCount: collectionCandidates.length,
    insertedCount,
    insertedSourceKeys,
    updatedCount,
    skippedHydrationCount,
    phaseState,
    degraded: failedStatuses.length > 0,
    failedStatuses,
    autoAuditRecommended: failedStatuses.length > 0,
  });
  const baseMessage = mergeMessages([
    listResponse.message,
    platformKey.warning,
    claimWarnings.length ? claimWarnings.join(" ") : null,
    claimGroupsBySourceKey.size
      ? insertOnlyMode
        ? `${syncModeLabel}에서 신규 클레임 ${quickCollectClaimInsertCount}건을 워크시트에 추가했습니다.`
        : `${syncModeLabel}에 클레임 ${claimGroupsBySourceKey.size}건을 반영했고, 신규 ${quickCollectClaimInsertCount}건을 워크시트에 추가했습니다.${quickCollectClaimMatchedCount ? ` 기존 주문 ${quickCollectClaimMatchedCount}건도 클레임 상태로 갱신했습니다.` : ""}`
      : null,
    phaseState.pendingPhases.length
      ? "워크시트 반영 후 주문 상세, 상품 상세, CS 상태 보강을 이어서 진행합니다."
      : null,
    /*
      ? `주문 상세 ${detailWarnings.length}건은 일부 정보를 기존 값으로 유지했습니다.`
      : null,
    productWarnings.length
      ? `상품 상세 ${productWarnings.length}건은 쿠팡 주문 원본값으로 보완했습니다.`
      : null,
    customerServiceMessage,
    */
  ]);
  const autoArchiveResult = await applyCompletedClaimAutoArchive({
    storeId: input.storeId,
    rows: Array.from(mergedBySourceKey.values()),
    message: baseMessage,
    archivedAt: now,
    persistToStore: true,
  });
  const sheet = await setWorksheetStoreSheetWithDiagnostics({
    storeId: input.storeId,
    items: autoArchiveResult.rows,
    collectedAt: now,
    source: listResponse.source,
    message: autoArchiveResult.message,
    syncState,
    syncSummary,
  }, {
    storeId: input.storeId,
    mode: syncPlan.mode,
    createdAtFrom: syncPlan.fetchCreatedAtFrom,
    createdAtTo: syncPlan.fetchCreatedAtTo,
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

function buildInvoiceInputApplyMessage(input: {
  matchedCount: number;
  issueCount: number;
  missingKeyCount: number;
  updatedCount: number;
}) {
  if (input.issueCount > 0 || input.missingKeyCount > 0) {
    return "\uC77C\uBD80 \uC1A1\uC7A5 \uC785\uB825\uC774 \uD604\uC7AC \uC6CC\uD06C\uC2DC\uD2B8\uC640 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC544 \uAC74\uB108\uB6F0\uC5C8\uC2B5\uB2C8\uB2E4.";
  }

  if (input.matchedCount > 0 && input.updatedCount === 0) {
    return "\uC774\uBBF8 \uB3D9\uC77C\uD55C \uC1A1\uC7A5 \uC815\uBCF4\uAC00 \uC785\uB825\uB418\uC5B4 \uC788\uC5B4 \uBCC0\uACBD\uD55C \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
  }

  return null;
}

export async function applyShipmentWorksheetInvoiceInput(
  input: ApplyCoupangShipmentWorksheetInvoiceInput,
): Promise<CoupangShipmentWorksheetInvoiceInputApplyResponse> {
  if (!input.rows.length) {
    throw new Error("\uBC18\uC601\uD560 \uC1A1\uC7A5 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  await getStoreOrThrow(input.storeId);
  const currentSheet = await coupangShipmentWorksheetStore.getStoreSheet(input.storeId);
  const rowBySelpickOrderNumber = new Map(
    currentSheet.items.map((row) => [row.selpickOrderNumber, row] as const),
  );
  const latestInputBySelpickOrderNumber = new Map<
    string,
    { deliveryCompanyCode: string; invoiceNumber: string }
  >();

  for (const row of input.rows) {
    const selpickOrderNumber = normalizeWhitespace(row.selpickOrderNumber);
    if (!selpickOrderNumber) {
      continue;
    }

    latestInputBySelpickOrderNumber.set(selpickOrderNumber, {
      deliveryCompanyCode: normalizeDeliveryCode(row.deliveryCompanyCode),
      invoiceNumber: normalizeInvoiceNumber(row.invoiceNumber),
    });
  }

  const issues: string[] = [];
  const normalizedItems: PatchCoupangShipmentWorksheetItemInput[] = [];
  let matchedCount = 0;

  latestInputBySelpickOrderNumber.forEach((invoiceInput, selpickOrderNumber) => {
    const row = rowBySelpickOrderNumber.get(selpickOrderNumber);
    if (!row) {
      issues.push(
        `\uD604\uC7AC \uC6CC\uD06C\uC2DC\uD2B8\uC5D0 \uC5C6\uB294 \uC140\uD53D\uC8FC\uBB38\uBC88\uD638\uC785\uB2C8\uB2E4: ${selpickOrderNumber}`,
      );
      return;
    }

    matchedCount += 1;

    if (
      row.deliveryCompanyCode === invoiceInput.deliveryCompanyCode &&
      row.invoiceNumber === invoiceInput.invoiceNumber
    ) {
      return;
    }

    normalizedItems.push(
      normalizePatchAgainstRow(row, {
        sourceKey: row.sourceKey,
        selpickOrderNumber,
        deliveryCompanyCode: invoiceInput.deliveryCompanyCode,
        invoiceNumber: invoiceInput.invoiceNumber,
      }),
    );
  });

  if (!normalizedItems.length) {
    return {
      matchedCount,
      updatedCount: 0,
      ignoredCount: issues.length,
      issues,
      touchedRowIds: [],
      message: buildInvoiceInputApplyMessage({
        matchedCount,
        issueCount: issues.length,
        missingKeyCount: 0,
        updatedCount: 0,
      }),
    };
  }

  const result = await coupangShipmentWorksheetStore.patchRows({
    storeId: input.storeId,
    items: normalizedItems,
  });
  const touchedSourceKeySet = new Set(result.touchedSourceKeys);
  const touchedRowIds = result.sheet.items
    .filter((row) => touchedSourceKeySet.has(row.sourceKey))
    .map((row) => row.id);

  return {
    matchedCount,
    updatedCount: result.touchedSourceKeys.length,
    ignoredCount: issues.length + result.missingKeys.length,
    issues: [
      ...issues,
      ...result.missingKeys.map(
        (key) =>
          `\uD604\uC7AC \uC6CC\uD06C\uC2DC\uD2B8\uC5D0\uC11C \uBC18\uC601\uD558\uC9C0 \uBABB\uD55C \uD589\uC785\uB2C8\uB2E4: ${key}`,
      ),
    ],
    touchedRowIds,
    message: buildInvoiceInputApplyMessage({
      matchedCount,
      issueCount: issues.length,
      missingKeyCount: result.missingKeys.length,
      updatedCount: result.touchedSourceKeys.length,
    }),
  };
}
