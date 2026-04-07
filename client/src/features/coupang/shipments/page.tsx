import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { RefreshCcw } from "lucide-react";
import {
  type CellClickArgs,
  DataGrid,
  SelectColumn,
  type CellSelectArgs,
  type RenderEditCellProps,
  type RowsChangeData,
  type SortColumn,
  textEditor,
} from "react-data-grid";
import {
  COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE,
  isCoupangInvoiceAlreadyProcessedResult,
  type CoupangBatchActionResponse,
  type CoupangExchangeDetail,
  type CoupangExchangeRow,
  type CoupangInvoiceTarget,
  type CoupangReturnDetail,
  type CoupangReturnRow,
  type CoupangShipmentInvoiceTransmissionStatus,
  type CoupangShipmentWorksheetDetailResponse,
  type CoupangShipmentWorksheetResponse,
  type CoupangShipmentWorksheetRow,
  type PatchCoupangShipmentWorksheetItemInput,
} from "@shared/coupang";
import { OrderTicketSection, TicketInfoTable } from "@/components/order-ticket-sections";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import {
  buildShipmentQuickFilterResult,
  canSendInvoiceRow,
  getInvoiceStatusCardKey,
  isSameInvoicePayload,
  normalizeInvoiceStatusCardKey,
  normalizeOrderStatusCardKey,
  normalizeOutputStatusCardKey,
  pruneShipmentSelectedRowIds,
  type InvoiceStatusCardKey,
  type OrderStatusCardKey,
  type OutputStatusCardKey,
} from "@/lib/coupang-shipment-quick-filters";
import {
  formatShipmentWorksheetCustomerServiceLabel,
  getCoupangCustomerServiceToneClass,
  getCoupangCustomerServiceStateText,
  getShipmentWorksheetCustomerServiceSearchText,
  hasResolvedCoupangCustomerServiceSnapshot,
  hasCoupangCustomerServiceIssue,
  resolvePreferredCoupangCustomerServiceSnapshot,
  type CoupangCustomerServiceSnapshot,
} from "@/lib/coupang-customer-service";
import {
  formatCoupangOrderStatusLabel,
  getCoupangOrderStatusToneClass,
  resolveCoupangDisplayOrderStatus,
} from "@/lib/coupang-order-status";
import { parseCoupangInvoicePopupInput } from "@/lib/coupang-invoice-input";
import { parseSpreadsheetClipboardMatrix } from "@/lib/spreadsheet-grid";
import { apiRequestJson, getJson, queryClient } from "@/lib/queryClient";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatNumber } from "@/lib/utils";
import {
  buildFailureDetails,
  buildInvoiceIdentity,
  buildInvoiceTransmissionGroupKey,
  buildInvoiceTransmissionGroupLabel,
  buildInvoiceTransmissionPayloadSignature,
  buildResultSummary,
  buildWorksheetPatchItem,
  combineBatchResults,
  formatInvoicePayloadText,
  normalizeRepeatedInvoiceBatchResult,
  resolveInvoiceTransmissionMode,
  resolveRepeatedInvoiceMessage,
  shouldPreserveSucceededInvoiceState,
  toInvoiceTarget,
  validateInvoiceRow,
} from "./shipment-actions";
import {
  summarizeWorksheetMessage,
  summarizeWorksheetSync,
} from "./worksheet-config";
import {
  buildShipmentGridColumns,
  getEditableColumnIds,
  stripWorksheetPasteHeaderRow,
} from "./worksheet-grid-config";
import {
  looksLikeInvoiceClipboard,
  parseInvoiceClipboardRows,
} from "./worksheet-clipboard";
import type {
  CoupangStoresResponse,
  EditableColumnKey,
  FeedbackState,
  FilterState,
  SelectedCellState,
  ShipmentActivityItem,
  ShipmentColumnConfig,
  ShipmentColumnSourceKey,
  ShipmentExcelExportScope,
  ShipmentExcelSortKey,
  WorksheetMode,
} from "./types";

type InvoiceTransmissionMode = "upload" | "update";
const SHIPMENT_WORKSHEET_PAGE_SIZE_OPTIONS = [50, 100, 200] as const;

type QuickFilterCardOption<TValue extends string> = {
  value: TValue;
  label: string;
  toneClassName: string;
};

const EDITABLE_COLUMN_KEYS: EditableColumnKey[] = [
  "receiverName",
  "deliveryCompanyCode",
  "invoiceNumber",
  "deliveryRequest",
];
const EDITABLE_COLUMN_KEY_SET = new Set<string>(EDITABLE_COLUMN_KEYS);
const INVOICE_INPUT_SOURCE_KEYS = ["deliveryCompanyCode", "invoiceNumber"] as const satisfies readonly EditableColumnKey[];
const INVOICE_INPUT_SOURCE_KEY_SET = new Set<string>(INVOICE_INPUT_SOURCE_KEYS);
const CURRENCY_FORMATTER = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const DEFAULT_SHIPMENT_COLUMN_ORDER: ShipmentColumnSourceKey[] = [
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
const SHIPMENT_COLUMN_LABELS: Record<ShipmentColumnSourceKey, string> = {
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
  productOptionNumber: "상품옵션번호",
  sellerProductCode: "판매자상품코드",
};
const SHIPMENT_COLUMN_DEFAULT_WIDTHS: Record<ShipmentColumnSourceKey, number> = {
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
  productOptionNumber: 130,
  sellerProductCode: 160,
};
const ORDER_STATUS_OPTIONS = [
  { value: "", label: "전체 상태" },
  { value: "ACCEPT", label: "주문접수" },
  { value: "INSTRUCT", label: "상품준비중" },
  { value: "DEPARTURE", label: "출고완료" },
  { value: "DELIVERING", label: "배송중" },
  { value: "FINAL_DELIVERY", label: "배송완료" },
  { value: "NONE_TRACKING", label: "추적없음" },
] as const;
const SHIPMENT_COLUMN_SOURCE_OPTIONS: ShipmentColumnSourceKey[] = [
  "blank",
  ...DEFAULT_SHIPMENT_COLUMN_ORDER,
];
const INVOICE_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<InvoiceStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "idle", label: "입력 전", toneClassName: "neutral" },
  { value: "ready", label: "전송 전", toneClassName: "ready" },
  { value: "pending", label: "송장 전송 중", toneClassName: "progress" },
  { value: "failed", label: "전송 실패", toneClassName: "danger" },
  { value: "applied", label: "전송", toneClassName: "success" },
] as const;
const ORDER_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<OrderStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "ACCEPT", label: "주문접수", toneClassName: "progress" },
  { value: "INSTRUCT", label: "상품준비중", toneClassName: "progress" },
  { value: "DEPARTURE", label: "출고완료", toneClassName: "progress" },
  { value: "DELIVERING", label: "배송중", toneClassName: "progress" },
  { value: "FINAL_DELIVERY", label: "배송완료", toneClassName: "success" },
  { value: "NONE_TRACKING", label: "추적없음", toneClassName: "attention" },
  { value: "SHIPMENT_STOP_REQUESTED", label: "출고중지 요청", toneClassName: "danger" },
  { value: "SHIPMENT_STOP_HANDLED", label: "출고중지완료", toneClassName: "attention" },
  { value: "CANCEL", label: "취소", toneClassName: "danger" },
  { value: "RETURN", label: "반품", toneClassName: "danger" },
  { value: "EXCHANGE", label: "교환", toneClassName: "attention" },
] as const;
const OUTPUT_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<OutputStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "notExported", label: "미출력", toneClassName: "ready" },
  { value: "exported", label: "출력 완료", toneClassName: "success" },
] as const;
const SELPICK_ORDER_NUMBER_PATTERN = /^O\d{8}[A-Z0-9]\d{4}$/i;
const SEOUL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

function createDefaultFilters(): FilterState {
  return {
    selectedStoreId: "",
    status: "",
    createdAtFrom: defaultSeoulDate(-3),
    createdAtTo: defaultSeoulDate(0),
    query: "",
    maxPerPage: 20,
    invoiceStatusCard: "all",
    orderStatusCard: "all",
    outputStatusCard: "all",
  };
}

function normalizeFiltersToSeoulToday(current: FilterState): FilterState {
  const today = defaultSeoulDate(0);
  const fallbackFrom = defaultSeoulDate(-3);
  const normalizedFrom = current.createdAtFrom.trim() || fallbackFrom;

  return {
    ...current,
    createdAtFrom: normalizedFrom.localeCompare(today) <= 0 ? normalizedFrom : today,
    createdAtTo: today,
    invoiceStatusCard: normalizeInvoiceStatusCardKey(current.invoiceStatusCard),
    orderStatusCard: normalizeOrderStatusCardKey(current.orderStatusCard),
    outputStatusCard: normalizeOutputStatusCardKey(current.outputStatusCard),
  };
}

function areFiltersEqual(left: FilterState, right: FilterState) {
  return (
    left.selectedStoreId === right.selectedStoreId &&
    left.status === right.status &&
    left.createdAtFrom === right.createdAtFrom &&
    left.createdAtTo === right.createdAtTo &&
    left.query === right.query &&
    left.maxPerPage === right.maxPerPage &&
    left.invoiceStatusCard === right.invoiceStatusCard &&
    left.orderStatusCard === right.orderStatusCard &&
    left.outputStatusCard === right.outputStatusCard
  );
}

function buildWorksheetUrl(storeId: string) {
  return `/api/coupang/shipments/worksheet?storeId=${encodeURIComponent(storeId)}`;
}

function buildShipmentWorksheetDetailUrl(
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

function makeColumnId() {
  return `shipment-column-${Math.random().toString(36).slice(2, 10)}`;
}

function createShipmentColumnConfig(sourceKey: ShipmentColumnSourceKey): ShipmentColumnConfig {
  return {
    id: makeColumnId(),
    sourceKey,
    label: SHIPMENT_COLUMN_LABELS[sourceKey],
  };
}

function createDefaultShipmentColumnConfigs() {
  return DEFAULT_SHIPMENT_COLUMN_ORDER.map((sourceKey) => createShipmentColumnConfig(sourceKey));
}

function isShipmentColumnSourceKey(value: unknown): value is ShipmentColumnSourceKey {
  return typeof value === "string" && value in SHIPMENT_COLUMN_LABELS;
}

function normalizeShipmentColumnConfigs(value: ShipmentColumnConfig[]) {
  const items = Array.isArray(value)
    ? value
        .filter(
          (item): item is ShipmentColumnConfig =>
            Boolean(item) && isShipmentColumnSourceKey(item.sourceKey),
        )
        .map((item) => ({
          id: item.id || makeColumnId(),
          sourceKey: item.sourceKey,
          label: item.label?.trim() || SHIPMENT_COLUMN_LABELS[item.sourceKey],
        }))
    : [];

  return items.length ? items : createDefaultShipmentColumnConfigs();
}

function moveColumnConfigs(
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

function normalizeText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
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
  const normalizedBaseName = normalizeText(baseName) ?? "-";
  const normalizedCode = normalizePersonalClearanceCode(personalClearanceCode);

  if (!isOverseas || !normalizedCode) {
    return normalizedBaseName;
  }

  return `${normalizedBaseName}_${normalizedCode}`;
}

function applyReceiverEdit(row: CoupangShipmentWorksheetRow, nextValue: unknown) {
  const normalizedValue = normalizeText(String(nextValue ?? ""));

  if (!row.isOverseas) {
    return {
      ...row,
      receiverName: normalizedValue ?? "-",
      receiverBaseName: normalizedValue ?? null,
      personalClearanceCode: null,
    };
  }

  if (!normalizedValue) {
    return {
      ...row,
      receiverName: composeReceiverName(row.receiverBaseName, null, true),
      receiverBaseName: row.receiverBaseName,
      personalClearanceCode: null,
    };
  }

  const delimiterIndex = normalizedValue.lastIndexOf("_");
  if (delimiterIndex <= 0 || delimiterIndex === normalizedValue.length - 1) {
    return {
      ...row,
      receiverName: composeReceiverName(normalizedValue, null, true),
      receiverBaseName: normalizedValue,
      personalClearanceCode: null,
    };
  }

  const baseName = normalizedValue.slice(0, delimiterIndex).trim();
  const personalClearanceCode = normalizePersonalClearanceCode(
    normalizedValue.slice(delimiterIndex + 1),
  );

  return {
    ...row,
    receiverName: composeReceiverName(baseName, personalClearanceCode, true),
    receiverBaseName: normalizeText(baseName),
    personalClearanceCode,
  };
}

function applyEditableCell(
  row: CoupangShipmentWorksheetRow,
  columnKey: EditableColumnKey,
  nextValue: unknown,
) {
  const normalizedText = String(nextValue ?? "");
  switch (columnKey) {
    case "receiverName":
      return applyReceiverEdit(row, nextValue);
    case "deliveryCompanyCode": {
      const deliveryCompanyCode = normalizedText.trim();
      if (deliveryCompanyCode === row.deliveryCompanyCode) {
        return row;
      }

      return {
        ...row,
        deliveryCompanyCode,
        invoiceTransmissionStatus: null,
        invoiceTransmissionMessage: null,
        invoiceTransmissionAt: null,
        invoiceAppliedAt: null,
      };
    }
    case "invoiceNumber": {
      const invoiceNumber = normalizedText.trim();
      if (invoiceNumber === row.invoiceNumber) {
        return row;
      }

      return {
        ...row,
        invoiceNumber,
        invoiceTransmissionStatus: null,
        invoiceTransmissionMessage: null,
        invoiceTransmissionAt: null,
        invoiceAppliedAt: null,
      };
    }
    case "deliveryRequest":
      return {
        ...row,
        deliveryRequest: normalizeText(normalizedText),
      };
    default:
      return row;
  }
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return CURRENCY_FORMATTER.format(value);
}

function formatExportCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }

  return CURRENCY_FORMATTER.format(value);
}

function formatText(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function formatExportText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized === "-") {
    return "";
  }

  return normalized;
}

