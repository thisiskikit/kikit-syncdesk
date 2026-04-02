import "../../../load-env";
import { randomUUID } from "crypto";
import type {
  BulkPriceCreateRunInput,
  BulkPriceLatestAppliedRecord,
  BulkPricePreviewBuildMetrics,
  BulkPricePreviewQueryInput,
  BulkPricePreviewResponse,
  BulkPricePreviewRow,
  BulkPricePreviewSnapshot,
  BulkPricePreviewSort,
  BulkPricePreviewStats,
  BulkPriceRunCommandResponse,
  BulkPriceWorkDateFilterSummary,
  BulkPriceRunRecentChange,
  BulkPriceRunSelectionMode,
  BulkPriceRulePresetInput,
  BulkPriceRuleSet,
  BulkPriceRun,
  BulkPriceRunDetail,
  BulkPriceRunLiveQueryInput,
  BulkPriceRunLiveResponse,
  BulkPriceRunItem,
  BulkPriceRunItemStatus,
  BulkPriceRunSummary,
  BulkPriceSourceConfig,
  BulkPriceSourceMetadataResponse,
  BulkPriceSourcePresetInput,
  BulkPriceSourceSampleRow,
  BulkPriceSourceTableRef,
  BulkPriceTargetSaleStatus,
} from "@shared/coupang-bulk-price";
import type {
  CoupangDataSource,
  CoupangSaleStatus,
} from "@shared/coupang";
import {
  ApiRouteError,
  coupangBulkPriceStore,
  CoupangBulkPriceStore,
  getDefaultWorkDateRange,
  normalizeSourceWorkDateValue,
  normalizeWorkDateBoundaryValue,
  pg,
} from "../../../infra/coupang/bulk-price-deps";
import {
  listAllProductExplorerRows,
  updateOptionPrice,
  updateOptionQuantity,
  updateSaleStatus,
  withCoupangExplorerHydrationSuspended,
} from "../../../services/coupang/product-service";

type SourceRowRecord = Record<string, unknown>;

type PreviewSourceRow = {
  matchedCode: string;
  basePrice: number | null;
  sourceSoldOut: boolean | null;
  soldOutValueError: string | null;
};

type PreviewSourceRowsResult = {
  rows: PreviewSourceRow[];
  excludedSourceRowCount: number;
  excludedOnlyMatchCodes: Set<string>;
  workDateFilterSummary: BulkPriceWorkDateFilterSummary;
};

type CoupangPreviewCandidate = {
  vendorItemId: string;
  sellerProductId: string;
  sellerProductName: string;
  itemName: string;
  externalVendorSku: string | null;
  barcode: string | null;
  matchedCode: string | null;
  currentPrice: number | null;
  currentInventoryCount: number | null;
  saleStatus: CoupangSaleStatus | null;
  lastModifiedAt: string | null;
};

type CoupangPreviewCandidateLoadResult = {
  rows: CoupangPreviewCandidate[];
  explorerFetchedAt: string;
  explorerServedFromCache: boolean;
  explorerSource: CoupangDataSource;
};

type BulkPriceServiceDeps = {
  store: CoupangBulkPriceStore;
  loadSourceMetadata: (input: {
    schema?: string | null;
    table?: string | null;
  }) => Promise<BulkPriceSourceMetadataResponse>;
  buildPreview: (input: {
    sourceConfig: BulkPriceSourceConfig;
    rules: BulkPriceRuleSet;
  }) => Promise<BulkPricePreviewSnapshot>;
  applyPriceUpdate: (input: {
    storeId: string;
    sellerProductId: string;
    vendorItemId: string;
    price: number;
    skipBackgroundHydration?: boolean;
  }) => Promise<{ message: string }>;
  applyInventoryUpdate: (input: {
    storeId: string;
    sellerProductId: string;
    vendorItemId: string;
    inventoryCount: number;
    skipBackgroundHydration?: boolean;
  }) => Promise<{ message: string }>;
  applySaleStatusUpdate: (input: {
    storeId: string;
    sellerProductId: string;
    vendorItemId: string;
    saleStatus: BulkPriceTargetSaleStatus;
    skipBackgroundHydration?: boolean;
  }) => Promise<{ message: string }>;
};

type RunController = {
  runId: string;
  pauseRequested: boolean;
  stopRequested: boolean;
  nextIndex: number;
  queuedItemIds: string[];
  recentChanges: BulkPriceRunRecentChange[];
  summary: BulkPriceRunSummary;
  touchedItemIds: string[];
  summaryPersistQueued: boolean;
  summaryUpdateChain: Promise<void>;
};

type PreviewSession = {
  id: string;
  key: string;
  preview: BulkPricePreviewSnapshot;
  cachedAt: number;
};

const RECENT_RUN_CHANGE_LIMIT = 5;
const COUPANG_RESTOCK_QUANTITY = 102;
const DEFAULT_PREVIEW_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_PREVIEW_SESSION_LIMIT = 2;
const DEFAULT_PREVIEW_PAGE_SIZE = 100;

let externalSourcePoolCache:
  | {
      url: string;
      pool: pg.Pool;
    }
  | null = null;

const SOLD_OUT_TRUE_VALUES = new Set([
  "true",
  "1",
  "y",
  "yes",
  "품절",
  "soldout",
  "outofstock",
  "suspended",
]);

const SOLD_OUT_FALSE_VALUES = new Set([
  "false",
  "0",
  "n",
  "no",
  "정상",
  "판매중",
  "onsale",
  "available",
]);

function toSerializableValue(
  value: unknown,
): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf-8");
  }

  return String(value);
}

function normalizeMatchCode(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value).trim() || null;
  }

  return null;
}

function parseNumericSourceValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const normalized = value.replaceAll(",", "").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isBlankSourceValue(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

function normalizeSoldOutToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function parseSoldOutSourceValue(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }

  if (typeof value === "bigint") {
    if (value.toString() === "1") {
      return true;
    }
    if (value.toString() === "0") {
      return false;
    }
    return null;
  }

  if (typeof value === "string") {
    const normalized = normalizeSoldOutToken(value);
    if (!normalized) {
      return null;
    }

    if (SOLD_OUT_TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (SOLD_OUT_FALSE_VALUES.has(normalized)) {
      return false;
    }
  }

  return null;
}

function resolveCurrentSoldOutState(
  currentInventoryCount: number | null,
  currentSaleStatus: CoupangSaleStatus | null,
) {
  if (currentSaleStatus === "SUSPENDED" || currentSaleStatus === "ENDED") {
    return true;
  }

  return currentInventoryCount !== null && currentInventoryCount <= 0;
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

function normalizePreviewPageSize(value: number | null | undefined) {
  if (!Number.isFinite(value) || !value) {
    return DEFAULT_PREVIEW_PAGE_SIZE;
  }

  return Math.max(1, Math.min(500, Math.trunc(value)));
}

function normalizePreviewPage(value: number | null | undefined, totalPages: number) {
  if (!Number.isFinite(value) || !value) {
    return 1;
  }

  return Math.max(1, Math.min(totalPages, Math.trunc(value)));
}

function resolveTargetInventoryCount(
  sourceSoldOut: boolean | null,
  currentSoldOut: boolean,
) {
  if (sourceSoldOut === null || sourceSoldOut === currentSoldOut) {
    return null;
  }

  return sourceSoldOut ? 0 : COUPANG_RESTOCK_QUANTITY;
}

function resolveTargetSaleStatus(input: {
  sourceSoldOut: boolean | null;
  currentSoldOut: boolean;
  currentSaleStatus: CoupangSaleStatus | null;
}): BulkPriceTargetSaleStatus | null {
  if (input.sourceSoldOut !== false || !input.currentSoldOut) {
    return null;
  }

  return input.currentSaleStatus === "ONSALE" ? null : "ONSALE";
}

function shouldApplyPriceUpdate(
  currentPrice: number | null,
  targetPrice: number | null,
) {
  return targetPrice !== null && currentPrice !== targetPrice;
}

function shouldApplyInventoryUpdate(
  currentInventoryCount: number | null,
  targetInventoryCount: number | null,
) {
  return (
    targetInventoryCount !== null &&
    currentInventoryCount !== targetInventoryCount
  );
}

function shouldApplySaleStatusUpdate(
  currentSaleStatus: CoupangSaleStatus | null,
  targetSaleStatus: BulkPriceTargetSaleStatus | null,
) {
  return targetSaleStatus !== null && currentSaleStatus !== targetSaleStatus;
}

function buildAlreadyMatchedMessage(input: {
  sourceSoldOut: boolean | null;
  targetInventoryCount: number | null;
  targetSaleStatus: BulkPriceTargetSaleStatus | null;
}) {
  const comparesSoldOutState =
    input.sourceSoldOut !== null ||
    input.targetInventoryCount !== null ||
    input.targetSaleStatus !== null;

  return comparesSoldOutState
    ? "Current price and sold-out state already match target."
    : "Current price already matches target price.";
}

function quoteIdentifier(value: string) {
  if (!value.trim()) {
    throw new ApiRouteError({
      code: "INVALID_IDENTIFIER",
      message: "Identifier is required.",
      status: 400,
    });
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function listRequiredSourceColumns(sourceConfig: BulkPriceSourceConfig) {
  const columns = [
    sourceConfig.sourceMatchColumn,
    sourceConfig.basePriceColumn,
    sourceConfig.workDateColumn,
    sourceConfig.soldOutColumn.trim(),
  ];

  return Array.from(
    new Set(
      columns
        .map((column) => column.trim())
        .filter((column): column is string => Boolean(column)),
    ),
  );
}

function parsePercentRatio(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: `${field} must be a finite number.`,
      status: 400,
    });
  }

  if (value < 0 || value >= 1) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: `${field} must be between 0 and 1.`,
      status: 400,
    });
  }
}

