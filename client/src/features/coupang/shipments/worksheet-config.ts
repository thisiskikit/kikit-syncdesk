import type {
  CoupangDataSource,
  CoupangShipmentWorksheetColumnSource,
  CoupangShipmentWorksheetRawFieldCatalogItem,
  CoupangShipmentWorksheetResponse,
  CoupangShipmentWorksheetRow,
  CoupangShipmentWorksheetSortField,
  CoupangShipmentWorksheetSyncSummary,
} from "@shared/coupang";
import type {
  InvoiceStatusCardKey,
  OrderStatusCardKey,
  OutputStatusCardKey,
} from "@/lib/coupang-shipment-quick-filters";
import {
  normalizeInvoiceStatusCardKey,
  normalizeOrderStatusCardKey,
  normalizeOutputStatusCardKey,
} from "@/lib/coupang-shipment-quick-filters";
import type {
  EditableColumnKey,
  FilterState,
  ShipmentColumnConfig,
  ShipmentColumnSource,
  ShipmentColumnSourceKey,
  ShipmentColumnSourceOption,
} from "./types";

type QuickFilterCardOption<TValue extends string> = {
  value: TValue;
  label: string;
  toneClassName: string;
};

export const SHIPMENT_WORKSHEET_PAGE_SIZE_OPTIONS = [50, 100, 200] as const;

export const EDITABLE_COLUMN_KEYS: EditableColumnKey[] = [
  "receiverName",
  "deliveryCompanyCode",
  "invoiceNumber",
  "deliveryRequest",
];

export const INVOICE_INPUT_SOURCE_KEYS = [
  "deliveryCompanyCode",
  "invoiceNumber",
] as const satisfies readonly EditableColumnKey[];

export const DEFAULT_SHIPMENT_COLUMN_ORDER: ShipmentColumnSourceKey[] = [
  "orderDateText",
  "quantity",
  "productName",
  "optionName",
  "productOrderNumber",
  "collectedPlatform",
  "ordererName",
  "contact",
  "receiverName",
  "collectedAccountName",
  "deliveryCompanyCode",
  "selpickOrderNumber",
  "invoiceNumber",
  "salePrice",
  "shippingFee",
  "receiverAddress",
  "deliveryRequest",
  "buyerPhoneNumber",
  "productNumber",
  "exposedProductName",
  "productOptionNumber",
  "sellerProductCode",
];

export const SHIPMENT_COLUMN_LABELS: Record<ShipmentColumnSourceKey, string> = {
  blank: "빈 열",
  orderDateText: "주문일자",
  quantity: "수량",
  productName: "상품명",
  optionName: "옵션명",
  productOrderNumber: "상품주문번호",
  collectedPlatform: "수집 플랫폼",
  ordererName: "주문자명",
  contact: "연락처",
  receiverName: "수령인명",
  collectedAccountName: "수집 계정명",
  deliveryCompanyCode: "택배사",
  selpickOrderNumber: "셀픽주문번호",
  invoiceNumber: "송장번호",
  salePrice: "판매가",
  shippingFee: "배송비",
  receiverAddress: "수령지",
  deliveryRequest: "요청사항",
  buyerPhoneNumber: "구매자 전화번호",
  productNumber: "상품번호",
  exposedProductName: "노출 상품명",
  coupangDisplayProductName: "쿠팡 원본 노출 상품명",
  productOptionNumber: "상품 옵션번호",
  sellerProductCode: "판매자 상품코드",
};

export const SHIPMENT_COLUMN_DEFAULT_WIDTHS: Record<ShipmentColumnSourceKey, number> = {
  blank: 96,
  orderDateText: 88,
  quantity: 72,
  productName: 190,
  optionName: 120,
  productOrderNumber: 140,
  collectedPlatform: 96,
  ordererName: 110,
  contact: 130,
  receiverName: 150,
  collectedAccountName: 140,
  deliveryCompanyCode: 110,
  selpickOrderNumber: 150,
  invoiceNumber: 140,
  salePrice: 110,
  shippingFee: 96,
  receiverAddress: 280,
  deliveryRequest: 180,
  buyerPhoneNumber: 130,
  productNumber: 120,
  exposedProductName: 220,
  coupangDisplayProductName: 220,
  productOptionNumber: 130,
  sellerProductCode: 160,
};

