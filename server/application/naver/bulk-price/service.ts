import { randomUUID } from "crypto";
import type {
  NaverBulkPriceDisplayStatus,
  NaverBulkPriceSaleStatus,
  NaverBulkPriceCreateRunInput,
  NaverBulkPriceLatestAppliedRecord,
  NaverBulkPricePreviewJob,
  NaverBulkPricePreviewJobPhase,
  NaverBulkPricePreviewJobProgress,
  NaverBulkPricePreviewJobSummary,
  NaverBulkPricePreviewQueryInput,
  NaverBulkPricePreviewResponse,
  NaverBulkPricePreviewRow,
  NaverBulkPricePreviewSnapshot,
  NaverBulkPricePreviewSort,
  NaverBulkPricePreviewStats,
  NaverBulkPriceRulePresetInput,
  NaverBulkPriceRuleSet,
  NaverBulkPriceRun,
  NaverBulkPriceRunDetail,
  NaverBulkPriceRunItem,
  NaverBulkPriceRunItemStatus,
  NaverBulkPriceRunRecentChange,
  NaverBulkPriceRunSummary,
  NaverBulkPriceRunSummaryResponse,
  NaverBulkPriceSourceConfig,
  NaverBulkPriceSourcePresetInput,
  NaverBulkPriceTargetSaleStatus,
  NaverBulkPriceWorkDateFilterSummary,
} from "@shared/naver-bulk-price";
import type {
  NaverPriceUpdatePreview,
  NaverProductListItem,
  NaverProductOptionType,
} from "@shared/naver-products";
import {
  ApiRouteError,
  BulkPricePreviewSourceRow,
  calculateBulkPriceValues,
  fetchBulkPriceSourceMetadata,
  loadRelevantSourceRows,
  naverBulkPriceStore,
  NaverBulkPriceStore,
  normalizeMatchCode,
  resolveMasterSkuDatabaseUrl,
  validateBulkPriceRuleSet,
  validateBulkPriceSourceConfigBase,
} from "../../../infra/naver/bulk-price-deps";
import {
  fetchNaverProducts,
  syncNaverProductAvailability,
  updateNaverProductSalePrice,
  updateNaverProductSalePriceFromPreview,
  updateNaverProductSaleStatus,
} from "../../../services/naver-product-service";

type NaverPreviewCandidate = {
  rowKey: string;
  originProductNo: string;
  channelProductNo: string | null;
  sellerManagementCode: string | null;
  sellerBarcode: string | null;
  productName: string;
  matchedCode: string | null;
  currentPrice: number | null;
  stockQuantity: number | null;
  saleStatusCode: string | null;
  displayStatusCode: string | null;
  saleStatusLabel: string;
  hasOptions: boolean;
  optionType: NaverProductOptionType;
  optionCount: number;
  optionHandlingMessage: string;
  modifiedAt: string | null;
};

type NaverBulkPriceServiceDeps = {
  store: NaverBulkPriceStore;
  loadSourceMetadata: (input: {
    schema?: string | null;
    table?: string | null;
  }) => Promise<{
    configured: boolean;
    databaseUrlAvailable: boolean;
    tables: { schema: string; table: string }[];
    columns: { name: string; dataType: string; isNullable: boolean }[];
    sampleRows: {
      index: number;
      values: Record<string, string | number | boolean | null>;
    }[];
    requestedTable: { schema: string; table: string } | null;
    fetchedAt: string;
  }>;
  buildPreview: (input: {
    sourceConfig: NaverBulkPriceSourceConfig;
    rules: NaverBulkPriceRuleSet;
    onProgress?: (update: BuildPreviewProgressUpdate) => void;
  }) => Promise<NaverBulkPricePreviewSnapshot>;
  applyPriceUpdate: (input: {
    storeId: string;
    originProductNo: string;
    channelProductNo: string | null;
    price: number;
    preview?: NaverPriceUpdatePreview;
  }) => Promise<{ message: string }>;
  applyAvailabilityUpdate?: (input: {
    storeId: string;
    originProductNo: string;
    channelProductNo: string | null;
    targetSaleStatus: NaverBulkPriceTargetSaleStatus | null;
    targetStockQuantity: number | null;
    targetDisplayStatus: Extract<NaverBulkPriceDisplayStatus, "ON"> | null;
  }) => Promise<{
    messages: string[];
    inventoryUpdated: boolean;
    saleStatusUpdated: boolean;
    displayStatusUpdated: boolean;
  }>;
  applySaleStatusUpdate?: (input: {
    storeId: string;
    originProductNo: string;
    channelProductNo: string | null;
    saleStatus: NaverBulkPriceTargetSaleStatus;
  }) => Promise<{ message: string }>;
  runWorkerConcurrency?: number;
  previewCacheTtlMs?: number;
};

type RunController = {
  runId: string;
  pauseRequested: boolean;
  stopRequested: boolean;
  nextIndex: number;
  queuedItemIds: string[];
  summary: NaverBulkPriceRunSummary | null;
  summaryUpdateChain: Promise<void>;
  summaryPersistTimer: ReturnType<typeof setTimeout> | null;
  summaryPersistPromise: Promise<void>;
  };

const RECENT_RUN_CHANGE_LIMIT = 5;

type PreviewSession = {
  id: string;
  key: string;
  preview: NaverBulkPricePreviewSnapshot;
  cachedAt: number;
};

type BuildPreviewProgressUpdate = Partial<NaverBulkPricePreviewJobProgress> & {
  phase?: NaverBulkPricePreviewJobPhase;
};

type PreviewRefreshJob = NaverBulkPricePreviewJob & {
  key: string;
  promise: Promise<void> | null;
};

type PreviewCandidateCacheEntry = {
  rows: NaverPreviewCandidate[];
  cachedAt: number;
  ttlMs: number;
};

const DEFAULT_RUN_WORKER_CONCURRENCY = 2;
const DEFAULT_PREVIEW_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_PREVIEW_CANDIDATE_CACHE_TTL_MS = 60_000;
const SELLER_BARCODE_PREVIEW_CANDIDATE_CACHE_TTL_MS = 5_000;
const DEFAULT_PREVIEW_PAGE_SIZE = 100;
const DEFAULT_SOURCE_MATCH_CODE_BATCH_SIZE = 500;
const RECENT_RUN_ITEM_LIMIT = 20;
const RUN_SUMMARY_PERSIST_DEBOUNCE_MS = 200;
const NAVER_RESTOCK_QUANTITY = 102;
const PREVIEW_REFRESH_JOB_TTL_MS = 10 * 60_000;

const previewCandidateCache = new Map<string, PreviewCandidateCacheEntry>();
const previewCandidateRequests = new Map<string, Promise<NaverPreviewCandidate[]>>();

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw?.trim()) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizePresetName(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new ApiRouteError({
      code: "INVALID_PRESET_NAME",
      message: "Preset name is required.",
      status: 400,
    });
  }

  return normalized;
}

function normalizePresetMemo(value: string) {
  return value.trim();
}

function validateSourceConfig(sourceConfig: NaverBulkPriceSourceConfig) {
  validateBulkPriceSourceConfigBase(sourceConfig);

  if (
    sourceConfig.naverMatchField !== "sellerManagementCode" &&
    sourceConfig.naverMatchField !== "sellerBarcode" &&
    sourceConfig.naverMatchField !== "originProductNo" &&
    sourceConfig.naverMatchField !== "channelProductNo"
  ) {
    throw new ApiRouteError({
      code: "INVALID_SOURCE_CONFIG",
      message:
        "naverMatchField must be sellerManagementCode, sellerBarcode, originProductNo, or channelProductNo.",
      status: 400,
    });
  }
}

function buildRowKey(originProductNo: string, channelProductNo: string | null) {
  return `${originProductNo}::${channelProductNo ?? ""}`;
}

function buildOptionSummary(row: NaverProductListItem) {
  const hasOptions = row.hasOptions === true;

  if (row.hasOptions === true) {
    return {
      hasOptions,
      optionType: "unknown" as const,
      optionCount: 0,
      optionHandlingMessage:
        "옵션 상품입니다. origin 상품 가격만 변경하고 옵션별 추가금은 유지합니다.",
    };
  }

  if (row.hasOptions === false) {
    return {
      hasOptions,
      optionType: "none" as const,
      optionCount: 0,
      optionHandlingMessage: "단일 상품입니다. origin 상품 가격을 직접 변경합니다.",
    };
  }

  return {
    hasOptions: false,
    optionType: "unknown" as const,
    optionCount: 0,
    optionHandlingMessage:
      "옵션 구조를 목록 데이터만으로 완전히 확인하지 못했습니다. origin 상품 가격만 변경합니다.",
  };
}

function resolveNaverMatchCode(
  row: NaverProductListItem,
  matchField: NaverBulkPriceSourceConfig["naverMatchField"],
) {
  if (matchField === "sellerBarcode") {
    return normalizeMatchCode(row.sellerBarcode);
  }

  if (matchField === "originProductNo") {
    return normalizeMatchCode(row.originProductNo);
  }

  if (matchField === "channelProductNo") {
    return normalizeMatchCode(row.channelProductNo);
  }

  return normalizeMatchCode(row.sellerManagementCode);
}

