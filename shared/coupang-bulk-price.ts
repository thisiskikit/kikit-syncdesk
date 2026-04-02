import type { CoupangDataSource, CoupangSaleStatus } from "./coupang";

export const bulkPriceCoupangMatchFields = [
  "externalVendorSku",
  "barcode",
  "vendorItemId",
  "sellerProductId",
] as const;

export type BulkPriceCoupangMatchField =
  (typeof bulkPriceCoupangMatchFields)[number];

export const bulkPriceRoundingModes = ["ceil", "round", "floor"] as const;
export type BulkPriceRoundingMode = (typeof bulkPriceRoundingModes)[number];

export const bulkPricePreviewStatuses = [
  "ready",
  "conflict",
  "unmatched",
  "invalid_source",
] as const;

export type BulkPricePreviewStatus =
  (typeof bulkPricePreviewStatuses)[number];

export const bulkPriceRunStatuses = [
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "partially_succeeded",
  "stopped",
] as const;

export type BulkPriceRunStatus = (typeof bulkPriceRunStatuses)[number];

export const bulkPriceRunItemStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "paused",
  "stopped",
  "skipped_conflict",
  "skipped_unmatched",
] as const;

export type BulkPriceRunItemStatus =
  (typeof bulkPriceRunItemStatuses)[number];

export const bulkPricePreviewSortDirections = ["asc", "desc"] as const;
export type BulkPricePreviewSortDirection =
  (typeof bulkPricePreviewSortDirections)[number];

export const bulkPricePreviewSortFields = [
  "product",
  "matchedCode",
  "status",
  "price",
  "manualOverride",
  "lastApplied",
] as const;
export type BulkPricePreviewSortField =
  (typeof bulkPricePreviewSortFields)[number];

export const bulkPriceRunSelectionModes = [
  "all_selectable",
  "all_ready",
  "explicit",
] as const;
export type BulkPriceRunSelectionMode =
  (typeof bulkPriceRunSelectionModes)[number];

export type BulkPriceTargetSaleStatus = Extract<
  CoupangSaleStatus,
  "ONSALE" | "SUSPENDED"
>;

export interface BulkPriceSourceTableRef {
  schema: string;
  table: string;
}

export interface BulkPriceSourceColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
}

export interface BulkPriceSourceSampleRow {
  index: number;
  values: Record<string, string | number | boolean | null>;
}

export interface BulkPriceSourceConfig {
  storeId: string;
  schema: string;
  table: string;
  basePriceColumn: string;
  sourceMatchColumn: string;
  soldOutColumn: string;
  workDateColumn: string;
  workDateFrom: string;
  workDateTo: string;
  coupangMatchField: BulkPriceCoupangMatchField;
}

export interface BulkPriceRuleSet {
  fixedAdjustment: number;
  feeRate: number;
  marginRate: number;
  inboundShippingCost: number;
  discountRate: number;
  roundingUnit: 1 | 10 | 100;
  roundingMode: BulkPriceRoundingMode;
}