function validateRuleSet(rules: BulkPriceRuleSet) {
  parsePercentRatio(rules.feeRate, "feeRate");
  parsePercentRatio(rules.marginRate, "marginRate");
  parsePercentRatio(rules.discountRate, "discountRate");

  if (![1, 10, 100].includes(rules.roundingUnit)) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: "roundingUnit must be 1, 10, or 100.",
      status: 400,
    });
  }

  if (rules.feeRate + rules.marginRate >= 1) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: "feeRate + marginRate must be less than 1.",
      status: 400,
    });
  }
}

function validateSourceConfig(sourceConfig: BulkPriceSourceConfig) {
  if (!sourceConfig.storeId.trim()) {
    throw new ApiRouteError({
      code: "INVALID_SOURCE_CONFIG",
      message: "storeId is required.",
      status: 400,
    });
  }

  for (const [key, value] of Object.entries({
    schema: sourceConfig.schema,
    table: sourceConfig.table,
    basePriceColumn: sourceConfig.basePriceColumn,
    sourceMatchColumn: sourceConfig.sourceMatchColumn,
    workDateColumn: sourceConfig.workDateColumn,
    workDateFrom: sourceConfig.workDateFrom,
    workDateTo: sourceConfig.workDateTo,
  })) {
    if (!value.trim()) {
      throw new ApiRouteError({
        code: "INVALID_SOURCE_CONFIG",
        message: `${key} is required.`,
        status: 400,
      });
    }
  }

  const normalizedWorkDateFrom = normalizeWorkDateBoundaryValue(sourceConfig.workDateFrom);
  const normalizedWorkDateTo = normalizeWorkDateBoundaryValue(sourceConfig.workDateTo);
  if (!normalizedWorkDateFrom) {
    throw new ApiRouteError({
      code: "INVALID_SOURCE_CONFIG",
      message: "workDateFrom must be a valid date.",
      status: 400,
    });
  }
  if (!normalizedWorkDateTo) {
    throw new ApiRouteError({
      code: "INVALID_SOURCE_CONFIG",
      message: "workDateTo must be a valid date.",
      status: 400,
    });
  }
  if (normalizedWorkDateFrom > normalizedWorkDateTo) {
    throw new ApiRouteError({
      code: "INVALID_SOURCE_CONFIG",
      message: "workDateFrom must be on or before workDateTo.",
      status: 400,
    });
  }
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

function roundToUnit(
  value: number,
  unit: number,
  mode: BulkPriceRuleSet["roundingMode"],
) {
  const normalizedUnit = Math.max(1, unit);
  const scaled = value / normalizedUnit;

  if (mode === "floor") {
    return Math.floor(scaled) * normalizedUnit;
  }

  if (mode === "round") {
    return Math.round(scaled) * normalizedUnit;
  }

  return Math.ceil(scaled) * normalizedUnit;
}

export function calculateBulkPriceValues(
  basePrice: number,
  rules: BulkPriceRuleSet,
) {
  validateRuleSet(rules);

  const discountedBaseCost = basePrice * (1 - rules.discountRate);
  const effectiveCost = discountedBaseCost + rules.inboundShippingCost;
  const denominator = 1 - rules.feeRate - rules.marginRate;

  if (denominator <= 0) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: "feeRate + marginRate must leave a positive denominator.",
      status: 400,
    });
  }

  const rawTargetPrice = effectiveCost / denominator;
  const adjustedTargetPrice = rawTargetPrice + rules.fixedAdjustment;
  const roundedTargetPrice = roundToUnit(
    adjustedTargetPrice,
    rules.roundingUnit,
    rules.roundingMode,
  );

  return {
    discountedBaseCost,
    effectiveCost,
    rawTargetPrice,
    adjustedTargetPrice,
    roundedTargetPrice,
    computedPrice: roundedTargetPrice,
  };
}

function summarizePreviewRows(rows: BulkPricePreviewRow[]): BulkPricePreviewStats {
  return {
    totalCoupangItems: rows.length,
    readyCount: rows.filter((row) => row.status === "ready").length,
    selectableCount: rows.filter((row) => row.isSelectable).length,
    conflictCount: rows.filter((row) => row.status === "conflict").length,
    unmatchedCount: rows.filter((row) => row.status === "unmatched").length,
    invalidSourceCount: rows.filter((row) => row.status === "invalid_source").length,
  };
}

function sortPreviewRows(
  rows: BulkPricePreviewRow[],
  sort: BulkPricePreviewSort | null | undefined,
) {
  if (!sort?.field) {
    return rows;
  }

  const direction = sort.direction === "desc" ? -1 : 1;

  return rows.slice().sort((left, right) => {
    let result = 0;

    if (sort.field === "product") {
      result =
        compareNullableStrings(left.sellerProductName, right.sellerProductName) ||
        compareNullableStrings(left.itemName, right.itemName) ||
        compareNullableStrings(left.vendorItemId, right.vendorItemId);
    } else if (sort.field === "matchedCode") {
      result =
        compareNullableStrings(left.matchedCode, right.matchedCode) ||
        compareNullableStrings(left.externalVendorSku, right.externalVendorSku) ||
        compareNullableStrings(left.barcode, right.barcode);
    } else if (sort.field === "status") {
      result =
        compareNullableStrings(left.status, right.status) ||
        compareNullableStrings(left.messages.join(" / "), right.messages.join(" / "));
    } else if (sort.field === "price" || sort.field === "manualOverride") {
      result =
        compareNullableNumbers(left.effectiveTargetPrice, right.effectiveTargetPrice) ||
        compareNullableNumbers(left.currentPrice, right.currentPrice) ||
        compareNullableNumbers(left.basePrice, right.basePrice);
    } else if (sort.field === "lastApplied") {
      result =
        compareNullableDates(left.lastAppliedAt, right.lastAppliedAt) ||
        compareNullableNumbers(left.lastAppliedPrice, right.lastAppliedPrice);
    }

    if (result !== 0) {
      return result * direction;
    }

    return compareNullableStrings(left.vendorItemId, right.vendorItemId) * direction;
  });
}

function buildPagedPreviewResponse(input: {
  session: PreviewSession;
  page?: number;
  pageSize?: number;
  matchedOnly?: boolean;
  sort?: BulkPricePreviewSort | null;
}): BulkPricePreviewResponse {
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
    buildMetrics: input.session.preview.buildMetrics,
    generatedAt: input.session.preview.generatedAt,
    page,
    pageSize,
    filteredTotal: sortedRows.length,
    totalPages,
  };
}