export const ORDER_STATUS_OPTIONS = [
  { value: "", label: "전체 상태" },
  { value: "ACCEPT", label: "결제완료" },
  { value: "INSTRUCT", label: "상품준비중" },
  { value: "DEPARTURE", label: "배송지시" },
  { value: "DELIVERING", label: "배송중" },
  { value: "FINAL_DELIVERY", label: "배송완료" },
  { value: "NONE_TRACKING", label: "추적없음" },
] as const;

const BUILTIN_SOURCE_OPTIONS: ShipmentColumnSourceKey[] = [
  "blank",
  ...DEFAULT_SHIPMENT_COLUMN_ORDER,
  "coupangDisplayProductName",
];

const EDITABLE_COLUMN_KEY_SET = new Set<string>(EDITABLE_COLUMN_KEYS);
const INVOICE_INPUT_SOURCE_KEY_SET = new Set<string>(INVOICE_INPUT_SOURCE_KEYS);

const RAW_FIELD_GROUP_ORDER = [
  "워크시트",
  "주문",
  "주문상세",
  "주문상세 상품",
  "상품",
  "상품 옵션",
];

const SEOUL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const ORDER_STATUS_LABEL_BY_VALUE = new Map<string, string>(
  ORDER_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

export const INVOICE_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<InvoiceStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "idle", label: "입력 전", toneClassName: "neutral" },
  { value: "ready", label: "전송 가능", toneClassName: "ready" },
  { value: "pending", label: "송장 전송 중", toneClassName: "progress" },
  { value: "failed", label: "전송 실패", toneClassName: "danger" },
  { value: "applied", label: "전송됨", toneClassName: "success" },
] as const;

export const ORDER_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<OrderStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "ACCEPT", label: "결제완료", toneClassName: "progress" },
  { value: "INSTRUCT", label: "상품준비중", toneClassName: "progress" },
  { value: "DEPARTURE", label: "배송지시", toneClassName: "progress" },
  { value: "DELIVERING", label: "배송중", toneClassName: "progress" },
  { value: "FINAL_DELIVERY", label: "배송완료", toneClassName: "success" },
  { value: "NONE_TRACKING", label: "업체 직접 배송", toneClassName: "attention" },
] as const;

export const OUTPUT_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<OutputStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "notExported", label: "미출력", toneClassName: "ready" },
  { value: "exported", label: "출력 완료", toneClassName: "success" },
] as const;

export const SELPICK_ORDER_NUMBER_PATTERN = /^O\d{8}[A-Z0-9]\d{4,}$/i;

export const shipmentWorksheetMirrorSyncRequirementReasons = [
  "idle",
  "trusted",
  "fallback",
  "missing_summary",
  "partial_sync",
  "degraded_sync",
  "range_outside_sync",
] as const;

export type ShipmentWorksheetMirrorSyncRequirementReason =
  (typeof shipmentWorksheetMirrorSyncRequirementReasons)[number];

export type ShipmentWorksheetMirrorSyncRequirement = {
  isTrusted: boolean;
  requiresFullSync: boolean;
  reason: ShipmentWorksheetMirrorSyncRequirementReason;
  syncRangeLabel: string | null;
};

export function createBuiltinShipmentColumnSource(
  key: ShipmentColumnSourceKey,
): ShipmentColumnSource {
  return {
    kind: "builtin",
    key,
  };
}

export function createRawShipmentColumnSource(key: string): ShipmentColumnSource {
  return {
    kind: "raw",
    key: key.trim(),
  };
}

export function isBuiltinShipmentColumnSource(
  source: ShipmentColumnSource | null | undefined,
): source is Extract<CoupangShipmentWorksheetColumnSource, { kind: "builtin" }> {
  return source?.kind === "builtin";
}