async function loadAllNaverPreviewCandidates(
  sourceConfig: NaverBulkPriceSourceConfig,
) {
  const cacheKey = `${sourceConfig.storeId}::${sourceConfig.naverMatchField}`;
  const cachedEntry = previewCandidateCache.get(cacheKey);
  if (
    cachedEntry &&
    Date.now() - cachedEntry.cachedAt <= cachedEntry.ttlMs
  ) {
    return cachedEntry.rows;
  }

  const inflightRequest = previewCandidateRequests.get(cacheKey);
  if (inflightRequest) {
    return inflightRequest;
  }

  const request = fetchNaverProducts({
    storeId: sourceConfig.storeId,
    all: true,
    includeSellerBarcodes: sourceConfig.naverMatchField === "sellerBarcode",
  })
    .then((response) =>
      response.items.map<NaverPreviewCandidate>((row) => {
        const optionSummary = buildOptionSummary(row);

        return {
          rowKey: buildRowKey(row.originProductNo, row.channelProductNo),
          originProductNo: row.originProductNo,
          channelProductNo: row.channelProductNo,
          sellerManagementCode: row.sellerManagementCode,
          sellerBarcode: row.sellerBarcode,
          productName: row.productName,
          matchedCode: resolveNaverMatchCode(row, sourceConfig.naverMatchField),
          currentPrice: row.salePrice,
          stockQuantity: row.stockQuantity,
          saleStatusCode: row.saleStatusCode,
          displayStatusCode: row.displayStatusCode,
          saleStatusLabel: row.saleStatusLabel,
          hasOptions: optionSummary.hasOptions,
          optionType: optionSummary.optionType,
          optionCount: optionSummary.optionCount,
          optionHandlingMessage: optionSummary.optionHandlingMessage,
          modifiedAt: row.modifiedAt,
        };
      }),
    )
    .then((rows) => {
      const shouldShortCache =
        sourceConfig.naverMatchField === "sellerBarcode" &&
        rows.some((row) => row.matchedCode === null);
      previewCandidateCache.set(cacheKey, {
        rows,
        cachedAt: Date.now(),
        ttlMs: shouldShortCache
          ? SELLER_BARCODE_PREVIEW_CANDIDATE_CACHE_TTL_MS
          : DEFAULT_PREVIEW_CANDIDATE_CACHE_TTL_MS,
      });
      return rows;
    })
    .finally(() => {
      previewCandidateRequests.delete(cacheKey);
    });

  previewCandidateRequests.set(cacheKey, request);
  return request;
}

function invalidateNaverPreviewCandidateCache(storeId: string) {
  for (const cacheKey of Array.from(previewCandidateCache.keys())) {
    if (cacheKey.startsWith(`${storeId}::`)) {
      previewCandidateCache.delete(cacheKey);
    }
  }

  for (const cacheKey of Array.from(previewCandidateRequests.keys())) {
    if (cacheKey.startsWith(`${storeId}::`)) {
      previewCandidateRequests.delete(cacheKey);
    }
  }
}

function resolveCurrentNaverSoldOutState(input: {
  stockQuantity: number | null;
  saleStatusCode: NaverBulkPriceSaleStatus | null;
  displayStatusCode: NaverBulkPriceDisplayStatus | null;
}) {
  if (
    input.saleStatusCode === "OUTOFSTOCK" ||
    input.saleStatusCode === "SUSPENSION"
  ) {
    return true;
  }

  if (input.displayStatusCode === "SUSPENSION") {
    return true;
  }

  return input.stockQuantity !== null && input.stockQuantity <= 0;
}

function resolveTargetStockQuantity(
  sourceSoldOut: boolean | null,
  currentSoldOut: boolean,
) {
  if (sourceSoldOut === null || sourceSoldOut === currentSoldOut) {
    return null;
  }

  return sourceSoldOut ? 0 : NAVER_RESTOCK_QUANTITY;
}

function resolveTargetSaleStatus(input: {
  sourceSoldOut: boolean | null;
  currentSoldOut: boolean;
  currentSaleStatus: NaverBulkPriceSaleStatus | null;
}): NaverBulkPriceTargetSaleStatus | null {
  if (input.sourceSoldOut !== false || !input.currentSoldOut) {
    return null;
  }

  return input.currentSaleStatus === "SALE" ? null : "SALE";
}

function resolveTargetDisplayStatus(input: {
  sourceSoldOut: boolean | null;
  currentSoldOut: boolean;
  currentDisplayStatus: NaverBulkPriceDisplayStatus | null;
}) {
  if (
    input.sourceSoldOut !== false ||
    !input.currentSoldOut ||
    input.currentDisplayStatus !== "SUSPENSION"
  ) {
    return null;
  }

  return "ON" as const;
}

function shouldApplyPriceUpdate(
  currentPrice: number | null,
  targetPrice: number | null,
) {
  return targetPrice !== null && currentPrice !== targetPrice;
}

function shouldApplyInventoryUpdate(
  currentStockQuantity: number | null,
  targetStockQuantity: number | null,
) {
  return (
    targetStockQuantity !== null &&
    currentStockQuantity !== targetStockQuantity
  );
}

function shouldApplySaleStatusUpdate(
  currentSaleStatus: NaverBulkPriceSaleStatus | null,
  targetSaleStatus: NaverBulkPriceTargetSaleStatus | null,
) {
  return targetSaleStatus !== null && currentSaleStatus !== targetSaleStatus;
}

function shouldApplyDisplayStatusUpdate(
  currentDisplayStatus: NaverBulkPriceDisplayStatus | null,
  targetDisplayStatus: Extract<NaverBulkPriceDisplayStatus, "ON"> | null,
) {
  return (
    targetDisplayStatus !== null &&
    currentDisplayStatus !== targetDisplayStatus
  );
}

function buildAlreadyMatchedMessage(input: {
  sourceSoldOut: boolean | null;
  targetStockQuantity: number | null;
  targetSaleStatus: NaverBulkPriceTargetSaleStatus | null;
  targetDisplayStatus: Extract<NaverBulkPriceDisplayStatus, "ON"> | null;
}) {
  const comparesSoldOutState =
    input.sourceSoldOut !== null ||
    input.targetStockQuantity !== null ||
    input.targetSaleStatus !== null ||
    input.targetDisplayStatus !== null;

  return comparesSoldOutState
    ? "Current price and sold-out state already match target."
    : "Current price already matches target price.";
}

function summarizePreviewRows(rows: NaverBulkPricePreviewRow[]): NaverBulkPricePreviewStats {
  return {
    totalNaverItems: rows.length,
    readyCount: rows.filter((row) => row.status === "ready").length,
    selectableCount: rows.filter((row) => row.isSelectable).length,
    conflictCount: rows.filter((row) => row.status === "conflict").length,
    unmatchedCount: rows.filter((row) => row.status === "unmatched").length,
    invalidSourceCount: rows.filter((row) => row.status === "invalid_source").length,
  };
}

function compareNullableNumbers(left: number | null | undefined, right: number | null | undefined) {
  if (left === right) {
    return 0;
  }

  if (left === null || left === undefined) {
    return 1;
  }

  if (right === null || right === undefined) {
    return -1;
  }

  return left - right;
}

function compareNullableStrings(left: string | null | undefined, right: string | null | undefined) {
  if (left === right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return left.localeCompare(right, "ko-KR");
}

function compareNullableDates(left: string | null | undefined, right: string | null | undefined) {
  const leftTime = left ? new Date(left).getTime() : Number.NaN;
  const rightTime = right ? new Date(right).getTime() : Number.NaN;

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0;
  }

  if (Number.isNaN(leftTime)) {
    return 1;
  }

  if (Number.isNaN(rightTime)) {
    return -1;
  }

  return leftTime - rightTime;
}

function normalizePreviewPage(value: number | undefined, totalPages: number) {
  const fallback = 1;
  const normalized =
    typeof value === "number" && Number.isInteger(value)
      ? Math.max(1, value)
      : fallback;
  return Math.min(normalized, totalPages);
}

function normalizePreviewPageSize(value: number | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return DEFAULT_PREVIEW_PAGE_SIZE;
  }

  return Math.max(1, Math.min(value, DEFAULT_PREVIEW_PAGE_SIZE));
}

function sortPreviewRows(
  rows: NaverBulkPricePreviewRow[],
  sort: NaverBulkPricePreviewSort | null | undefined,
) {
  if (!sort?.field) {
    return rows;
  }

  const direction = sort.direction === "desc" ? -1 : 1;

  return rows.slice().sort((left, right) => {
    let result = 0;

    if (sort.field === "product") {
      result =
        compareNullableStrings(left.productName, right.productName) ||
        compareNullableStrings(left.originProductNo, right.originProductNo);
    } else if (sort.field === "matchedCode") {
      result =
        compareNullableStrings(left.matchedCode, right.matchedCode) ||
        compareNullableStrings(left.productName, right.productName);
    } else if (sort.field === "status") {
      result =
        compareNullableStrings(left.status, right.status) ||
        compareNullableStrings(left.saleStatusLabel, right.saleStatusLabel);
    } else if (sort.field === "targetPrice" || sort.field === "manualOverride") {
      result =
        compareNullableNumbers(left.effectiveTargetPrice, right.effectiveTargetPrice) ||
        compareNullableNumbers(left.currentPrice, right.currentPrice);
    } else if (sort.field === "basePrice") {
      result =
        compareNullableNumbers(left.basePrice, right.basePrice) ||
        compareNullableNumbers(left.effectiveCost, right.effectiveCost);
    } else if (sort.field === "option") {
      result =
        compareNullableNumbers(left.optionCount, right.optionCount) ||
        compareNullableStrings(left.optionType, right.optionType);
    } else if (sort.field === "lastApplied") {
      result =
        compareNullableDates(left.lastAppliedAt, right.lastAppliedAt) ||
        compareNullableNumbers(left.lastAppliedPrice, right.lastAppliedPrice);
    } else if (sort.field === "messages") {
      result = compareNullableStrings(
        left.messages.join(" / "),
        right.messages.join(" / "),
      );
    }

    if (result !== 0) {
      return result * direction;
    }

    return compareNullableStrings(left.rowKey, right.rowKey) * direction;
  });
}

function buildPagedPreviewResponse(input: {
  session: PreviewSession;
  page?: number;
  pageSize?: number;
  matchedOnly?: boolean;
  sort?: NaverBulkPricePreviewSort | null;
}): NaverBulkPricePreviewResponse {
  const filteredRows = input.matchedOnly
    ? input.session.preview.rows.filter((row) => Boolean(row.matchedCode?.trim()))
    : input.session.preview.rows;
  const sortedRows = sortPreviewRows(filteredRows, input.sort);
  const pageSize = normalizePreviewPageSize(input.pageSize);
  const totalPages = Math.max(1, Math.ceil(Math.max(sortedRows.length, 1) / pageSize));
  const page = normalizePreviewPage(input.page, totalPages);
  const offset = (page - 1) * pageSize;

  return {
    previewId: input.session.id,
    sourceConfig: input.session.preview.sourceConfig,
    rules: input.session.preview.rules,
    rows: sortedRows.slice(offset, offset + pageSize),
    stats: input.session.preview.stats,
    workDateFilterSummary: input.session.preview.workDateFilterSummary,
    generatedAt: input.session.preview.generatedAt,
    page,
    pageSize,
    filteredTotal: sortedRows.length,
    totalPages,
  };
}

