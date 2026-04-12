import type { CoupangShipmentWorksheetResponse, CoupangShipmentWorksheetRow } from "@shared/coupang";
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
  ShipmentColumnSourceKey,
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
  collectedPlatform: "수집한플랫폼",
  ordererName: "주문자명",
  contact: "연락처",
  receiverName: "수령자명",
  collectedAccountName: "수집한계정명",
  deliveryCompanyCode: "택배사",
  selpickOrderNumber: "셀픽주문번호",
  invoiceNumber: "송장번호",
  salePrice: "판매가",
  shippingFee: "배송비",
  receiverAddress: "수령지",
  deliveryRequest: "요청사항",
  buyerPhoneNumber: "구매자전화번호",
  productNumber: "상품번호",
  exposedProductName: "노출상품명",
  coupangDisplayProductName: "쿠팡 원본 노출상품명",
  productOptionNumber: "상품옵션번호",
  sellerProductCode: "판매자상품코드",
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
  { value: "ACCEPT", label: "주문접수" },
  { value: "INSTRUCT", label: "상품준비중" },
  { value: "DEPARTURE", label: "출고완료" },
  { value: "DELIVERING", label: "배송중" },
  { value: "FINAL_DELIVERY", label: "배송완료" },
  { value: "NONE_TRACKING", label: "추적없음" },
] as const;

export const SHIPMENT_COLUMN_SOURCE_OPTIONS: ShipmentColumnSourceKey[] = [
  "blank",
  ...DEFAULT_SHIPMENT_COLUMN_ORDER,
  "coupangDisplayProductName",
];

export const ORDER_STATUS_LABEL_BY_VALUE = new Map<string, string>(
  ORDER_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

export const INVOICE_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<InvoiceStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "idle", label: "입력 전", toneClassName: "neutral" },
  { value: "ready", label: "전송 전", toneClassName: "ready" },
  { value: "pending", label: "송장 전송 중", toneClassName: "progress" },
  { value: "failed", label: "전송 실패", toneClassName: "danger" },
  { value: "applied", label: "전송", toneClassName: "success" },
] as const;

export const ORDER_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<OrderStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "ACCEPT", label: "주문접수", toneClassName: "progress" },
  { value: "INSTRUCT", label: "상품준비중", toneClassName: "progress" },
  { value: "DEPARTURE", label: "출고완료", toneClassName: "progress" },
  { value: "DELIVERING", label: "배송중", toneClassName: "progress" },
  { value: "FINAL_DELIVERY", label: "배송완료", toneClassName: "success" },
  { value: "NONE_TRACKING", label: "추적없음", toneClassName: "attention" },
] as const;

export const OUTPUT_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<OutputStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "notExported", label: "미출력", toneClassName: "ready" },
  { value: "exported", label: "출력 완료", toneClassName: "success" },
] as const;

export const SELPICK_ORDER_NUMBER_PATTERN = /^O\d{8}[A-Z0-9]\d{4}$/i;

const SEOUL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const EDITABLE_COLUMN_KEY_SET = new Set<string>(EDITABLE_COLUMN_KEYS);
const INVOICE_INPUT_SOURCE_KEY_SET = new Set<string>(INVOICE_INPUT_SOURCE_KEYS);

export function isEditableSourceKey(
  sourceKey: ShipmentColumnSourceKey,
): sourceKey is EditableColumnKey {
  return EDITABLE_COLUMN_KEY_SET.has(sourceKey);
}

export function isInvoiceInputSourceKey(
  sourceKey: ShipmentColumnSourceKey,
): sourceKey is EditableColumnKey {
  return INVOICE_INPUT_SOURCE_KEY_SET.has(sourceKey);
}

export function isGridEditableSourceKey(
  sourceKey: ShipmentColumnSourceKey,
  worksheetMode: "default" | "invoice",
): sourceKey is EditableColumnKey {
  return worksheetMode === "invoice"
    ? isInvoiceInputSourceKey(sourceKey)
    : isEditableSourceKey(sourceKey);
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

export function createDefaultFilters(): FilterState {
  return {
    selectedStoreId: "",
    createdAtFrom: defaultSeoulDate(-3),
    createdAtTo: defaultSeoulDate(0),
    query: "",
    maxPerPage: 20,
    scope: "dispatch_active",
    decisionStatus: "all",
    invoiceStatusCard: "all",
    orderStatusCard: "all",
    outputStatusCard: "all",
  };
}

export function normalizeFiltersToSeoulToday(current: FilterState): FilterState {
  const today = defaultSeoulDate(0);
  const fallbackFrom = defaultSeoulDate(-3);
  const normalizedFrom = current.createdAtFrom.trim() || fallbackFrom;

  return {
    ...current,
    createdAtFrom: normalizedFrom.localeCompare(today) <= 0 ? normalizedFrom : today,
    createdAtTo: today,
    scope: current.scope ?? "dispatch_active",
    decisionStatus: current.decisionStatus ?? "all",
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
    left.scope === right.scope &&
    left.decisionStatus === right.decisionStatus &&
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

export function createShipmentColumnConfig(
  sourceKey: ShipmentColumnSourceKey,
): ShipmentColumnConfig {
  return {
    id: createShipmentColumnId(),
    sourceKey,
    label: SHIPMENT_COLUMN_LABELS[sourceKey],
  };
}

export function createDefaultShipmentColumnConfigs() {
  return DEFAULT_SHIPMENT_COLUMN_ORDER.map((sourceKey) => createShipmentColumnConfig(sourceKey));
}

function isShipmentColumnSourceKey(value: unknown): value is ShipmentColumnSourceKey {
  return typeof value === "string" && value in SHIPMENT_COLUMN_LABELS;
}

export function normalizeShipmentColumnConfigs(value: ShipmentColumnConfig[]) {
  const items = Array.isArray(value)
    ? value
        .filter(
          (item): item is ShipmentColumnConfig =>
            Boolean(item) && isShipmentColumnSourceKey(item.sourceKey),
        )
        .map((item) => ({
          id: item.id || createShipmentColumnId(),
          sourceKey: item.sourceKey,
          label: item.label?.trim() || SHIPMENT_COLUMN_LABELS[item.sourceKey],
        }))
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

  const modeLabel = sheet.syncSummary.mode === "full" ? "전체 재동기화" : "빠른 수집";
  const scopeLabel =
    sheet.syncSummary.fetchCreatedAtFrom && sheet.syncSummary.fetchCreatedAtTo
      ? `${sheet.syncSummary.fetchCreatedAtFrom} ~ ${sheet.syncSummary.fetchCreatedAtTo}`
      : "범위 정보 없음";
  const statusLabel =
    ORDER_STATUS_LABEL_BY_VALUE.get(sheet.syncSummary.statusFilter ?? "") ??
    sheet.syncSummary.statusFilter ??
    "전체 상태";

  return {
    title: "최근 수집",
    message:
      `${modeLabel}${sheet.syncSummary.autoExpanded ? " (자동 확장)" : ""} · ` +
      `범위 ${scopeLabel} · 상태 ${statusLabel} · ` +
      `추가 ${sheet.syncSummary.insertedCount}건 · 갱신 ${sheet.syncSummary.updatedCount}건 · ` +
      `조회 ${sheet.syncSummary.fetchedCount}건`,
  };
}