export function isRawShipmentColumnSource(
  source: ShipmentColumnSource | null | undefined,
): source is Extract<CoupangShipmentWorksheetColumnSource, { kind: "raw" }> {
  return source?.kind === "raw";
}

export function getShipmentColumnSourceStorageKey(source: ShipmentColumnSource) {
  return isBuiltinShipmentColumnSource(source) ? source.key : `raw:${source.key}`;
}

export function resolveShipmentColumnDefaultWidth(
  source: ShipmentColumnSource,
  catalogItem?: CoupangShipmentWorksheetRawFieldCatalogItem,
) {
  if (isBuiltinShipmentColumnSource(source)) {
    return SHIPMENT_COLUMN_DEFAULT_WIDTHS[source.key];
  }

  switch (catalogItem?.sampleValueType) {
    case "number":
      return 120;
    case "boolean":
      return 110;
    default:
      return 180;
  }
}

export function resolveShipmentColumnSourceLabel(
  source: ShipmentColumnSource,
  rawFieldCatalog?: readonly CoupangShipmentWorksheetRawFieldCatalogItem[],
) {
  if (isBuiltinShipmentColumnSource(source)) {
    return SHIPMENT_COLUMN_LABELS[source.key];
  }

  return rawFieldCatalog?.find((item) => item.key === source.key)?.label ?? source.key;
}

export function formatShipmentColumnSourceOptionLabel(
  source: ShipmentColumnSource,
  rawFieldCatalog?: readonly CoupangShipmentWorksheetRawFieldCatalogItem[],
) {
  const sourceKey = isBuiltinShipmentColumnSource(source) ? source.key : source.key;
  return `${sourceKey} · ${resolveShipmentColumnSourceLabel(source, rawFieldCatalog)}`;
}

export function buildShipmentColumnSourceOptions(
  rawFieldCatalog: readonly CoupangShipmentWorksheetRawFieldCatalogItem[] = [],
): ShipmentColumnSourceOption[] {
  const builtinOptions = BUILTIN_SOURCE_OPTIONS.map((key) => ({
    key: `builtin:${key}`,
    source: createBuiltinShipmentColumnSource(key),
    label: formatShipmentColumnSourceOptionLabel(createBuiltinShipmentColumnSource(key)),
    group: "기본 필드",
    defaultWidth: SHIPMENT_COLUMN_DEFAULT_WIDTHS[key],
  }));

  const rawOptions = rawFieldCatalog.map((item) => ({
    key: `raw:${item.key}`,
    source: createRawShipmentColumnSource(item.key),
    label: `${item.key} · ${item.label}`,
    group: item.group,
    defaultWidth: resolveShipmentColumnDefaultWidth(createRawShipmentColumnSource(item.key), item),
    catalogItem: item,
  }));

  rawOptions.sort((left, right) => {
    const leftGroupIndex = RAW_FIELD_GROUP_ORDER.indexOf(left.group);
    const rightGroupIndex = RAW_FIELD_GROUP_ORDER.indexOf(right.group);
    const normalizedLeftIndex = leftGroupIndex >= 0 ? leftGroupIndex : RAW_FIELD_GROUP_ORDER.length;
    const normalizedRightIndex =
      rightGroupIndex >= 0 ? rightGroupIndex : RAW_FIELD_GROUP_ORDER.length;

    if (normalizedLeftIndex !== normalizedRightIndex) {
      return normalizedLeftIndex - normalizedRightIndex;
    }

    return left.label.localeCompare(right.label, "ko-KR", {
      numeric: true,
      sensitivity: "base",
    });
  });

  return [...builtinOptions, ...rawOptions];
}