function createEmptyPreviewJobProgress(): NaverBulkPricePreviewJobProgress {
  return {
    loadedProducts: 0,
    totalProducts: 0,
    matchedCodes: 0,
    processedRows: 0,
    updatedAt: new Date().toISOString(),
  };
}

function buildPreviewJobSummary(
  session: PreviewSession | null,
): NaverBulkPricePreviewJobSummary | null {
  if (!session) {
    return null;
  }

  return {
    previewId: session.id,
    stats: session.preview.stats,
    workDateFilterSummary: session.preview.workDateFilterSummary,
    generatedAt: session.preview.generatedAt,
  };
}

function sortPreviewRefreshJobs(items: PreviewRefreshJob[]) {
  return items
    .slice()
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id),
    );
}

function toPublicPreviewRefreshJob(job: PreviewRefreshJob): NaverBulkPricePreviewJob {
  const { key: _key, promise: _promise, ...publicJob } = job;
  return publicJob;
}

export function buildNaverBulkPricePreviewRows(input: {
  sourceRows: BulkPricePreviewSourceRow[];
  naverRows: NaverPreviewCandidate[];
  rules: NaverBulkPriceRuleSet;
  latestRecords: NaverBulkPriceLatestAppliedRecord[];
  excludedOnlyMatchCodes?: ReadonlySet<string>;
}) {
  const sourceMap = new Map<string, BulkPricePreviewSourceRow[]>();
  for (const row of input.sourceRows) {
    const current = sourceMap.get(row.matchedCode) ?? [];
    current.push(row);
    sourceMap.set(row.matchedCode, current);
  }

  const naverMap = new Map<string, NaverPreviewCandidate[]>();
  for (const row of input.naverRows) {
    if (!row.matchedCode) {
      continue;
    }

    const current = naverMap.get(row.matchedCode) ?? [];
    current.push(row);
    naverMap.set(row.matchedCode, current);
  }

  const latestRecordMap = new Map(
    input.latestRecords.map((item) => [item.rowKey, item] as const),
  );

  const rows: NaverBulkPricePreviewRow[] = [];
  let excludedPreviewRowCount = 0;

  for (const row of input.naverRows) {
    if (
      row.matchedCode &&
      (input.excludedOnlyMatchCodes?.has(row.matchedCode) ?? false)
    ) {
      excludedPreviewRowCount += 1;
      continue;
    }

    const latestRecord = latestRecordMap.get(row.rowKey) ?? null;
    const messages: string[] = [];
    let status: NaverBulkPricePreviewRow["status"] = "ready";
    let selectedSource: BulkPricePreviewSourceRow | null = null;
    let sourceSoldOut: boolean | null = null;
    let targetStockQuantity: number | null = null;
    let targetSaleStatus: NaverBulkPriceTargetSaleStatus | null = null;
    const currentSaleStatus = row.saleStatusCode as NaverBulkPriceSaleStatus | null;
    const currentDisplayStatus =
      row.displayStatusCode as NaverBulkPriceDisplayStatus | null;
    const currentSoldOut = resolveCurrentNaverSoldOutState({
      stockQuantity: row.stockQuantity,
      saleStatusCode: currentSaleStatus,
      displayStatusCode: currentDisplayStatus,
    });
    let targetDisplayStatus: Extract<NaverBulkPriceDisplayStatus, "ON"> | null =
      null;

    if (!row.matchedCode) {
      status = "unmatched";
      messages.push("선택한 NAVER 매칭 필드 값이 비어 있습니다.");
    } else {
      const matchedSourceRows = sourceMap.get(row.matchedCode) ?? [];
      const duplicateNaverRows = naverMap.get(row.matchedCode) ?? [];

      if (matchedSourceRows.length === 0) {
        status = "unmatched";
        messages.push("일치하는 외부 소스 행을 찾지 못했습니다.");
      } else if (matchedSourceRows.length > 1) {
        status = "conflict";
        messages.push("외부 소스의 매칭 코드가 중복되었습니다.");
      } else if (duplicateNaverRows.length > 1) {
        status = "conflict";
        messages.push("NAVER 상품의 매칭 코드가 중복되었습니다.");
      } else {
        selectedSource = matchedSourceRows[0] ?? null;
        sourceSoldOut = selectedSource?.sourceSoldOut ?? null;
        targetStockQuantity = resolveTargetStockQuantity(
          sourceSoldOut,
          currentSoldOut,
        );
        targetSaleStatus = resolveTargetSaleStatus({
          sourceSoldOut,
          currentSoldOut,
          currentSaleStatus,
        });
        targetDisplayStatus = resolveTargetDisplayStatus({
          sourceSoldOut,
          currentSoldOut,
          currentDisplayStatus,
        });
      }
    }

    let basePrice: number | null = selectedSource?.basePrice ?? null;
    let discountedBaseCost: number | null = null;
    let effectiveCost: number | null = null;
    let rawTargetPrice: number | null = null;
    let adjustedTargetPrice: number | null = null;
    let roundedTargetPrice: number | null = null;
    let computedPrice: number | null = null;
    let needsPriceUpdate = false;
    let needsInventoryUpdate = shouldApplyInventoryUpdate(
      row.stockQuantity,
      targetStockQuantity,
    );
    let needsSaleStatusUpdate = shouldApplySaleStatusUpdate(
      currentSaleStatus,
      targetSaleStatus,
    );
    let needsDisplayStatusUpdate = shouldApplyDisplayStatusUpdate(
      currentDisplayStatus,
      targetDisplayStatus,
    );

    if (status === "ready" && selectedSource) {
      if (selectedSource.soldOutValueError) {
        status = "invalid_source";
        messages.push(selectedSource.soldOutValueError);
        targetStockQuantity = null;
        targetSaleStatus = null;
        targetDisplayStatus = null;
        needsInventoryUpdate = false;
        needsSaleStatusUpdate = false;
        needsDisplayStatusUpdate = false;
      }
      if (basePrice === null || basePrice < 0) {
        if (needsInventoryUpdate || needsSaleStatusUpdate || needsDisplayStatusUpdate) {
          messages.push("Base price is missing or invalid. Price update will be skipped.");
        } else if (status === "ready") {
          status = "invalid_source";
          messages.push("Base price is missing or invalid.");
        }
      } else if (status === "ready") {
        const calculated = calculateBulkPriceValues(basePrice, input.rules);
        discountedBaseCost = calculated.discountedBaseCost;
        effectiveCost = calculated.effectiveCost;
        rawTargetPrice = calculated.rawTargetPrice;
        adjustedTargetPrice = calculated.adjustedTargetPrice;
        roundedTargetPrice = calculated.roundedTargetPrice;
        computedPrice = calculated.computedPrice;
        needsPriceUpdate = shouldApplyPriceUpdate(row.currentPrice, computedPrice);

        if (needsPriceUpdate && row.currentPrice === null) {
          needsPriceUpdate = false;
          messages.push("Current sale price could not be confirmed. Price update will be skipped.");
        } else if (
          !needsInventoryUpdate &&
          !needsSaleStatusUpdate &&
          !needsDisplayStatusUpdate &&
          !needsPriceUpdate &&
          computedPrice !== null
        ) {
          messages.push("Current price already matches target price.");
        }
      }
    }

    rows.push({
      rowKey: row.rowKey,
      originProductNo: row.originProductNo,
      channelProductNo: row.channelProductNo,
      sellerManagementCode: row.sellerManagementCode,
      sellerBarcode: row.sellerBarcode,
      productName: row.productName,
      matchedCode: row.matchedCode,
      status,
      messages,
      isSelectable:
        status === "ready" &&
        (
          needsPriceUpdate ||
          needsInventoryUpdate ||
          needsSaleStatusUpdate ||
          needsDisplayStatusUpdate
        ),
      modifiedAt: row.modifiedAt,
      lastAppliedAt: latestRecord?.appliedAt ?? null,
      lastAppliedPrice: latestRecord?.appliedPrice ?? null,
      currentPrice: row.currentPrice,
      currentStockQuantity: row.stockQuantity,
      sourceSoldOut,
      currentSaleStatus,
      currentDisplayStatus,
      targetStockQuantity,
      targetSaleStatus,
      targetDisplayStatus,
      needsPriceUpdate,
      needsInventoryUpdate,
      needsSaleStatusUpdate,
      needsDisplayStatusUpdate,
      saleStatusCode: row.saleStatusCode,
      saleStatusLabel: row.saleStatusLabel,
      hasOptions: row.hasOptions,
      optionType: row.optionType,
      optionCount: row.optionCount,
      optionHandlingMessage: row.optionHandlingMessage,
      basePrice,
      discountedBaseCost,
      effectiveCost,
      rawTargetPrice,
      adjustedTargetPrice,
      roundedTargetPrice,
      computedPrice,
      manualOverridePrice: null,
      effectiveTargetPrice: computedPrice,
      sourceRow: selectedSource?.raw ?? null,
    } satisfies NaverBulkPricePreviewRow);
  }

  return {
    rows,
    excludedPreviewRowCount,
  };
}