export interface BulkPricePresetBase {
  id: string;
  name: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface BulkPriceSourcePreset extends BulkPricePresetBase {
  sourceConfig: BulkPriceSourceConfig;
}

export interface BulkPriceRulePreset extends BulkPricePresetBase {
  rules: BulkPriceRuleSet;
}

export interface BulkPriceSourcePresetInput {
  name: string;
  memo: string;
  sourceConfig: BulkPriceSourceConfig;
}

export interface BulkPriceRulePresetInput {
  name: string;
  memo: string;
  rules: BulkPriceRuleSet;
}

export interface BulkPriceSourcePresetListResponse {
  items: BulkPriceSourcePreset[];
}

export interface BulkPriceRulePresetListResponse {
  items: BulkPriceRulePreset[];
}

export interface BulkPricePreviewStats {
  totalCoupangItems: number;
  readyCount: number;
  selectableCount: number;
  conflictCount: number;
  unmatchedCount: number;
  invalidSourceCount: number;
}

export interface BulkPriceWorkDateFilterSummary {
  enabled: boolean;
  column: string;
  startDate: string;
  endDate: string;
  excludedSourceRowCount: number;
  excludedPreviewRowCount: number;
}

export interface BulkPricePreviewBuildMetrics {
  totalMs: number;
  metadataMs: number;
  coupangCandidateMs: number;
  sourceQueryMs: number;
  latestRecordLoadMs: number;
  rowBuildMs: number;
  coupangExplorerFetchedAt: string;
  coupangExplorerServedFromCache: boolean;
  coupangExplorerSource: CoupangDataSource;
}

export interface BulkPricePreviewRow {
  vendorItemId: string;
  sellerProductId: string;
  sellerProductName: string;
  itemName: string;
  externalVendorSku: string | null;
  barcode: string | null;
  matchedCode: string | null;
  status: BulkPricePreviewStatus;
  messages: string[];
  isSelectable: boolean;
  lastModifiedAt: string | null;
  lastAppliedAt: string | null;
  lastAppliedPrice: number | null;
  currentPrice: number | null;
  currentInventoryCount: number | null;
  sourceSoldOut: boolean | null;
  currentSaleStatus: CoupangSaleStatus | null;
  targetInventoryCount: number | null;
  targetSaleStatus: BulkPriceTargetSaleStatus | null;
  needsPriceUpdate: boolean;
  needsInventoryUpdate: boolean;
  needsSaleStatusUpdate: boolean;
  basePrice: number | null;
  discountedBaseCost: number | null;
  effectiveCost: number | null;
  rawTargetPrice: number | null;
  adjustedTargetPrice: number | null;
  roundedTargetPrice: number | null;
  computedPrice: number | null;
  manualOverridePrice: number | null;
  effectiveTargetPrice: number | null;
  sourceRow: Record<string, string | number | boolean | null> | null;
}

export interface BulkPricePreviewSnapshot {
  sourceConfig: BulkPriceSourceConfig;
  rules: BulkPriceRuleSet;
  rows: BulkPricePreviewRow[];
  stats: BulkPricePreviewStats;
  workDateFilterSummary: BulkPriceWorkDateFilterSummary;
  buildMetrics: BulkPricePreviewBuildMetrics;
  generatedAt: string;
}

export interface BulkPricePreviewSort {
  field: BulkPricePreviewSortField | null;
  direction: BulkPricePreviewSortDirection;
}

export interface BulkPricePreviewQueryInput {
  sourceConfig?: BulkPriceSourceConfig;
  rules?: BulkPriceRuleSet;
  previewId?: string | null;
  page?: number;
  pageSize?: number;
  matchedOnly?: boolean;
  sort?: BulkPricePreviewSort | null;
}

export interface BulkPricePreviewResponse extends BulkPricePreviewSnapshot {
  previewId: string;
  page: number;
  pageSize: number;
  filteredTotal: number;
  totalPages: number;
}

export interface BulkPriceLatestAppliedRecord {
  vendorItemId: string;
  sellerProductId: string;
  matchedCode: string | null;
  beforePrice: number | null;
  appliedPrice: number;
  appliedAt: string;
  runId: string;
  storeId: string;
}

export interface BulkPriceRunRecentChange {
  rowId: string;
  label: string;
  matchedCode: string | null;
  beforePrice: number | null;
  afterPrice: number | null;
  beforeInventoryCount: number | null;
  afterInventoryCount: number | null;
  beforeSaleStatus: CoupangSaleStatus | null;
  afterSaleStatus: CoupangSaleStatus | null;
  appliedAt: string;
}

export interface BulkPriceRunSummary {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  paused: number;
  stopped: number;
  skippedConflict: number;
  skippedUnmatched: number;
  recentChanges: BulkPriceRunRecentChange[];
}

export interface BulkPriceRun {
  id: string;
  storeId: string;
  sourceConfig: BulkPriceSourceConfig;
  rules: BulkPriceRuleSet;
  status: BulkPriceRunStatus;
  summary: BulkPriceRunSummary;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BulkPriceRunItem {
  id: string;
  runId: string;
  vendorItemId: string;
  sellerProductId: string;
  sellerProductName: string;
  itemName: string;
  externalVendorSku: string | null;
  barcode: string | null;
  matchedCode: string | null;
  status: BulkPriceRunItemStatus;
  messages: string[];
  currentPrice: number | null;
  currentInventoryCount: number | null;
  sourceSoldOut: boolean | null;
  currentSaleStatus: CoupangSaleStatus | null;
  targetInventoryCount: number | null;
  targetSaleStatus: BulkPriceTargetSaleStatus | null;
  basePrice: number | null;
  discountedBaseCost: number | null;
  effectiveCost: number | null;
  rawTargetPrice: number | null;
  adjustedTargetPrice: number | null;
  roundedTargetPrice: number | null;
  computedPrice: number | null;
  manualOverridePrice: number | null;
  effectiveTargetPrice: number | null;
  lastAppliedAt: string | null;
  lastAppliedPrice: number | null;
  sourceRow: Record<string, string | number | boolean | null> | null;
  createdAt: string;
  updatedAt: string;
}

export interface BulkPriceRunDetail {
  run: BulkPriceRun;
  items: BulkPriceRunItem[];
  latestRecords: BulkPriceLatestAppliedRecord[];
}

export interface BulkPriceRunCommandResponse {
  run: BulkPriceRun;
}

export interface BulkPriceRunLiveQueryInput {
  vendorItemIds?: string[];
  logLimit?: number;
}

export interface BulkPriceRunLiveResponse {
  run: BulkPriceRun;
  overlayItems: BulkPriceRunItem[];
  liveLogItems: BulkPriceRunItem[];
}

export interface BulkPriceRunListResponse {
  items: BulkPriceRun[];
}

export interface BulkPriceRunRowInput {
  vendorItemId: string;
  manualOverridePrice?: number | null;
}

export interface BulkPriceCreateRunInput {
  sourceConfig?: BulkPriceSourceConfig;
  rules?: BulkPriceRuleSet;
  previewId?: string | null;
  selectionMode?: BulkPriceRunSelectionMode;
  excludedRowKeys?: string[];
  selectedRowKeys?: string[];
  manualOverrides?: Record<string, number | null | undefined>;
  items?: BulkPriceRunRowInput[];
}

export interface BulkPriceSourceMetadataResponse {
  configured: boolean;
  databaseUrlAvailable: boolean;
  tables: BulkPriceSourceTableRef[];
  columns: BulkPriceSourceColumn[];
  sampleRows: BulkPriceSourceSampleRow[];
  requestedTable: BulkPriceSourceTableRef | null;
  fetchedAt: string;
}