export function resolveShipmentColumnLabelForSourceChange(input: {
  currentLabel: string;
  previousSource: ShipmentColumnSource;
  nextSource: ShipmentColumnSource;
  rawFieldCatalog?: readonly CoupangShipmentWorksheetRawFieldCatalogItem[];
}) {
  const normalizedCurrentLabel = input.currentLabel.trim();
  const previousStorageKey = getShipmentColumnSourceStorageKey(input.previousSource);
  const nextStorageKey = getShipmentColumnSourceStorageKey(input.nextSource);
  const previousLabel = resolveShipmentColumnSourceLabel(
    input.previousSource,
    input.rawFieldCatalog,
  );
  const nextLabel = resolveShipmentColumnSourceLabel(input.nextSource, input.rawFieldCatalog);

  if (!normalizedCurrentLabel) {
    return nextLabel;
  }

  if (normalizedCurrentLabel === previousStorageKey) {
    return nextStorageKey;
  }

  if (normalizedCurrentLabel === previousLabel) {
    return nextLabel;
  }

  return input.currentLabel;
}

export function isEditableSource(
  source: ShipmentColumnSource,
): source is { kind: "builtin"; key: EditableColumnKey } {
  return isBuiltinShipmentColumnSource(source) && EDITABLE_COLUMN_KEY_SET.has(source.key);
}

export function isInvoiceInputSource(
  source: ShipmentColumnSource,
): source is { kind: "builtin"; key: EditableColumnKey } {
  return isBuiltinShipmentColumnSource(source) && INVOICE_INPUT_SOURCE_KEY_SET.has(source.key);
}

export function isGridEditableSource(
  source: ShipmentColumnSource,
  worksheetMode: "default" | "invoice",
): source is { kind: "builtin"; key: EditableColumnKey } {
  return worksheetMode === "invoice" ? isInvoiceInputSource(source) : isEditableSource(source);
}

function getSeoulDateParts(date: Date) {
  const parts = SEOUL_DATE_FORMATTER
    .formatToParts(date)
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") {
        current[part.type] = part.value;
      }

      return current;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function defaultSeoulDate(offsetDays: number) {
  const { year, month, day } = getSeoulDateParts(new Date());
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);

  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function normalizePriorityCardFilter(
  value: FilterState["priorityCard"] | string | null | undefined,
): FilterState["priorityCard"] {
  return value === "shipment_stop_requested" ||
    value === "same_day_dispatch" ||
    value === "dispatch_delayed" ||
    value === "long_in_transit"
    ? value
    : "all";
}

function normalizePipelineCardFilter(
  value: FilterState["pipelineCard"] | string | null | undefined,
): FilterState["pipelineCard"] {
  switch (value) {
    case "payment_completed":
    case "preparing_product":
    case "shipping_instruction":
    case "in_delivery":
    case "delivered":
      return value;
    case "ACCEPT":
      return "payment_completed";
    case "INSTRUCT":
      return "preparing_product";
    case "DEPARTURE":
      return "shipping_instruction";
    case "DELIVERING":
    case "NONE_TRACKING":
      return "in_delivery";
    case "FINAL_DELIVERY":
      return "delivered";
    default:
      return "all";
  }
}

function normalizeIssueFilter(
  value: FilterState["issueFilter"] | string | null | undefined,
): FilterState["issueFilter"] {
  if (value === "shipment_stop_handled") {
    return "shipment_stop_resolved";
  }

  return value === "shipment_stop_requested" ||
    value === "shipment_stop_resolved" ||
    value === "cancel" ||
    value === "return" ||
    value === "exchange" ||
    value === "cs_open" ||
    value === "direct_delivery"
    ? value
    : "all";
}

export function createDefaultFilters(): FilterState {
  return {
    selectedStoreId: "",
    createdAtFrom: defaultSeoulDate(-29),
    createdAtTo: defaultSeoulDate(0),
    query: "",
    maxPerPage: 20,
    datasetMode: "active",
    scope: "all",
    decisionStatus: "all",
    priorityCard: "all",
    pipelineCard: "all",
    issueFilter: "all",
    invoiceStatusCard: "all",
    orderStatusCard: "all",
    outputStatusCard: "all",
  };
}