export function buildNaverBulkPricePreview(input: {
  sourceConfig: NaverBulkPriceSourceConfig;
  rules: NaverBulkPriceRuleSet;
  onProgress?: (update: BuildPreviewProgressUpdate) => void;
}): Promise<NaverBulkPricePreviewSnapshot> {
  validateSourceConfig(input.sourceConfig);
  validateBulkPriceRuleSet(input.rules);

  return (async () => {
    const metadata = await fetchBulkPriceSourceMetadata({
      schema: input.sourceConfig.schema,
      table: input.sourceConfig.table,
    });

    const columnNames = new Set(metadata.columns.map((column) => column.name));
    const sourceMatchColumn =
      metadata.columns.find((column) => column.name === input.sourceConfig.sourceMatchColumn) ??
      null;
    if (!columnNames.has(input.sourceConfig.basePriceColumn)) {
      throw new ApiRouteError({
        code: "SOURCE_COLUMN_NOT_FOUND",
        message: `Column ${input.sourceConfig.basePriceColumn} was not found.`,
        status: 400,
      });
    }

    if (!columnNames.has(input.sourceConfig.sourceMatchColumn)) {
      throw new ApiRouteError({
        code: "SOURCE_COLUMN_NOT_FOUND",
        message: `Column ${input.sourceConfig.sourceMatchColumn} was not found.`,
        status: 400,
      });
    }

    if (!columnNames.has(input.sourceConfig.workDateColumn)) {
      throw new ApiRouteError({
        code: "SOURCE_COLUMN_NOT_FOUND",
        message: `Column ${input.sourceConfig.workDateColumn} was not found.`,
        status: 400,
      });
    }

    if (
      input.sourceConfig.soldOutColumn.trim() &&
      !columnNames.has(input.sourceConfig.soldOutColumn)
    ) {
      throw new ApiRouteError({
        code: "SOURCE_COLUMN_NOT_FOUND",
        message: `Column ${input.sourceConfig.soldOutColumn} was not found.`,
        status: 400,
      });
    }

    input.onProgress?.({
      phase: "loading_naver_products",
      loadedProducts: 0,
      totalProducts: 0,
      matchedCodes: 0,
      processedRows: 0,
      updatedAt: new Date().toISOString(),
    });
    const naverRows = await loadAllNaverPreviewCandidates(input.sourceConfig);
    const matchCodes = Array.from(
      new Set(
        naverRows
          .map((row) => row.matchedCode)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    input.onProgress?.({
      phase:
        input.sourceConfig.naverMatchField === "sellerBarcode"
          ? "enriching_barcodes"
          : "loading_source_rows",
      loadedProducts: naverRows.length,
      totalProducts: naverRows.length,
      matchedCodes: 0,
      processedRows: 0,
      updatedAt: new Date().toISOString(),
    });
    const sourceRowsResult = await loadRelevantSourceRows({
      sourceConfig: input.sourceConfig,
      matchCodes,
      sourceMatchColumnDataType: sourceMatchColumn?.dataType ?? null,
      batchSize: DEFAULT_SOURCE_MATCH_CODE_BATCH_SIZE,
      onBatchComplete: (progress) =>
        input.onProgress?.({
          phase: "loading_source_rows",
          loadedProducts: naverRows.length,
          totalProducts: naverRows.length,
          matchedCodes: progress.processedMatchCodes,
          processedRows: 0,
          updatedAt: new Date().toISOString(),
        }),
    });
    const latestRecords = await naverBulkPriceStore.listLatestRecordsByRowKeys(
      naverRows.map((row) => row.rowKey),
    );
    input.onProgress?.({
      phase: "matching",
      loadedProducts: naverRows.length,
      totalProducts: naverRows.length,
      matchedCodes: matchCodes.length,
      processedRows: 0,
      updatedAt: new Date().toISOString(),
    });
    const previewRowsResult = buildNaverBulkPricePreviewRows({
      sourceRows: sourceRowsResult.rows,
      naverRows,
      rules: input.rules,
      latestRecords,
      excludedOnlyMatchCodes: sourceRowsResult.excludedOnlyMatchCodes,
    });
    input.onProgress?.({
      phase: "finalizing",
      loadedProducts: naverRows.length,
      totalProducts: naverRows.length,
      matchedCodes: matchCodes.length,
      processedRows: previewRowsResult.rows.length,
      updatedAt: new Date().toISOString(),
    });
    const workDateFilterSummary: NaverBulkPriceWorkDateFilterSummary = {
      ...sourceRowsResult.workDateFilterSummary,
      excludedPreviewRowCount: previewRowsResult.excludedPreviewRowCount,
    };

    return {
      sourceConfig: input.sourceConfig,
      rules: input.rules,
      rows: previewRowsResult.rows,
      stats: summarizePreviewRows(previewRowsResult.rows),
      workDateFilterSummary,
      generatedAt: new Date().toISOString(),
    } satisfies NaverBulkPricePreviewSnapshot;
  })();
}

function createEmptyRunSummary(): NaverBulkPriceRunSummary {
  return {
    total: 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    paused: 0,
    stopped: 0,
    skippedConflict: 0,
    skippedUnmatched: 0,
    recentChanges: [],
  };
}

function mergeRecentRunChanges(
  current: NaverBulkPriceRunRecentChange[],
  nextChange?: NaverBulkPriceRunRecentChange | null,
) {
  const items = nextChange
    ? [nextChange, ...current.filter((item) => item.rowId !== nextChange.rowId)]
    : current.slice();

  return items
    .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))
    .slice(0, RECENT_RUN_CHANGE_LIMIT);
}

function buildRunItemChangeLabel(
  item: Pick<NaverBulkPriceRunItem, "productName" | "originProductNo" | "channelProductNo">,
) {
  const productName = item.productName.trim();
  if (productName) {
    return productName;
  }

  return item.channelProductNo ?? item.originProductNo;
}

function buildRunRecentChange(input: {
  item: NaverBulkPriceRunItem;
  appliedAt: string;
  priceUpdated: boolean;
  inventoryUpdated: boolean;
  saleStatusUpdated: boolean;
  displayStatusUpdated: boolean;
  appliedPrice: number | null;
}): NaverBulkPriceRunRecentChange | null {
  if (
    !input.priceUpdated &&
    !input.inventoryUpdated &&
    !input.saleStatusUpdated &&
    !input.displayStatusUpdated
  ) {
    return null;
  }

  return {
    rowId: input.item.rowKey,
    label: buildRunItemChangeLabel(input.item),
    matchedCode: input.item.matchedCode,
    beforePrice: input.priceUpdated ? input.item.currentPrice : null,
    afterPrice: input.priceUpdated ? input.appliedPrice : null,
    beforeStockQuantity: input.inventoryUpdated ? input.item.currentStockQuantity : null,
    afterStockQuantity: input.inventoryUpdated ? input.item.targetStockQuantity : null,
    beforeSaleStatus: input.saleStatusUpdated ? input.item.currentSaleStatus : null,
    afterSaleStatus: input.saleStatusUpdated ? input.item.targetSaleStatus : null,
    beforeDisplayStatus: input.displayStatusUpdated ? input.item.currentDisplayStatus : null,
    afterDisplayStatus: input.displayStatusUpdated ? input.item.targetDisplayStatus : null,
    appliedAt: input.appliedAt,
  };
}

function buildRunSummary(
  items: NaverBulkPriceRunItem[],
  recentChanges: NaverBulkPriceRunRecentChange[] = [],
): NaverBulkPriceRunSummary {
  const summary = createEmptyRunSummary();
  summary.total = items.length;
  summary.recentChanges = mergeRecentRunChanges(recentChanges);

  for (const item of items) {
    if (item.status === "queued") summary.queued += 1;
    else if (item.status === "running") summary.running += 1;
    else if (item.status === "succeeded") summary.succeeded += 1;
    else if (item.status === "failed") summary.failed += 1;
    else if (item.status === "paused") summary.paused += 1;
    else if (item.status === "stopped") summary.stopped += 1;
    else if (item.status === "skipped_conflict") summary.skippedConflict += 1;
    else if (item.status === "skipped_unmatched") summary.skippedUnmatched += 1;
  }

  return summary;
}

function getRunSummaryKey(status: NaverBulkPriceRunItemStatus) {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "paused":
      return "paused";
    case "stopped":
      return "stopped";
    case "skipped_conflict":
      return "skippedConflict";
    case "skipped_unmatched":
      return "skippedUnmatched";
  }
}

function transitionRunSummary(
  summary: NaverBulkPriceRunSummary,
  fromStatus: NaverBulkPriceRunItemStatus,
  toStatus: NaverBulkPriceRunItemStatus,
) {
  if (fromStatus === toStatus) {
    return summary;
  }

  const nextSummary: NaverBulkPriceRunSummary = { ...summary };
  const fromKey = getRunSummaryKey(fromStatus);
  const toKey = getRunSummaryKey(toStatus);

  nextSummary[fromKey] = Math.max(0, nextSummary[fromKey] - 1);
  nextSummary[toKey] += 1;

  return nextSummary;
}

function resolveCompletedRunStatus(summary: NaverBulkPriceRunSummary): NaverBulkPriceRun["status"] {
  if (summary.stopped > 0 && summary.queued === 0 && summary.running === 0) {
    return "stopped";
  }

  if (summary.paused > 0) {
    return "paused";
  }

  const skippedCount = summary.skippedConflict + summary.skippedUnmatched;
  if (summary.failed > 0 && summary.succeeded > 0) {
    return "partially_succeeded";
  }

  if (summary.failed > 0 && skippedCount > 0) {
    return "partially_succeeded";
  }

  if (summary.failed > 0) {
    return "failed";
  }

  if (skippedCount > 0 && summary.succeeded > 0) {
    return "partially_succeeded";
  }

  if (skippedCount > 0) {
    return "failed";
  }

  return "succeeded";
}

function createRunItemFromPreview(
  previewRow: NaverBulkPricePreviewRow,
  manualOverridePrice: number | null,
): Omit<NaverBulkPriceRunItem, "id" | "runId" | "createdAt" | "updatedAt"> {
  return {
    rowKey: previewRow.rowKey,
    originProductNo: previewRow.originProductNo,
    channelProductNo: previewRow.channelProductNo,
    sellerManagementCode: previewRow.sellerManagementCode,
    sellerBarcode: previewRow.sellerBarcode,
    productName: previewRow.productName,
    matchedCode: previewRow.matchedCode,
    status: "queued",
    messages: [...previewRow.messages],
    currentPrice: previewRow.currentPrice,
    currentStockQuantity: previewRow.currentStockQuantity,
    sourceSoldOut: previewRow.sourceSoldOut,
    currentSaleStatus: previewRow.currentSaleStatus,
    currentDisplayStatus: previewRow.currentDisplayStatus,
    targetStockQuantity: previewRow.targetStockQuantity,
    targetSaleStatus: previewRow.targetSaleStatus,
    targetDisplayStatus: previewRow.targetDisplayStatus,
    saleStatusCode: previewRow.saleStatusCode,
    saleStatusLabel: previewRow.saleStatusLabel,
    hasOptions: previewRow.hasOptions,
    optionType: previewRow.optionType,
    optionCount: previewRow.optionCount,
    optionHandlingMessage: previewRow.optionHandlingMessage,
    basePrice: previewRow.basePrice,
    discountedBaseCost: previewRow.discountedBaseCost,
    effectiveCost: previewRow.effectiveCost,
    rawTargetPrice: previewRow.rawTargetPrice,
    adjustedTargetPrice: previewRow.adjustedTargetPrice,
    roundedTargetPrice: previewRow.roundedTargetPrice,
    computedPrice: previewRow.computedPrice,
    manualOverridePrice,
    effectiveTargetPrice: manualOverridePrice ?? previewRow.computedPrice,
    lastAppliedAt: previewRow.lastAppliedAt,
    lastAppliedPrice: previewRow.lastAppliedPrice,
    modifiedAt: previewRow.modifiedAt,
    sourceRow: previewRow.sourceRow,
  };
}

