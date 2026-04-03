import type { NaverProductOptionType } from "./naver-products";

export const naverBulkPriceMatchFields = [
  "sellerManagementCode",
  "sellerBarcode",
  "originProductNo",
  "channelProductNo",
] as const;

export type NaverBulkPriceMatchField =
  (typeof naverBulkPriceMatchFields)[number];

export const naverBulkPriceRoundingModes = ["ceil", "round", "floor"] as const;
export type NaverBulkPriceRoundingMode =
  (typeof naverBulkPriceRoundingModes)[number];

export const naverBulkPricePreviewStatuses = [
  "ready",
  "conflict",
  "unmatched",
  "invalid_source",
] as const;

export type NaverBulkPricePreviewStatus =
  (typeof naverBulkPricePreviewStatuses)[number];

export const naverBulkPriceRunStatuses = [
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "partially_succeeded",
  "stopped",
] as const;

export type NaverBulkPriceRunStatus =
  (typeof naverBulkPriceRunStatuses)[number];

export const naverBulkPriceRunItemStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "paused",
  "stopped",
  "skipped_conflict",
  "skipped_unmatched",
] as const;

export type NaverBulkPriceRunItemStatus =
  (typeof naverBulkPriceRunItemStatuses)[number];

export const naverBulkPricePreviewJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type NaverBulkPricePreviewJobStatus =
  (typeof naverBulkPricePreviewJobStatuses)[number];

export const naverBulkPricePreviewJobPhases = [
  "loading_naver_products",
  "enriching_barcodes",
  "loading_source_rows",
  "matching",
  "finalizing",
] as const;
export type NaverBulkPricePreviewJobPhase =
  (typeof naverBulkPricePreviewJobPhases)[number];

export const naverBulkPricePreviewSortDirections = ["asc", "desc"] as const;
export type NaverBulkPricePreviewSortDirection =
  (typeof naverBulkPricePreviewSortDirections)[number];

export const naverBulkPricePreviewSortFields = [
  "product",
  "matchedCode",
  "status",
  "targetPrice",
  "basePrice",
  "manualOverride",
  "option",
  "lastApplied",
  "messages",
] as const;
export type NaverBulkPricePreviewSortField =
  (typeof naverBulkPricePreviewSortFields)[number];

export const naverBulkPriceRunSelectionModes = [
  "all_selectable",
  "all_ready",
  "explicit",
] as const;
export type NaverBulkPriceRunSelectionMode =
  (typeof naverBulkPriceRunSelectionModes)[number];

export const naverBulkPriceSaleStatuses = [
  "WAIT",
  "SALE",
  "OUTOFSTOCK",
  "UNADMISSION",
  "REJECTION",
  "SUSPENSION",
  "CLOSE",
  "PROHIBITION",
  "DELETE",
] as const;
export type NaverBulkPriceSaleStatus =
  (typeof naverBulkPriceSaleStatuses)[number];

export const naverBulkPriceDisplayStatuses = [
  "WAIT",
  "ON",
  "SUSPENSION",
] as const;
export type NaverBulkPriceDisplayStatus =
  (typeof naverBulkPriceDisplayStatuses)[number];

export type NaverBulkPriceTargetSaleStatus = Extract<
  NaverBulkPriceSaleStatus,
  "SALE" | "OUTOFSTOCK"
>;

export type NaverBulkPriceSerializableValue =
  | string
  | number
  | boolean
  | null;

export interface NaverBulkPriceSourceTableRef {
  schema: string;
  table: string;
}

export interface NaverBulkPriceSourceColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
}

export interface NaverBulkPriceSourceSampleRow {
  index: number;
  values: Record<string, NaverBulkPriceSerializableValue>;
}

export interface NaverBulkPriceSourceConfig {
  storeId: string;
  schema: string;
  table: string;
  basePriceColumn: string;
  sourceMatchColumn: string;
  soldOutColumn: string;
  workDateColumn: string;
  workDateFrom: string;
  workDateTo: string;
  naverMatchField: NaverBulkPriceMatchField;
}

export interface NaverBulkPriceRuleSet {
  fixedAdjustment: number;
  feeRate: number;
  marginRate: number;
  inboundShippingCost: number;
  discountRate: number;
  roundingUnit: 1 | 10 | 100;
  roundingMode: NaverBulkPriceRoundingMode;
}