export function normalizeFiltersToSeoulToday(current: FilterState): FilterState {
  const today = defaultSeoulDate(0);
  const fallbackFrom = defaultSeoulDate(-29);
  const normalizedFrom = current.createdAtFrom.trim() || fallbackFrom;

  return {
    ...current,
    createdAtFrom: normalizedFrom.localeCompare(today) <= 0 ? normalizedFrom : today,
    createdAtTo: today,
    datasetMode: current.datasetMode === "mirror" ? "mirror" : "active",
    scope: current.scope ?? "all",
    decisionStatus: current.decisionStatus ?? "all",
    priorityCard: normalizePriorityCardFilter(current.priorityCard),
    pipelineCard: normalizePipelineCardFilter(current.pipelineCard),
    issueFilter: normalizeIssueFilter(current.issueFilter),
    invoiceStatusCard: normalizeInvoiceStatusCardKey(current.invoiceStatusCard),
    orderStatusCard: normalizeOrderStatusCardKey(current.orderStatusCard),
    outputStatusCard: normalizeOutputStatusCardKey(current.outputStatusCard),
  };
}

export function areFiltersEqual(left: FilterState, right: FilterState) {
  return (
    left.selectedStoreId === right.selectedStoreId &&
    left.createdAtFrom === right.createdAtFrom &&
    left.createdAtTo === right.createdAtTo &&
    left.query === right.query &&
    left.maxPerPage === right.maxPerPage &&
    left.datasetMode === right.datasetMode &&
    left.scope === right.scope &&
    left.decisionStatus === right.decisionStatus &&
    left.priorityCard === right.priorityCard &&
    left.pipelineCard === right.pipelineCard &&
    left.issueFilter === right.issueFilter &&
    left.invoiceStatusCard === right.invoiceStatusCard &&
    left.orderStatusCard === right.orderStatusCard &&
    left.outputStatusCard === right.outputStatusCard
  );
}

export function buildWorksheetUrl(storeId: string) {
  return `/api/coupang/shipments/worksheet?storeId=${encodeURIComponent(storeId)}`;
}

export function buildShipmentWorksheetDetailUrl(
  storeId: string,
  row: Pick<
    CoupangShipmentWorksheetRow,
    "shipmentBoxId" | "orderId" | "orderedAtRaw" | "vendorItemId" | "sellerProductId"
  >,
) {
  const params = new URLSearchParams({
    storeId,
  });

  if (row.shipmentBoxId) {
    params.set("shipmentBoxId", row.shipmentBoxId);
  }
  if (row.orderId) {
    params.set("orderId", row.orderId);
  }
  if (row.vendorItemId?.trim()) {
    params.set("vendorItemId", row.vendorItemId.trim());
  }
  if (row.sellerProductId?.trim()) {
    params.set("sellerProductId", row.sellerProductId.trim());
  }
  if (row.orderedAtRaw?.trim()) {
    params.set("orderedAtRaw", row.orderedAtRaw.trim());
  }

  return `/api/coupang/shipments/worksheet/detail?${params.toString()}`;
}

function createShipmentColumnId() {
  return `shipment-column-${Math.random().toString(36).slice(2, 10)}`;
}

function isShipmentColumnSourceKey(value: unknown): value is ShipmentColumnSourceKey {
  return typeof value === "string" && value in SHIPMENT_COLUMN_LABELS;
}