function normalizeManualOverridePrice(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new ApiRouteError({
      code: "INVALID_MANUAL_OVERRIDE",
      message: "manualOverridePrice must be a positive integer.",
      status: 400,
    });
  }

  return value;
}

function normalizeSelectionMode(value: NaverBulkPriceCreateRunInput["selectionMode"]) {
  if (value === "explicit") {
    return "explicit";
  }
  if (value === "all_ready") {
    return "all_ready";
  }
  return "all_selectable";
}

function buildManualOverrideMap(input: {
  manualOverrides?: Record<string, number | null | undefined>;
  items?: NaverBulkPriceCreateRunInput["items"];
}) {
  const overrideMap = new Map<string, number | null>();

  for (const [rowKey, manualOverridePrice] of Object.entries(input.manualOverrides ?? {})) {
    const normalizedRowKey = rowKey.trim();
    if (!normalizedRowKey) {
      continue;
    }

    overrideMap.set(
      normalizedRowKey,
      normalizeManualOverridePrice(manualOverridePrice),
    );
  }

  for (const item of input.items ?? []) {
    const normalizedRowKey = item.rowKey.trim();
    if (!normalizedRowKey) {
      continue;
    }

    overrideMap.set(
      normalizedRowKey,
      normalizeManualOverridePrice(item.manualOverridePrice),
    );
  }

  return overrideMap;
}

function resolveExplicitRequestedItems(input: {
  selectedRowKeys?: string[];
  items?: NaverBulkPriceCreateRunInput["items"];
  overrideMap: Map<string, number | null>;
}) {
  const rowKeys = new Set<string>();

  for (const rowKey of input.selectedRowKeys ?? []) {
    const normalizedRowKey = rowKey.trim();
    if (normalizedRowKey) {
      rowKeys.add(normalizedRowKey);
    }
  }

  for (const item of input.items ?? []) {
    const normalizedRowKey = item.rowKey.trim();
    if (normalizedRowKey) {
      rowKeys.add(normalizedRowKey);
    }
  }

  return Array.from(rowKeys).map((rowKey) => ({
    rowKey,
    manualOverridePrice: input.overrideMap.get(rowKey) ?? null,
  }));
}

export class NaverBulkPriceService {
  private readonly controllers = new Map<string, RunController>();
  private readonly previewSessionsByKey = new Map<string, PreviewSession>();
  private readonly previewSessionsById = new Map<string, PreviewSession>();
  private readonly previewRefreshJobsById = new Map<string, PreviewRefreshJob>();
  private readonly previewRefreshJobsByKey = new Map<string, PreviewRefreshJob>();

  constructor(private readonly deps: NaverBulkPriceServiceDeps) {}

  async getSourceMetadata(input: { schema?: string | null; table?: string | null }) {
    return this.deps.loadSourceMetadata(input);
  }

  async preview(input: NaverBulkPricePreviewQueryInput) {
    const previewId = input.previewId?.trim() ?? "";
    const session = previewId
      ? this.resolvePreviewSessionById(previewId)
      : await this.createPreviewSession({
          sourceConfig: input.sourceConfig ?? null,
          rules: input.rules ?? null,
        });

    return buildPagedPreviewResponse({
      session,
      page: input.page,
      pageSize: input.pageSize,
      matchedOnly: input.matchedOnly,
      sort: input.sort,
    });
  }