function compareShipmentSortValues(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
) {
  if (left === right) {
    return 0;
  }

  if (left === null || left === undefined || left === "") {
    return 1;
  }

  if (right === null || right === undefined || right === "") {
    return -1;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
}

function getShipmentSortValue(
  row: CoupangShipmentWorksheetRow,
  columnKey: string,
  columnConfigs: readonly ShipmentColumnConfig[],
) {
  if (columnKey === "__exportStatus") {
    return row.exportedAt ? 1 : 0;
  }

  if (columnKey === "__orderStatus") {
    const presentation = getWorksheetStatusPresentation(row);
    const hasCustomerServiceIssue = hasCoupangCustomerServiceIssue({
      summary: row.customerServiceIssueSummary,
      count: row.customerServiceIssueCount,
      breakdown: row.customerServiceIssueBreakdown,
    });
    const customerServiceSortKey =
      hasCustomerServiceIssue ? "0" : row.customerServiceState === "unknown" ? "2" : "1";
    return `${customerServiceSortKey}:${presentation.orderLabel}:${presentation.customerServiceIssueSummary ?? ""}`;
  }

  if (columnKey === "__invoiceTransmissionStatus") {
    return getInvoiceTransmissionPresentation(row).label;
  }

  const config = columnConfigs.find((item) => item.id === columnKey);
  if (!config) {
    return null;
  }

  switch (config.sourceKey) {
    case "blank":
      return null;
    case "quantity":
      return row.quantity;
    case "salePrice":
      return row.salePrice;
    case "shippingFee":
      return row.shippingFee;
    case "orderDateText":
      return row.orderDateKey;
    default:
      return row[config.sourceKey] as string | null | undefined;
  }
}

function sortShipmentRows(
  rows: CoupangShipmentWorksheetRow[],
  sortColumns: readonly SortColumn[] = [],
  columnConfigs: readonly ShipmentColumnConfig[] = [],
) {
  if (!sortColumns.length) {
    return rows.slice();
  }

  const [sortColumn] = sortColumns;
  const direction = sortColumn.direction === "DESC" ? -1 : 1;

  return rows.slice().sort((left, right) => {
    const compared = compareShipmentSortValues(
      getShipmentSortValue(left, sortColumn.columnKey, columnConfigs),
      getShipmentSortValue(right, sortColumn.columnKey, columnConfigs),
    );

    if (compared !== 0) {
      return compared * direction;
    }

    return left.id.localeCompare(right.id);
  });
}

function renderTextCell(value: string | null | undefined) {
  const display = formatText(value);
  return (
    <div className="shipment-cell" title={display}>
      {display}
    </div>
  );
}

function isEditableSourceKey(sourceKey: ShipmentColumnSourceKey): sourceKey is EditableColumnKey {
  return EDITABLE_COLUMN_KEY_SET.has(sourceKey);
}

function isGridEditableSourceKey(
  sourceKey: ShipmentColumnSourceKey,
  worksheetMode: WorksheetMode,
): sourceKey is EditableColumnKey {
  return worksheetMode === "invoice"
    ? isInvoiceInputSourceKey(sourceKey)
    : isEditableSourceKey(sourceKey);
}

function formatDateTimeText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLabel(value: string | null | undefined) {
  const text = formatDateTimeText(value);
  return text || "-";
}

function formatJoinedText(values: Array<string | null | undefined>, separator = " / ") {
  const parts = values.map((value) => formatExportText(value)).filter(Boolean);
  return parts.length ? parts.join(separator) : "-";
}

function formatAddressText(values: Array<string | null | undefined>) {
  const parts = values.map((value) => formatExportText(value)).filter(Boolean);
  return parts.length ? parts.join(" ") : "-";
}

function formatClaimReasonText(
  reason: string | null | undefined,
  reasonCode: string | null | undefined,
  reasonDetail?: string | null | undefined,
) {
  const parts = [formatExportText(reason), formatExportText(reasonCode), formatExportText(reasonDetail)].filter(
    (value, index, array) => Boolean(value) && array.indexOf(value) === index,
  );
  return parts.length ? parts.join(" / ") : "-";
}

function formatActionsText(values: string[]) {
  return values.length ? values.join(" · ") : "없음";
}

function buildReturnActionLabels(
  row: Pick<
    CoupangReturnRow,
    | "canMarkShipmentStopped"
    | "canMarkAlreadyShipped"
    | "canApproveReturn"
    | "canConfirmInbound"
    | "canUploadCollectionInvoice"
  >,
) {
  const labels: string[] = [];

  if (row.canMarkShipmentStopped) {
    labels.push("출고 중지");
  }
  if (row.canMarkAlreadyShipped) {
    labels.push("이미 출고됨");
  }
  if (row.canApproveReturn) {
    labels.push("반품 승인");
  }
  if (row.canConfirmInbound) {
    labels.push("입고 확인");
  }
  if (row.canUploadCollectionInvoice) {
    labels.push("회수 송장 등록");
  }

  return labels;
}

function buildExchangeActionLabels(
  row: Pick<CoupangExchangeRow, "canConfirmInbound" | "canReject" | "canUploadExchangeInvoice">,
) {
  const labels: string[] = [];

  if (row.canConfirmInbound) {
    labels.push("입고 확인");
  }
  if (row.canReject) {
    labels.push("교환 반려");
  }
  if (row.canUploadExchangeInvoice) {
    labels.push("교환 송장 등록");
  }

  return labels;
}

function formatReturnDeliverySummary(detail: CoupangReturnDetail | null, row: CoupangReturnRow | null) {
  const deliveries =
    detail?.deliveries
      .map((delivery) =>
        [
          formatExportText(delivery.returnExchangeDeliveryType),
          formatExportText(delivery.deliveryCompanyCode),
          formatExportText(delivery.deliveryInvoiceNo),
          formatExportText(delivery.regNumber),
        ]
          .filter(Boolean)
          .join(" / "),
      )
      .filter(Boolean) ?? [];

  if (deliveries.length) {
    return deliveries.join("\n");
  }

  return formatJoinedText([row?.deliveryCompanyCode, row?.deliveryInvoiceNo]);
}

function formatExchangeInvoiceSummary(
  detail: CoupangExchangeDetail | null,
  row: CoupangExchangeRow | null,
) {
  const invoices =
    detail?.invoices
      .map((invoice) =>
        [
          formatExportText(invoice.shipmentBoxId),
          formatExportText(invoice.deliverCode),
          formatExportText(invoice.invoiceNumber),
          formatExportText(invoice.statusCode),
        ]
          .filter(Boolean)
          .join(" / "),
      )
      .filter(Boolean) ?? [];

  if (invoices.length) {
    return invoices.join("\n");
  }

  return formatJoinedText([row?.deliverCode, row?.invoiceNumber]);
}

function renderExportStatusCell(row: CoupangShipmentWorksheetRow) {
  const exported = Boolean(row.exportedAt);
  const label = exported ? "출력 완료" : "미출력";
  const title = exported
    ? `${label} · ${formatDateTimeText(row.exportedAt)}`
    : "아직 엑셀로 출력하지 않았습니다.";

  return (
    <div className="shipment-cell" title={title}>
      <StatusBadge tone={exported ? "live" : "draft"} label={label} />
    </div>
  );
}

function getShipmentExcelSortLabel(sortKey: ShipmentExcelSortKey) {
  return sortKey === "productName" ? "상품명순" : "날짜순";
}

function getShipmentExcelExportScopeLabel(scope: ShipmentExcelExportScope) {
  return scope === "selected" ? "선택 행" : "미출력건 전체";
}

type ShipmentCustomerServiceCarrier = CoupangCustomerServiceSnapshot;

type ShipmentStatusCarrier = ShipmentCustomerServiceCarrier &
  Pick<CoupangShipmentWorksheetRow, "orderStatus">;

function hasSameShipmentCustomerServiceSnapshot(
  row: Pick<
    CoupangShipmentWorksheetRow,
    | "customerServiceIssueCount"
    | "customerServiceIssueSummary"
    | "customerServiceIssueBreakdown"
    | "customerServiceState"
    | "customerServiceFetchedAt"
  >,
  snapshot: ShipmentCustomerServiceCarrier,
  fetchedAt: string | null,
) {
  if (
    row.customerServiceIssueCount !== snapshot.customerServiceIssueCount ||
    row.customerServiceIssueSummary !== snapshot.customerServiceIssueSummary ||
    row.customerServiceState !== snapshot.customerServiceState ||
    row.customerServiceFetchedAt !== fetchedAt ||
    row.customerServiceIssueBreakdown.length !== snapshot.customerServiceIssueBreakdown.length
  ) {
    return false;
  }

  return row.customerServiceIssueBreakdown.every((item, index) => {
    const nextItem = snapshot.customerServiceIssueBreakdown[index];
    return (
      item?.type === nextItem?.type &&
      item?.count === nextItem?.count &&
      item?.label === nextItem?.label
    );
  });
}

function hasShipmentClaimIssue(
  row: Pick<ShipmentCustomerServiceCarrier, "customerServiceIssueSummary" | "customerServiceIssueCount" | "customerServiceIssueBreakdown">,
) {
  return hasCoupangCustomerServiceIssue({
    summary: row.customerServiceIssueSummary,
    count: row.customerServiceIssueCount,
    breakdown: row.customerServiceIssueBreakdown,
  });
}

function getShipmentClaimSummary(
  row: Pick<
    ShipmentStatusCarrier,
    "orderStatus" | "customerServiceIssueSummary" | "customerServiceIssueCount" | "customerServiceIssueBreakdown"
  >,
) {
  const summary = (row.customerServiceIssueSummary ?? "").trim();
  if (summary) {
    return summary;
  }

  return formatOrderStatusLabel(resolveWorksheetOrderStatus(row));
}

function buildInvoiceClaimBlockedDetails(
  rows: Array<
    Pick<
      CoupangShipmentWorksheetRow,
      | "orderStatus"
      | "orderId"
      | "shipmentBoxId"
      | "customerServiceIssueSummary"
      | "customerServiceIssueCount"
      | "customerServiceIssueBreakdown"
    >
  >,
) {
  return rows.map(
    (row) =>
      `주문 ${row.orderId || "-"} / 배송 ${row.shipmentBoxId || "-"} / ${getShipmentClaimSummary(row)}`,
  );
}

function sortShipmentRowsForExcelExport(
  rows: readonly CoupangShipmentWorksheetRow[],
  sortKey: ShipmentExcelSortKey,
) {
  return rows.slice().sort((left, right) => {
    if (sortKey === "productName") {
      const productCompared = compareShipmentSortValues(
        left.exposedProductName ?? left.productName,
        right.exposedProductName ?? right.productName,
      );
      if (productCompared !== 0) {
        return productCompared;
      }

      const optionCompared = compareShipmentSortValues(left.optionName, right.optionName);
      if (optionCompared !== 0) {
        return optionCompared;
      }
    } else {
      const dateCompared = compareShipmentSortValues(
        left.orderedAtRaw ?? left.orderDateKey ?? left.orderDateText,
        right.orderedAtRaw ?? right.orderDateKey ?? right.orderDateText,
      );
      if (dateCompared !== 0) {
        return dateCompared;
      }
    }

    const fallbackCompared = compareShipmentSortValues(left.selpickOrderNumber, right.selpickOrderNumber);
    if (fallbackCompared !== 0) {
      return fallbackCompared;
    }

    return left.id.localeCompare(right.id);
  });
}

function formatOrderStatusLabel(value: string | null | undefined) {
  return formatCoupangOrderStatusLabel(value);
}

function getOrderStatusToneClass(value: string | null | undefined) {
  return getCoupangOrderStatusToneClass(value);
}

function resolveWorksheetOrderStatus(
  row: Pick<ShipmentStatusCarrier, "orderStatus" | "customerServiceIssueBreakdown" | "customerServiceIssueSummary">,
) {
  return resolveCoupangDisplayOrderStatus({
    orderStatus: row.orderStatus,
    customerServiceIssueBreakdown: row.customerServiceIssueBreakdown,
    customerServiceIssueSummary: row.customerServiceIssueSummary,
  });
}

function getWorksheetStatusPresentation(row: ShipmentStatusCarrier) {
  const resolvedOrderStatus = resolveWorksheetOrderStatus(row);
  const orderLabel = formatOrderStatusLabel(resolvedOrderStatus);
  const hasCustomerServiceIssue = hasCoupangCustomerServiceIssue({
    summary: row.customerServiceIssueSummary,
    count: row.customerServiceIssueCount,
    breakdown: row.customerServiceIssueBreakdown,
  });
  const customerServiceLabel = formatShipmentWorksheetCustomerServiceLabel({
    summary: row.customerServiceIssueSummary,
    count: row.customerServiceIssueCount,
    state: row.customerServiceState,
    breakdown: row.customerServiceIssueBreakdown,
  });
  const customerServiceToneClass = getCoupangCustomerServiceToneClass({
    summary: row.customerServiceIssueSummary,
    breakdown: row.customerServiceIssueBreakdown,
  });
  const customerServiceIssueSummary = hasCustomerServiceIssue
    ? formatExportText(row.customerServiceIssueSummary) || null
    : null;
  const customerServiceStateText =
    hasCustomerServiceIssue && row.customerServiceState === "stale"
      ? getCoupangCustomerServiceStateText(row.customerServiceState)
      : null;
  const title = [orderLabel, customerServiceStateText, customerServiceLabel, customerServiceIssueSummary]
    .filter(Boolean)
    .join(" · ");

  return {
    orderLabel,
    orderToneClassName: getOrderStatusToneClass(resolvedOrderStatus),
    customerServiceLabel,
    customerServiceToneClass,
    customerServiceIssueSummary,
    customerServiceStateText,
    title: title || orderLabel,
  };
}

function renderOrderStatusCell(row: CoupangShipmentWorksheetRow) {
  const presentation = getWorksheetStatusPresentation(row);

  return (
    <div className="shipment-cell shipment-status-cell" title={presentation.title}>
      <div className="shipment-status-badges">
        <span className={`status-pill ${presentation.orderToneClassName}`}>
          {presentation.orderLabel}
        </span>
        {presentation.customerServiceLabel ? (
          <span className={`status-pill ${presentation.customerServiceToneClass}`}>
            {presentation.customerServiceLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function isInvoiceInputSourceKey(sourceKey: ShipmentColumnSourceKey): sourceKey is EditableColumnKey {
  return INVOICE_INPUT_SOURCE_KEY_SET.has(sourceKey);
}

function getInvoiceTransmissionPresentation(row: CoupangShipmentWorksheetRow) {
  switch (getInvoiceStatusCardKey(row)) {
    case "pending":
      return {
        label: "송장 전송 중",
        toneClassName: "shipment-transmission-status pending",
      };
    case "applied":
      return {
        label: "전송",
        toneClassName: "shipment-transmission-status succeeded",
      };
    case "failed":
      return {
        label: "전송 실패",
        toneClassName: "shipment-transmission-status failed",
      };
    case "ready":
      return {
        label: "전송 전",
        toneClassName: "shipment-transmission-status ready",
      };
    case "idle":
    default:
      return {
        label: "입력 전",
        toneClassName: "shipment-transmission-status idle",
      };
  }
}

function renderInvoiceTransmissionStatusCell(row: CoupangShipmentWorksheetRow) {
  const presentation = getInvoiceTransmissionPresentation(row);
  const titleParts = [presentation.label];
  if (row.invoiceTransmissionMessage) {
    titleParts.push(row.invoiceTransmissionMessage);
  } else if (row.invoiceTransmissionAt) {
    titleParts.push(formatDateTimeText(row.invoiceTransmissionAt));
  }

  const title = titleParts.join(" · ");

  return (
    <div className="shipment-cell" title={title}>
      <span className={presentation.toneClassName}>{presentation.label}</span>
    </div>
  );
}

function renderShipmentEditCell(
  props: RenderEditCellProps<CoupangShipmentWorksheetRow>,
  sourceKey: EditableColumnKey,
) {
  const editorRow = {
    ...props.row,
    [props.column.key]: (props.row[sourceKey] ?? "") as string | null,
  } as CoupangShipmentWorksheetRow & Record<string, string | null>;

  return textEditor({
    ...props,
    row: editorRow,
    onRowChange: (nextRow, commitChanges) =>
      props.onRowChange(
        applyEditableCell(props.row, sourceKey, nextRow[props.column.key as keyof typeof nextRow]),
        commitChanges,
      ),
  });
}

function renderShipmentColumnValue(
  row: CoupangShipmentWorksheetRow,
  sourceKey: ShipmentColumnSourceKey,
): ReactNode {
  switch (sourceKey) {
    case "blank":
      return renderTextCell(null);
    case "quantity":
      return formatNumber(row.quantity);
    case "salePrice":
      return formatCurrency(row.salePrice);
    case "shippingFee":
      return formatCurrency(row.shippingFee);
    default:
      return renderTextCell(row[sourceKey] as string | null | undefined);
  }
}

function getShipmentExportValue(row: CoupangShipmentWorksheetRow, sourceKey: ShipmentColumnSourceKey) {
  switch (sourceKey) {
    case "blank":
      return "";
    case "quantity":
      return row.quantity ?? "";
    case "salePrice":
      return formatExportCurrency(row.salePrice);
    case "shippingFee":
      return formatExportCurrency(row.shippingFee);
    default:
      return formatExportText(row[sourceKey] as string | null | undefined);
  }
}

function matchesQuery(row: CoupangShipmentWorksheetRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const invoiceStatusLabel = getInvoiceTransmissionPresentation(row).label;

  return [
    row.orderDateText,
    row.orderStatus,
    resolveWorksheetOrderStatus(row),
    formatOrderStatusLabel(resolveWorksheetOrderStatus(row)),
    invoiceStatusLabel,
    getShipmentWorksheetCustomerServiceSearchText(row),
    row.productName,
    row.optionName,
    row.productOrderNumber,
    row.ordererName,
    row.contact,
    row.receiverName,
    row.collectedAccountName,
    row.deliveryCompanyCode,
    row.selpickOrderNumber,
    row.invoiceNumber,
    row.receiverAddress,
    row.deliveryRequest,
    row.buyerPhoneNumber,
    row.productNumber,
    row.exposedProductName,
    row.productOptionNumber,
    row.sellerProductCode,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function renderOverlayInBody(content: ReactNode) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(content, document.body);
}

export default function CoupangShipmentsPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const defaultFilters = useMemo(() => createDefaultFilters(), []);
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "coupang.shipments",
    defaultFilters,
  );
  const [sheetSnapshot, setSheetSnapshot] = useState<CoupangShipmentWorksheetResponse | null>(null);
  const [draftRows, setDraftRows] = useState<CoupangShipmentWorksheetRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<ReadonlySet<string>>(() => new Set());
  const [dirtySourceKeys, setDirtySourceKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);
  const [selectedCell, setSelectedCell] = useState<SelectedCellState>(null);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"worksheet" | "settings">("worksheet");
  const [worksheetMode, setWorksheetMode] = useState<WorksheetMode>("default");
  const [worksheetPageSize, setWorksheetPageSize] = usePersistentState<number>(
    "kikit:coupang-shipments:worksheet-page-size",
    50,
  );
  const [worksheetPage, setWorksheetPage] = useState(1);
  const [isInvoiceInputDialogOpen, setIsInvoiceInputDialogOpen] = useState(false);
  const [invoiceInputDialogValue, setInvoiceInputDialogValue] = useState("");
  const [isExcelSortDialogOpen, setIsExcelSortDialogOpen] = useState(false);
  const [excelExportScope, setExcelExportScope] = useState<ShipmentExcelExportScope>("selected");
  const [draggingConfigId, setDraggingConfigId] = useState<string | null>(null);
  const [columnConfigs, setColumnConfigs] = usePersistentState<ShipmentColumnConfig[]>(
    "kikit:coupang-shipments:columns",
    createDefaultShipmentColumnConfigs(),
  );
  const [columnWidths, setColumnWidths] = usePersistentState<Record<string, number>>(
    "kikit:layout:rdg:coupang-shipments",
    {},
  );

  useEffect(() => {
    if (!isFiltersLoaded) {
      return;
    }

    setFilters((current) => {
      const next = normalizeFiltersToSeoulToday(current);
      return areFiltersEqual(current, next) ? current : next;
    });
  }, [isFiltersLoaded, setFilters]);

  useEffect(() => {
    if (SHIPMENT_WORKSHEET_PAGE_SIZE_OPTIONS.includes(worksheetPageSize as 50 | 100 | 200)) {
      return;
    }

    setWorksheetPageSize(50);
  }, [setWorksheetPageSize, worksheetPageSize]);

  const storesQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const stores = storesQuery.data?.items ?? [];

  useEffect(() => {
    setColumnConfigs((current) => {
      const normalized = normalizeShipmentColumnConfigs(current);
      return JSON.stringify(normalized) === JSON.stringify(current) ? current : normalized;
    });
  }, [setColumnConfigs]);

  useEffect(() => {
    if (!isFiltersLoaded || filters.selectedStoreId || !stores[0]) {
      return;
    }

    setFilters((current) => ({
      ...current,
      selectedStoreId: stores[0].id,
    }));
  }, [filters.selectedStoreId, isFiltersLoaded, setFilters, stores]);

  const worksheetQuery = useQuery({
    queryKey: ["/api/coupang/shipments/worksheet", filters.selectedStoreId],
    queryFn: () =>
      getJson<CoupangShipmentWorksheetResponse>(buildWorksheetUrl(filters.selectedStoreId)),
    enabled: Boolean(filters.selectedStoreId),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  useEffect(() => {
    if (!worksheetQuery.data) {
      return;
    }

    setSheetSnapshot(worksheetQuery.data);
    setDraftRows(sortShipmentRows(worksheetQuery.data.items));
    setDirtySourceKeys(new Set());
  }, [worksheetQuery.data]);

  useEffect(() => {
    if (!filters.selectedStoreId) {
      setSheetSnapshot(null);
      setDraftRows([]);
      setSelectedRowIds(new Set());
      setDirtySourceKeys(new Set());
      setSelectedCell(null);
      setDetailRowId(null);
    }
  }, [filters.selectedStoreId]);

  useEffect(() => {
    if (activeTab !== "worksheet") {
      setDetailRowId(null);
    }
  }, [activeTab]);

  const activeSheet = sheetSnapshot ?? worksheetQuery.data ?? null;
  const deferredQuery = useDeferredValue(filters.query);
  const searchFilteredRows = useMemo(
    () => draftRows.filter((row) => matchesQuery(row, deferredQuery)),
    [deferredQuery, draftRows],
  );
  const quickFilterResult = useMemo(
    () =>
      buildShipmentQuickFilterResult(searchFilteredRows, {
        invoiceStatusCard: filters.invoiceStatusCard,
        orderStatusCard: filters.orderStatusCard,
        outputStatusCard: filters.outputStatusCard,
      }),
    [filters.invoiceStatusCard, filters.orderStatusCard, filters.outputStatusCard, searchFilteredRows],
  );
  const activeInvoiceStatusCard = quickFilterResult.state.invoiceStatusCard;
  const activeOrderStatusCard = quickFilterResult.state.orderStatusCard;
  const activeOutputStatusCard = quickFilterResult.state.outputStatusCard;
  const visibleRows = useMemo(
    () => sortShipmentRows(quickFilterResult.visibleRows, sortColumns, columnConfigs),
    [columnConfigs, quickFilterResult.visibleRows, sortColumns],
  );
  const worksheetTotalPages = Math.max(1, Math.ceil(visibleRows.length / worksheetPageSize));
  const pagedVisibleRows = useMemo(() => {
    const startIndex = (worksheetPage - 1) * worksheetPageSize;
    return visibleRows.slice(startIndex, startIndex + worksheetPageSize);
  }, [visibleRows, worksheetPage, worksheetPageSize]);
  const pageRowIdSet = useMemo(
    () => new Set(pagedVisibleRows.map((row) => row.id)),
    [pagedVisibleRows],
  );
  const pageSelectedRowIds = useMemo(
    () =>
      new Set(
        pagedVisibleRows
          .filter((row) => selectedRowIds.has(row.id))
          .map((row) => row.id),
      ),
    [pagedVisibleRows, selectedRowIds],
  );
  const selectedRows = useMemo(
    () => visibleRows.filter((row) => selectedRowIds.has(row.id)),
    [selectedRowIds, visibleRows],
  );
  const selectedInvoiceBlockedRows = useMemo(
    () => selectedRows.filter((row) => hasShipmentClaimIssue(row)),
    [selectedRows],
  );
  const notExportedRows = useMemo(
    () => draftRows.filter((row) => !row.exportedAt),
    [draftRows],
  );
  const dirtyCount = dirtySourceKeys.size;
  const dirtySet = useMemo(() => new Set(dirtySourceKeys), [dirtySourceKeys]);
  const invoiceReadyRows = useMemo(
    () => visibleRows.filter((row) => canSendInvoiceRow(row) && row.invoiceTransmissionStatus !== "pending"),
    [visibleRows],
  );
  const detailRow = useMemo(
    () => visibleRows.find((row) => row.id === detailRowId) ?? null,
    [detailRowId, visibleRows],
  );

  useEffect(() => {
    setSelectedRowIds((current) => pruneShipmentSelectedRowIds(current, visibleRows));
  }, [visibleRows]);

  useEffect(() => {
    setWorksheetPage((current) => Math.min(current, worksheetTotalPages));
  }, [worksheetTotalPages]);

  useEffect(() => {
    setSelectedCell(null);
  }, [worksheetPage]);

  const shipmentDetailQuery = useQuery({
    queryKey: [
      "/api/coupang/shipments/worksheet/detail",
      filters.selectedStoreId,
      detailRow?.id ?? null,
      detailRow?.shipmentBoxId ?? null,
      detailRow?.orderId ?? null,
      detailRow?.vendorItemId ?? null,
      detailRow?.sellerProductId ?? null,
      detailRow?.orderedAtRaw ?? null,
    ],
    queryFn: () =>
      getJson<CoupangShipmentWorksheetDetailResponse>(
        buildShipmentWorksheetDetailUrl(filters.selectedStoreId, detailRow!),
      ),
    enabled: Boolean(filters.selectedStoreId && detailRow && (detailRow.shipmentBoxId || detailRow.orderId)),
  });
  const detailItem = shipmentDetailQuery.data?.item ?? null;
  const detailReturnRows = useMemo(() => {
    const merged = new Map<string, CoupangReturnRow>();

    for (const row of detailItem?.returns ?? []) {
      merged.set(row.receiptId, row);
    }
    for (const row of detailItem?.orderDetail?.relatedReturnRequests ?? []) {
      if (!merged.has(row.receiptId)) {
        merged.set(row.receiptId, row);
      }
    }

    return Array.from(merged.values());
  }, [detailItem]);
  const detailExchangeRows = useMemo(() => {
    const merged = new Map<string, CoupangExchangeRow>();

    for (const row of detailItem?.exchanges ?? []) {
      merged.set(row.exchangeId, row);
    }
    for (const row of detailItem?.orderDetail?.relatedExchangeRequests ?? []) {
      if (!merged.has(row.exchangeId)) {
        merged.set(row.exchangeId, row);
      }
    }

    return Array.from(merged.values());
  }, [detailItem]);
  const returnDetailByReceiptId = useMemo(
    () =>
      new Map((detailItem?.returnDetails ?? []).map((item) => [item.receiptId, item] as const)),
    [detailItem?.returnDetails],
  );
  const exchangeDetailById = useMemo(
    () =>
      new Map((detailItem?.exchangeDetails ?? []).map((item) => [item.exchangeId, item] as const)),
    [detailItem?.exchangeDetails],
  );
  const isFallback = activeSheet?.source === "fallback";
  const infoBanner = summarizeWorksheetMessage(activeSheet);
  const syncBanner = summarizeWorksheetSync(activeSheet);
  const invoiceModeNotice =
    worksheetMode === "invoice"
      ? "송장 입력 모드에서는 택배사와 송장번호 열이 연보라색으로 강조되며, 다른 엑셀 표를 그대로 복사해 와도 현재 선택 위치부터 붙여넣고 드래그 복제를 사용할 수 있습니다. 팝업 입력도 지원합니다."
      : "표 안에서 `Ctrl+V`로 붙여넣을 수 있습니다. 일반 값은 선택한 셀부터 반영되고, `셀픽주문번호 | 택배사 | 송장번호` 형식은 주문번호 기준으로 자동 매칭합니다.";
  const detailGuideNotice = "행을 클릭하면 메모, 현재 상태, 쿠팡 클레임 상세를 팝업으로 확인할 수 있습니다.";
  const detailDerivedCustomerServiceSnapshot = detailItem
    ? {
        customerServiceIssueCount: detailItem.customerServiceIssueCount,
        customerServiceIssueSummary: detailItem.customerServiceIssueSummary,
        customerServiceIssueBreakdown: detailItem.customerServiceIssueBreakdown,
        customerServiceState: detailItem.customerServiceState,
      }
    : null;
  const detailCustomerServiceSnapshot = resolvePreferredCoupangCustomerServiceSnapshot(
    detailDerivedCustomerServiceSnapshot,
    detailRow
      ? {
          customerServiceIssueCount: detailRow.customerServiceIssueCount,
          customerServiceIssueSummary: detailRow.customerServiceIssueSummary,
          customerServiceIssueBreakdown: detailRow.customerServiceIssueBreakdown,
          customerServiceState: detailRow.customerServiceState,
        }
      : null,
  );
  const detailInvoicePresentation = detailRow ? getInvoiceTransmissionPresentation(detailRow) : null;
  const detailOrderDetail = detailItem?.orderDetail ?? null;
  const detailStatusCarrier =
    detailCustomerServiceSnapshot || detailRow
      ? {
          orderStatus: detailOrderDetail?.status ?? detailRow?.orderStatus ?? null,
          customerServiceIssueCount: detailCustomerServiceSnapshot?.customerServiceIssueCount ?? 0,
          customerServiceIssueSummary: detailCustomerServiceSnapshot?.customerServiceIssueSummary ?? null,
          customerServiceIssueBreakdown:
            detailCustomerServiceSnapshot?.customerServiceIssueBreakdown ?? [],
          customerServiceState: detailCustomerServiceSnapshot?.customerServiceState ?? "unknown",
        }
      : null;
  const detailOrderPresentation = detailStatusCarrier
    ? getWorksheetStatusPresentation(detailStatusCarrier)
    : null;
  const detailCustomerServiceLabel = detailCustomerServiceSnapshot
    ? formatShipmentWorksheetCustomerServiceLabel({
        summary: detailCustomerServiceSnapshot.customerServiceIssueSummary,
        count: detailCustomerServiceSnapshot.customerServiceIssueCount,
        state: detailCustomerServiceSnapshot.customerServiceState,
        breakdown: detailCustomerServiceSnapshot.customerServiceIssueBreakdown,
      })
    : null;
  const detailResolvedOrderStatus = detailStatusCarrier
    ? resolveWorksheetOrderStatus(detailStatusCarrier)
    : null;
  const detailClaimCount = detailReturnRows.length + detailExchangeRows.length;
  const detailClaimLookupRange =
    detailItem?.claimLookupCreatedAtFrom && detailItem?.claimLookupCreatedAtTo
      ? `${detailItem.claimLookupCreatedAtFrom} ~ ${detailItem.claimLookupCreatedAtTo}`
      : "-";

  useEffect(() => {
    if (
      !filters.selectedStoreId ||
      !detailRow ||
      !detailDerivedCustomerServiceSnapshot ||
      !hasResolvedCoupangCustomerServiceSnapshot(detailDerivedCustomerServiceSnapshot)
    ) {
      return;
    }

    const fetchedAt = shipmentDetailQuery.data?.fetchedAt ?? null;
    const patchRow = (row: CoupangShipmentWorksheetRow) => {
      if (row.id !== detailRow.id) {
        return row;
      }

      if (
        hasSameShipmentCustomerServiceSnapshot(row, detailDerivedCustomerServiceSnapshot, fetchedAt)
      ) {
        return row;
      }

      return {
        ...row,
        customerServiceIssueCount: detailDerivedCustomerServiceSnapshot.customerServiceIssueCount,
        customerServiceIssueSummary: detailDerivedCustomerServiceSnapshot.customerServiceIssueSummary,
        customerServiceIssueBreakdown:
          detailDerivedCustomerServiceSnapshot.customerServiceIssueBreakdown,
        customerServiceState: detailDerivedCustomerServiceSnapshot.customerServiceState,
        customerServiceFetchedAt: fetchedAt,
      };
    };

    queryClient.setQueryData<CoupangShipmentWorksheetResponse>(
      ["/api/coupang/shipments/worksheet", filters.selectedStoreId],
      (current) => {
        if (!current) {
          return current;
        }

        const nextItems = current.items.map(patchRow);
        return nextItems.some((row, index) => row !== current.items[index])
          ? { ...current, items: nextItems }
          : current;
      },
    );
    setSheetSnapshot((current) => {
      if (!current) {
        return current;
      }

      const nextItems = current.items.map(patchRow);
      return nextItems.some((row, index) => row !== current.items[index])
        ? { ...current, items: nextItems }
        : current;
    });
    setDraftRows((current) => {
      const nextRows = current.map(patchRow);
      return nextRows.some((row, index) => row !== current[index]) ? sortShipmentRows(nextRows) : current;
    });
  }, [
    detailDerivedCustomerServiceSnapshot,
    detailRow,
    filters.selectedStoreId,
    shipmentDetailQuery.data?.fetchedAt,
  ]);
  const detailHeroMeta = detailRow
    ? [
        formatExportText(detailRow.optionName),
        detailRow.quantity === null ? "" : `${formatNumber(detailRow.quantity)}개`,
        formatExportText(detailRow.receiverName),
        formatExportText(detailRow.collectedAccountName),
      ]
        .filter(Boolean)
        .join(" · ") || "-"
    : "-";
  const detailOptionSummary = detailRow
    ? formatJoinedText(
        [detailRow.optionName, detailRow.quantity === null ? null : `${formatNumber(detailRow.quantity)}개`],
        " / ",
      )
    : "-";
  const detailWorksheetStatusValue: ReactNode = detailOrderPresentation ? (
    <div className="shipment-detail-inline-stack">
      <div className="shipment-detail-inline-badges">
        <span className={`status-pill ${detailOrderPresentation.orderToneClassName}`}>
          {detailOrderPresentation.orderLabel}
        </span>
        {detailOrderPresentation.customerServiceLabel ? (
          <span className="shipment-detail-inline-note">
            {detailOrderPresentation.customerServiceLabel}
          </span>
        ) : null}
      </div>
    </div>
  ) : (
    "-"
  );
  const detailCoupangStatusValue: ReactNode =
    detailResolvedOrderStatus ? (
      <span className={`status-pill ${getOrderStatusToneClass(detailResolvedOrderStatus)}`}>
        {formatOrderStatusLabel(detailResolvedOrderStatus)}
      </span>
    ) : (
      "-"
    );
  const detailInvoiceStatusValue: ReactNode = detailInvoicePresentation ? (
    <span className={detailInvoicePresentation.toneClassName}>
      {detailInvoicePresentation.label}
    </span>
  ) : (
    "-"
  );
  const detailOutputStatusValue: ReactNode = detailRow ? (
    <span className={`status-pill ${detailRow.exportedAt ? "success" : "draft"}`}>
      {detailRow.exportedAt ? "출력 완료" : "미출력"}
    </span>
  ) : (
    "-"
  );
  const detailCustomerServiceValue: ReactNode = detailCustomerServiceLabel ? (
    <span className="shipment-detail-inline-note strong">{detailCustomerServiceLabel}</span>
  ) : detailCustomerServiceSnapshot?.customerServiceState === "ready" ? (
    <span className="status-pill draft">접수 없음</span>
  ) : (
    "-"
  );
  const detailClaimStatusValue: ReactNode = shipmentDetailQuery.isLoading ? (
    <span className="status-pill pending">조회 중</span>
  ) : detailClaimCount > 0 ? (
    <span className="status-pill attention">{`${formatNumber(detailClaimCount)}건`}</span>
  ) : (
    <span className="status-pill draft">없음</span>
  );
  const detailWorksheetInvoice = formatJoinedText([
    detailRow?.deliveryCompanyCode,
    detailRow?.invoiceNumber,
  ]);
  const detailCoupangInvoice = formatJoinedText([
    detailOrderDetail?.deliveryCompanyName,
    detailOrderDetail?.deliveryCompanyCode,
    detailOrderDetail?.invoiceNumber,
  ]);
  const detailReceiverContact = formatJoinedText([
    detailOrderDetail?.receiver.safeNumber,
    detailOrderDetail?.receiver.receiverNumber,
    detailRow?.contact,
    detailRow?.buyerPhoneNumber,
  ]);
  const detailBuyerContact = formatJoinedText([
    detailOrderDetail?.orderer.safeNumber,
    detailOrderDetail?.orderer.ordererNumber,
  ]);
  const detailReceiverAddress = formatAddressText([
    detailOrderDetail?.receiver.postCode ? `(${detailOrderDetail.receiver.postCode})` : null,
    detailOrderDetail?.receiver.addr1,
    detailOrderDetail?.receiver.addr2,
    detailRow?.receiverAddress,
  ]);
  const detailDeliveryTypeText = formatJoinedText(
    [
      detailOrderDetail?.shipmentType,
      detailOrderDetail?.splitShipping === null
        ? null
        : detailOrderDetail?.splitShipping
          ? "분할배송"
          : "단일배송",
      detailOrderDetail?.ableSplitShipping === null
        ? null
        : detailOrderDetail?.ableSplitShipping
          ? "분할배송 가능"
          : "분할배송 불가",
    ],
    " · ",
  );
  const detailWorksheetRows = detailRow
    ? [
        { label: "주문번호", value: detailRow.orderId },
        { label: "상품주문번호", value: detailRow.productOrderNumber },
        { label: "배송번호", value: detailRow.shipmentBoxId },
        { label: "셀픽주문번호", value: detailRow.selpickOrderNumber },
        {
          label: "주문일시",
          value: formatDateTimeLabel(detailOrderDetail?.orderedAt ?? detailRow.orderedAtRaw),
        },
        { label: "결제일시", value: formatDateTimeLabel(detailOrderDetail?.paidAt) },
        { label: "상품명", value: detailRow.productName },
        { label: "옵션 / 수량", value: detailOptionSummary },
        { label: "노출상품명", value: detailRow.exposedProductName },
        { label: "수집 계정", value: detailRow.collectedAccountName },
      ]
    : [];
  const detailDeliveryRows = detailRow
    ? [
        { label: "수령자", value: detailRow.receiverName },
        { label: "연락처", value: detailReceiverContact },
        { label: "수령지", value: detailReceiverAddress },
        { label: "요청사항", value: formatText(detailRow.deliveryRequest) },
        { label: "워크시트 송장", value: detailWorksheetInvoice },
        { label: "쿠팡 송장", value: detailCoupangInvoice },
        {
          label: "주문자",
          value: formatJoinedText([detailOrderDetail?.orderer.name, detailRow.ordererName]),
        },
        { label: "주문자 연락처", value: detailBuyerContact },
      ]
    : [];
  const detailStatusRows = detailRow
    ? [
        { label: "워크시트 상태", value: detailWorksheetStatusValue },
        { label: "쿠팡 주문상태", value: detailCoupangStatusValue },
        { label: "송장 상태", value: detailInvoiceStatusValue },
        { label: "출력 상태", value: detailOutputStatusValue },
        { label: "CS 상태", value: detailCustomerServiceValue },
        { label: "클레임 현황", value: detailClaimStatusValue },
        {
          label: "CS 요약",
          value: formatText(detailCustomerServiceSnapshot?.customerServiceIssueSummary),
        },
        { label: "클레임 조회 범위", value: detailClaimLookupRange },
        { label: "출력 메모", value: formatText(detailOrderDetail?.parcelPrintMessage) },
        { label: "송장 전송 메모", value: formatText(detailRow.invoiceTransmissionMessage) },
      ]
    : [];
  const detailRealtimeOrderRows = detailRow
    ? [
        {
          label: "주문자",
          value: formatJoinedText([detailOrderDetail?.orderer.name, detailRow.ordererName]),
        },
        { label: "주문자 연락처", value: detailBuyerContact },
        {
          label: "주문일시",
          value: formatDateTimeLabel(detailOrderDetail?.orderedAt ?? detailRow.orderedAtRaw),
        },
        { label: "결제일시", value: formatDateTimeLabel(detailOrderDetail?.paidAt) },
        { label: "배송유형", value: detailDeliveryTypeText },
        { label: "쿠팡 송장", value: detailCoupangInvoice },
        { label: "배송중 전환", value: formatDateTimeLabel(detailOrderDetail?.inTransitDateTime) },
        { label: "배송완료", value: formatDateTimeLabel(detailOrderDetail?.deliveredDate) },
      ]
    : [];
  const recentActivityItems = useMemo<ShipmentActivityItem[]>(() => {
    const items: ShipmentActivityItem[] = [];

    if (feedback) {
      items.push({
        id: "feedback",
        tone: feedback.type,
        title: feedback.title,
        message: feedback.message,
        details: feedback.details,
      });
    }

    if (syncBanner) {
      items.push({
        id: "sync",
        tone: null,
        title: syncBanner.title,
        message: syncBanner.message,
        details: [],
      });
    }

    if (infoBanner) {
      items.push({
        id: "info",
        tone: isFallback ? "warning" : null,
        title: infoBanner.title,
        message: infoBanner.message,
        details: [],
      });
    }

    return items;
  }, [feedback, infoBanner, isFallback, syncBanner]);
  const transmitActionLabel = worksheetMode === "invoice" ? "송장 전송하기" : "선택 송장 전송";
  const transmitActionBusyLabel =
    busyAction === "invoice-transmit" || busyAction === "execute"
      ? "송장 전송 중..."
      : transmitActionLabel;
  const transmitActionDisabled =
    (worksheetMode === "invoice" ? !invoiceReadyRows.length : !selectedRows.length) ||
    isFallback ||
    busyAction !== null;
  const collectActionDisabled = !filters.selectedStoreId || busyAction !== null;
  const refreshActionDisabled =
    !filters.selectedStoreId || worksheetQuery.isFetching || busyAction !== null;
  const openInvoiceInputDisabled = !draftRows.length || busyAction !== null;
  const openExcelExportDisabled = !selectedRows.length || busyAction !== null;
  const openNotExportedExcelExportDisabled = !notExportedRows.length || busyAction !== null;

  useEffect(() => {
    if (!detailRowId) {
      return;
    }

    if (!detailRow) {
      setDetailRowId(null);
    }
  }, [detailRow, detailRowId]);

  function applyWorksheetRowUpdates(updates: Map<string, CoupangShipmentWorksheetRow>) {
    if (!updates.size) {
      return;
    }

    setDraftRows((current) => sortShipmentRows(current.map((row) => updates.get(row.id) ?? row)));
    setDirtySourceKeys((current) => {
      const next = new Set(current);
      for (const row of Array.from(updates.values())) {
        next.add(row.sourceKey);
      }
      return next;
    });
  }

  async function patchWorksheetRows(
    items: PatchCoupangShipmentWorksheetItemInput[],
    options?: { clearDirtyMode?: "all" | "touched" | "none" },
  ) {
    if (!filters.selectedStoreId || !items.length) {
      return null;
    }

    const response = await apiRequestJson<CoupangShipmentWorksheetResponse>(
      "PATCH",
      "/api/coupang/shipments/worksheet",
      {
        storeId: filters.selectedStoreId,
        items,
      },
    );

    setSheetSnapshot(response);
    setDraftRows(sortShipmentRows(response.items));
    setDirtySourceKeys((current) => {
      const clearDirtyMode = options?.clearDirtyMode ?? "touched";
      if (clearDirtyMode === "all") {
        return new Set();
      }
      if (clearDirtyMode === "none") {
        return current;
      }

      const next = new Set(current);
      for (const item of items) {
        if (item.sourceKey) {
          next.delete(item.sourceKey);
        }
      }
      return next;
    });
    return response;
  }

  function mapRowsByInvoiceIdentity(rows: CoupangShipmentWorksheetRow[]) {
    return new Map(
      rows.map(
        (row) =>
          [buildInvoiceIdentity(row.shipmentBoxId, row.orderId, row.vendorItemId), row] as const,
      ),
    );
  }

  const columnConfigById = useMemo(
    () => new Map(columnConfigs.map((config) => [config.id, config] as const)),
    [columnConfigs],
  );
  const editableColumnIds = useMemo(
    () => getEditableColumnIds(columnConfigs, worksheetMode),
    [columnConfigs, worksheetMode],
  );

  const columns = useMemo(
    () =>
      buildShipmentGridColumns({
        columnConfigs,
        columnWidths,
        worksheetMode,
      }),
    [columnConfigs, columnWidths, worksheetMode],
  );

  function handlePageSelectedRowsChange(nextSelectedRows: ReadonlySet<string>) {
    setSelectedRowIds((current) => {
      const next = new Set(Array.from(current).filter((rowId) => !pageRowIdSet.has(rowId)));
      for (const rowId of Array.from(nextSelectedRows)) {
        next.add(rowId);
      }
      return next;
    });
  }

  function handleGridFill(event: {
    columnKey: string;
    sourceRow: CoupangShipmentWorksheetRow;
    targetRow: CoupangShipmentWorksheetRow;
  }) {
    const config = columnConfigById.get(event.columnKey);
    if (!config || !isGridEditableSourceKey(config.sourceKey, worksheetMode)) {
      return event.targetRow;
    }

    return applyEditableCell(
      event.targetRow,
      config.sourceKey,
      event.sourceRow[config.sourceKey as keyof CoupangShipmentWorksheetRow],
    );
  }

  async function collectWorksheet(
    syncMode: "incremental" | "full" = "incremental",
    options?: { silent?: boolean; skipBusyState?: boolean },
  ) {
    const requestFilters = normalizeFiltersToSeoulToday(filters);
    if (!requestFilters.selectedStoreId) {
      return null;
    }

    if (!areFiltersEqual(filters, requestFilters)) {
      setFilters(requestFilters);
    }

    const localToastId = options?.silent
      ? null
      : startLocalOperation({
          channel: "coupang",
          actionName:
            syncMode === "full" ? "쿠팡 배송 시트 전체 재동기화" : "쿠팡 배송 시트 빠른 수집",
          targetCount: 1,
        });
    if (!options?.skipBusyState) {
      setBusyAction(syncMode === "full" ? "collect-full" : "collect-incremental");
    }
    if (!options?.silent) {
      setFeedback(null);
    }

    try {
      const response = await apiRequestJson<CoupangShipmentWorksheetResponse>(
        "POST",
        "/api/coupang/shipments/collect",
        {
          storeId: requestFilters.selectedStoreId,
          createdAtFrom: requestFilters.createdAtFrom,
          createdAtTo: requestFilters.createdAtTo,
          status: requestFilters.status || undefined,
          maxPerPage: requestFilters.maxPerPage,
          syncMode,
        },
      );

      setSheetSnapshot(response);
      setDraftRows(sortShipmentRows(response.items));
      setSelectedRowIds(new Set());
      setDirtySourceKeys(new Set());
      setSelectedCell(null);

      if (!options?.silent) {
        const modeLabel = response.syncSummary?.mode === "full" ? "전체 재동기화" : "빠른 수집";
        const summary = response.syncSummary
          ? `${modeLabel}으로 조회 ${response.syncSummary.fetchedCount}건, 추가 ${response.syncSummary.insertedCount}건, 갱신 ${response.syncSummary.updatedCount}건을 반영했습니다.`
          : `${response.items.length}건을 셀픽 형식으로 정리했습니다.`;
        setFeedback({
          type: response.message || response.source === "fallback" ? "warning" : "success",
          title: modeLabel === "전체 재동기화" ? "배송 시트 재동기화 완료" : "배송 시트 수집 완료",
          message: response.message ? `${summary} ${response.message}` : summary,
          details: [],
        });
      }

      if (localToastId) {
        finishLocalOperation(localToastId, {
          status: response.message || response.source === "fallback" ? "warning" : "success",
          summary: response.syncSummary
            ? `${response.syncSummary.insertedCount}건 추가, ${response.syncSummary.updatedCount}건 갱신`
            : `${response.items.length}건 수집 완료`,
        });
        window.setTimeout(() => removeLocalOperation(localToastId), 1_200);
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "배송 시트 수집에 실패했습니다.";

      if (!options?.silent) {
        setFeedback({
          type: "error",
          title: syncMode === "full" ? "배송 시트 재동기화 실패" : "배송 시트 수집 실패",
          message,
          details: [],
        });
      }

      if (localToastId) {
        finishLocalOperation(localToastId, {
          status: "error",
          errorMessage: message,
        });
      }

      return null;
    } finally {
      if (!options?.skipBusyState) {
        setBusyAction(null);
      }
    }
  }

  async function saveWorksheetChanges() {
    if (!filters.selectedStoreId || !dirtyCount) {
      return;
    }

    const items = draftRows
      .filter((row) => dirtySet.has(row.sourceKey))
      .map((row) => buildWorksheetPatchItem(row));

    if (!items.length) {
      return;
    }

    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName: "쿠팡 배송 시트 저장",
      targetCount: items.length,
    });
    setBusyAction("save");
    setFeedback(null);

    try {
      const response = await patchWorksheetRows(items, { clearDirtyMode: "all" });
      if (!response) {
        throw new Error("배송 시트 저장 결과를 확인하지 못했습니다.");
      }

      setFeedback({
        type: response.message ? "warning" : "success",
        title: "배송 시트 저장 완료",
        message: response.message ?? `${items.length}건의 변경사항을 저장했습니다.`,
        details: [],
      });
      finishLocalOperation(localToastId, {
        status: response.message ? "warning" : "success",
        summary: `${items.length}건 저장 완료`,
      });
      window.setTimeout(() => removeLocalOperation(localToastId), 1_200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "배송 시트 저장에 실패했습니다.";
      setFeedback({
        type: "error",
        title: "배송 시트 저장 실패",
        message,
        details: [],
      });
      finishLocalOperation(localToastId, {
        status: "error",
        errorMessage: message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  function addColumnConfig() {
    const sourceKey: ShipmentColumnSourceKey = "blank";
    const nextConfig = createShipmentColumnConfig(sourceKey);
    setColumnConfigs((current) => [...current, nextConfig]);
    setColumnWidths((current) => ({
      ...current,
      [nextConfig.id]: SHIPMENT_COLUMN_DEFAULT_WIDTHS[sourceKey],
    }));
  }

  function updateColumnConfig(id: string, patch: Partial<ShipmentColumnConfig>) {
    setColumnConfigs((current) =>
      current.map((config) =>
        config.id === id
          ? {
              ...config,
              ...patch,
              label:
                patch.label !== undefined
                  ? patch.label
                  : config.label,
            }
          : config,
      ),
    );
  }

  function deleteColumnConfig(id: string) {
    setColumnConfigs((current) => current.filter((config) => config.id !== id));
    setColumnWidths((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function resetColumnConfigs() {
    const nextConfigs = createDefaultShipmentColumnConfigs();
    setColumnConfigs(nextConfigs);
    setColumnWidths(
      Object.fromEntries(
        nextConfigs.map((config) => [config.id, SHIPMENT_COLUMN_DEFAULT_WIDTHS[config.sourceKey]]),
      ),
    );
  }

  async function downloadWorksheetXlsx(
    scope: ShipmentExcelExportScope,
    sortKey: ShipmentExcelSortKey,
  ) {
    if (!draftRows.length) {
      setFeedback({
        type: "warning",
        title: "엑셀 다운로드",
        message: "다운로드할 배송 시트가 없습니다.",
        details: [],
      });
      return;
    }

    const targetRows = scope === "selected" ? selectedRows : notExportedRows;
    if (!targetRows.length) {
      setFeedback({
        type: "warning",
        title: "엑셀 다운로드",
        message:
          scope === "selected"
            ? "체크한 행이 없어 엑셀을 다운로드할 수 없습니다."
            : "미출력 행이 없어 엑셀을 다운로드할 수 없습니다.",
        details: [],
      });
      return;
    }

    const exportColumns = columnConfigs;
    const sortedRows = sortShipmentRowsForExcelExport(targetRows, sortKey);
    const rows = sortedRows.map((row) =>
      Object.fromEntries(
        exportColumns.map((config) => [config.label, getShipmentExportValue(row, config.sourceKey)]),
      ),
    );
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: exportColumns.map((config) => config.label),
    });

    worksheet["!cols"] = exportColumns.map((config) => ({
      wch: Math.max(
        10,
        Math.round((columnWidths[config.id] ?? SHIPMENT_COLUMN_DEFAULT_WIDTHS[config.sourceKey]) / 8),
      ),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "배송시트");

    const storeName =
      stores.find((store) => store.id === filters.selectedStoreId)?.storeName ?? "쿠팡";
    const fileName = `${storeName}-${filters.createdAtFrom || "시작일"}-${filters.createdAtTo || "종료일"}-${scope === "selected" ? "배송시트" : "미출력-배송시트"}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    const exportedAt = new Date().toISOString();

    try {
      const response = await patchWorksheetRows(
        targetRows.map((row) => buildWorksheetPatchItem(row, { exportedAt })),
        { clearDirtyMode: "touched" },
      );
      if (!response) {
        throw new Error("출력 상태 저장 결과를 확인하지 못했습니다.");
      }
    } catch (error) {
      const selectedRowIdSet = new Set(targetRows.map((row) => row.id));
      setDraftRows((current) =>
        current.map((row) => ({
          ...row,
          exportedAt: selectedRowIdSet.has(row.id) ? exportedAt : row.exportedAt,
        })),
      );
      setDirtySourceKeys((current) => {
        const next = new Set(current);
        for (const row of targetRows) {
          next.add(row.sourceKey);
        }
        return next;
      });
      setFeedback({
        type: "warning",
        title: "엑셀 다운로드 완료",
        message:
          error instanceof Error
            ? `${fileName} 파일은 저장했지만 출력 상태 저장은 실패했습니다. ${error.message}`
            : `${fileName} 파일은 저장했지만 출력 상태 저장은 실패했습니다.`,
        details: [],
      });
      return;
    }

    setFeedback({
      type: "success",
      title: "엑셀 다운로드 완료",
      message: `${fileName} 파일을 ${getShipmentExcelSortLabel(sortKey)}으로 저장했고 ${getShipmentExcelExportScopeLabel(scope)} ${targetRows.length}행을 출력 완료로 표시했습니다.`,
      details: [],
    });
  }

  async function executeInvoiceTransmission(scope: "selected" | "ready") {
    if (!filters.selectedStoreId) {
      return;
    }

    if (isFallback) {
      setFeedback({
        type: "warning",
        title: "송장 전송 불가",
        message: "대체 데이터에서는 송장 전송을 실행할 수 없습니다.",
        details: [],
      });
      return;
    }

    const sourceRows = scope === "selected" ? selectedRows : invoiceReadyRows;
    const blockedClaimRows = scope === "selected" ? sourceRows.filter((row) => hasShipmentClaimIssue(row)) : [];
    const blockedClaimDetails = buildInvoiceClaimBlockedDetails(blockedClaimRows);
    if (!sourceRows.length) {
      setFeedback({
        type: "warning",
        title: scope === "selected" ? "선택 송장 전송" : "송장 전송하기",
        message:
          scope === "selected"
            ? "선택된 행이 없습니다."
            : "전송할 신규/실패 송장 행이 없습니다. 이미 완료된 행은 값을 수정하면 다시 전송할 수 있습니다.",
        details: [],
      });
      return;
    }

    if (scope === "selected" && blockedClaimRows.length === sourceRows.length) {
      setFeedback({
        type: "warning",
        title: "송장 전송 차단",
        message: "클레임이 있는 주문은 송장 전송 대상에서 제외됩니다.",
        details: blockedClaimDetails,
      });
      return;
    }

    const uploadItems: CoupangInvoiceTarget[] = [];
    const updateItems: CoupangInvoiceTarget[] = [];
    const candidateTransmissionRows: CoupangShipmentWorksheetRow[] = [];
    const validationErrors: string[] = [];
    const invalidGroupKeys = new Set<string>();
    const transmissionGroups = new Map<
      string,
      {
        rows: CoupangShipmentWorksheetRow[];
        target: CoupangInvoiceTarget;
        mode: InvoiceTransmissionMode;
        payloadSignature: string;
      }
    >();

    for (const row of sourceRows) {
      if (hasShipmentClaimIssue(row)) {
        continue;
      }

      if (scope === "ready" && !canSendInvoiceRow(row)) {
        continue;
      }

      const validationMessage = validateInvoiceRow(row);
      if (validationMessage) {
        if (scope === "selected") {
          validationErrors.push(`${row.selpickOrderNumber}: ${validationMessage}`);
        }
        continue;
      }

      const mode = resolveInvoiceTransmissionMode(row);

      if (!mode) {
        if (scope === "selected") {
          validationErrors.push(`${row.selpickOrderNumber}: 현재 상태에서 송장을 전송할 수 없습니다.`);
        }
        continue;
      }

      candidateTransmissionRows.push(row);
      const groupKey = buildInvoiceTransmissionGroupKey({
        shipmentBoxId: row.shipmentBoxId,
        productOrderNumber: row.productOrderNumber,
        orderId: row.orderId,
      });
      const payloadSignature = buildInvoiceTransmissionPayloadSignature(row);
      const existingGroup = transmissionGroups.get(groupKey);

      if (!existingGroup) {
        transmissionGroups.set(groupKey, {
          rows: [row],
          target: toInvoiceTarget(row),
          mode,
          payloadSignature,
        });
        continue;
      }

      existingGroup.rows.push(row);
      if (existingGroup.payloadSignature !== payloadSignature && !invalidGroupKeys.has(groupKey)) {
        invalidGroupKeys.add(groupKey);
        validationErrors.push(
          `${buildInvoiceTransmissionGroupLabel(row)}: 합배송 묶음의 택배사/송장번호가 서로 달라 한 번에 전송할 수 없습니다.`,
        );
      }

      if (mode === "update" && existingGroup.mode !== "update") {
        existingGroup.mode = "update";
        existingGroup.target = toInvoiceTarget(row);
      }
    }

    const invoiceTransmissionGroups = Array.from(transmissionGroups.entries())
      .filter(([groupKey]) => !invalidGroupKeys.has(groupKey))
      .map(([key, group]) => ({ key, ...group }));
    const transmissionRows = invoiceTransmissionGroups.flatMap((group) => group.rows);
    const skippedRowCount = candidateTransmissionRows.length - transmissionRows.length;

    for (const group of invoiceTransmissionGroups) {
      if (group.mode === "update") {
        updateItems.push(group.target);
      } else {
        uploadItems.push(group.target);
      }
    }

    if (validationErrors.length && !invoiceTransmissionGroups.length) {
      setFeedback({
        type: "error",
        title: "송장 전송 전 검증 실패",
        message: "전송 가능한 행이 없어 송장 전송을 실행하지 않았습니다.",
        details: [...blockedClaimDetails, ...validationErrors],
      });
      return;
    }

    if (!transmissionRows.length) {
      setFeedback({
        type: "warning",
        title: scope === "selected" ? "선택 송장 전송" : "송장 전송하기",
        message:
          scope === "selected"
            ? "전송 가능한 선택 행이 없습니다."
            : "송장번호와 택배사가 모두 입력된 전송 대상이 없습니다.",
        details: blockedClaimDetails,
      });
      return;
    }

    const actionName = scope === "selected" ? "쿠팡 선택 송장 전송" : "쿠팡 송장 일괄 전송";
    const previousRowBySourceKey = new Map(
      (sheetSnapshot?.items ?? []).map((row) => [row.sourceKey, row] as const),
    );
    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName,
      targetCount: invoiceTransmissionGroups.length,
    });
    const transmissionStartedAt = new Date().toISOString();
    setBusyAction(scope === "selected" ? "execute" : "invoice-transmit");
    setFeedback(null);

    try {
      await patchWorksheetRows(
        transmissionRows.map((row) =>
          buildWorksheetPatchItem(row, {
            invoiceTransmissionStatus: "pending",
            invoiceTransmissionMessage: null,
            invoiceTransmissionAt: transmissionStartedAt,
            invoiceAppliedAt: null,
          }),
        ),
      );

      const results: CoupangBatchActionResponse[] = [];

      if (uploadItems.length) {
        const result = await apiRequestJson<CoupangBatchActionResponse>(
          "POST",
          "/api/coupang/shipments/invoices/upload",
          {
            storeId: filters.selectedStoreId,
            items: uploadItems,
          },
        );
        results.push(result);
        if (result.operation) {
          publishOperation(result.operation);
        }
      }

      if (updateItems.length) {
        const result = await apiRequestJson<CoupangBatchActionResponse>(
          "POST",
          "/api/coupang/shipments/invoices/update",
          {
            storeId: filters.selectedStoreId,
            items: updateItems,
          },
        );
        results.push(result);
        if (result.operation) {
          publishOperation(result.operation);
        }
      }

      const rowByInvoiceIdentity = mapRowsByInvoiceIdentity(transmissionRows);
      const rowsByTransmissionGroupKey = new Map(
        invoiceTransmissionGroups.map((group) => [group.key, group.rows] as const),
      );
      const combined = combineBatchResults(
        results.map((result) =>
          normalizeRepeatedInvoiceBatchResult(result, rowByInvoiceIdentity, previousRowBySourceKey),
        ),
      );
      const transmissionStateBySourceKey = new Map<
        string,
        {
          status: CoupangShipmentInvoiceTransmissionStatus;
          message: string | null;
          appliedAt: string | null;
          transmissionAt: string;
        }
      >();

      for (const item of combined.items) {
        if (!item.shipmentBoxId || !item.orderId) {
          continue;
        }

        const groupRows = rowsByTransmissionGroupKey.get(
          buildInvoiceTransmissionGroupKey({
            shipmentBoxId: item.shipmentBoxId,
            orderId: item.orderId,
          }),
        );
        if (!groupRows?.length) {
          continue;
        }

        const nextState = {
          status: item.status === "succeeded" ? "succeeded" : "failed",
          message: item.message || null,
          appliedAt: item.status === "succeeded" ? item.appliedAt ?? combined.completedAt : null,
          transmissionAt: combined.completedAt,
        } satisfies {
          status: CoupangShipmentInvoiceTransmissionStatus;
          message: string | null;
          appliedAt: string | null;
          transmissionAt: string;
        };

        for (const row of groupRows) {
          transmissionStateBySourceKey.set(row.sourceKey, nextState);
        }
      }

      for (const row of transmissionRows) {
        if (transmissionStateBySourceKey.has(row.sourceKey)) {
          continue;
        }

        const previousRow = previousRowBySourceKey.get(row.sourceKey);
        if (shouldPreserveSucceededInvoiceState(row, previousRow)) {
          transmissionStateBySourceKey.set(row.sourceKey, {
            status: "succeeded",
            message: resolveRepeatedInvoiceMessage(previousRow),
            appliedAt: previousRow?.invoiceAppliedAt ?? combined.completedAt,
            transmissionAt: combined.completedAt,
          });
          continue;
        }

        transmissionStateBySourceKey.set(row.sourceKey, {
          status: "failed",
          message: "전송 결과를 확인하지 못했습니다.",
          appliedAt: null,
          transmissionAt: combined.completedAt,
        });
      }

      await patchWorksheetRows(
        transmissionRows.map((row) => {
          const state = transmissionStateBySourceKey.get(row.sourceKey);
          return buildWorksheetPatchItem(row, {
            invoiceTransmissionStatus: state?.status ?? "failed",
            invoiceTransmissionMessage: state?.message ?? null,
            invoiceTransmissionAt: state?.transmissionAt ?? combined.completedAt,
            invoiceAppliedAt: state?.appliedAt ?? null,
          });
        }),
      );

      const mergedShipmentRowCount = transmissionRows.length - invoiceTransmissionGroups.length;
      const summaryBase =
        mergedShipmentRowCount > 0
          ? `${buildResultSummary(combined)} / 합배송 ${mergedShipmentRowCount}행 묶음 처리`
          : buildResultSummary(combined);
      const summary =
        skippedRowCount > 0
          ? `${summaryBase} / 오류 ${skippedRowCount}행 건너뜀`
          : summaryBase;
      const detailLines = [...buildFailureDetails(combined), ...validationErrors].slice(0, 8);
      setFeedback({
        type:
          blockedClaimDetails.length > 0 ||
          validationErrors.length > 0 ||
          combined.summary.failedCount > 0 ||
          combined.summary.warningCount > 0 ||
          combined.summary.skippedCount > 0
            ? "warning"
            : "success",
        title: scope === "selected" ? "송장 전송 결과" : "송장 전송 결과",
        message: summary,
        details: [...detailLines, ...blockedClaimDetails].slice(0, 8),
      });
      finishLocalOperation(localToastId, {
        status:
          validationErrors.length > 0 ||
          combined.summary.failedCount > 0 ||
          combined.summary.warningCount > 0 ||
          combined.summary.skippedCount > 0
            ? "warning"
            : "success",
        summary,
      });
      window.setTimeout(() => removeLocalOperation(localToastId), 1_200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "송장 전송에 실패했습니다.";
      const failedAt = new Date().toISOString();

      try {
        await patchWorksheetRows(
          transmissionRows.map((row) => {
            const previousRow = previousRowBySourceKey.get(row.sourceKey);
            if (shouldPreserveSucceededInvoiceState(row, previousRow)) {
              return buildWorksheetPatchItem(row, {
                invoiceTransmissionStatus: "succeeded",
                invoiceTransmissionMessage: resolveRepeatedInvoiceMessage(previousRow),
                invoiceTransmissionAt: previousRow?.invoiceTransmissionAt ?? failedAt,
                invoiceAppliedAt: previousRow?.invoiceAppliedAt ?? failedAt,
              });
            }

            return buildWorksheetPatchItem(row, {
              invoiceTransmissionStatus: "failed",
              invoiceTransmissionMessage: message,
              invoiceTransmissionAt: failedAt,
              invoiceAppliedAt: null,
            });
          }),
        );
      } catch {
        // Ignore secondary patch failures and surface the original error below.
      }

      setFeedback({
        type: "error",
        title: scope === "selected" ? "송장 전송 실패" : "송장 전송 실패",
        message,
        details: [],
      });
      finishLocalOperation(localToastId, {
        status: "error",
        errorMessage: message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function executeSelectedInvoices() {
    await executeInvoiceTransmission("selected");
  }

  async function executeInvoiceInputMode() {
    await executeInvoiceTransmission("ready");
  }

  function openShipmentDetailDialog(rowId: string) {
    setDetailRowId(rowId);
  }

  function closeShipmentDetailDialog() {
    setDetailRowId(null);
  }

  function openExcelSortDialog(scope: ShipmentExcelExportScope) {
    setExcelExportScope(scope);
    setIsExcelSortDialogOpen(true);
  }

  function closeExcelSortDialog() {
    setIsExcelSortDialogOpen(false);
  }

  function applyExcelSortDialog(sortKey: ShipmentExcelSortKey) {
    setIsExcelSortDialogOpen(false);
    void downloadWorksheetXlsx(excelExportScope, sortKey);
  }

  function openInvoiceInputDialog() {
    setWorksheetMode("invoice");
    setInvoiceInputDialogValue("");
    setIsInvoiceInputDialogOpen(true);
  }

  function closeInvoiceInputDialog() {
    setIsInvoiceInputDialogOpen(false);
    setInvoiceInputDialogValue("");
  }

  async function applyInvoiceInputDialog() {
    const { rows, issues } = parseCoupangInvoicePopupInput(invoiceInputDialogValue);
    if (!rows.length) {
      setFeedback({
        type: "warning",
        title: "송장 입력 팝업",
        message: "적용할 송장 데이터가 없습니다.",
        details: issues,
      });
      return;
    }

    const rowBySelpickOrderNumber = new Map(
      draftRows.map((row) => [row.selpickOrderNumber, row] as const),
    );
    const updates = new Map<string, CoupangShipmentWorksheetRow>();
    const nextIssues = [...issues];

    for (const item of rows) {
      const row = rowBySelpickOrderNumber.get(item.selpickOrderNumber);
      if (!row) {
        nextIssues.push(`현재 시트에 없는 셀픽주문번호입니다: ${item.selpickOrderNumber}`);
        continue;
      }

      const nextRow = applyEditableCell(
        applyEditableCell(row, "deliveryCompanyCode", item.deliveryCompanyCode),
        "invoiceNumber",
        item.invoiceNumber,
      );
      if (nextRow === row) {
        continue;
      }
      updates.set(row.id, nextRow);
    }

    if (!updates.size) {
      setFeedback({
        type: "warning",
        title: "송장 입력 팝업",
        message: "현재 워크시트에 반영할 수 있는 송장 데이터가 없습니다.",
        details: nextIssues,
      });
      return;
    }

    const changedRows = Array.from(updates.values());

    setBusyAction("save");
    try {
      const response = await patchWorksheetRows(
        changedRows.map((row) => buildWorksheetPatchItem(row)),
        { clearDirtyMode: "touched" },
      );
      if (!response) {
        throw new Error("송장 입력 반영 결과를 확인하지 못했습니다.");
      }

      setWorksheetMode("invoice");
      closeInvoiceInputDialog();
      setFeedback({
        type: nextIssues.length ? "warning" : "success",
        title: "송장 입력 팝업 적용",
        message: `${updates.size}건의 택배사와 운송장번호를 셀픽주문번호 기준으로 반영했습니다.`,
        details: nextIssues,
      });
    } catch (error) {
      applyWorksheetRowUpdates(updates);
      setWorksheetMode("invoice");
      closeInvoiceInputDialog();
      setFeedback({
        type: "warning",
        title: "송장 입력 팝업 적용",
        message:
          error instanceof Error
            ? `값은 워크시트에 반영했지만 저장은 실패했습니다. ${error.message}`
            : "값은 워크시트에 반영했지만 저장은 실패했습니다. 상단의 변경 저장 버튼으로 다시 저장해 주세요.",
        details: nextIssues,
      });
    } finally {
      setBusyAction(null);
    }
  }

  function handleVisibleRowsChange(
    nextVisibleRows: CoupangShipmentWorksheetRow[],
    data: RowsChangeData<CoupangShipmentWorksheetRow>,
  ) {
    const columnId = String(data.column.key);
    const config = columnConfigById.get(columnId);
    const sourceKey = config?.sourceKey;
    if (!config || !sourceKey || !isGridEditableSourceKey(sourceKey, worksheetMode)) {
      return;
    }

    const changedRows = data.indexes
      .map((index) => nextVisibleRows[index])
      .filter((row): row is CoupangShipmentWorksheetRow => Boolean(row))
      .map((row) => {
        const nextRow = applyEditableCell(
          row,
          sourceKey,
          row[sourceKey as keyof CoupangShipmentWorksheetRow],
        );

        return nextRow === row ? null : nextRow;
      })
      .filter((row): row is CoupangShipmentWorksheetRow => Boolean(row));

    if (!changedRows.length) {
      return;
    }

    const changedRowById = new Map(changedRows.map((row) => [row.id, row] as const));
    setDraftRows((current) => sortShipmentRows(current.map((row) => changedRowById.get(row.id) ?? row)));
    setDirtySourceKeys((current) => {
      const next = new Set(current);
      for (const row of changedRows) {
        next.add(row.sourceKey);
      }
      return next;
    });
  }

  function handleGridPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable='true']")) {
      return;
    }

    const clipboardText = event.clipboardData.getData("text/plain");
    if (!clipboardText.trim()) {
      return;
    }

    if (looksLikeInvoiceClipboard(clipboardText)) {
      event.preventDefault();

      const rowBySelpickOrderNumber = new Map(
        draftRows.map((row) => [row.selpickOrderNumber, row] as const),
      );
      const { updates, issues } = parseInvoiceClipboardRows(clipboardText, rowBySelpickOrderNumber);

      if (!updates.size) {
        setFeedback({
          type: "warning",
          title: "송장 붙여넣기",
          message: "현재 워크시트에서 일치하는 셀픽주문번호를 찾지 못했습니다.",
          details: issues.length
            ? issues
            : ["셀픽주문번호 | 택배사 | 송장번호 형식을 확인해 주세요."],
        });
        return;
      }

      applyWorksheetRowUpdates(updates);
      setFeedback({
        type: issues.length ? "warning" : "success",
        title: "송장 붙여넣기 적용",
        message: `${updates.size}건의 택배사와 송장번호를 워크시트에 반영했습니다.`,
        details: issues,
      });
      return;
    }

    if (!selectedCell) {
      return;
    }

    const startColumnIndex = editableColumnIds.indexOf(selectedCell.columnId);
    if (startColumnIndex < 0) {
      return;
    }

    const matrix = parseSpreadsheetClipboardMatrix(clipboardText);
    if (!matrix.length) {
      return;
    }

    const sanitizedMatrix =
      worksheetMode === "invoice"
        ? stripWorksheetPasteHeaderRow(matrix, startColumnIndex, editableColumnIds, columnConfigById)
        : matrix;
    if (!sanitizedMatrix.length) {
      return;
    }

    event.preventDefault();
    const updates = new Map<string, CoupangShipmentWorksheetRow>();

    for (let rowOffset = 0; rowOffset < sanitizedMatrix.length; rowOffset += 1) {
      const targetRow = pagedVisibleRows[selectedCell.rowIdx + rowOffset];
      if (!targetRow) {
        continue;
      }

      let workingRow = updates.get(targetRow.id) ?? targetRow;
      const cells = sanitizedMatrix[rowOffset] ?? [];

      for (let columnOffset = 0; columnOffset < cells.length; columnOffset += 1) {
        const targetColumnId = editableColumnIds[startColumnIndex + columnOffset];
        const config = targetColumnId ? columnConfigById.get(targetColumnId) : undefined;
        if (!config || !isGridEditableSourceKey(config.sourceKey, worksheetMode)) {
          continue;
        }

        workingRow = applyEditableCell(workingRow, config.sourceKey, cells[columnOffset]);
      }

      updates.set(workingRow.id, workingRow);
    }

    if (!updates.size) {
      return;
    }

    applyWorksheetRowUpdates(updates);
    setFeedback({
      type: "success",
      title: "표 붙여넣기 적용",
      message: `${updates.size}행에 값을 반영했습니다.`,
      details: [],
    });
  }

  function handleGridColumnsReorder(sourceColumnKey: string, targetColumnKey: string) {
    if (!columnConfigById.has(sourceColumnKey) || !columnConfigById.has(targetColumnKey)) {
      return;
    }

    setColumnConfigs((current) => moveColumnConfigs(current, sourceColumnKey, targetColumnKey));
  }

  function handleGridCellClick(args: CellClickArgs<CoupangShipmentWorksheetRow>) {
    const columnKey = String(args.column.key);

    if (columnKey === String(SelectColumn.key)) {
      return;
    }

    const config = columnConfigById.get(columnKey);
    if (config && isGridEditableSourceKey(config.sourceKey, worksheetMode)) {
      return;
    }

    openShipmentDetailDialog(args.row.id);
  }

  function handleSettingsDrop(targetId: string) {
    if (!draggingConfigId || draggingConfigId === targetId) {
      return;
    }

    setColumnConfigs((current) => moveColumnConfigs(current, draggingConfigId, targetId));
    setDraggingConfigId(null);
  }

  return (
    <div className="page">
      <div className="card shipment-page-header">
        <div className="shipment-page-header-main">
          <div className="hero">
            <div className="hero-badges">
              <StatusBadge
                tone={activeSheet?.source === "live" ? "live" : "draft"}
                label={activeSheet?.source === "live" ? "실데이터" : "대체 데이터"}
              />
              <StatusBadge tone="shared" label="셀픽 워크시트" />
            </div>
            <h1>쿠팡 배송/송장</h1>
            <p>
              배송 시트를 셀픽 헤더 규칙으로 수집하고, 표 안 붙여넣기와 셀픽주문번호 기준 송장
              전송을 한 화면에서 처리합니다.
            </p>
          </div>

          <div className="shipment-page-actions">
            <div className="shipment-primary-actions">
              <button
                className="button"
                onClick={() => void collectWorksheet("incremental")}
                disabled={collectActionDisabled}
              >
                {busyAction === "collect-incremental" ? "빠른 수집 중..." : "빠른 수집"}
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  void (worksheetMode === "invoice" ? executeInvoiceInputMode() : executeSelectedInvoices())
                }
                disabled={transmitActionDisabled}
              >
                {transmitActionBusyLabel}
              </button>
              <button
                className="button ghost"
                onClick={openInvoiceInputDialog}
                disabled={openInvoiceInputDisabled}
              >
                송장 입력
              </button>
              <button
                className="button ghost"
                onClick={() => openExcelSortDialog("selected")}
                disabled={openExcelExportDisabled}
              >
                선택 행 엑셀 다운로드
              </button>
              <button
                className="button ghost"
                onClick={() => openExcelSortDialog("notExported")}
                disabled={openNotExportedExcelExportDisabled}
              >
                미출력건 전부 다운로드
              </button>
              {dirtyCount ? (
                <button
                  className="button secondary"
                  onClick={() => void saveWorksheetChanges()}
                  disabled={busyAction !== null}
                >
                  {busyAction === "save" ? "저장 중..." : "변경 저장"}
                </button>
              ) : null}
              <details className="shipment-manage-actions">
                <summary className="shipment-manage-actions-trigger">관리 작업</summary>
                <div className="shipment-manage-actions-menu">
                  <button
                    className="button ghost"
                    onClick={() => void collectWorksheet("full")}
                    disabled={collectActionDisabled}
                  >
                    {busyAction === "collect-full" ? "재동기화 중..." : "전체 재동기화"}
                  </button>
                </div>
              </details>
            </div>
            {isFallback ? (
              <div className="muted action-disabled-reason">
                대체 데이터에서는 송장 전송을 실행할 수 없습니다.
              </div>
            ) : selectedInvoiceBlockedRows.length ? (
              <div className="muted action-disabled-reason">
                클레임 {selectedInvoiceBlockedRows.length}건은 송장 전송 대상에서 제외됩니다.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card shipment-filter-bar">
        <div className="shipment-filter-fields">
          <select
            value={filters.selectedStoreId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                selectedStoreId: event.target.value,
              }))
            }
          >
            <option value="">스토어 선택</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.storeName}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.createdAtFrom}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                createdAtFrom: event.target.value,
              }))
            }
          />
          <input
            type="date"
            value={filters.createdAtTo}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                createdAtTo: event.target.value,
              }))
            }
          />
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value,
              }))
            }
          >
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                query: event.target.value,
              }))
            }
            placeholder="셀픽주문번호, 상품명, 수령자명, 송장번호 검색"
          />
        </div>

        <div className="shipment-filter-support">
          <select
            aria-label="목록 건수"
            value={filters.maxPerPage}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxPerPage: Number(event.target.value),
              }))
            }
          >
            <option value={10}>10건</option>
            <option value={20}>20건</option>
            <option value={50}>50건</option>
          </select>
          <button
            type="button"
            className="button ghost shipment-icon-button"
            aria-label="워크시트 새로고침"
            title="워크시트 새로고침"
            onClick={() => void worksheetQuery.refetch()}
            disabled={refreshActionDisabled}
          >
            <RefreshCcw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">전체</div>
          <div className="metric-value">{draftRows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">현재 목록</div>
          <div className="metric-value">{visibleRows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">전송 대상</div>
          <div className="metric-value">{invoiceReadyRows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">미저장 변경</div>
          <div className="metric-value">{dirtyCount}</div>
        </div>
      </div>

      <div className="card shipment-status-toolbar">
        <div className="shipment-status-group">
          <div className="shipment-status-group-label">
            전송
            <span className="muted">{formatNumber(quickFilterResult.invoiceCounts.all)}건</span>
          </div>
          <div className="shipment-status-pill-list">
            {INVOICE_STATUS_CARD_OPTIONS.map((option) => {
              const active = activeInvoiceStatusCard === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`shipment-filter-pill ${option.toneClassName}${active ? " active" : ""}`}
                  aria-pressed={active}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      invoiceStatusCard: option.value,
                    }))
                  }
                >
                  <span>{option.label}</span>
                  <strong>{formatNumber(quickFilterResult.invoiceCounts[option.value])}</strong>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shipment-status-group">
          <div className="shipment-status-group-label">
            출력
            <span className="muted">{formatNumber(quickFilterResult.outputCounts.all)}건</span>
          </div>
          <div className="shipment-status-pill-list">
            {OUTPUT_STATUS_CARD_OPTIONS.map((option) => {
              const active = activeOutputStatusCard === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`shipment-filter-pill ${option.toneClassName}${active ? " active" : ""}`}
                  aria-pressed={active}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      outputStatusCard: option.value,
                    }))
                  }
                >
                  <span>{option.label}</span>
                  <strong>{formatNumber(quickFilterResult.outputCounts[option.value])}</strong>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shipment-status-group">
          <div className="shipment-status-group-label">
            주문
            <span className="muted">{formatNumber(quickFilterResult.orderCounts.all)}건</span>
          </div>
          <div className="shipment-status-pill-list">
            {ORDER_STATUS_CARD_OPTIONS.map((option) => {
              const active = activeOrderStatusCard === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`shipment-filter-pill ${option.toneClassName}${active ? " active" : ""}`}
                  aria-pressed={active}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      orderStatusCard: option.value,
                    }))
                  }
                >
                  <span>{option.label}</span>
                  <strong>{formatNumber(quickFilterResult.orderCounts[option.value])}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {recentActivityItems.length ? (
        <details className="card shipment-activity-card">
          <summary className="shipment-activity-summary">
            <div>
              <strong>최근 작업 알림</strong>
              <div className="muted shipment-activity-summary-text">
                {recentActivityItems[0]?.title ?? "최근 작업"} · {recentActivityItems.length}건
              </div>
            </div>
            <span className="shipment-activity-summary-action">펼치기</span>
          </summary>

          <div className="shipment-activity-list">
            {recentActivityItems.map((item) => (
              <div
                key={item.id}
                className={`feedback${item.tone === "error" ? " error" : item.tone === "warning" ? " warning" : item.tone === "success" ? " success" : ""}`}
              >
                <strong>{item.title}</strong>
                <div className="muted">{item.message}</div>
                {item.details.length ? (
                  <ul className="messages">
                    {item.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {activeTab === "worksheet" ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 style={{ margin: 0 }}>셀픽 워크시트</h2>
              <div className="muted shipment-grid-note">{invoiceModeNotice}</div>
              <div className="muted shipment-grid-note">{detailGuideNotice}</div>
            </div>
            <div className="toolbar shipment-worksheet-toolbar">
              <div className="segmented-control">
                <button
                  className={`segmented-button${worksheetMode === "default" ? " active" : ""}`}
                  onClick={() => setWorksheetMode("default")}
                >
                  기본 보기
                </button>
                <button
                  className={`segmented-button${worksheetMode === "invoice" ? " active" : ""}`}
                  onClick={() => setWorksheetMode("invoice")}
                >
                  송장 입력하기
                </button>
              </div>
              <button className="button ghost" onClick={() => setActiveTab("settings")}>
                컬럼 설정
              </button>
            </div>
          </div>

          {worksheetQuery.isLoading && !activeSheet ? (
            <div className="empty">배송 시트를 불러오는 중입니다...</div>
          ) : !draftRows.length ? (
            <div className="empty">수집 버튼을 눌러 셀픽 형식 배송 시트를 생성해 주세요.</div>
          ) : (
            <>
              <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div className="selection-summary">
                  전체 {formatNumber(visibleRows.length)}행 · 현재 페이지 {formatNumber(pagedVisibleRows.length)}행 ·{" "}
                  {worksheetPage} / {worksheetTotalPages} 페이지
                </div>
                <div className="toolbar" style={{ gap: "0.5rem" }}>
                  <label style={{ display: "grid", gap: "0.25rem" }}>
                    <span className="muted">보기 행 수</span>
                    <select
                      value={worksheetPageSize}
                      onChange={(event) => {
                        setWorksheetPageSize(Number(event.target.value));
                        setWorksheetPage(1);
                      }}
                    >
                      {SHIPMENT_WORKSHEET_PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}행
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => setWorksheetPage((current) => Math.max(1, current - 1))}
                    disabled={worksheetPage <= 1}
                  >
                    이전
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() =>
                      setWorksheetPage((current) => Math.min(worksheetTotalPages, current + 1))
                    }
                    disabled={worksheetPage >= worksheetTotalPages}
                  >
                    다음
                  </button>
                </div>
              </div>
              <div className="grid-shell shipment-grid-shell" onPasteCapture={handleGridPaste}>
                <DataGrid
                  className={`rdg-light shipment-grid${worksheetMode === "invoice" ? " invoice-input-mode" : ""}`}
                  columns={columns}
                  defaultColumnOptions={{ resizable: true }}
                  rows={pagedVisibleRows}
                  rowKeyGetter={(row: CoupangShipmentWorksheetRow) => row.id}
                  selectedRows={pageSelectedRowIds}
                  sortColumns={sortColumns}
                  onSortColumnsChange={(nextSortColumns) => setSortColumns(nextSortColumns.slice(-1))}
                  onSelectedRowsChange={handlePageSelectedRowsChange}
                  onRowsChange={handleVisibleRowsChange}
                  onFill={handleGridFill}
                  onCellClick={handleGridCellClick}
                  onSelectedCellChange={(args: CellSelectArgs<CoupangShipmentWorksheetRow>) =>
                    setSelectedCell({
                      rowIdx: args.rowIdx,
                      columnId: String(args.column.key),
                    })
                  }
                  onColumnResize={(column, width) =>
                    setColumnWidths((current) => ({
                      ...current,
                      [String(column.key)]: width,
                    }))
                  }
                  onColumnsReorder={handleGridColumnsReorder}
                  rowClass={(row) => {
                    const classNames = [];
                    if (dirtySet.has(row.sourceKey)) {
                      classNames.push("shipment-row-dirty");
                    }
                    if (row.invoiceTransmissionStatus === "failed") {
                      classNames.push("shipment-row-failed");
                    }
                    if (row.invoiceTransmissionStatus === "pending") {
                      classNames.push("shipment-row-pending");
                    }
                    return classNames.length ? classNames.join(" ") : undefined;
                  }}
                  style={{ height: 640 }}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 style={{ margin: 0 }}>다운로드 컬럼 설정</h2>
              <div className="muted shipment-grid-note">
                컬럼명 변경, 소스 변경, 삭제와 추가가 가능합니다. 여기에서 바꾼 순서와 구성이
                워크시트와 엑셀 다운로드에 같이 적용됩니다.
              </div>
            </div>
            <div className="toolbar">
              <button className="button ghost" onClick={() => setActiveTab("worksheet")}>
                워크시트로 돌아가기
              </button>
              <button className="button ghost" onClick={addColumnConfig}>
                컬럼 추가
              </button>
              <button className="button ghost" onClick={resetColumnConfigs}>
                기본값 복원
              </button>
              <button
                className="button"
                onClick={() => openExcelSortDialog("selected")}
                disabled={openExcelExportDisabled}
              >
                선택 행 엑셀 다운로드
              </button>
              <button
                className="button ghost"
                onClick={() => openExcelSortDialog("notExported")}
                disabled={openNotExportedExcelExportDisabled}
              >
                미출력건 전부 다운로드
              </button>
            </div>
          </div>

          <div className="column-settings-list">
            {columnConfigs.map((config) => (
              <div
                key={config.id}
                className={`column-settings-row${draggingConfigId === config.id ? " dragging" : ""}`}
                draggable
                onDragStart={() => setDraggingConfigId(config.id)}
                onDragEnd={() => setDraggingConfigId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleSettingsDrop(config.id)}
              >
                <div className="column-settings-handle">드래그</div>
                <input
                  value={config.label}
                  onChange={(event) => updateColumnConfig(config.id, { label: event.target.value })}
                  placeholder="컬럼명"
                />
                <select
                  value={config.sourceKey}
                  onChange={(event) =>
                    updateColumnConfig(config.id, {
                      sourceKey: event.target.value as ShipmentColumnSourceKey,
                      label: config.label || SHIPMENT_COLUMN_LABELS[event.target.value as ShipmentColumnSourceKey],
                    })
                  }
                >
                  {SHIPMENT_COLUMN_SOURCE_OPTIONS.map((sourceKey) => (
                    <option key={sourceKey} value={sourceKey}>
                      {SHIPMENT_COLUMN_LABELS[sourceKey]}
                    </option>
                  ))}
                </select>
                <div className="muted">
                  현재 너비 {columnWidths[config.id] ?? SHIPMENT_COLUMN_DEFAULT_WIDTHS[config.sourceKey]}px
                </div>
                <button
                  className="button ghost"
                  onClick={() => deleteColumnConfig(config.id)}
                  disabled={columnConfigs.length <= 1}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {detailRow ? (
        <div className="csv-overlay" onMouseDown={closeShipmentDetailDialog}>
          <div
            className="csv-dialog detail-dialog shipment-detail-dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="detail-box-header">
              <div className="shipment-detail-header-stack">
                <div>
                  <h3 className="shipment-detail-title">셀픽 워크시트 상세</h3>
                  <p className="muted shipment-detail-dialog-note">
                    메모, 현재 상태, 쿠팡 주문 상세와 클레임 내용을 한 번에 확인합니다.
                  </p>
                </div>

                <div className="shipment-detail-hero">
                  <div className="shipment-detail-hero-copy">
                    <div className="shipment-detail-hero-eyebrow">워크시트 행 요약</div>
                    <strong className="shipment-detail-hero-title">
                      {detailRow.exposedProductName || detailRow.productName}
                    </strong>
                    <div className="shipment-detail-hero-meta">{detailHeroMeta}</div>
                  </div>
                  <div className="shipment-detail-hero-badges">
                    <div className="shipment-detail-hero-badge">
                      <span className="shipment-detail-hero-badge-label">워크시트</span>
                      {detailWorksheetStatusValue}
                    </div>
                    <div className="shipment-detail-hero-badge">
                      <span className="shipment-detail-hero-badge-label">송장</span>
                      {detailInvoiceStatusValue}
                    </div>
                    <div className="shipment-detail-hero-badge">
                      <span className="shipment-detail-hero-badge-label">클레임</span>
                      {detailClaimStatusValue}
                    </div>
                  </div>
                </div>
              </div>
              <div className="detail-actions">
                <button className="button secondary" onClick={closeShipmentDetailDialog}>
                  닫기
                </button>
              </div>
            </div>

            <div className="shipment-detail-section-grid">
              <OrderTicketSection title="주문 정보">
                <TicketInfoTable rows={detailWorksheetRows} />
              </OrderTicketSection>

              <OrderTicketSection title="배송 정보">
                <TicketInfoTable rows={detailDeliveryRows} />
              </OrderTicketSection>

              <OrderTicketSection title="상태 / 메모">
                <TicketInfoTable rows={detailStatusRows} />
              </OrderTicketSection>
            </div>

            {shipmentDetailQuery.isLoading ? (
              <div className="empty">쿠팡 주문 상세와 클레임 정보를 불러오는 중입니다...</div>
            ) : shipmentDetailQuery.error ? (
              <div className="feedback error">
                <strong>상세 정보를 불러오지 못했습니다.</strong>
                <div>{(shipmentDetailQuery.error as Error).message}</div>
              </div>
            ) : (
              <>
                {shipmentDetailQuery.data?.source === "fallback" || shipmentDetailQuery.data?.message ? (
                  <div className="feedback warning">
                    <strong>
                      {shipmentDetailQuery.data?.source === "fallback"
                        ? "실시간 상세 일부를 불러오지 못했습니다."
                        : "쿠팡 상세 응답에 안내 메시지가 있습니다."}
                    </strong>
                    <div>
                      {shipmentDetailQuery.data?.message ??
                        "워크시트에 저장된 정보와 실시간 조회 결과를 함께 보여주고 있습니다."}
                    </div>
                  </div>
                ) : null}

                <div className="shipment-detail-section-grid">
                  <OrderTicketSection title="실시간 주문 상세">
                    <TicketInfoTable rows={detailRealtimeOrderRows} />
                  </OrderTicketSection>

                  <OrderTicketSection title="주문 상품">
                    {detailOrderDetail?.items.length ? (
                      <div className="shipment-detail-table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>상품</th>
                              <th>옵션</th>
                              <th>수량</th>
                              <th>상태</th>
                              <th>송장</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailOrderDetail.items.map((item, index) => (
                              <tr key={`${item.id}:${index}`}>
                                <td>{item.productName}</td>
                                <td>{item.optionName ?? "-"}</td>
                                <td>{formatNumber(item.quantity)}</td>
                                <td>{formatOrderStatusLabel(item.status)}</td>
                                <td>{formatJoinedText([item.deliveryCompanyCode, item.invoiceNumber])}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="muted">실시간 주문 상품 상세가 없습니다.</div>
                    )}
                  </OrderTicketSection>
                </div>

                <div className="detail-box">
                  <div className="detail-box-header">
                    <div>
                      <strong>취소 / 반품 클레임</strong>
                      <div className="table-note">
                        총 {formatNumber(detailReturnRows.length)}건 · 조회 범위 {detailClaimLookupRange}
                      </div>
                    </div>
                  </div>
                  {detailReturnRows.length ? (
                    <div className="shipment-detail-claim-list">
                      {detailReturnRows.map((row) => {
                        const detail = returnDetailByReceiptId.get(row.receiptId) ?? null;
                        const summaryRow = detail?.summaryRow ?? row;
                        const actionLabels = buildReturnActionLabels(summaryRow);

                        return (
                          <div key={row.receiptId} className="detail-card shipment-detail-claim-card">
                            <div className="detail-box-header">
                              <div>
                                <strong>{summaryRow.cancelType === "RETURN" ? "반품" : summaryRow.cancelType}</strong>
                                <div className="table-note">{summaryRow.receiptId}</div>
                              </div>
                              <div className="muted">{summaryRow.status}</div>
                            </div>

                            <div className="detail-grid">
                              <div className="detail-card">
                                <strong>요청 상태</strong>
                                <p>상품: {formatJoinedText([summaryRow.productName, summaryRow.vendorItemName], " / ")}</p>
                                <p>수량: {formatNumber(summaryRow.cancelCount ?? summaryRow.purchaseCount)}개</p>
                                <p>
                                  유형:{" "}
                                  {formatJoinedText(
                                    [summaryRow.cancelType, summaryRow.receiptType, summaryRow.returnDeliveryType],
                                    " · ",
                                  )}
                                </p>
                                <p>
                                  사유:{" "}
                                  {formatClaimReasonText(
                                    detail?.reason ?? summaryRow.reason,
                                    detail?.reasonCode ?? summaryRow.reasonCode,
                                  )}
                                </p>
                                <p>책임 구분: {formatText(detail?.faultByType ?? summaryRow.faultByType)}</p>
                                <p>
                                  선환불:{" "}
                                  {detail?.preRefund === null || detail?.preRefund === undefined
                                    ? "-"
                                    : detail.preRefund
                                      ? "예"
                                      : "아니오"}
                                </p>
                              </div>

                              <div className="detail-card">
                                <strong>요청자 / 회수</strong>
                                <p>
                                  요청자:{" "}
                                  {formatJoinedText([
                                    detail?.requester.name ?? summaryRow.requesterName,
                                    detail?.requester.mobile ??
                                      detail?.requester.phone ??
                                      summaryRow.requesterMobile ??
                                      summaryRow.requesterPhone,
                                  ])}
                                </p>
                                <p>
                                  회수지:{" "}
                                  {formatAddressText([
                                    detail?.requester.postCode
                                      ? `(${detail.requester.postCode})`
                                      : summaryRow.requesterPostCode
                                        ? `(${summaryRow.requesterPostCode})`
                                        : null,
                                    detail?.requester.address ?? summaryRow.requesterAddress,
                                    detail?.requester.addressDetail,
                                  ])}
                                </p>
                                <p>회수송장: {formatReturnDeliverySummary(detail, summaryRow)}</p>
                                <p>
                                  반품비: {formatCurrency(detail?.returnCharge.amount ?? summaryRow.retrievalChargeAmount)}
                                </p>
                                <p>가능 작업: {formatActionsText(actionLabels)}</p>
                              </div>

                              <div className="detail-card">
                                <strong>처리 이력</strong>
                                <p>등록일: {formatDateTimeLabel(detail?.createdAt ?? summaryRow.createdAt)}</p>
                                <p>수정일: {formatDateTimeLabel(detail?.modifiedAt ?? summaryRow.modifiedAt)}</p>
                                <p>
                                  완료일:{" "}
                                  {formatDateTimeLabel(detail?.completeConfirmDate ?? summaryRow.completeConfirmDate)}
                                </p>
                                <p>완료 유형: {formatText(detail?.completeConfirmType ?? summaryRow.completeConfirmType)}</p>
                                <p>출고 상태: {formatText(summaryRow.releaseStatus)}</p>
                              </div>
                            </div>

                            {detail?.items.length ? (
                              <div className="shipment-detail-claim-table">
                                <strong>반품 상품</strong>
                                <table className="table">
                                  <thead>
                                    <tr>
                                      <th>상품</th>
                                      <th>shipmentBoxId</th>
                                      <th>수량</th>
                                      <th>상태</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.items.map((item, index) => (
                                      <tr key={`${summaryRow.receiptId}:item:${index}`}>
                                        <td>{item.vendorItemName ?? item.sellerProductName ?? item.vendorItemId ?? "-"}</td>
                                        <td>{item.shipmentBoxId ?? "-"}</td>
                                        <td>{formatNumber(item.cancelCount ?? item.purchaseCount)}</td>
                                        <td>{item.releaseStatusName ?? item.releaseStatus ?? "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}

                            {detail?.deliveries.length ? (
                              <div className="shipment-detail-claim-table">
                                <strong>회수 송장 상세</strong>
                                <table className="table">
                                  <thead>
                                    <tr>
                                      <th>구분</th>
                                      <th>택배사</th>
                                      <th>송장번호</th>
                                      <th>등록번호</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.deliveries.map((delivery, index) => (
                                      <tr key={`${summaryRow.receiptId}:delivery:${index}`}>
                                        <td>{delivery.returnExchangeDeliveryType ?? "-"}</td>
                                        <td>{delivery.deliveryCompanyCode ?? "-"}</td>
                                        <td>{delivery.deliveryInvoiceNo ?? "-"}</td>
                                        <td>{delivery.regNumber ?? "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="muted">현재 확인된 취소/반품 클레임이 없습니다.</div>
                  )}
                </div>

                <div className="detail-box">
                  <div className="detail-box-header">
                    <div>
                      <strong>교환 클레임</strong>
                      <div className="table-note">
                        총 {formatNumber(detailExchangeRows.length)}건 · 조회 범위 {detailClaimLookupRange}
                      </div>
                    </div>
                  </div>
                  {detailExchangeRows.length ? (
                    <div className="shipment-detail-claim-list">
                      {detailExchangeRows.map((row) => {
                        const detail = exchangeDetailById.get(row.exchangeId) ?? null;
                        const summaryRow = detail?.summaryRow ?? row;
                        const actionLabels = buildExchangeActionLabels(summaryRow);

                        return (
                          <div key={row.exchangeId} className="detail-card shipment-detail-claim-card">
                            <div className="detail-box-header">
                              <div>
                                <strong>교환</strong>
                                <div className="table-note">{summaryRow.exchangeId}</div>
                              </div>
                              <div className="muted">{summaryRow.status}</div>
                            </div>

                            <div className="detail-grid">
                              <div className="detail-card">
                                <strong>요청 상태</strong>
                                <p>상품: {formatJoinedText([summaryRow.productName, summaryRow.vendorItemName], " / ")}</p>
                                <p>수량: {formatNumber(summaryRow.quantity)}개</p>
                                <p>회수 상태: {formatText(detail?.collectStatus ?? summaryRow.collectStatus)}</p>
                                <p>
                                  사유:{" "}
                                  {formatClaimReasonText(
                                    detail?.reason ?? summaryRow.reason,
                                    detail?.reasonCode ?? summaryRow.reasonCode,
                                    detail?.reasonDetail ?? summaryRow.reasonDetail,
                                  )}
                                </p>
                                <p>주문 배송상태: {formatText(detail?.orderDeliveryStatusCode ?? summaryRow.orderDeliveryStatusCode)}</p>
                                <p>가능 작업: {formatActionsText(actionLabels)}</p>
                              </div>

                              <div className="detail-card">
                                <strong>회수지 / 메모</strong>
                                <p>
                                  회수지:{" "}
                                  {formatJoinedText([
                                    detail?.requester.name ?? summaryRow.returnCustomerName,
                                    detail?.requester.mobile ??
                                      detail?.requester.phone ??
                                      summaryRow.returnMobile,
                                  ])}
                                </p>
                                <p>
                                  주소:{" "}
                                  {formatAddressText([
                                    detail?.requester.postCode ? `(${detail.requester.postCode})` : null,
                                    detail?.requester.address ?? summaryRow.returnAddress,
                                    detail?.requester.addressDetail,
                                  ])}
                                </p>
                                <p>요청 메모: {formatText(detail?.requester.memo)}</p>
                                <p>회수 완료: {formatDateTimeLabel(detail?.collectCompleteDate ?? summaryRow.collectCompleteDate)}</p>
                              </div>

                              <div className="detail-card">
                                <strong>재배송지 / 메모</strong>
                                <p>
                                  수령지:{" "}
                                  {formatJoinedText([
                                    detail?.recipient.name ?? summaryRow.deliveryCustomerName,
                                    detail?.recipient.mobile ??
                                      detail?.recipient.phone ??
                                      summaryRow.deliveryMobile,
                                  ])}
                                </p>
                                <p>
                                  주소:{" "}
                                  {formatAddressText([
                                    detail?.recipient.postCode ? `(${detail.recipient.postCode})` : null,
                                    detail?.recipient.address ?? summaryRow.deliveryAddress,
                                    detail?.recipient.addressDetail,
                                  ])}
                                </p>
                                <p>수령 메모: {formatText(detail?.recipient.memo)}</p>
                                <p>교환 송장: {formatExchangeInvoiceSummary(detail, summaryRow)}</p>
                              </div>
                            </div>

                            {detail?.items.length ? (
                              <div className="shipment-detail-claim-table">
                                <strong>교환 상품</strong>
                                <table className="table">
                                  <thead>
                                    <tr>
                                      <th>상품</th>
                                      <th>shipmentBoxId</th>
                                      <th>수량</th>
                                      <th>상태</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.items.map((item, index) => (
                                      <tr key={`${summaryRow.exchangeId}:item:${index}`}>
                                        <td>{item.targetItemName ?? item.orderItemName ?? item.vendorItemName ?? "-"}</td>
                                        <td>{item.shipmentBoxId ?? "-"}</td>
                                        <td>{formatNumber(item.quantity)}</td>
                                        <td>{item.collectStatus ?? item.releaseStatus ?? "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}

                            {detail?.invoices.length ? (
                              <div className="shipment-detail-claim-table">
                                <strong>교환 송장 상세</strong>
                                <table className="table">
                                  <thead>
                                    <tr>
                                      <th>shipmentBoxId</th>
                                      <th>택배사</th>
                                      <th>송장번호</th>
                                      <th>예정일</th>
                                      <th>상태</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.invoices.map((invoice, index) => (
                                      <tr key={`${summaryRow.exchangeId}:invoice:${index}`}>
                                        <td>{invoice.shipmentBoxId ?? "-"}</td>
                                        <td>{invoice.deliverCode ?? "-"}</td>
                                        <td>{invoice.invoiceNumber ?? "-"}</td>
                                        <td>{invoice.estimatedDeliveryDate ?? "-"}</td>
                                        <td>{invoice.statusCode ?? "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="muted">현재 확인된 교환 클레임이 없습니다.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {isExcelSortDialogOpen ? (
        <div className="csv-overlay" onMouseDown={closeExcelSortDialog}>
          <div
            className="csv-dialog shipment-export-dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div>
              <h3 style={{ margin: 0 }}>엑셀 정렬 기준 선택</h3>
              <p className="muted shipment-export-dialog-note">
                {getShipmentExcelExportScopeLabel(excelExportScope)}{" "}
                {formatNumber(
                  excelExportScope === "selected" ? selectedRows.length : notExportedRows.length,
                )}
                행을 엑셀로 내보내기 전에 정렬 기준을 선택해 주세요.
              </p>
            </div>
            <div className="shipment-export-dialog-options">
              <button
                type="button"
                className="button shipment-export-dialog-option"
                onClick={() => applyExcelSortDialog("productName")}
              >
                상품명순으로 내보내기
              </button>
              <button
                type="button"
                className="button secondary shipment-export-dialog-option"
                onClick={() => applyExcelSortDialog("date")}
              >
                날짜순으로 내보내기
              </button>
            </div>
            <div className="toolbar" style={{ justifyContent: "flex-end" }}>
              <button className="button secondary" onClick={closeExcelSortDialog}>
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isInvoiceInputDialogOpen
        ? renderOverlayInBody(
            <div className="csv-overlay" onMouseDown={closeInvoiceInputDialog}>
              <div
                className="csv-dialog shipment-invoice-dialog"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div>
                  <h3 style={{ margin: 0 }}>송장 입력하기</h3>
                  <p className="muted shipment-invoice-dialog-note">
                    아래 형식으로 붙여넣으면 `셀픽주문번호` 기준으로 현재 워크시트의 `택배사`, `운송장번호`
                    값을 채웁니다.
                  </p>
                </div>
                <div className="shipment-invoice-dialog-example">
                  <strong>입력 형식</strong>
                  <pre>{`택배사\t운송장번호\t셀픽주문번호\nCJ대한통운\t123456789\tO20260326K0001`}</pre>
                </div>
                <textarea
                  className="shipment-invoice-dialog-textarea"
                  rows={12}
                  value={invoiceInputDialogValue}
                  onChange={(event) => setInvoiceInputDialogValue(event.target.value)}
                  placeholder={"택배사\t운송장번호\t셀픽주문번호"}
                />
                <div className="toolbar" style={{ justifyContent: "flex-end" }}>
                  <button className="button secondary" onClick={closeInvoiceInputDialog}>
                    닫기
                  </button>
                  <button
                    className="button"
                    onClick={() => void applyInvoiceInputDialog()}
                    disabled={!invoiceInputDialogValue.trim() || busyAction !== null}
                  >
                    {busyAction === "save" ? "반영 중..." : "값 반영"}
                  </button>
                </div>
              </div>
            </div>,
          )
        : null}
    </div>
  );
}