function normalizeShipmentColumnSource(value: unknown): ShipmentColumnSource | null {
  if (isShipmentColumnSourceKey(value)) {
    return createBuiltinShipmentColumnSource(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<ShipmentColumnSource>;
  if (source.kind === "builtin" && isShipmentColumnSourceKey(source.key)) {
    return createBuiltinShipmentColumnSource(source.key);
  }

  if (source.kind === "raw" && typeof source.key === "string" && source.key.trim()) {
    return createRawShipmentColumnSource(source.key);
  }

  return null;
}

export function createShipmentColumnConfig(
  source: ShipmentColumnSource | ShipmentColumnSourceKey,
): ShipmentColumnConfig {
  const normalizedSource =
    typeof source === "string" ? createBuiltinShipmentColumnSource(source) : source;

  return {
    id: createShipmentColumnId(),
    source: normalizedSource,
    label: resolveShipmentColumnSourceLabel(normalizedSource),
  };
}

export function createDefaultShipmentColumnConfigs() {
  return DEFAULT_SHIPMENT_COLUMN_ORDER.map((sourceKey) => createShipmentColumnConfig(sourceKey));
}

export function normalizeShipmentColumnConfigs(
  value: unknown,
): ShipmentColumnConfig[] {
  const items = Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const config = item as Partial<ShipmentColumnConfig> & {
            sourceKey?: unknown;
          };
          const source =
            normalizeShipmentColumnSource(config.source) ??
            normalizeShipmentColumnSource(config.sourceKey);

          if (!source) {
            return null;
          }

          return {
            id: typeof config.id === "string" && config.id.trim() ? config.id : createShipmentColumnId(),
            source,
            label:
              typeof config.label === "string" && config.label.trim()
                ? config.label.trim()
                : resolveShipmentColumnSourceLabel(source),
          } satisfies ShipmentColumnConfig;
        })
        .filter((item): item is ShipmentColumnConfig => Boolean(item))
    : [];

  return items.length ? items : createDefaultShipmentColumnConfigs();
}

export function moveColumnConfigs(
  configs: ShipmentColumnConfig[],
  sourceId: string,
  targetId: string,
) {
  const sourceIndex = configs.findIndex((config) => config.id === sourceId);
  const targetIndex = configs.findIndex((config) => config.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return configs;
  }

  const next = configs.slice();
  const [moved] = next.splice(sourceIndex, 1);
  const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  next.splice(adjustedTargetIndex, 0, moved);
  return next;
}

export function serializeShipmentWorksheetSortField(
  source: ShipmentColumnSource,
): CoupangShipmentWorksheetSortField | null {
  if (isBuiltinShipmentColumnSource(source)) {
    return source.key === "blank" ? null : source.key;
  }

  return source.key ? (`raw:${source.key}` as CoupangShipmentWorksheetSortField) : null;
}