  async getCachedPreview(input: NaverBulkPricePreviewQueryInput) {
    const previewId = input.previewId?.trim() ?? "";
    const session = previewId
      ? this.resolvePreviewSessionById(previewId)
      : this.findPreviewSession(input.sourceConfig ?? null, input.rules ?? null);

    if (!session) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_PREVIEW_REFRESH_REQUIRED",
        message: "Preview refresh required. Start a preview refresh job and try again.",
        status: 409,
      });
    }

    return buildPagedPreviewResponse({
      session,
      page: input.page,
      pageSize: input.pageSize,
      matchedOnly: input.matchedOnly,
      sort: input.sort,
    });
  }

  async startPreviewRefreshJob(input: {
    sourceConfig: NaverBulkPriceSourceConfig;
    rules: NaverBulkPriceRuleSet;
  }) {
    validateSourceConfig(input.sourceConfig);
    validateBulkPriceRuleSet(input.rules);
    this.cleanupExpiredPreviewRefreshJobs();

    const key = this.getPreviewSessionKey(input.sourceConfig, input.rules);
    const existing = this.previewRefreshJobsByKey.get(key);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return {
        job: toPublicPreviewRefreshJob(existing),
      };
    }

    const cachedSession = this.findPreviewSession(input.sourceConfig, input.rules);
    const timestamp = new Date().toISOString();
    const job: PreviewRefreshJob = {
      id: randomUUID(),
      key,
      sourceConfig: input.sourceConfig,
      rules: input.rules,
      status: "queued",
      phase: "loading_naver_products",
      progress: createEmptyPreviewJobProgress(),
      cachedPreviewId: cachedSession?.id ?? null,
      cachedSummary: buildPreviewJobSummary(cachedSession),
      startedFromCache: Boolean(cachedSession),
      latestPreviewId: null,
      summary: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      finishedAt: null,
      promise: null,
    };

    this.previewRefreshJobsById.set(job.id, job);
    this.previewRefreshJobsByKey.set(key, job);
    job.promise = this.runPreviewRefreshJob(job);

    return {
      job: toPublicPreviewRefreshJob(job),
    };
  }

  async getPreviewRefreshJob(jobId: string) {
    this.cleanupExpiredPreviewRefreshJobs();
    const job = this.previewRefreshJobsById.get(jobId) ?? null;
    if (!job) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_PREVIEW_JOB_NOT_FOUND",
        message: "Preview refresh job not found.",
        status: 404,
      });
    }

    return {
      job: toPublicPreviewRefreshJob(job),
    };
  }

  async listPreviewRefreshJobs() {
    this.cleanupExpiredPreviewRefreshJobs();
    return {
      items: sortPreviewRefreshJobs(Array.from(this.previewRefreshJobsById.values())).map(
        toPublicPreviewRefreshJob,
      ),
    };
  }

  private getPreviewSessionKey(
    sourceConfig: NaverBulkPriceSourceConfig,
    rules: NaverBulkPriceRuleSet,
  ) {
    return JSON.stringify({ sourceConfig, rules });
  }

  private getRunWorkerConcurrency() {
    return Math.max(1, this.deps.runWorkerConcurrency ?? DEFAULT_RUN_WORKER_CONCURRENCY);
  }

  private getPreviewCacheTtlMs() {
    return Math.max(1_000, this.deps.previewCacheTtlMs ?? DEFAULT_PREVIEW_CACHE_TTL_MS);
  }

  private findPreviewSession(
    sourceConfig: NaverBulkPriceSourceConfig | null,
    rules: NaverBulkPriceRuleSet | null,
  ) {
    this.cleanupExpiredPreviewSessions();
    if (!sourceConfig || !rules) {
      return null;
    }

    return this.previewSessionsByKey.get(this.getPreviewSessionKey(sourceConfig, rules)) ?? null;
  }

  private removePreviewSession(session: PreviewSession) {
    this.previewSessionsById.delete(session.id);

    const activeKeyEntry = this.previewSessionsByKey.get(session.key);
    if (activeKeyEntry?.id === session.id) {
      this.previewSessionsByKey.delete(session.key);
    }
  }

  private cleanupExpiredPreviewSessions() {
    const ttlMs = this.getPreviewCacheTtlMs();
    const now = Date.now();

    for (const session of Array.from(this.previewSessionsById.values())) {
      if (now - session.cachedAt > ttlMs) {
        this.removePreviewSession(session);
      }
    }
  }

  private removePreviewRefreshJob(job: PreviewRefreshJob) {
    this.previewRefreshJobsById.delete(job.id);
    const activeKeyEntry = this.previewRefreshJobsByKey.get(job.key);
    if (activeKeyEntry?.id === job.id) {
      this.previewRefreshJobsByKey.delete(job.key);
    }
  }

  private cleanupExpiredPreviewRefreshJobs() {
    const now = Date.now();

    for (const job of Array.from(this.previewRefreshJobsById.values())) {
      if (job.status === "queued" || job.status === "running") {
        continue;
      }

      const referenceTime = Date.parse(job.finishedAt ?? job.updatedAt);
      if (Number.isNaN(referenceTime)) {
        continue;
      }

      if (now - referenceTime > PREVIEW_REFRESH_JOB_TTL_MS) {
        this.removePreviewRefreshJob(job);
      }
    }
  }

  private updatePreviewRefreshJob(
    job: PreviewRefreshJob,
    patch: Partial<
      Omit<PreviewRefreshJob, "id" | "key" | "sourceConfig" | "rules" | "createdAt" | "promise">
    >,
  ) {
    const nextProgress = patch.progress
      ? {
          ...job.progress,
          ...patch.progress,
          updatedAt: patch.progress.updatedAt ?? new Date().toISOString(),
        }
      : job.progress;

    Object.assign(job, patch, {
      progress: nextProgress,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    });
  }

  private cachePreviewSession(preview: NaverBulkPricePreviewSnapshot) {
    this.cleanupExpiredPreviewSessions();

    const key = this.getPreviewSessionKey(preview.sourceConfig, preview.rules);
    const existing = this.previewSessionsByKey.get(key);
    if (existing) {
      this.removePreviewSession(existing);
    }

    const session: PreviewSession = {
      id: randomUUID(),
      key,
      preview,
      cachedAt: Date.now(),
    };
    this.previewSessionsByKey.set(key, session);
    this.previewSessionsById.set(session.id, session);
    return session;
  }

  private resolvePreviewSessionById(previewId: string) {
    this.cleanupExpiredPreviewSessions();
    const normalizedPreviewId = previewId.trim();
    if (!normalizedPreviewId) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_PREVIEW_ID_REQUIRED",
        message: "previewId is required.",
        status: 400,
      });
    }

    const session = this.previewSessionsById.get(normalizedPreviewId) ?? null;
    if (!session) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_PREVIEW_EXPIRED",
        message: "Preview session expired. Refresh the preview and try again.",
        status: 409,
      });
    }

    return session;
  }

  private async createPreviewSession(input: {
    sourceConfig: NaverBulkPriceSourceConfig | null;
    rules: NaverBulkPriceRuleSet | null;
    onProgress?: (update: BuildPreviewProgressUpdate) => void;
  }) {
    if (!input.sourceConfig || !input.rules) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_PREVIEW_BUILD_INPUT_REQUIRED",
        message: "sourceConfig and rules are required to build a preview.",
        status: 400,
      });
    }

    validateSourceConfig(input.sourceConfig);
    validateBulkPriceRuleSet(input.rules);

    return this.cachePreviewSession(
      await this.deps.buildPreview({
        sourceConfig: input.sourceConfig,
        rules: input.rules,
        onProgress: input.onProgress,
      }),
    );
  }

  private async runPreviewRefreshJob(job: PreviewRefreshJob) {
    this.updatePreviewRefreshJob(job, {
      status: "running",
      phase: "loading_naver_products",
      error: null,
      finishedAt: null,
      progress: createEmptyPreviewJobProgress(),
    });

    try {
      const session = await this.createPreviewSession({
        sourceConfig: job.sourceConfig,
        rules: job.rules,
        onProgress: (update) =>
          this.updatePreviewRefreshJob(job, {
            status: "running",
            phase: update.phase ?? job.phase,
            progress: {
              ...job.progress,
              ...update,
            },
          }),
      });

      this.updatePreviewRefreshJob(job, {
        status: "succeeded",
        phase: "finalizing",
        latestPreviewId: session.id,
        summary: buildPreviewJobSummary(session),
        finishedAt: new Date().toISOString(),
        progress: {
          loadedProducts: session.preview.stats.totalNaverItems,
          totalProducts: session.preview.stats.totalNaverItems,
          matchedCodes:
            session.preview.stats.totalNaverItems - session.preview.stats.unmatchedCount,
          processedRows: session.preview.rows.length,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.updatePreviewRefreshJob(job, {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Failed to refresh NAVER bulk price preview.",
        finishedAt: new Date().toISOString(),
      });
    } finally {
      job.promise = null;
    }
  }

  private resolvePreviewSessionForRun(input: {
    previewId?: string | null;
    sourceConfig?: NaverBulkPriceSourceConfig;
    rules?: NaverBulkPriceRuleSet;
  }) {
    const previewId = input.previewId?.trim() ?? "";
    if (!previewId) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_PREVIEW_ID_REQUIRED",
        message: "previewId is required.",
        status: 400,
      });
    }

    const session = this.resolvePreviewSessionById(previewId);

    if (input.sourceConfig && input.rules) {
      validateSourceConfig(input.sourceConfig);
      validateBulkPriceRuleSet(input.rules);
      const expectedKey = this.getPreviewSessionKey(
        input.sourceConfig,
        input.rules,
      );
      if (session.key !== expectedKey) {
        throw new ApiRouteError({
          code: "NAVER_BULK_PRICE_PREVIEW_EXPIRED",
          message: "Preview session expired. Refresh the preview and try again.",
          status: 409,
        });
      }
    }

    return session;
  }

  async listSourcePresets() {
    return {
      items: await this.deps.store.listSourcePresets(),
    };
  }

  async createSourcePreset(input: NaverBulkPriceSourcePresetInput) {
    validateSourceConfig(input.sourceConfig);
    return this.deps.store.createSourcePreset({
      name: normalizePresetName(input.name),
      memo: normalizePresetMemo(input.memo),
      sourceConfig: input.sourceConfig,
    });
  }

  async updateSourcePreset(id: string, input: NaverBulkPriceSourcePresetInput) {
    validateSourceConfig(input.sourceConfig);
    const preset = await this.deps.store.updateSourcePreset(id, {
      name: normalizePresetName(input.name),
      memo: normalizePresetMemo(input.memo),
      sourceConfig: input.sourceConfig,
    });

    if (!preset) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_SOURCE_PRESET_NOT_FOUND",
        message: "NAVER bulk price source preset not found.",
        status: 404,
      });
    }

    return preset;
  }

  async deleteSourcePreset(id: string) {
    const preset = await this.deps.store.deleteSourcePreset(id);
    if (!preset) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_SOURCE_PRESET_NOT_FOUND",
        message: "NAVER bulk price source preset not found.",
        status: 404,
      });
    }

    return {
      id: preset.id,
    };
  }

  async listRulePresets() {
    return {
      items: await this.deps.store.listRulePresets(),
    };
  }

  async createRulePreset(input: NaverBulkPriceRulePresetInput) {
    validateBulkPriceRuleSet(input.rules);
    return this.deps.store.createRulePreset({
      name: normalizePresetName(input.name),
      memo: normalizePresetMemo(input.memo),
      rules: input.rules,
    });
  }

  async updateRulePreset(id: string, input: NaverBulkPriceRulePresetInput) {
    validateBulkPriceRuleSet(input.rules);
    const preset = await this.deps.store.updateRulePreset(id, {
      name: normalizePresetName(input.name),
      memo: normalizePresetMemo(input.memo),
      rules: input.rules,
    });

    if (!preset) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RULE_PRESET_NOT_FOUND",
        message: "NAVER bulk price rule preset not found.",
        status: 404,
      });
    }

    return preset;
  }

  async deleteRulePreset(id: string) {
    const preset = await this.deps.store.deleteRulePreset(id);
    if (!preset) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RULE_PRESET_NOT_FOUND",
        message: "NAVER bulk price rule preset not found.",
        status: 404,
      });
    }

    return {
      id: preset.id,
    };
  }

  async getRunDetail(runId: string) {
    const detail = await this.deps.store.getRunDetail(runId);
    if (!detail) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_NOT_FOUND",
        message: "NAVER bulk price run not found.",
        status: 404,
      });
    }

    return detail;
  }

  async getRunSummary(runId: string): Promise<NaverBulkPriceRunSummaryResponse> {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_NOT_FOUND",
        message: "NAVER bulk price run not found.",
        status: 404,
      });
    }

    return {
      run,
      recentItems: await this.deps.store.listRecentRunItems(runId, RECENT_RUN_ITEM_LIMIT),
    };
  }

  async getRunDetailWithOptions(input: {
    runId: string;
    rowKeys?: string[] | null;
    includeItems?: boolean;
    includeLatestRecords?: boolean;
  }) {
    const detail = await this.deps.store.getRunDetail(input.runId, {
      rowKeys: input.rowKeys,
      includeItems: input.includeItems,
      includeLatestRecords: input.includeLatestRecords,
    });
    if (!detail) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_NOT_FOUND",
        message: "NAVER bulk price run not found.",
        status: 404,
      });
    }

    return detail;
  }

  async listRuns() {
    return {
      items: await this.deps.store.listRuns(),
    };
  }

  async createRun(input: NaverBulkPriceCreateRunInput) {
    const previewSession = this.resolvePreviewSessionForRun({
      sourceConfig: input.sourceConfig,
      rules: input.rules,
      previewId: input.previewId,
    });
    const preview = previewSession.preview;
    const sourceConfig = input.sourceConfig ?? preview.sourceConfig;
    const rules = input.rules ?? preview.rules;
    validateSourceConfig(sourceConfig);
    validateBulkPriceRuleSet(rules);
    const previewMap = new Map(
      preview.rows.map((row) => [row.rowKey, row] as const),
    );
    const selectionMode = normalizeSelectionMode(input.selectionMode);
    const overrideMap = buildManualOverrideMap({
      manualOverrides: input.manualOverrides,
      items: input.items,
    });
    const requestedItems =
      selectionMode === "explicit"
        ? resolveExplicitRequestedItems({
            selectedRowKeys: input.selectedRowKeys,
            items: input.items,
            overrideMap,
          })
        : selectionMode === "all_ready"
          ? preview.rows
              .filter((row) => row.status === "ready")
              .filter((row) => !(input.excludedRowKeys ?? []).includes(row.rowKey))
              .map((row) => ({
                rowKey: row.rowKey,
                manualOverridePrice: overrideMap.get(row.rowKey) ?? null,
              }))
        : preview.rows
            .filter((row) => row.isSelectable)
            .filter((row) => !(input.excludedRowKeys ?? []).includes(row.rowKey))
            .map((row) => ({
              rowKey: row.rowKey,
              manualOverridePrice: overrideMap.get(row.rowKey) ?? null,
            }));

    if (!requestedItems.length) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_ITEMS_REQUIRED",
        message: "At least one selected row is required.",
        status: 400,
      });
    }

    const run = await this.deps.store.createRun({
      storeId: sourceConfig.storeId,
      sourceConfig,
      rules,
      status: "queued",
      summary: createEmptyRunSummary(),
      startedAt: null,
      finishedAt: null,
    });

    const createdItems = await this.deps.store.createRunItems(
      run.id,
      requestedItems.map((requestItem) => {
        const previewRow = previewMap.get(requestItem.rowKey) ?? null;
        const manualOverridePrice = overrideMap.get(requestItem.rowKey) ?? null;

        if (!previewRow) {
          return {
            rowKey: requestItem.rowKey,
            originProductNo: requestItem.rowKey,
            channelProductNo: null,
            sellerManagementCode: null,
            sellerBarcode: null,
            productName: requestItem.rowKey,
            matchedCode: null,
            status: "skipped_unmatched" as NaverBulkPriceRunItemStatus,
            messages: ["Preview row is no longer available."],
            currentPrice: null,
            currentStockQuantity: null,
            sourceSoldOut: null,
            currentSaleStatus: null,
            currentDisplayStatus: null,
            targetStockQuantity: null,
            targetSaleStatus: null,
            targetDisplayStatus: null,
            saleStatusCode: null,
            saleStatusLabel: "-",
            hasOptions: false,
            optionType: "unknown" as const,
            optionCount: 0,
            optionHandlingMessage: "Preview row is no longer available.",
            basePrice: null,
            discountedBaseCost: null,
            effectiveCost: null,
            rawTargetPrice: null,
            adjustedTargetPrice: null,
            roundedTargetPrice: null,
            computedPrice: null,
            manualOverridePrice,
            effectiveTargetPrice: manualOverridePrice,
            lastAppliedAt: null,
            lastAppliedPrice: null,
            modifiedAt: null,
            sourceRow: null,
          };
        }

        if (previewRow.status === "conflict") {
          const item = createRunItemFromPreview(previewRow, manualOverridePrice);
          return {
            ...item,
            status: "skipped_conflict" as NaverBulkPriceRunItemStatus,
            messages:
              previewRow.messages.length > 0
                ? previewRow.messages
                : ["Preview row is in conflict."],
          };
        }

        const effectiveTargetPrice = manualOverridePrice ?? previewRow.computedPrice;
        const needsPriceUpdate = shouldApplyPriceUpdate(
          previewRow.currentPrice,
          effectiveTargetPrice,
        );
        const needsInventoryUpdate = shouldApplyInventoryUpdate(
          previewRow.currentStockQuantity,
          previewRow.targetStockQuantity,
        );
        const needsSaleStatusUpdate = shouldApplySaleStatusUpdate(
          previewRow.currentSaleStatus,
          previewRow.targetSaleStatus,
        );
        const needsDisplayStatusUpdate = shouldApplyDisplayStatusUpdate(
          previewRow.currentDisplayStatus,
          previewRow.targetDisplayStatus,
        );

        if (
          previewRow.status === "ready" &&
          !needsPriceUpdate &&
          !needsInventoryUpdate &&
          !needsSaleStatusUpdate
          && !needsDisplayStatusUpdate
        ) {
          const item = createRunItemFromPreview(previewRow, manualOverridePrice);
          return {
            ...item,
            status: "skipped_unmatched" as NaverBulkPriceRunItemStatus,
            messages: [
              ...previewRow.messages,
              buildAlreadyMatchedMessage(previewRow),
            ],
          };
        }

        if (!previewRow.isSelectable) {
          const item = createRunItemFromPreview(previewRow, manualOverridePrice);
          return {
            ...item,
            status: "skipped_unmatched" as NaverBulkPriceRunItemStatus,
            messages:
              previewRow.messages.length > 0
                ? previewRow.messages
                : ["Preview row is not executable."],
          };
        }

        return createRunItemFromPreview(previewRow, manualOverridePrice);
      }),
    );

    const summary = buildRunSummary(createdItems);
    const queuedCount = summary.queued;
    const nextRunStatus =
      queuedCount > 0 ? "queued" : resolveCompletedRunStatus(summary);

    await this.deps.store.updateRun(run.id, {
      status: nextRunStatus,
      summary,
      startedAt: queuedCount > 0 ? new Date().toISOString() : null,
      finishedAt: queuedCount > 0 ? null : new Date().toISOString(),
    });

    if (queuedCount > 0) {
      this.startRunProcessing(run.id);
    }

    return this.getRunDetail(run.id);
  }

  async pauseRun(runId: string) {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_NOT_FOUND",
        message: "NAVER bulk price run not found.",
        status: 404,
      });
    }

    const controller = this.controllers.get(runId);
    if (!controller) {
      return this.getRunDetail(runId);
    }

    controller.pauseRequested = true;
    return this.getRunDetail(runId);
  }

  async resumeRun(runId: string) {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_NOT_FOUND",
        message: "NAVER bulk price run not found.",
        status: 404,
      });
    }

    if (run.status !== "paused") {
      return this.getRunDetail(runId);
    }

    await this.deps.store.updateRunItems(runId, (item) =>
      item.status === "paused"
        ? {
            ...item,
            status: "queued",
          }
        : item,
    );

    const items = await this.deps.store.listRunItems(runId);
    const summary = buildRunSummary(items, run.summary.recentChanges ?? []);
    await this.deps.store.updateRun(runId, {
      status: summary.queued > 0 ? "queued" : resolveCompletedRunStatus(summary),
      summary,
      finishedAt: null,
    });

    if (summary.queued > 0) {
      this.startRunProcessing(runId);
    }

    return this.getRunDetail(runId);
  }

  async stopRun(runId: string) {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_NOT_FOUND",
        message: "NAVER bulk price run not found.",
        status: 404,
      });
    }

    const controller = this.controllers.get(runId);
    if (controller) {
      controller.stopRequested = true;
      return this.getRunDetail(runId);
    }

    if (run.status === "paused" || run.status === "queued") {
      await this.deps.store.updateRunItems(runId, (item) =>
        item.status === "queued" || item.status === "paused"
          ? {
              ...item,
              status: "stopped",
              messages: [...item.messages, "Stopped before execution."],
            }
          : item,
      );
      const items = await this.deps.store.listRunItems(runId);
      await this.deps.store.updateRun(runId, {
        status: "stopped",
        summary: buildRunSummary(items, run.summary.recentChanges ?? []),
        finishedAt: new Date().toISOString(),
      });
    }

    return this.getRunDetail(runId);
  }

  async deleteRun(runId: string) {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_NOT_FOUND",
        message: "NAVER bulk price run not found.",
        status: 404,
      });
    }

    if (run.status === "queued" || run.status === "running" || this.controllers.has(runId)) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_DELETE_BLOCKED",
        message: "Active NAVER bulk price runs cannot be deleted. Stop the run first.",
        status: 400,
      });
    }

    await this.deps.store.deleteRun(runId);
    this.controllers.delete(runId);

    return {
      deleted: true as const,
      runId,
    };
  }

  async recoverInterruptedRuns() {
    const runs = await this.deps.store.listRuns();

    for (const run of runs) {
      if (run.status !== "running" && run.status !== "queued") {
        continue;
      }

      await this.deps.store.updateRunItems(run.id, (item) => {
        if (item.status === "running") {
          return {
            ...item,
            status: "failed",
            messages: [...item.messages, "Server restarted during execution."],
          };
        }

        if (item.status === "queued") {
          return {
            ...item,
            status: "paused",
            messages: [...item.messages, "Run paused after server restart."],
          };
        }

        return item;
      });

      const items = await this.deps.store.listRunItems(run.id);
      const summary = buildRunSummary(items, run.summary.recentChanges ?? []);
      await this.deps.store.updateRun(run.id, {
        status: summary.paused > 0 ? "paused" : resolveCompletedRunStatus(summary),
        summary,
        finishedAt: summary.paused > 0 ? null : new Date().toISOString(),
      });
    }
  }

  private enqueueRunSummaryUpdate(
    controller: RunController,
    updater: (summary: NaverBulkPriceRunSummary) => NaverBulkPriceRunSummary,
  ) {
    const task = controller.summaryUpdateChain.then(async () => {
      if (!controller.summary) {
        return;
      }

      controller.summary = updater(controller.summary);
      this.scheduleRunSummaryPersist(controller);
    });

    controller.summaryUpdateChain = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  }

  private scheduleRunSummaryPersist(controller: RunController) {
    if (controller.summaryPersistTimer) {
      return;
    }

    controller.summaryPersistTimer = setTimeout(() => {
      controller.summaryPersistTimer = null;
      const task = this.persistRunSummary(controller);
      controller.summaryPersistPromise = task.then(
        () => undefined,
        () => undefined,
      );
    }, RUN_SUMMARY_PERSIST_DEBOUNCE_MS);
  }

  private async persistRunSummary(controller: RunController) {
    if (!controller.summary) {
      return;
    }

    await this.deps.store.patchRun(controller.runId, {
      summary: controller.summary,
    });
  }

  private async flushRunSummary(controller: RunController) {
    if (controller.summaryPersistTimer) {
      clearTimeout(controller.summaryPersistTimer);
      controller.summaryPersistTimer = null;
      const task = this.persistRunSummary(controller);
      controller.summaryPersistPromise = task.then(
        () => undefined,
        () => undefined,
      );
      await task;
      return;
    }

    await controller.summaryPersistPromise;
  }

  private async transitionRunItemStatus(
    controller: RunController,
    item: NaverBulkPriceRunItem,
    patch: {
      status: NaverBulkPriceRunItemStatus;
      messages: string[];
      lastAppliedAt?: string | null;
      lastAppliedPrice?: number | null;
    },
    recentChange?: NaverBulkPriceRunRecentChange | null,
  ) {
    await this.deps.store.patchRunItem(item.id, patch);
    await this.enqueueRunSummaryUpdate(controller, (summary) => ({
      ...transitionRunSummary(summary, item.status, patch.status),
      recentChanges: mergeRecentRunChanges(summary.recentChanges, recentChange),
    }));
  }

  private clearPreviewCaches(storeId: string) {
    for (const session of Array.from(this.previewSessionsById.values())) {
      if (session.preview.sourceConfig.storeId === storeId) {
        this.removePreviewSession(session);
      }
    }

    invalidateNaverPreviewCandidateCache(storeId);
  }

  private startRunProcessing(runId: string) {
    if (this.controllers.has(runId)) {
      return;
    }

    const controller: RunController = {
      runId,
      pauseRequested: false,
      stopRequested: false,
      nextIndex: 0,
      queuedItemIds: [],
      summary: null,
      summaryUpdateChain: Promise.resolve(),
      summaryPersistTimer: null,
      summaryPersistPromise: Promise.resolve(),
    };
    this.controllers.set(runId, controller);
    void this.processRun(controller).finally(() => {
      this.controllers.delete(runId);
      void this.deps.store.getRun(runId).then((run) => {
        if (run?.status === "queued" && !this.controllers.has(runId)) {
          this.startRunProcessing(runId);
        }
      });
    });
  }

  private async processRun(controller: RunController) {
    const run = await this.requireRun(controller.runId);
    const items = await this.deps.store.listRunItems(controller.runId);
    controller.summary = buildRunSummary(items, run.summary.recentChanges ?? []);
    controller.queuedItemIds = items
      .filter((item) => item.status === "queued")
      .map((item) => item.id);

    if (!controller.queuedItemIds.length) {
      await this.deps.store.updateRun(controller.runId, {
        status: resolveCompletedRunStatus(controller.summary),
        summary: controller.summary,
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    await this.deps.store.patchRun(controller.runId, {
      status: "running",
      startedAt: run.startedAt ?? new Date().toISOString(),
      finishedAt: null,
    });

    const workerCount = Math.min(
      this.getRunWorkerConcurrency(),
      controller.queuedItemIds.length,
    );
    await Promise.all(
      Array.from({ length: workerCount }, () =>
        this.processRunWorker(controller, run.storeId),
      ),
    );
    await controller.summaryUpdateChain;
    await this.flushRunSummary(controller);
    await this.finishRunProcessing(controller.runId, controller, run.storeId);
  }

  private async processRunWorker(controller: RunController, storeId: string) {
    while (true) {
      if (controller.pauseRequested || controller.stopRequested) {
        return;
      }

      const itemId = controller.queuedItemIds[controller.nextIndex];
      controller.nextIndex += 1;

      if (!itemId) {
        return;
      }

      const item = await this.deps.store.getRunItem(itemId);
      if (!item || item.status !== "queued") {
        continue;
      }

      await this.transitionRunItemStatus(controller, item, {
        status: "running",
        messages: item.messages,
      });
      const runningItem: NaverBulkPriceRunItem = {
        ...item,
        status: "running",
      };

      const needsPriceUpdate = shouldApplyPriceUpdate(
        item.currentPrice,
        item.effectiveTargetPrice,
      );
      const needsInventoryUpdate = shouldApplyInventoryUpdate(
        item.currentStockQuantity,
        item.targetStockQuantity,
      );
      const needsSaleStatusUpdate = shouldApplySaleStatusUpdate(
        item.currentSaleStatus,
        item.targetSaleStatus,
      );
      const needsDisplayStatusUpdate = shouldApplyDisplayStatusUpdate(
        item.currentDisplayStatus,
        item.targetDisplayStatus,
      );
      const needsAvailabilitySync =
        needsInventoryUpdate || needsSaleStatusUpdate || needsDisplayStatusUpdate;

      if (!needsPriceUpdate && !needsAvailabilitySync) {
        await this.transitionRunItemStatus(controller, runningItem, {
          status: "succeeded",
          messages: [
            ...item.messages,
            buildAlreadyMatchedMessage(item),
          ],
          lastAppliedAt: item.lastAppliedAt,
          lastAppliedPrice: item.lastAppliedPrice,
        });
        continue;
      }

      if (needsPriceUpdate && item.effectiveTargetPrice === null) {
        await this.transitionRunItemStatus(controller, runningItem, {
          status: "failed",
          messages: [...item.messages, "Target price is missing."],
          lastAppliedAt: item.lastAppliedAt,
          lastAppliedPrice: item.lastAppliedPrice,
        });
        continue;
      }

      let nextMessages = [...item.messages];
      let lastAppliedAt = item.lastAppliedAt;
      let lastAppliedPrice = item.lastAppliedPrice;
      let priceUpdated = false;
      let inventoryUpdated = false;
      let saleStatusUpdated = false;
      let displayStatusUpdated = false;

      try {
        if (needsPriceUpdate) {
          const targetPrice = item.effectiveTargetPrice;
          if (targetPrice === null) {
            throw new Error("Target price is missing.");
          }

          const priceResult = await this.deps.applyPriceUpdate({
            storeId,
            originProductNo: item.originProductNo,
            channelProductNo: item.channelProductNo,
            price: targetPrice,
            preview: {
              storeId,
              storeName: "",
              originProductNo: item.originProductNo,
              channelProductNo: item.channelProductNo,
              productName: item.productName,
              currentPrice: item.currentPrice,
              saleStatusCode: item.saleStatusCode,
              saleStatusLabel: item.saleStatusLabel,
              stockQuantity: item.currentStockQuantity,
              hasOptions: item.hasOptions,
              optionType: item.optionType,
              optionCount: item.optionCount,
              optionHandlingMessage: item.optionHandlingMessage,
              optionRows: [],
              modifiedAt: item.modifiedAt,
            },
          });
          const appliedAt = new Date().toISOString();
          nextMessages = [...nextMessages, priceResult.message];
          lastAppliedAt = appliedAt;
          lastAppliedPrice = targetPrice;
          priceUpdated = true;

          await this.deps.store.upsertLatestRecord({
            rowKey: item.rowKey,
            originProductNo: item.originProductNo,
            channelProductNo: item.channelProductNo,
            sellerManagementCode: item.sellerManagementCode,
            sellerBarcode: item.sellerBarcode,
            matchedCode: item.matchedCode,
            beforePrice: item.currentPrice,
            appliedPrice: targetPrice,
            appliedAt,
            runId: item.runId,
            storeId,
          });
        }

        if (needsAvailabilitySync) {
          const availabilityUpdater = this.deps.applyAvailabilityUpdate;
          if (availabilityUpdater) {
            const availabilityResult = await availabilityUpdater({
              storeId,
              originProductNo: item.originProductNo,
              channelProductNo: item.channelProductNo,
              targetSaleStatus: item.targetSaleStatus,
              targetStockQuantity: item.targetStockQuantity,
              targetDisplayStatus: item.targetDisplayStatus,
            });
            nextMessages = [...nextMessages, ...availabilityResult.messages];
            inventoryUpdated = availabilityResult.inventoryUpdated;
            saleStatusUpdated = availabilityResult.saleStatusUpdated;
            displayStatusUpdated = availabilityResult.displayStatusUpdated;
          } else if (
            needsSaleStatusUpdate &&
            !needsInventoryUpdate &&
            !needsDisplayStatusUpdate
          ) {
            const targetSaleStatus = item.targetSaleStatus;
            if (!targetSaleStatus) {
              throw new Error("Target sale status is missing.");
            }

            const saleStatusUpdater = this.deps.applySaleStatusUpdate;
            if (!saleStatusUpdater) {
              throw new Error("Availability updater is not configured.");
            }

            const saleStatusResult = await saleStatusUpdater({
              storeId,
              originProductNo: item.originProductNo,
              channelProductNo: item.channelProductNo,
              saleStatus: targetSaleStatus,
            });
            nextMessages = [...nextMessages, saleStatusResult.message];
            saleStatusUpdated = true;
          } else {
            throw new Error("Availability updater is not configured.");
          }
        }

        const recentChange = buildRunRecentChange({
          item,
          appliedAt: new Date().toISOString(),
          priceUpdated,
          inventoryUpdated,
          saleStatusUpdated,
          displayStatusUpdated,
          appliedPrice: lastAppliedPrice,
        });
        await this.transitionRunItemStatus(controller, runningItem, {
          status: "succeeded",
          messages: nextMessages,
          lastAppliedAt,
          lastAppliedPrice,
        }, recentChange);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : needsAvailabilitySync
              ? "Failed to sync NAVER sold-out state."
              : "Failed to update NAVER price.";
        const recentChange = buildRunRecentChange({
          item,
          appliedAt: new Date().toISOString(),
          priceUpdated,
          inventoryUpdated,
          saleStatusUpdated,
          displayStatusUpdated,
          appliedPrice: lastAppliedPrice,
        });
        await this.transitionRunItemStatus(controller, runningItem, {
          status: "failed",
          messages: [
            ...nextMessages,
            priceUpdated && needsAvailabilitySync
              ? `Price updated, but NAVER sold-out sync failed: ${message}`
              : message,
          ],
          lastAppliedAt,
          lastAppliedPrice,
        }, recentChange);
      }
    }
  }

  private async finishRunProcessing(
    runId: string,
    controller: RunController,
    storeId: string,
  ) {
    if (controller.stopRequested) {
      await this.deps.store.updateRunItems(runId, (item) =>
        item.status === "queued" || item.status === "paused"
          ? {
              ...item,
              status: "stopped",
              messages: [...item.messages, "Stopped before execution."],
            }
          : item,
      );
    } else if (controller.pauseRequested) {
      await this.deps.store.updateRunItems(runId, (item) =>
        item.status === "queued"
          ? {
              ...item,
              status: "paused",
              messages: [...item.messages, "Paused before execution."],
            }
          : item,
      );
    }

    await controller.summaryUpdateChain;
    await this.flushRunSummary(controller);
    const items = await this.deps.store.listRunItems(runId);
    const summary = buildRunSummary(items, controller.summary?.recentChanges ?? []);
    const nextStatus = controller.stopRequested
      ? "stopped"
      : controller.pauseRequested
        ? "paused"
        : resolveCompletedRunStatus(summary);

    await this.deps.store.patchRun(runId, {
      status: nextStatus,
      summary,
      finishedAt: nextStatus === "paused" ? null : new Date().toISOString(),
    });

    if (summary.succeeded > 0) {
      this.clearPreviewCaches(storeId);
    }
  }

  private async requireRun(runId: string) {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "NAVER_BULK_PRICE_RUN_NOT_FOUND",
        message: "NAVER bulk price run not found.",
        status: 404,
      });
    }

    return run;
  }
}