export interface NaverBulkPricePresetBase {
  id: string;
  name: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface NaverBulkPriceSourcePreset extends NaverBulkPricePresetBase {
  sourceConfig: NaverBulkPriceSourceConfig;
}

export interface NaverBulkPriceRulePreset extends NaverBulkPricePresetBase {
  rules: NaverBulkPriceRuleSet;
}

export interface NaverBulkPriceSourcePresetInput {
  name: string;
  memo: string;
  sourceConfig: NaverBulkPriceSourceConfig;
}

export interface NaverBulkPriceRulePresetInput {
  name: string;
  memo: string;
  rules: NaverBulkPriceRuleSet;
}

export interface NaverBulkPriceSourcePresetListResponse {
  items: NaverBulkPriceSourcePreset[];
}

export interface NaverBulkPriceRulePresetListResponse {
  items: NaverBulkPriceRulePreset[];
}

export interface NaverBulkPricePreviewStats {
  totalNaverItems: number;
  readyCount: number;
  selectableCount: number;
  conflictCount: number;
  unmatchedCount: number;
  invalidSourceCount: number;
}

export interface NaverBulkPriceWorkDateFilterSummary {
  enabled: boolean;
  column: string;
  startDate: string;
  endDate: string;
  excludedSourceRowCount: number;
  excludedPreviewRowCount: number;
}

export interface NaverBulkPricePreviewRow {
  rowKey: string;
  originProductNo: string;
  channelProductNo: string | null;
  sellerManagementCode: string | null;
  sellerBarcode: string | null;
  productName: string;
  matchedCode: string | null;
  status: NaverBulkPricePreviewStatus;
  messages: string[];
  isSelectable: boolean;
  modifiedAt: string | null;
  lastAppliedAt: string | null;
  lastAppliedPrice: number | null;
  currentPrice: number | null;
  currentStockQuantity: number | null;
  sourceSoldOut: boolean | null;
  currentSaleStatus: NaverBulkPriceSaleStatus | null;
  currentDisplayStatus: NaverBulkPriceDisplayStatus | null;
  targetStockQuantity: number | null;
  targetSaleStatus: NaverBulkPriceTargetSaleStatus | null;
  targetDisplayStatus: Extract<NaverBulkPriceDisplayStatus, "ON"> | null;
  needsPriceUpdate: boolean;
  needsInventoryUpdate: boolean;
  needsSaleStatusUpdate: boolean;
  needsDisplayStatusUpdate: boolean;
  saleStatusCode: string | null;
  saleStatusLabel: string;
  hasOptions: boolean;
  optionType: NaverProductOptionType;
  optionCount: number;
  optionHandlingMessage: string;
  basePrice: number | null;
  discountedBaseCost: number | null;
  effectiveCost: number | null;
  rawTargetPrice: number | null;
  adjustedTargetPrice: number | null;
  roundedTargetPrice: number | null;
  computedPrice: number | null;
  manualOverridePrice: number | null;
  effectiveTargetPrice: number | null;
  sourceRow: Record<string, NaverBulkPriceSerializableValue> | null;
}

export interface NaverBulkPricePreviewSnapshot {
  sourceConfig: NaverBulkPriceSourceConfig;
  rules: NaverBulkPriceRuleSet;
  rows: NaverBulkPricePreviewRow[];
  stats: NaverBulkPricePreviewStats;
  workDateFilterSummary: NaverBulkPriceWorkDateFilterSummary;
  generatedAt: string;
}

export interface NaverBulkPricePreviewSort {
  field: NaverBulkPricePreviewSortField | null;
  direction: NaverBulkPricePreviewSortDirection;
}

export interface NaverBulkPriceRunRowInput {
  rowKey: string;
  manualOverridePrice?: number | null;
}

export interface NaverBulkPricePreviewQueryInput {
  sourceConfig?: NaverBulkPriceSourceConfig;
  rules?: NaverBulkPriceRuleSet;
  previewId?: string | null;
  page?: number;
  pageSize?: number;
  matchedOnly?: boolean;
  sort?: NaverBulkPricePreviewSort | null;
}

export interface NaverBulkPricePreviewResponse
  extends NaverBulkPricePreviewSnapshot {
  previewId: string;
  page: number;
  pageSize: number;
  filteredTotal: number;
  totalPages: number;
}

export interface NaverBulkPricePreviewJobProgress {
  loadedProducts: number;
  totalProducts: number;
  matchedCodes: number;
  processedRows: number;
  updatedAt: string;
}

export interface NaverBulkPricePreviewJobSummary {
  previewId: string | null;
  stats: NaverBulkPricePreviewStats | null;
  workDateFilterSummary: NaverBulkPriceWorkDateFilterSummary | null;
  generatedAt: string | null;
}

export interface NaverBulkPricePreviewJob {
  id: string;
  sourceConfig: NaverBulkPriceSourceConfig;
  rules: NaverBulkPriceRuleSet;
  status: NaverBulkPricePreviewJobStatus;
  phase: NaverBulkPricePreviewJobPhase;
  progress: NaverBulkPricePreviewJobProgress;
  cachedPreviewId: string | null;
  cachedSummary: NaverBulkPricePreviewJobSummary | null;
  startedFromCache: boolean;
  latestPreviewId: string | null;
  summary: NaverBulkPricePreviewJobSummary | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface NaverBulkPricePreviewJobInput {
  sourceConfig: NaverBulkPriceSourceConfig;
  rules: NaverBulkPriceRuleSet;
}

export interface NaverBulkPricePreviewJobResponse {
  job: NaverBulkPricePreviewJob;
}

export interface NaverBulkPricePreviewJobListResponse {
  items: NaverBulkPricePreviewJob[];
}

export interface NaverBulkPriceLatestAppliedRecord {
  rowKey: string;
  originProductNo: string;
  channelProductNo: string | null;
  sellerManagementCode: string | null;
  sellerBarcode: string | null;
  matchedCode: string | null;
  beforePrice: number | null;
  appliedPrice: number;
  appliedAt: string;
  runId: string;
  storeId: string;
}

export interface NaverBulkPriceRunRecentChange {
  rowId: string;
  label: string;
  matchedCode: string | null;
  beforePrice: number | null;
  afterPrice: number | null;
  beforeStockQuantity: number | null;
  afterStockQuantity: number | null;
  beforeSaleStatus: NaverBulkPriceSaleStatus | null;
  afterSaleStatus: NaverBulkPriceSaleStatus | null;
  beforeDisplayStatus: NaverBulkPriceDisplayStatus | null;
  afterDisplayStatus: NaverBulkPriceDisplayStatus | null;
  appliedAt: string;
}

export interface NaverBulkPriceRunSummary {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  paused: number;
  stopped: number;
  skippedConflict: number;
  skippedUnmatched: number;
  recentChanges: NaverBulkPriceRunRecentChange[];
}

export interface NaverBulkPriceRun {
  id: string;
  storeId: string;
  sourceConfig: NaverBulkPriceSourceConfig;
  rules: NaverBulkPriceRuleSet;
  status: NaverBulkPriceRunStatus;
  summary: NaverBulkPriceRunSummary;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface NaverBulkPriceRunItem {
  id: string;
  runId: string;
  rowKey: string;
  originProductNo: string;
  channelProductNo: string | null;
  sellerManagementCode: string | null;
  sellerBarcode: string | null;
  productName: string;
  matchedCode: string | null;
  status: NaverBulkPriceRunItemStatus;
  messages: string[];
  currentPrice: number | null;
  currentStockQuantity: number | null;
  sourceSoldOut: boolean | null;
  currentSaleStatus: NaverBulkPriceSaleStatus | null;
  currentDisplayStatus: NaverBulkPriceDisplayStatus | null;
  targetStockQuantity: number | null;
  targetSaleStatus: NaverBulkPriceTargetSaleStatus | null;
  targetDisplayStatus: Extract<NaverBulkPriceDisplayStatus, "ON"> | null;
  saleStatusCode: string | null;
  saleStatusLabel: string;
  hasOptions: boolean;
  optionType: NaverProductOptionType;
  optionCount: number;
  optionHandlingMessage: string;
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
  modifiedAt: string | null;
  sourceRow: Record<string, NaverBulkPriceSerializableValue> | null;
  createdAt: string;
  updatedAt: string;
}

export interface NaverBulkPriceRunDetail {
  run: NaverBulkPriceRun;
  items: NaverBulkPriceRunItem[];
  latestRecords: NaverBulkPriceLatestAppliedRecord[];
}

export interface NaverBulkPriceRunSummaryResponse {
  run: NaverBulkPriceRun;
  recentItems: NaverBulkPriceRunItem[];
}

export interface NaverBulkPriceRunListResponse {
  items: NaverBulkPriceRun[];
}

export interface NaverBulkPriceCreateRunInput {
  sourceConfig?: NaverBulkPriceSourceConfig;
  rules?: NaverBulkPriceRuleSet;
  previewId?: string | null;
  selectionMode?: NaverBulkPriceRunSelectionMode;
  excludedRowKeys?: string[];
  selectedRowKeys?: string[];
  manualOverrides?: Record<string, number | null | undefined>;
  items?: NaverBulkPriceRunRowInput[];
}

export interface NaverBulkPriceSourceMetadataResponse {
  configured: boolean;
  databaseUrlAvailable: boolean;
  tables: NaverBulkPriceSourceTableRef[];
  columns: NaverBulkPriceSourceColumn[];
  sampleRows: NaverBulkPriceSourceSampleRow[];
  requestedTable: NaverBulkPriceSourceTableRef | null;
  fetchedAt: string;
}