function normalizeWorksheetDateValue(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function buildShipmentWorksheetSyncRangeLabel(
  syncSummary: CoupangShipmentWorksheetSyncSummary | null | undefined,
) {
  const from = normalizeWorksheetDateValue(syncSummary?.fetchCreatedAtFrom);
  const to = normalizeWorksheetDateValue(syncSummary?.fetchCreatedAtTo);

  return from && to ? `${from} ~ ${to}` : null;
}

export function resolveShipmentWorksheetMirrorSyncRequirement(input: {
  selectedStoreId: string | null | undefined;
  requestedCreatedAtFrom: string | null | undefined;
  requestedCreatedAtTo: string | null | undefined;
  source: CoupangDataSource | null | undefined;
  syncSummary: CoupangShipmentWorksheetSyncSummary | null | undefined;
  isAuthoritativeMirror?: boolean | null | undefined;
  coverageCreatedAtFrom?: string | null | undefined;
  coverageCreatedAtTo?: string | null | undefined;
}): ShipmentWorksheetMirrorSyncRequirement {
  const selectedStoreId = input.selectedStoreId?.trim() ?? "";
  const requestedCreatedAtFrom = normalizeWorksheetDateValue(input.requestedCreatedAtFrom);
  const requestedCreatedAtTo = normalizeWorksheetDateValue(input.requestedCreatedAtTo);
  const coverageCreatedAtFrom = normalizeWorksheetDateValue(input.coverageCreatedAtFrom);
  const coverageCreatedAtTo = normalizeWorksheetDateValue(input.coverageCreatedAtTo);
  const syncRangeLabel =
    coverageCreatedAtFrom && coverageCreatedAtTo
      ? `${coverageCreatedAtFrom} ~ ${coverageCreatedAtTo}`
      : buildShipmentWorksheetSyncRangeLabel(input.syncSummary);

  if (!selectedStoreId || !requestedCreatedAtFrom || !requestedCreatedAtTo) {
    return {
      isTrusted: false,
      requiresFullSync: false,
      reason: "idle",
      syncRangeLabel,
    };
  }

  if (input.isAuthoritativeMirror === true) {
    return {
      isTrusted: true,
      requiresFullSync: false,
      reason: "trusted",
      syncRangeLabel,
    };
  }

  if (input.source === "fallback") {
    return {
      isTrusted: false,
      requiresFullSync: true,
      reason: "fallback",
      syncRangeLabel,
    };
  }

  if (!input.syncSummary) {
    return {
      isTrusted: false,
      requiresFullSync: true,
      reason: "missing_summary",
      syncRangeLabel,
    };
  }

  if (input.syncSummary.mode !== "full") {
    return {
      isTrusted: false,
      requiresFullSync: true,
      reason: "partial_sync",
      syncRangeLabel,
    };
  }

  if (input.syncSummary.degraded || (input.syncSummary.failedStatuses?.length ?? 0) > 0) {
    return {
      isTrusted: false,
      requiresFullSync: true,
      reason: "degraded_sync",
      syncRangeLabel,
    };
  }

  const fetchCreatedAtFrom = normalizeWorksheetDateValue(input.syncSummary.fetchCreatedAtFrom);
  const fetchCreatedAtTo = normalizeWorksheetDateValue(input.syncSummary.fetchCreatedAtTo);
  const isRangeCovered =
    Boolean(fetchCreatedAtFrom && fetchCreatedAtTo) &&
    requestedCreatedAtFrom.localeCompare(fetchCreatedAtFrom ?? "") >= 0 &&
    requestedCreatedAtTo.localeCompare(fetchCreatedAtTo ?? "") <= 0;

  if (!isRangeCovered) {
    return {
      isTrusted: false,
      requiresFullSync: true,
      reason: "range_outside_sync",
      syncRangeLabel,
    };
  }

  return {
    isTrusted: true,
    requiresFullSync: false,
    reason: "trusted",
    syncRangeLabel,
  };
}

export function summarizeWorksheetMessage(sheet: CoupangShipmentWorksheetResponse | null | undefined) {
  if (!sheet?.message) {
    return null;
  }

  return {
    title: sheet.source === "fallback" ? "대체 데이터" : "수집 안내",
    message: sheet.message,
  };
}

export function summarizeWorksheetSync(sheet: CoupangShipmentWorksheetResponse | null | undefined) {
  if (!sheet?.syncSummary) {
    return null;
  }

  const modeLabel =
    sheet.syncSummary.mode === "full"
      ? "쿠팡 기준 재동기화"
      : sheet.syncSummary.mode === "incremental"
        ? "증분 갱신"
        : "빠른 수집";
  const scopeLabel =
    sheet.syncSummary.fetchCreatedAtFrom && sheet.syncSummary.fetchCreatedAtTo
      ? `${sheet.syncSummary.fetchCreatedAtFrom} ~ ${sheet.syncSummary.fetchCreatedAtTo}`
      : "범위 정보 없음";
  const statusLabel =
    ORDER_STATUS_LABEL_BY_VALUE.get(sheet.syncSummary.statusFilter ?? "") ??
    sheet.syncSummary.statusFilter ??
    "전체 상태";
  const checkpointLabel =
    sheet.syncSummary.checkpointCount && sheet.syncSummary.checkpointPersistedCount
      ? ` · 체크포인트 ${sheet.syncSummary.checkpointCount}회 / ${sheet.syncSummary.checkpointPersistedCount}행`
      : "";

  return {
    title: "최근 수집",
    message:
      `${modeLabel}${sheet.syncSummary.autoExpanded ? " (자동 확장)" : ""} · ` +
      `범위 ${scopeLabel} · 상태 ${statusLabel} · ` +
      `추가 ${sheet.syncSummary.insertedCount}건 · 갱신 ${sheet.syncSummary.updatedCount}건 · ` +
      `조회 ${sheet.syncSummary.fetchedCount}건${checkpointLabel}`,
  };
}