export const naverBulkPriceService = new NaverBulkPriceService({
  store: naverBulkPriceStore,
  loadSourceMetadata: fetchBulkPriceSourceMetadata,
  buildPreview: buildNaverBulkPricePreview,
  runWorkerConcurrency: readPositiveIntegerEnv(
    "NAVER_BULK_PRICE_RUN_WORKER_CONCURRENCY",
    DEFAULT_RUN_WORKER_CONCURRENCY,
  ),
  applyPriceUpdate: async (input) =>
    input.preview
      ? updateNaverProductSalePriceFromPreview({
          storeId: input.storeId,
          preview: input.preview,
          newPrice: input.price,
        })
      : updateNaverProductSalePrice({
          storeId: input.storeId,
          originProductNo: input.originProductNo,
          channelProductNo: input.channelProductNo,
          newPrice: input.price,
        }),
  applyAvailabilityUpdate: async (input) =>
    syncNaverProductAvailability({
      storeId: input.storeId,
      originProductNo: input.originProductNo,
      channelProductNo: input.channelProductNo,
      targetSaleStatus: input.targetSaleStatus,
      targetStockQuantity: input.targetStockQuantity,
      targetDisplayStatus: input.targetDisplayStatus,
    }),
  applySaleStatusUpdate: async (input) =>
    updateNaverProductSaleStatus({
      storeId: input.storeId,
      originProductNo: input.originProductNo,
      channelProductNo: input.channelProductNo,
      saleStatus: input.saleStatus,
    }),
});

export async function recoverNaverBulkPriceRuns() {
  await naverBulkPriceService.recoverInterruptedRuns();
}

export { calculateBulkPriceValues, resolveMasterSkuDatabaseUrl };