export function buildBulkPricePreviewRows(input: {
  sourceRows: PreviewSourceRow[];
  coupangRows: CoupangPreviewCandidate[];
  rules: BulkPriceRuleSet;
  latestRecords: BulkPriceLatestAppliedRecord[];
  excludedOnlyMatchCodes?: ReadonlySet<string>;
}): { rows: BulkPricePreviewRow[]; excludedPreviewRowCount: number } {
  const sourceMap = new Map<string, PreviewSourceRow[]>();
  for (const row of input.sourceRows) {
    const current = sourceMap.get(row.matchedCode) ?? [];
    current.push(row);
    sourceMap.set(row.matchedCode, current);
  }

  const coupangMap = new Map<string, CoupangPreviewCandidate[]>();
  for (const row of input.coupangRows) {
    if (!row.matchedCode) {
      continue;
    }

    const current = coupangMap.get(row.matchedCode) ?? [];
    current.push(row);
    coupangMap.set(row.matchedCode, current);
  }

  const latestRecordMap = new Map(
    input.latestRecords.map((item) => [item.vendorItemId, item] as const),
  );

  const rows: BulkPricePreviewRow[] = [];
  let excludedPreviewRowCount = 0;

  for (const row of input.coupangRows) {
    if (
      row.matchedCode &&
      (input.excludedOnlyMatchCodes?.has(row.matchedCode) ?? false)
    ) {
      excludedPreviewRowCount += 1;
      continue;
    }

    const latestRecord = latestRecordMap.get(row.vendorItemId) ?? null;
    const messages: string[] = [];
    let status: BulkPricePreviewRow["status"] = "ready";
    let selectedSource: PreviewSourceRow | null = null;
    let sourceSoldOut: boolean | null = null;
    let targetInventoryCount: number | null = null;
    let targetSaleStatus: BulkPriceTargetSaleStatus | null = null;
    const currentSaleStatus = row.saleStatus ?? null;
    const currentInventoryCount = row.currentInventoryCount;
    const currentSoldOut = resolveCurrentSoldOutState(
      currentInventoryCount,
      currentSaleStatus,
    );

    if (!row.matchedCode) {
      status = "unmatched";
      messages.push("Match code is empty on Coupang.");
    } else {
      const matchedSourceRows = sourceMap.get(row.matchedCode) ?? [];
      const duplicateCoupangRows = coupangMap.get(row.matchedCode) ?? [];

      if (matchedSourceRows.length === 0) {
        status = "unmatched";
        messages.push("No matching source row was found.");
      } else if (matchedSourceRows.length > 1) {
        status = "conflict";
        messages.push("Source match code is duplicated.");
      } else if (duplicateCoupangRows.length > 1) {
        status = "conflict";
        messages.push("Coupang match code is duplicated.");
      } else {
        selectedSource = matchedSourceRows[0] ?? null;
        sourceSoldOut = selectedSource?.sourceSoldOut ?? null;
        targetInventoryCount = resolveTargetInventoryCount(
          sourceSoldOut,
          currentSoldOut,
        );
        targetSaleStatus = resolveTargetSaleStatus({
          sourceSoldOut,
          currentSoldOut,
          currentSaleStatus,
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
      currentInventoryCount,
      targetInventoryCount,
    );
    let needsSaleStatusUpdate = shouldApplySaleStatusUpdate(
      currentSaleStatus,
      targetSaleStatus,
    );

    if (status === "ready" && selectedSource) {
      if (selectedSource.soldOutValueError) {
        status = "invalid_source";
        messages.push(selectedSource.soldOutValueError);
        targetInventoryCount = null;
        targetSaleStatus = null;
        needsInventoryUpdate = false;
        needsSaleStatusUpdate = false;
      }

      if (basePrice === null || basePrice < 0) {
        if (needsInventoryUpdate || needsSaleStatusUpdate) {
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
      }
    }

    rows.push({
      vendorItemId: row.vendorItemId,
      sellerProductId: row.sellerProductId,
      sellerProductName: row.sellerProductName,
      itemName: row.itemName,
      externalVendorSku: row.externalVendorSku,
      barcode: row.barcode,
      matchedCode: row.matchedCode,
      status,
      messages,
      isSelectable:
        status === "ready" &&
        (needsPriceUpdate || needsInventoryUpdate || needsSaleStatusUpdate),
      lastModifiedAt: row.lastModifiedAt,
      lastAppliedAt: latestRecord?.appliedAt ?? null,
      lastAppliedPrice: latestRecord?.appliedPrice ?? null,
      currentPrice: row.currentPrice,
      currentInventoryCount,
      sourceSoldOut,
      currentSaleStatus,
      targetInventoryCount,
      targetSaleStatus,
      needsPriceUpdate,
      needsInventoryUpdate,
      needsSaleStatusUpdate,
      basePrice,
      discountedBaseCost,
      effectiveCost,
      rawTargetPrice,
      adjustedTargetPrice,
      roundedTargetPrice,
      computedPrice,
      manualOverridePrice: null,
      effectiveTargetPrice: computedPrice,
      sourceRow: null,
    } satisfies BulkPricePreviewRow);
  }

  return {
    rows,
    excludedPreviewRowCount,
  };
}

export function resolveMasterSkuDatabaseUrl(
  value = process.env.MASTER_SKU_DATABASE_URL,
) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ApiRouteError({
      code: "MASTER_SKU_DATABASE_URL_REQUIRED",
      message: "MASTER_SKU_DATABASE_URL is required.",
      status: 400,
    });
  }

  return normalized;
}

function getExternalSourcePool(
  databaseUrl = resolveMasterSkuDatabaseUrl(),
) {
  if (
    externalSourcePoolCache &&
    externalSourcePoolCache.url === databaseUrl
  ) {
    return externalSourcePoolCache.pool;
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  externalSourcePoolCache = {
    url: databaseUrl,
    pool,
  };

  return pool;
}

export async function fetchBulkPriceSourceMetadata(input: {
  schema?: string | null;
  table?: string | null;
}): Promise<BulkPriceSourceMetadataResponse> {
  const pool = getExternalSourcePool();
  const tablesResult = await pool.query<{
    table_schema: string;
    table_name: string;
  }>(
    `
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('pg_catalog', 'information_schema')
      order by table_schema, table_name
    `,
  );

  const tables = tablesResult.rows.map<BulkPriceSourceTableRef>((row) => ({
    schema: row.table_schema,
    table: row.table_name,
  }));

  const schema = input.schema?.trim() ?? "";
  const table = input.table?.trim() ?? "";
  let columns: BulkPriceSourceMetadataResponse["columns"] = [];
  let sampleRows: BulkPriceSourceSampleRow[] = [];
  let requestedTable: BulkPriceSourceTableRef | null = null;

  if (schema && table) {
    requestedTable = { schema, table };
    const tableExists = tables.some(
      (item) => item.schema === schema && item.table === table,
    );

    if (!tableExists) {
      throw new ApiRouteError({
        code: "SOURCE_TABLE_NOT_FOUND",
        message: `Table ${schema}.${table} was not found.`,
        status: 404,
      });
    }

    const columnResult = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = $1
          and table_name = $2
        order by ordinal_position
      `,
      [schema, table],
    );

    columns = columnResult.rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === "YES",
    }));

    const sampleResult = await pool.query<SourceRowRecord>(
      `select * from ${quoteIdentifier(schema)}.${quoteIdentifier(table)} limit 5`,
    );

    sampleRows = sampleResult.rows.map((row, index) => ({
      index,
      values: Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, toSerializableValue(value)]),
      ),
    }));
  }

  return {
    configured: true,
    databaseUrlAvailable: true,
    tables,
    columns,
    sampleRows,
    requestedTable,
    fetchedAt: new Date().toISOString(),
  };
}

async function loadAllCoupangPreviewCandidates(
  sourceConfig: BulkPriceSourceConfig,
): Promise<CoupangPreviewCandidateLoadResult> {
  const explorerRows = await listAllProductExplorerRows({
    storeId: sourceConfig.storeId,
  });

  const rows: CoupangPreviewCandidate[] = [];

  for (const product of explorerRows.items) {
    for (const option of product.vendorItems) {
      const matchedCode =
        sourceConfig.coupangMatchField === "externalVendorSku"
          ? normalizeMatchCode(option.externalVendorSku)
          : sourceConfig.coupangMatchField === "barcode"
            ? normalizeMatchCode(option.barcode)
            : sourceConfig.coupangMatchField === "vendorItemId"
              ? normalizeMatchCode(option.vendorItemId)
              : normalizeMatchCode(product.sellerProductId);

      rows.push({
        vendorItemId: option.vendorItemId,
        sellerProductId: product.sellerProductId,
        sellerProductName: product.sellerProductName,
        itemName: option.itemName,
        externalVendorSku: option.externalVendorSku,
        barcode: option.barcode ?? null,
        matchedCode,
        currentPrice: option.salePrice,
        currentInventoryCount: option.inventoryCount ?? null,
        saleStatus: option.saleStatus,
        lastModifiedAt: option.lastModifiedAt ?? product.lastModifiedAt,
      });
    }
  }

  return {
    rows,
    explorerFetchedAt: explorerRows.fetchedAt,
    explorerServedFromCache: explorerRows.servedFromCache,
    explorerSource: explorerRows.source,
  };
}

function isTextualSourceDataType(dataType: string | null | undefined) {
  return /char|text|citext/i.test(dataType ?? "");
}

async function loadRelevantSourceRows(input: {
  sourceConfig: BulkPriceSourceConfig;
  matchCodes: string[];
  sourceMatchColumnDataType?: string | null;
  workDateFrom?: string;
  workDateTo?: string;
}): Promise<PreviewSourceRowsResult> {
  const pool = getExternalSourcePool();
  const fallbackRange = getDefaultWorkDateRange();
  const workDateFrom =
    input.workDateFrom ??
    normalizeWorkDateBoundaryValue(input.sourceConfig.workDateFrom) ??
    fallbackRange.startDate;
  const workDateTo =
    input.workDateTo ??
    normalizeWorkDateBoundaryValue(input.sourceConfig.workDateTo) ??
    fallbackRange.endDate;
  if (!input.matchCodes.length) {
    return {
      rows: [],
      excludedSourceRowCount: 0,
      excludedOnlyMatchCodes: new Set<string>(),
      workDateFilterSummary: {
        enabled: true,
        column: input.sourceConfig.workDateColumn,
        startDate: workDateFrom,
        endDate: workDateTo,
        excludedSourceRowCount: 0,
        excludedPreviewRowCount: 0,
      },
    };
  }

  const sourceSelectClause = listRequiredSourceColumns(input.sourceConfig)
    .map((column) => quoteIdentifier(column))
    .join(", ");
  const normalizedQuery = `
    select ${sourceSelectClause}
    from ${quoteIdentifier(input.sourceConfig.schema)}.${quoteIdentifier(
      input.sourceConfig.table,
    )}
    where btrim(cast(${quoteIdentifier(input.sourceConfig.sourceMatchColumn)} as text)) = any($1::text[])
  `;
  const soldOutSyncEnabled = Boolean(input.sourceConfig.soldOutColumn.trim());
  const rows: PreviewSourceRow[] = [];
  const includedMatchCodes = new Set<string>();
  const excludedMatchCodes = new Set<string>();
  let excludedSourceRowCount = 0;

  const consumeRows = (sourceRows: SourceRowRecord[]) => {
    for (const row of sourceRows) {
      const matchedCode = normalizeMatchCode(
        row[input.sourceConfig.sourceMatchColumn],
      );

      if (!matchedCode) {
        continue;
      }

      const normalizedWorkDate = normalizeSourceWorkDateValue(
        row[input.sourceConfig.workDateColumn],
      );

      if (
        normalizedWorkDate === null ||
        normalizedWorkDate < workDateFrom ||
        normalizedWorkDate > workDateTo
      ) {
        excludedSourceRowCount += 1;
        excludedMatchCodes.add(matchedCode);
        continue;
      }

      const sourceSoldOutValue = soldOutSyncEnabled
        ? row[input.sourceConfig.soldOutColumn]
        : null;
      const sourceSoldOut = soldOutSyncEnabled
        ? parseSoldOutSourceValue(sourceSoldOutValue)
        : null;

      includedMatchCodes.add(matchedCode);
      rows.push({
        matchedCode,
        basePrice: parseNumericSourceValue(
          row[input.sourceConfig.basePriceColumn],
        ),
        sourceSoldOut,
        soldOutValueError:
          soldOutSyncEnabled && sourceSoldOut === null
            ? isBlankSourceValue(sourceSoldOutValue)
              ? "Sold-out value is missing."
              : "Sold-out value could not be parsed."
            : null,
      });
    }
  };

  if (!isTextualSourceDataType(input.sourceMatchColumnDataType)) {
    const result = await pool.query<SourceRowRecord>(normalizedQuery, [input.matchCodes]);
    consumeRows(result.rows);
  } else {
    const exactQuery = `
      select ${sourceSelectClause}
      from ${quoteIdentifier(input.sourceConfig.schema)}.${quoteIdentifier(
        input.sourceConfig.table,
      )}
      where ${quoteIdentifier(input.sourceConfig.sourceMatchColumn)} = any($1::text[])
    `;
    const exactResult = await pool.query<SourceRowRecord>(exactQuery, [input.matchCodes]);
    consumeRows(exactResult.rows);
    const exactMatchedCodes = new Set(
      exactResult.rows
        .map((row) => normalizeMatchCode(row[input.sourceConfig.sourceMatchColumn]))
        .filter((value): value is string => Boolean(value)),
    );
    const remainingMatchCodes = input.matchCodes.filter(
      (code) => !exactMatchedCodes.has(code),
    );

    if (remainingMatchCodes.length) {
      const fallbackResult = await pool.query<SourceRowRecord>(normalizedQuery, [
        remainingMatchCodes,
      ]);
      consumeRows(fallbackResult.rows);
    }
  }

  return {
    rows,
    excludedSourceRowCount,
    excludedOnlyMatchCodes: new Set(
      Array.from(excludedMatchCodes).filter((code) => !includedMatchCodes.has(code)),
    ),
    workDateFilterSummary: {
      enabled: true,
      column: input.sourceConfig.workDateColumn,
      startDate: workDateFrom,
      endDate: workDateTo,
      excludedSourceRowCount,
      excludedPreviewRowCount: 0,
    },
  };
}

export async function buildBulkPricePreview(input: {
  sourceConfig: BulkPriceSourceConfig;
  rules: BulkPriceRuleSet;
}): Promise<BulkPricePreviewSnapshot> {
  validateSourceConfig(input.sourceConfig);
  validateRuleSet(input.rules);

  const buildStartedAt = Date.now();
  const metadataStartedAt = Date.now();
  const metadata = await fetchBulkPriceSourceMetadata({
    schema: input.sourceConfig.schema,
    table: input.sourceConfig.table,
  });
  const metadataMs = Date.now() - metadataStartedAt;

  const columnNames = new Set(metadata.columns.map((column) => column.name));
  const sourceMatchColumnDefinition =
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

  const coupangCandidateStartedAt = Date.now();
  const coupangCandidateResult = await loadAllCoupangPreviewCandidates(input.sourceConfig);
  const coupangCandidateMs = Date.now() - coupangCandidateStartedAt;
  const coupangRows = coupangCandidateResult.rows;
  const matchCodes = Array.from(
    new Set(
      coupangRows
        .map((row) => row.matchedCode)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const sourceQueryStartedAt = Date.now();
  const sourceRowsResult = await loadRelevantSourceRows({
    sourceConfig: input.sourceConfig,
    matchCodes,
    sourceMatchColumnDataType: sourceMatchColumnDefinition?.dataType ?? null,
  });
  const sourceQueryMs = Date.now() - sourceQueryStartedAt;
  const latestRecordLoadStartedAt = Date.now();
  const latestRecords = await coupangBulkPriceStore.listLatestRecordsByVendorItemIds(
    coupangRows.map((row) => row.vendorItemId),
  );
  const latestRecordLoadMs = Date.now() - latestRecordLoadStartedAt;
  const rowBuildStartedAt = Date.now();
  const previewRowsResult = buildBulkPricePreviewRows({
    sourceRows: sourceRowsResult.rows,
    coupangRows,
    rules: input.rules,
    latestRecords,
    excludedOnlyMatchCodes: sourceRowsResult.excludedOnlyMatchCodes,
  });
  const rowBuildMs = Date.now() - rowBuildStartedAt;
  const workDateFilterSummary: BulkPriceWorkDateFilterSummary = {
    ...sourceRowsResult.workDateFilterSummary,
    excludedPreviewRowCount: previewRowsResult.excludedPreviewRowCount,
  };
  const buildMetrics: BulkPricePreviewBuildMetrics = {
    totalMs: Date.now() - buildStartedAt,
    metadataMs,
    coupangCandidateMs,
    sourceQueryMs,
    latestRecordLoadMs,
    rowBuildMs,
    coupangExplorerFetchedAt: coupangCandidateResult.explorerFetchedAt,
    coupangExplorerServedFromCache: coupangCandidateResult.explorerServedFromCache,
    coupangExplorerSource: coupangCandidateResult.explorerSource,
  };

  return {
    sourceConfig: input.sourceConfig,
    rules: input.rules,
    rows: previewRowsResult.rows,
    stats: summarizePreviewRows(previewRowsResult.rows),
    workDateFilterSummary,
    buildMetrics,
    generatedAt: new Date().toISOString(),
  };
}

function createEmptyRunSummary(): BulkPriceRunSummary {
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
  current: BulkPriceRunRecentChange[],
  nextChange?: BulkPriceRunRecentChange | null,
) {
  const items = nextChange
    ? [nextChange, ...current.filter((item) => item.rowId !== nextChange.rowId)]
    : current.slice();

  return items
    .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))
    .slice(0, RECENT_RUN_CHANGE_LIMIT);
}

function buildRunItemChangeLabel(item: Pick<BulkPriceRunItem, "sellerProductName" | "itemName" | "vendorItemId">) {
  const productName = item.sellerProductName.trim();
  const optionName = item.itemName.trim();

  if (!productName && !optionName) {
    return item.vendorItemId;
  }
  if (!optionName || optionName === productName) {
    return productName || optionName;
  }

  return `${productName} / ${optionName}`;
}

function buildRunRecentChange(input: {
  item: BulkPriceRunItem;
  appliedAt: string;
  priceUpdated: boolean;
  inventoryUpdated: boolean;
  saleStatusUpdated: boolean;
  appliedPrice: number | null;
}): BulkPriceRunRecentChange | null {
  if (!input.priceUpdated && !input.inventoryUpdated && !input.saleStatusUpdated) {
    return null;
  }

  return {
    rowId: input.item.vendorItemId,
    label: buildRunItemChangeLabel(input.item),
    matchedCode: input.item.matchedCode,
    beforePrice: input.priceUpdated ? input.item.currentPrice : null,
    afterPrice: input.priceUpdated ? input.appliedPrice : null,
    beforeInventoryCount: input.inventoryUpdated ? input.item.currentInventoryCount : null,
    afterInventoryCount: input.inventoryUpdated ? input.item.targetInventoryCount : null,
    beforeSaleStatus: input.saleStatusUpdated ? input.item.currentSaleStatus : null,
    afterSaleStatus: input.saleStatusUpdated ? input.item.targetSaleStatus : null,
    appliedAt: input.appliedAt,
  };
}

function buildRunSummary(
  items: ReadonlyArray<Pick<BulkPriceRunItem, "status">>,
  recentChanges: BulkPriceRunRecentChange[] = [],
): BulkPriceRunSummary {
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

function incrementRunSummaryStatus(
  summary: BulkPriceRunSummary,
  status: BulkPriceRunItemStatus,
  delta: number,
) {
  if (delta === 0) {
    return;
  }

  if (status === "queued") summary.queued += delta;
  else if (status === "running") summary.running += delta;
  else if (status === "succeeded") summary.succeeded += delta;
  else if (status === "failed") summary.failed += delta;
  else if (status === "paused") summary.paused += delta;
  else if (status === "stopped") summary.stopped += delta;
  else if (status === "skipped_conflict") summary.skippedConflict += delta;
  else if (status === "skipped_unmatched") summary.skippedUnmatched += delta;
}

function applyRunSummaryTransition(
  summary: BulkPriceRunSummary,
  previousStatus: BulkPriceRunItemStatus,
  nextStatus: BulkPriceRunItemStatus,
) {
  if (previousStatus === nextStatus) {
    return;
  }

  incrementRunSummaryStatus(summary, previousStatus, -1);
  incrementRunSummaryStatus(summary, nextStatus, 1);
}

function resolveCompletedRunStatus(summary: BulkPriceRunSummary): BulkPriceRun["status"] {
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

function buildRunLogPriority(status: BulkPriceRunItemStatus) {
  switch (status) {
    case "running":
      return 0;
    case "failed":
      return 1;
    case "succeeded":
      return 2;
    case "paused":
      return 3;
    case "stopped":
      return 4;
    case "skipped_conflict":
      return 5;
    case "skipped_unmatched":
      return 6;
    case "queued":
      return 7;
    default:
      return 8;
  }
}

function sortRunLogItems(items: BulkPriceRunItem[]) {
  return items
    .slice()
    .sort((left, right) => {
      const priority =
        buildRunLogPriority(left.status) - buildRunLogPriority(right.status);
      if (priority !== 0) {
        return priority;
      }

      return (
        compareNullableDates(right.updatedAt, left.updatedAt) ||
        compareNullableStrings(left.sellerProductName, right.sellerProductName)
      );
    });
}

function filterRunLogItems(
  items: BulkPriceRunItem[],
  runStatus: BulkPriceRun["status"],
) {
  const active =
    runStatus === "running" ||
    runStatus === "queued" ||
    runStatus === "paused";

  if (!active) {
    return items;
  }

  return items.filter(
    (item) =>
      item.status !== "queued" ||
      item.messages.length > 0 ||
      item.lastAppliedAt !== null ||
      item.updatedAt !== item.createdAt,
  );
}

function createRunItemFromPreview(
  previewRow: BulkPricePreviewRow,
  manualOverridePrice: number | null,
): Omit<BulkPriceRunItem, "id" | "runId" | "createdAt" | "updatedAt"> {
  return {
    vendorItemId: previewRow.vendorItemId,
    sellerProductId: previewRow.sellerProductId,
    sellerProductName: previewRow.sellerProductName,
    itemName: previewRow.itemName,
    externalVendorSku: previewRow.externalVendorSku,
    barcode: previewRow.barcode,
    matchedCode: previewRow.matchedCode,
    status: "queued",
    messages: [...previewRow.messages],
    currentPrice: previewRow.currentPrice,
    currentInventoryCount: previewRow.currentInventoryCount,
    sourceSoldOut: previewRow.sourceSoldOut,
    currentSaleStatus: previewRow.currentSaleStatus,
    targetInventoryCount: previewRow.targetInventoryCount,
    targetSaleStatus: previewRow.targetSaleStatus,
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
    sourceRow: null,
  };
}

function normalizeManualOverridePrice(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new ApiRouteError({
      code: "INVALID_MANUAL_OVERRIDE",
      message: "manualOverridePrice must be a non-negative integer.",
      status: 400,
    });
  }

  return value;
}

function normalizeSelectionMode(value: BulkPriceCreateRunInput["selectionMode"]): BulkPriceRunSelectionMode {
  return value === "explicit"
    ? "explicit"
    : value === "all_ready"
      ? "all_ready"
      : "all_selectable";
}

function buildManualOverrideMap(input: {
  manualOverrides?: Record<string, number | null | undefined>;
  items?: BulkPriceCreateRunInput["items"];
}) {
  const overrideMap = new Map<string, number | null>();

  for (const [vendorItemId, manualOverridePrice] of Object.entries(input.manualOverrides ?? {})) {
    const normalizedVendorItemId = vendorItemId.trim();
    if (!normalizedVendorItemId) {
      continue;
    }

    overrideMap.set(
      normalizedVendorItemId,
      normalizeManualOverridePrice(manualOverridePrice),
    );
  }

  for (const item of input.items ?? []) {
    const normalizedVendorItemId = item.vendorItemId.trim();
    if (!normalizedVendorItemId) {
      continue;
    }

    overrideMap.set(
      normalizedVendorItemId,
      normalizeManualOverridePrice(item.manualOverridePrice),
    );
  }

  return overrideMap;
}

function resolveExplicitRequestedItems(input: {
  selectedRowKeys?: string[];
  items?: BulkPriceCreateRunInput["items"];
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
    const normalizedRowKey = item.vendorItemId.trim();
    if (normalizedRowKey) {
      rowKeys.add(normalizedRowKey);
    }
  }

  return Array.from(rowKeys).map((vendorItemId) => ({
    vendorItemId,
    manualOverridePrice: input.overrideMap.get(vendorItemId) ?? null,
  }));
}

export class CoupangBulkPriceService {
  private readonly controllers = new Map<string, RunController>();
  private readonly previewSessionsByKey = new Map<string, PreviewSession>();
  private readonly previewSessionsById = new Map<string, PreviewSession>();

  constructor(private readonly deps: BulkPriceServiceDeps) {}

  async getSourceMetadata(input: { schema?: string | null; table?: string | null }) {
    return this.deps.loadSourceMetadata(input);
  }

  async preview(input: BulkPricePreviewQueryInput) {
    const session = input.previewId
      ? this.resolvePreviewSessionById(input.previewId)
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

  private getPreviewSessionKey(
    sourceConfig: BulkPriceSourceConfig,
    rules: BulkPriceRuleSet,
  ) {
    return JSON.stringify({ sourceConfig, rules });
  }

  private getPreviewCacheTtlMs() {
    return DEFAULT_PREVIEW_CACHE_TTL_MS;
  }

  private getPreviewSessionLimit() {
    return DEFAULT_PREVIEW_SESSION_LIMIT;
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

  private trimPreviewSessions() {
    const limit = this.getPreviewSessionLimit();
    if (limit <= 0) {
      this.previewSessionsById.clear();
      this.previewSessionsByKey.clear();
      return;
    }

    while (this.previewSessionsById.size > limit) {
      const oldest = this.previewSessionsById.values().next().value as PreviewSession | undefined;
      if (!oldest) {
        break;
      }
      this.removePreviewSession(oldest);
    }
  }

  private cachePreviewSession(preview: BulkPricePreviewSnapshot) {
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
    this.trimPreviewSessions();
    return session;
  }

  private resolvePreviewSessionById(previewId: string) {
    this.cleanupExpiredPreviewSessions();
    const normalizedPreviewId = previewId.trim();
    if (!normalizedPreviewId) {
      throw new ApiRouteError({
        code: "COUPANG_BULK_PRICE_PREVIEW_ID_REQUIRED",
        message: "previewId is required.",
        status: 400,
      });
    }

    const session = this.previewSessionsById.get(normalizedPreviewId) ?? null;
    if (!session) {
      throw new ApiRouteError({
        code: "COUPANG_BULK_PRICE_PREVIEW_EXPIRED",
        message: "Preview session expired. Refresh the preview and try again.",
        status: 409,
      });
    }

    return session;
  }

  private async createPreviewSession(input: {
    sourceConfig: BulkPriceSourceConfig | null;
    rules: BulkPriceRuleSet | null;
  }) {
    if (!input.sourceConfig || !input.rules) {
      throw new ApiRouteError({
        code: "COUPANG_BULK_PRICE_PREVIEW_BUILD_INPUT_REQUIRED",
        message: "sourceConfig and rules are required to build a preview.",
        status: 400,
      });
    }

    validateSourceConfig(input.sourceConfig);
    validateRuleSet(input.rules);

    return this.cachePreviewSession(
      await this.deps.buildPreview({
        sourceConfig: input.sourceConfig,
        rules: input.rules,
      }),
    );
  }

  private resolvePreviewSessionForRun(input: {
    previewId?: string | null;
    sourceConfig?: BulkPriceSourceConfig;
    rules?: BulkPriceRuleSet;
  }) {
    const session = this.resolvePreviewSessionById(input.previewId?.trim() ?? "");
    if (input.sourceConfig && input.rules) {
      validateSourceConfig(input.sourceConfig);
      validateRuleSet(input.rules);
      const expectedKey = this.getPreviewSessionKey(input.sourceConfig, input.rules);

      if (session.key !== expectedKey) {
        throw new ApiRouteError({
          code: "COUPANG_BULK_PRICE_PREVIEW_EXPIRED",
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

  async createSourcePreset(input: BulkPriceSourcePresetInput) {
    validateSourceConfig(input.sourceConfig);
    return this.deps.store.createSourcePreset({
      name: normalizePresetName(input.name),
      memo: normalizePresetMemo(input.memo),
      sourceConfig: input.sourceConfig,
    });
  }

  async updateSourcePreset(id: string, input: BulkPriceSourcePresetInput) {
    validateSourceConfig(input.sourceConfig);
    const preset = await this.deps.store.updateSourcePreset(id, {
      name: normalizePresetName(input.name),
      memo: normalizePresetMemo(input.memo),
      sourceConfig: input.sourceConfig,
    });

    if (!preset) {
      throw new ApiRouteError({
        code: "BULK_PRICE_SOURCE_PRESET_NOT_FOUND",
        message: "Bulk price source preset not found.",
        status: 404,
      });
    }

    return preset;
  }

  async deleteSourcePreset(id: string) {
    const preset = await this.deps.store.deleteSourcePreset(id);
    if (!preset) {
      throw new ApiRouteError({
        code: "BULK_PRICE_SOURCE_PRESET_NOT_FOUND",
        message: "Bulk price source preset not found.",
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

  async createRulePreset(input: BulkPriceRulePresetInput) {
    validateRuleSet(input.rules);
    return this.deps.store.createRulePreset({
      name: normalizePresetName(input.name),
      memo: normalizePresetMemo(input.memo),
      rules: input.rules,
    });
  }

  async updateRulePreset(id: string, input: BulkPriceRulePresetInput) {
    validateRuleSet(input.rules);
    const preset = await this.deps.store.updateRulePreset(id, {
      name: normalizePresetName(input.name),
      memo: normalizePresetMemo(input.memo),
      rules: input.rules,
    });

    if (!preset) {
      throw new ApiRouteError({
        code: "BULK_PRICE_RULE_PRESET_NOT_FOUND",
        message: "Bulk price rule preset not found.",
        status: 404,
      });
    }

    return preset;
  }

  async deleteRulePreset(id: string) {
    const preset = await this.deps.store.deleteRulePreset(id);
    if (!preset) {
      throw new ApiRouteError({
        code: "BULK_PRICE_RULE_PRESET_NOT_FOUND",
        message: "Bulk price rule preset not found.",
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
        code: "BULK_PRICE_RUN_NOT_FOUND",
        message: "Bulk price run not found.",
        status: 404,
      });
    }

    return detail;
  }

  async getRunLiveData(
    runId: string,
    input: BulkPriceRunLiveQueryInput,
  ): Promise<BulkPriceRunLiveResponse> {
    const run = await this.requireRun(runId);
    const controller = this.controllers.get(runId);
    const vendorItemIds = Array.from(
      new Set(
        (input.vendorItemIds ?? [])
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    );
    const logLimit = Math.max(1, Math.min(50, Math.trunc(input.logLimit ?? 20)));
    const liveCandidateLimit = Math.max(logLimit * 3, 30);

    const [overlayItems, liveLogCandidates] = await Promise.all([
      vendorItemIds.length
        ? this.deps.store.listRunItemsByVendorItemIds(runId, vendorItemIds)
        : Promise.resolve([]),
      controller?.touchedItemIds.length
        ? this.deps.store.listRunItemsByIds(
            controller.touchedItemIds.slice(0, liveCandidateLimit),
          )
        : this.deps.store.listRecentlyUpdatedRunItems(runId, liveCandidateLimit),
    ]);

    return {
      run: controller
        ? {
            ...run,
            summary: controller.summary,
          }
        : run,
      overlayItems,
      liveLogItems: sortRunLogItems(
        filterRunLogItems(liveLogCandidates, run.status),
      ).slice(0, logLimit),
    };
  }

  async listRuns() {
    return {
      items: await this.deps.store.listRuns(),
    };
  }

  async createRun(input: BulkPriceCreateRunInput): Promise<BulkPriceRunCommandResponse> {
    const previewSession = this.resolvePreviewSessionForRun({
      sourceConfig: input.sourceConfig,
      rules: input.rules,
      previewId: input.previewId,
    });
    const preview = previewSession.preview;
    const sourceConfig = input.sourceConfig ?? preview.sourceConfig;
    const rules = input.rules ?? preview.rules;
    validateSourceConfig(sourceConfig);
    validateRuleSet(rules);
    const previewMap = new Map(
      preview.rows.map((row) => [row.vendorItemId, row] as const),
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
              .filter((row) => !(input.excludedRowKeys ?? []).includes(row.vendorItemId))
              .map((row) => ({
                vendorItemId: row.vendorItemId,
                manualOverridePrice: overrideMap.get(row.vendorItemId) ?? null,
              }))
        : preview.rows
            .filter((row) => row.isSelectable)
            .filter((row) => !(input.excludedRowKeys ?? []).includes(row.vendorItemId))
            .map((row) => ({
              vendorItemId: row.vendorItemId,
              manualOverridePrice: overrideMap.get(row.vendorItemId) ?? null,
            }));

    if (!requestedItems.length) {
      throw new ApiRouteError({
        code: "BULK_PRICE_RUN_ITEMS_REQUIRED",
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

    const runItems = requestedItems.map((requestItem) => {
      const previewRow = previewMap.get(requestItem.vendorItemId) ?? null;
      const manualOverridePrice =
        overrideMap.get(requestItem.vendorItemId) ??
        normalizeManualOverridePrice(requestItem.manualOverridePrice);

      if (!previewRow) {
        return {
          vendorItemId: requestItem.vendorItemId,
          sellerProductId: "",
          sellerProductName: "",
          itemName: requestItem.vendorItemId,
          externalVendorSku: null,
          barcode: null,
          matchedCode: null,
          status: "skipped_unmatched" as BulkPriceRunItemStatus,
          messages: ["Preview row is no longer available."],
          currentPrice: null,
          currentInventoryCount: null,
          sourceSoldOut: null,
          currentSaleStatus: null,
          targetInventoryCount: null,
          targetSaleStatus: null,
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
          sourceRow: null,
        };
      }

      if (previewRow.status === "conflict") {
        const item = createRunItemFromPreview(previewRow, manualOverridePrice);
        return {
          ...item,
          status: "skipped_conflict" as BulkPriceRunItemStatus,
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
        previewRow.currentInventoryCount,
        previewRow.targetInventoryCount,
      );
      const needsSaleStatusUpdate = shouldApplySaleStatusUpdate(
        previewRow.currentSaleStatus,
        previewRow.targetSaleStatus,
      );

      if (
        previewRow.status === "ready" &&
        !needsPriceUpdate &&
        !needsInventoryUpdate &&
        !needsSaleStatusUpdate
      ) {
        const item = createRunItemFromPreview(previewRow, manualOverridePrice);
        return {
          ...item,
          status: "skipped_unmatched" as BulkPriceRunItemStatus,
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
          status: "skipped_unmatched" as BulkPriceRunItemStatus,
          messages:
            previewRow.messages.length > 0
              ? previewRow.messages
              : ["Preview row is not executable."],
        };
      }

      return createRunItemFromPreview(previewRow, manualOverridePrice);
    });

    try {
      await this.deps.store.createRunItems(run.id, runItems);
    } catch (error) {
      await this.deps.store.deleteRun(run.id).catch(() => undefined);
      throw error;
    }

    const summary = buildRunSummary(runItems);
    const queuedCount = summary.queued;
    const nextRunStatus =
      queuedCount > 0 ? "queued" : resolveCompletedRunStatus(summary);

    const updatedRun =
      (await this.deps.store.updateRun(run.id, {
        status: nextRunStatus,
        summary,
        startedAt: queuedCount > 0 ? new Date().toISOString() : null,
        finishedAt: queuedCount > 0 ? null : new Date().toISOString(),
      })) ?? (await this.requireRun(run.id));

    if (queuedCount > 0) {
      this.startRunProcessing(run.id);
    }

    return { run: updatedRun };
  }

  async pauseRun(runId: string): Promise<BulkPriceRunCommandResponse> {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "BULK_PRICE_RUN_NOT_FOUND",
        message: "Bulk price run not found.",
        status: 404,
      });
    }

    const controller = this.controllers.get(runId);
    if (!controller) {
      return { run };
    }

    controller.pauseRequested = true;
    return { run };
  }

  async resumeRun(runId: string): Promise<BulkPriceRunCommandResponse> {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "BULK_PRICE_RUN_NOT_FOUND",
        message: "Bulk price run not found.",
        status: 404,
      });
    }

    if (run.status !== "paused") {
      return { run };
    }

    await this.deps.store.updateRunItems(runId, (item) =>
      item.status === "paused"
        ? {
            ...item,
            status: "queued",
          }
        : item,
    );

    const itemStates = await this.deps.store.listRunItemStates(runId);
    const summary = buildRunSummary(itemStates, run.summary.recentChanges ?? []);
    const updatedRun =
      (await this.deps.store.updateRun(runId, {
        status: summary.queued > 0 ? "queued" : resolveCompletedRunStatus(summary),
        summary,
        finishedAt: null,
      })) ?? (await this.requireRun(runId));

    if (summary.queued > 0) {
      this.startRunProcessing(runId);
    }

    return { run: updatedRun };
  }

  async stopRun(runId: string): Promise<BulkPriceRunCommandResponse> {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "BULK_PRICE_RUN_NOT_FOUND",
        message: "Bulk price run not found.",
        status: 404,
      });
    }

    const controller = this.controllers.get(runId);
    if (controller) {
      controller.stopRequested = true;
      return { run };
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
        const itemStates = await this.deps.store.listRunItemStates(runId);
        await this.deps.store.updateRun(runId, {
          status: "stopped",
          summary: buildRunSummary(itemStates, run.summary.recentChanges ?? []),
          finishedAt: new Date().toISOString(),
        });
      }

    return { run: (await this.requireRun(runId)) };
  }

  async deleteRun(runId: string) {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "BULK_PRICE_RUN_NOT_FOUND",
        message: "Bulk price run not found.",
        status: 404,
      });
    }

    if (run.status === "queued" || run.status === "running" || this.controllers.has(runId)) {
      throw new ApiRouteError({
        code: "BULK_PRICE_RUN_DELETE_BLOCKED",
        message: "Active bulk price runs cannot be deleted. Stop the run first.",
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

      // Collect running items' vendorItemIds to check latestRecords
      const allItems = await this.deps.store.listRunItems(run.id);
      const runningItems = allItems.filter((item) => item.status === "running");
      const runningVendorItemIds = runningItems.map((item) => item.vendorItemId);

      // Look up latestRecords for running items to detect already-applied prices
      const latestRecords =
        runningVendorItemIds.length > 0
          ? await this.deps.store.listLatestRecordsByVendorItemIds(runningVendorItemIds)
          : [];
      const latestRecordMap = new Map(
        latestRecords.map((record) => [record.vendorItemId, record]),
      );

      await this.deps.store.updateRunItems(run.id, (item) => {
        if (item.status === "running") {
          const latestRecord = latestRecordMap.get(item.vendorItemId);
          const wasAppliedInThisRun = latestRecord?.runId === run.id;
          return {
            ...item,
            status: "failed" as BulkPriceRunItemStatus,
            messages: [
              ...item.messages,
              wasAppliedInThisRun
                ? "Server restarted. Price was applied but execution was interrupted."
                : "Server restarted during execution.",
            ],
            lastAppliedAt: wasAppliedInThisRun
              ? latestRecord.appliedAt
              : item.lastAppliedAt,
            lastAppliedPrice: wasAppliedInThisRun
              ? latestRecord.appliedPrice
              : item.lastAppliedPrice,
          };
        }

        if (item.status === "queued") {
          return {
            ...item,
            status: "paused" as BulkPriceRunItemStatus,
            messages: [...item.messages, "Run paused after server restart."],
          };
        }

        return item;
      });

      const itemStates = await this.deps.store.listRunItemStates(run.id);
      const summary = buildRunSummary(itemStates, run.summary.recentChanges ?? []);
      await this.deps.store.updateRun(run.id, {
        status: summary.paused > 0 ? "paused" : resolveCompletedRunStatus(summary),
        summary,
        finishedAt: summary.paused > 0 ? null : new Date().toISOString(),
      });
    }
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
      recentChanges: [],
      summary: createEmptyRunSummary(),
      touchedItemIds: [],
      summaryPersistQueued: false,
      summaryUpdateChain: Promise.resolve(),
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
    const items = await this.deps.store.listRunItemStates(controller.runId);
    controller.recentChanges = run.summary.recentChanges ?? [];
    controller.summary = buildRunSummary(items, controller.recentChanges);
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

    await this.deps.store.updateRun(controller.runId, {
      status: "running",
      summary: controller.summary,
      startedAt: run.startedAt ?? new Date().toISOString(),
      finishedAt: null,
    });

    await withCoupangExplorerHydrationSuspended(run.storeId, async () => {
      const workerCount = Math.max(1, Math.min(2, controller.queuedItemIds.length));
      const workers = Array.from({ length: workerCount }, async () =>
        this.processRunWorker(controller, run.storeId),
      );

      await Promise.all(workers);
    });
    await controller.summaryUpdateChain;
    try {
      await this.finishRunProcessing(controller.runId, controller);
    } catch (finishError) {
      // finishRunProcessing failed — ensure run doesn't stay "running" forever
      try {
        const itemStates = await this.deps.store.listRunItemStates(controller.runId);
        const summary = buildRunSummary(itemStates, controller.recentChanges);
        await this.deps.store.updateRun(controller.runId, {
          status: resolveCompletedRunStatus(summary),
          summary,
          finishedAt: new Date().toISOString(),
        });
      } catch {
        // Last resort: at least mark the run as failed
        try {
          await this.deps.store.updateRun(controller.runId, {
            status: "failed",
            finishedAt: new Date().toISOString(),
          });
        } catch {
          // DB is completely unavailable — will be recovered on restart
        }
      }
    }
  }

  private recordTouchedRunItem(controller: RunController, itemId: string) {
    controller.touchedItemIds = [
      itemId,
      ...controller.touchedItemIds.filter((currentItemId) => currentItemId !== itemId),
    ].slice(0, 50);
  }

  private queueRunSummaryPersist(controller: RunController) {
    if (controller.summaryPersistQueued) {
      return controller.summaryUpdateChain;
    }

    controller.summaryPersistQueued = true;
    const task = controller.summaryUpdateChain.then(async () => {
      controller.summaryPersistQueued = false;
      await this.deps.store.updateRun(controller.runId, {
        summary: controller.summary,
      });
    });

    controller.summaryUpdateChain = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  }

  private transitionRunSummary(
    controller: RunController,
    itemId: string,
    previousStatus: BulkPriceRunItemStatus,
    nextStatus: BulkPriceRunItemStatus,
    recentChange?: BulkPriceRunRecentChange | null,
  ) {
    applyRunSummaryTransition(controller.summary, previousStatus, nextStatus);
    controller.recentChanges = mergeRecentRunChanges(
      controller.recentChanges,
      recentChange,
    );
    controller.summary.recentChanges = controller.recentChanges;
    this.recordTouchedRunItem(controller, itemId);
    void this.queueRunSummaryPersist(controller);
  }

  private async processRunWorker(
    controller: RunController,
    storeId: string,
  ) {
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

      await this.deps.store.updateRunItem(itemId, {
        status: "running",
        messages: item.messages,
      });
      this.transitionRunSummary(controller, itemId, item.status, "running");

      const needsPriceUpdate = shouldApplyPriceUpdate(
        item.currentPrice,
        item.effectiveTargetPrice,
      );
      const needsInventoryUpdate = shouldApplyInventoryUpdate(
        item.currentInventoryCount,
        item.targetInventoryCount,
      );
      const needsSaleStatusUpdate = shouldApplySaleStatusUpdate(
        item.currentSaleStatus,
        item.targetSaleStatus,
      );

      if (!needsPriceUpdate && !needsInventoryUpdate && !needsSaleStatusUpdate) {
        await this.deps.store.updateRunItem(itemId, {
          status: "succeeded",
          messages: [
            ...item.messages,
            buildAlreadyMatchedMessage(item),
          ],
        });
        this.transitionRunSummary(controller, itemId, "running", "succeeded");
        continue;
      }

      let nextMessages = [...item.messages];
      let lastAppliedAt = item.lastAppliedAt;
      let lastAppliedPrice = item.lastAppliedPrice;
      let priceUpdated = false;
      let inventoryUpdated = false;
      let saleStatusUpdated = false;
      let priceFailed = false;
      let inventoryFailed = false;
      let saleStatusFailed = false;

      try {
        if (needsPriceUpdate) {
          const targetPrice = item.effectiveTargetPrice;
          if (targetPrice === null) {
            throw new Error("Target price is missing.");
          }

          try {
            const priceResult = await this.deps.applyPriceUpdate({
              storeId,
              sellerProductId: item.sellerProductId,
              vendorItemId: item.vendorItemId,
              price: targetPrice,
              skipBackgroundHydration: true,
            });
            const appliedAt = new Date().toISOString();
            nextMessages = [...nextMessages, priceResult.message];
            lastAppliedAt = appliedAt;
            lastAppliedPrice = targetPrice;
            priceUpdated = true;

            await this.deps.store.upsertLatestRecord({
              vendorItemId: item.vendorItemId,
              sellerProductId: item.sellerProductId,
              matchedCode: item.matchedCode,
              beforePrice: item.currentPrice,
              appliedPrice: targetPrice,
              appliedAt,
              runId: item.runId,
              storeId,
            });
          } catch (priceError) {
            priceFailed = true;
            const msg =
              priceError instanceof Error
                ? priceError.message
                : "Failed to update Coupang price.";
            nextMessages = [...nextMessages, msg];
          }
        }

        if (needsInventoryUpdate) {
          const targetInventoryCount = item.targetInventoryCount;
          if (targetInventoryCount === null) {
            throw new Error("Target inventory count is missing.");
          }

          try {
            const inventoryResult = await this.deps.applyInventoryUpdate({
              storeId,
              sellerProductId: item.sellerProductId,
              vendorItemId: item.vendorItemId,
              inventoryCount: targetInventoryCount,
              skipBackgroundHydration: true,
            });
            nextMessages = [...nextMessages, inventoryResult.message];
            inventoryUpdated = true;
          } catch (inventoryError) {
            inventoryFailed = true;
            const msg =
              inventoryError instanceof Error
                ? inventoryError.message
                : "Failed to update Coupang inventory.";
            nextMessages = [...nextMessages, msg];
          }
        }

        if (needsSaleStatusUpdate) {
          const targetSaleStatus = item.targetSaleStatus;
          if (!targetSaleStatus) {
            throw new Error("Target sale status is missing.");
          }

          try {
            const saleStatusResult = await this.deps.applySaleStatusUpdate({
              storeId,
              sellerProductId: item.sellerProductId,
              vendorItemId: item.vendorItemId,
              saleStatus: targetSaleStatus,
              skipBackgroundHydration: true,
            });
            nextMessages = [...nextMessages, saleStatusResult.message];
            saleStatusUpdated = true;
          } catch (saleStatusError) {
            saleStatusFailed = true;
            const msg =
              saleStatusError instanceof Error
                ? saleStatusError.message
                : "Failed to update Coupang sale status.";
            nextMessages = [...nextMessages, msg];
          }
        }

        const anyFailed = priceFailed || inventoryFailed || saleStatusFailed;
        const anySucceeded = priceUpdated || inventoryUpdated || saleStatusUpdated;
        const finalStatus: BulkPriceRunItemStatus = anyFailed ? "failed" : "succeeded";

        if (anyFailed && anySucceeded) {
          const succeededParts: string[] = [];
          if (priceUpdated) succeededParts.push("price");
          if (inventoryUpdated) succeededParts.push("inventory");
          if (saleStatusUpdated) succeededParts.push("sale status");
          const failedParts: string[] = [];
          if (priceFailed) failedParts.push("price");
          if (inventoryFailed) failedParts.push("inventory");
          if (saleStatusFailed) failedParts.push("sale status");
          if (
            priceUpdated &&
            saleStatusFailed &&
            !inventoryUpdated &&
            !priceFailed &&
            !inventoryFailed
          ) {
            const failureMessage =
              nextMessages.at(-1) ?? "Failed to update Coupang sale status.";
            nextMessages = [
              ...nextMessages,
              `Price updated, but Coupang sold-out sync failed: ${failureMessage}`,
            ];
          } else {
            nextMessages = [
              ...nextMessages,
              `Partially applied: ${succeededParts.join(", ")} succeeded, ${failedParts.join(", ")} failed.`,
            ];
          }
        }

        const recentChange = buildRunRecentChange({
          item,
          appliedAt: new Date().toISOString(),
          priceUpdated,
          inventoryUpdated,
          saleStatusUpdated,
          appliedPrice: lastAppliedPrice,
        });
        await this.deps.store.updateRunItem(itemId, {
          status: finalStatus,
          messages: nextMessages,
          lastAppliedAt,
          lastAppliedPrice,
        });
        this.transitionRunSummary(controller, itemId, "running", finalStatus, recentChange);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected error during item processing.";
        const recentChange = buildRunRecentChange({
          item,
          appliedAt: new Date().toISOString(),
          priceUpdated,
          inventoryUpdated,
          saleStatusUpdated,
          appliedPrice: lastAppliedPrice,
        });
        try {
          await this.deps.store.updateRunItem(itemId, {
            status: "failed",
            messages: [...nextMessages, message],
            lastAppliedAt,
            lastAppliedPrice,
          });
          this.transitionRunSummary(controller, itemId, "running", "failed", recentChange);
        } catch {
          // DB write also failed — summary will be reconciled by finishRunProcessing
          this.transitionRunSummary(controller, itemId, "running", "failed", recentChange);
        }
      }
    }
  }

  private async finishRunProcessing(runId: string, controller: RunController) {
    if (controller.stopRequested) {
      await this.deps.store.bulkTransitionRunItemStatus(
        runId, "queued", "stopped", "Stopped before execution.",
      );
      await this.deps.store.bulkTransitionRunItemStatus(
        runId, "paused", "stopped", "Stopped before execution.",
      );
    } else if (controller.pauseRequested) {
      await this.deps.store.bulkTransitionRunItemStatus(
        runId, "queued", "paused", "Paused before execution.",
      );
    }

    const itemStates = await this.deps.store.listRunItemStates(runId);
    const summary = buildRunSummary(itemStates, controller.recentChanges);
    const nextStatus = controller.stopRequested
      ? "stopped"
      : controller.pauseRequested
        ? "paused"
        : resolveCompletedRunStatus(summary);

    await this.deps.store.updateRun(runId, {
      status: nextStatus,
      summary,
      finishedAt:
        nextStatus === "paused" ? null : new Date().toISOString(),
    });
  }

  private async requireRun(runId: string) {
    const run = await this.deps.store.getRun(runId);
    if (!run) {
      throw new ApiRouteError({
        code: "BULK_PRICE_RUN_NOT_FOUND",
        message: "Bulk price run not found.",
        status: 404,
      });
    }

    return run;
  }
}

export const coupangBulkPriceService = new CoupangBulkPriceService({
  store: coupangBulkPriceStore,
  loadSourceMetadata: fetchBulkPriceSourceMetadata,
  buildPreview: buildBulkPricePreview,
  applyPriceUpdate: async (input) =>
    updateOptionPrice({
      storeId: input.storeId,
      sellerProductId: input.sellerProductId,
      vendorItemId: input.vendorItemId,
      price: input.price,
    }),
  applyInventoryUpdate: async (input) =>
    updateOptionQuantity({
      storeId: input.storeId,
      sellerProductId: input.sellerProductId,
      vendorItemId: input.vendorItemId,
      quantity: input.inventoryCount,
    }),
  applySaleStatusUpdate: async (input) =>
    updateSaleStatus({
      storeId: input.storeId,
      sellerProductId: input.sellerProductId,
      vendorItemId: input.vendorItemId,
      saleStatus: input.saleStatus,
    }),
});

export async function recoverBulkPriceRuns() {
  await coupangBulkPriceService.recoverInterruptedRuns();
}
