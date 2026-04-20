import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";
import {
  type CellClickArgs,
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
  type CoupangPrepareTarget,
  type ReconcileCoupangShipmentWorksheetResponse,
  type CoupangReturnDetail,
  type CoupangReturnRow,
  type CoupangShipmentArchiveRow,
  type CoupangShipmentArchiveViewResponse,
  type CoupangShipmentWorksheetAuditMissingResponse,
  type CoupangShipmentWorksheetInvoiceInputApplyResponse,
  type CoupangShipmentWorksheetInvoiceInputApplyRow,
  type CoupangShipmentWorksheetBulkResolveResponse,
  type CoupangShipmentWorksheetColumnSourceKey,
  type CoupangShipmentWorksheetDetailResponse,
  type CoupangShipmentWorksheetRefreshResponse,
  type CoupangShipmentWorksheetRow,
  type CoupangShipmentWorksheetResponse,
  type CoupangShipmentWorksheetSortField,
  type CoupangShipmentWorksheetViewResponse,
  type CoupangShipmentWorksheetViewScope,
  type PatchCoupangShipmentWorksheetItemInput,
} from "@shared/coupang";
import { useOperations } from "@/components/operation-provider";
import { StatusBadge } from "@/components/status-badge";
import {
  canAttemptInvoiceRow,
  canSendInvoiceRow,
  getInvoiceStatusCardKey,
  isSameInvoicePayload,
  normalizeInvoiceStatusCardKey,
  normalizeOrderStatusCardKey,
  normalizeOutputStatusCardKey,
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
import { apiRequestJson, getJson } from "@/lib/queryClient";
import { usePersistentState } from "@/lib/use-persistent-state";
import {
  buildCsHubWorkspaceHref,
  buildFulfillmentWorkspaceHref,
  buildWorkCenterWorkspaceHref,
  parseFulfillmentWorkspaceSearch,
  type FulfillmentWorkspaceTab,
} from "@/lib/ops-handoff-links";
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
  buildShipmentColumnSourceOptions,
  createDefaultShipmentColumnConfigs,
  createDefaultFilters,
  createShipmentColumnConfig,
  isGridEditableSource,
  moveColumnConfigs,
  normalizeFiltersToSeoulToday,
  normalizeShipmentColumnConfigs,
  resolveShipmentWorksheetMirrorSyncRequirement,
  resolveShipmentColumnDefaultWidth,
  serializeShipmentWorksheetSortField,
  SHIPMENT_WORKSHEET_PAGE_SIZE_OPTIONS,
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
import {
  dedupeInvoiceInputApplyRows,
  resolveSourceKeysForTouchedRowIds,
} from "./invoice-input-apply";
import {
  buildShipmentWorksheetAuditDetails,
  buildShipmentWorksheetAuditRequest,
  summarizeShipmentWorksheetAuditResult,
} from "./shipment-audit-missing";
import {
  buildOptimisticPrepareRowUpdates,
  buildPrepareAcceptedOrdersFeedback,
  getSucceededPrepareShipmentBoxIds,
  resolveInvoiceAutoPrepareRows,
  resolvePrepareAcceptedOrdersPlan,
} from "./shipment-prepare-flow";
import {
  getFulfillmentDecision,
  getFulfillmentDecisionReasonLabel,
  getFulfillmentDecisionStatusLabel,
} from "./fulfillment-decision";
import {
  buildShipmentFilterSummaryTokens,
  countActiveShipmentDetailFilters,
} from "./fulfillment-filter-summary";
import { resolveShipmentHandoffLinks } from "./fulfillment-handoff";
import {
  buildQuickCollectFocusSignature,
  type QuickCollectFocusState,
} from "./quick-collect-focus";
import FulfillmentDrawerController from "./fulfillment-drawer-controller";
import FulfillmentGridController from "./fulfillment-grid-controller";
import ShipmentHubSidePanel from "./shipment-hub-side-panel";
import FulfillmentSelectionController from "./fulfillment-selection-controller";
import FulfillmentShell from "./fulfillment-shell";
import FulfillmentSummaryBar from "./fulfillment-summary-bar";
import FulfillmentToolbar from "./fulfillment-toolbar";
import {
  buildShipmentBlockedDecisionDetails,
  summarizeShipmentBlockedDecisionRows,
} from "./shipment-selection-summary";
import {
  buildShipmentColumnPresetConfigs,
  buildShipmentColumnPresetWidths,
  detectShipmentColumnPresetKey,
  type ShipmentColumnPresetKey,
} from "./shipment-column-presets";
import type {
  ShipmentDetailClaimCardView,
  ShipmentDetailInfoRow,
  ShipmentDetailTable,
} from "./shipment-detail-dialog";
import { resolveQuickCollectFocusViewState } from "./quick-collect-focus-controller";
import type {
  CoupangStoresResponse,
  EditableColumnKey,
  FeedbackState,
  FilterState,
  SelectedCellState,
  ShipmentActivityItem,
  ShipmentColumnConfig,
  ShipmentColumnSource,
  ShipmentColumnSourceKey,
  ShipmentExcelExportScope,
  ShipmentExcelSortKey,
  ShipmentPreviewRowOption,
  WorksheetMode,
} from "./types";

type InvoiceTransmissionMode = "upload" | "update";

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
  coupangDisplayProductName: "쿠팡 원본 노출상품명",
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
  coupangDisplayProductName: 220,
  productOptionNumber: 130,
  sellerProductCode: 160,
};
const SHIPMENT_COLUMN_SOURCE_OPTIONS: ShipmentColumnSourceKey[] = [
  "blank",
  ...DEFAULT_SHIPMENT_COLUMN_ORDER,
  "coupangDisplayProductName",
];
const WORKSHEET_SCOPE_OPTIONS: ReadonlyArray<{
  value: CoupangShipmentWorksheetViewScope;
  label: string;
  description: string;
}> = [
  { value: "dispatch_active", label: "작업 대상", description: "출고 판단과 송장 작업이 필요한 주문 중심" },
  { value: "post_dispatch", label: "배송 이후", description: "출력 완료된 배송 이후 주문" },
  { value: "claims", label: "예외·클레임", description: "취소·반품·교환·출고중지 등 예외 주문" },
  { value: "all", label: "전체", description: "전체 워크시트" },
] as const;
const MAIN_WORKSHEET_SCOPE_OPTIONS: ReadonlyArray<{
  value: CoupangShipmentWorksheetViewScope;
  label: string;
  description: string;
}> = [
  { value: "all", label: "전체 배송관리", description: "쿠팡 배송관리 미러 기준 전체 조회" },
  { value: "dispatch_active", label: "내부 작업 대상", description: "발송 판단과 송장 작업을 바로 볼 주문" },
  { value: "post_dispatch", label: "배송 이후", description: "출력 완료 후 배송 상태를 보는 주문" },
  { value: "claims", label: "이슈·클레임", description: "취소·반품·교환·출고중지 신호가 있는 주문" },
] as const;
const FULFILLMENT_DECISION_OPTIONS = [
  { value: "all", label: "전체", description: "현재 화면의 주문 전체를 보여줍니다." },
  { value: "ready", label: "출고 가능", description: "즉시 출고 관련 작업을 진행할 수 있는 주문입니다." },
  { value: "invoice_waiting", label: "송장 대기", description: "송장 입력 또는 전송이 먼저 필요한 주문입니다." },
  { value: "hold", label: "보류", description: "CS 영향이나 예외 사유로 운영 확인이 먼저 필요한 주문입니다." },
  { value: "blocked", label: "차단", description: "취소·반품·교환·출고중지로 출고를 막아야 하는 주문입니다." },
  { value: "recheck", label: "재확인 필요", description: "송장 실패나 데이터 누락으로 재확인이 필요한 주문입니다." },
] as const;
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
  { value: "ACCEPT", label: "결제완료", toneClassName: "progress" },
  { value: "INSTRUCT", label: "상품준비중", toneClassName: "progress" },
  { value: "DEPARTURE", label: "배송지시", toneClassName: "progress" },
  { value: "DELIVERING", label: "배송중", toneClassName: "progress" },
  { value: "FINAL_DELIVERY", label: "배송완료", toneClassName: "success" },
  { value: "NONE_TRACKING", label: "업체 직접 배송", toneClassName: "attention" },
  { value: "SHIPMENT_STOP_REQUESTED", label: "출고중지요청", toneClassName: "danger" },
  { value: "SHIPMENT_STOP_HANDLED", label: "출고중지처리완료", toneClassName: "attention" },
  { value: "CANCEL", label: "취소", toneClassName: "danger" },
  { value: "RETURN", label: "반품", toneClassName: "danger" },
  { value: "EXCHANGE", label: "교환", toneClassName: "attention" },
] as const;
const OUTPUT_STATUS_CARD_OPTIONS: readonly QuickFilterCardOption<OutputStatusCardKey>[] = [
  { value: "all", label: "전체", toneClassName: "neutral" },
  { value: "notExported", label: "미출력", toneClassName: "ready" },
  { value: "exported", label: "출력 완료", toneClassName: "success" },
] as const;
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

function areFiltersEqual(left: FilterState, right: FilterState) {
  return (
    left.selectedStoreId === right.selectedStoreId &&
    left.createdAtFrom === right.createdAtFrom &&
    left.createdAtTo === right.createdAtTo &&
    left.query === right.query &&
    left.maxPerPage === right.maxPerPage &&
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

function buildWorksheetViewUrl(input: {
  storeId: string;
  createdAtFrom: string;
  createdAtTo: string;
  scope: CoupangShipmentWorksheetViewScope;
  decisionStatus: FilterState["decisionStatus"];
  priorityCard: FilterState["priorityCard"];
  pipelineCard: FilterState["pipelineCard"];
  issueFilter: FilterState["issueFilter"];
  page: number;
  pageSize: number;
  query: string;
  invoiceStatusCard: InvoiceStatusCardKey;
  orderStatusCard: OrderStatusCardKey;
  outputStatusCard: OutputStatusCardKey;
  sortField: CoupangShipmentWorksheetSortField | null;
  sortDirection: "asc" | "desc";
}) {
  const params = new URLSearchParams({
    storeId: input.storeId,
    createdAtFrom: input.createdAtFrom,
    createdAtTo: input.createdAtTo,
    scope: input.scope,
    page: String(input.page),
    pageSize: String(input.pageSize),
    query: input.query,
    invoiceStatusCard: input.invoiceStatusCard,
    orderStatusCard: input.orderStatusCard,
    outputStatusCard: input.outputStatusCard,
  });

  if (input.decisionStatus !== "all") {
    params.set("decisionStatus", input.decisionStatus);
  }
  if (input.priorityCard !== "all") {
    params.set("priorityCard", input.priorityCard);
  }
  if (input.pipelineCard !== "all") {
    params.set("pipelineCard", input.pipelineCard);
  }
  if (input.issueFilter !== "all") {
    params.set("issueFilter", input.issueFilter);
  }

  if (input.sortField) {
    params.set("sortField", input.sortField);
    params.set("sortDirection", input.sortDirection);
  }

  return `/api/coupang/shipments/worksheet/view?${params.toString()}`;
}

function buildShipmentArchiveViewUrl(input: {
  storeId: string;
  page: number;
  pageSize: number;
  query: string;
}) {
  const params = new URLSearchParams({
    storeId: input.storeId,
    page: String(input.page),
    pageSize: String(input.pageSize),
    query: input.query,
  });

  return `/api/coupang/shipments/archive/view?${params.toString()}`;
}

function buildShipmentDetailUrl(
  path: "/api/coupang/shipments/worksheet/detail" | "/api/coupang/shipments/archive/detail",
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

  return `${path}?${params.toString()}`;
}

function makeColumnId() {
  return `shipment-column-${Math.random().toString(36).slice(2, 10)}`;
}

function dedupeShipmentRowsBySourceKey<
  Row extends Pick<CoupangShipmentWorksheetRow, "sourceKey" | "selpickOrderNumber">,
>(rows: readonly Row[]) {
  const rowBySourceKey = new Map<string, Row>();
  for (const row of rows) {
    rowBySourceKey.set(row.sourceKey, row);
  }

  return Array.from(rowBySourceKey.values());
}

function findDuplicateShipmentSelpickOrderNumbers<
  Row extends Pick<CoupangShipmentWorksheetRow, "sourceKey" | "selpickOrderNumber">,
>(rows: readonly Row[]) {
  const counts = new Map<string, number>();
  for (const row of dedupeShipmentRowsBySourceKey(rows)) {
    const selpickOrderNumber = row.selpickOrderNumber?.trim().toUpperCase();
    if (!selpickOrderNumber) {
      continue;
    }

    counts.set(selpickOrderNumber, (counts.get(selpickOrderNumber) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([selpickOrderNumber]) => selpickOrderNumber)
    .sort((left, right) => left.localeCompare(right));
}

function createBuiltinShipmentColumnSource(
  key: ShipmentColumnSourceKey,
): Extract<ShipmentColumnSource, { kind: "builtin" }> {
  return {
    kind: "builtin",
    key,
  };
}

function createShipmentColumnConfigLocal(
  source: ShipmentColumnSource | ShipmentColumnSourceKey,
): ShipmentColumnConfig {
  const normalizedSource =
    typeof source === "string" ? createBuiltinShipmentColumnSource(source) : source;
  return {
    id: makeColumnId(),
    source: normalizedSource,
    label:
      normalizedSource.kind === "builtin"
        ? SHIPMENT_COLUMN_LABELS[normalizedSource.key]
        : normalizedSource.key,
  };
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
    return {
      kind: "raw",
      key: source.key.trim(),
    };
  }

  return null;
}

function normalizeShipmentColumnConfigsLocal(value: ShipmentColumnConfig[]) {
  const items = Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const candidate = item as Partial<ShipmentColumnConfig> & {
            sourceKey?: unknown;
          };
          const source =
            normalizeShipmentColumnSource(candidate.source) ??
            normalizeShipmentColumnSource(candidate.sourceKey);
          if (!source) {
            return null;
          }

          return {
            id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : makeColumnId(),
            source,
            label:
              typeof candidate.label === "string" && candidate.label.trim()
                ? candidate.label.trim()
                : source.kind === "builtin"
                  ? SHIPMENT_COLUMN_LABELS[source.key]
                  : source.key,
          } satisfies ShipmentColumnConfig;
        })
        .filter((item): item is ShipmentColumnConfig => Boolean(item))
    : [];

  return items.length
    ? items
    : DEFAULT_SHIPMENT_COLUMN_ORDER.map((sourceKey) => createShipmentColumnConfigLocal(sourceKey));
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
  left: string | number | boolean | null | undefined,
  right: string | number | boolean | null | undefined,
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

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
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

  if (config.source.kind === "raw") {
    return row.rawFields?.[config.source.key] ?? null;
  }

  switch (config.source.key) {
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
      return row[config.source.key] as string | number | boolean | null | undefined;
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

function resolveShipmentSortField(
  columnKey: string | null | undefined,
  columnConfigs: readonly ShipmentColumnConfig[],
): CoupangShipmentWorksheetSortField | null {
  if (!columnKey) {
    return null;
  }

  if (
    columnKey === "__exportStatus" ||
    columnKey === "__orderStatus" ||
    columnKey === "__invoiceTransmissionStatus"
  ) {
    return columnKey;
  }

  const config = columnConfigs.find((item) => item.id === columnKey);
  return config ? serializeShipmentWorksheetSortField(config.source) : null;
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
    CoupangShipmentWorksheetRow,
    | "orderStatus"
    | "customerServiceIssueSummary"
    | "customerServiceIssueCount"
    | "customerServiceIssueBreakdown"
  >,
) {
  return (
    formatShipmentWorksheetCustomerServiceLabel({
      summary: row.customerServiceIssueSummary,
      count: row.customerServiceIssueCount,
      state: "ready",
      breakdown: row.customerServiceIssueBreakdown,
    }) ??
    formatCoupangOrderStatusLabel(
      resolveCoupangDisplayOrderStatus({
        orderStatus: row.orderStatus,
        customerServiceIssueSummary: row.customerServiceIssueSummary,
        customerServiceIssueBreakdown: row.customerServiceIssueBreakdown,
      }),
    )
  );
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

function buildExcelClaimBlockedDetails(
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

function getShipmentArchiveReasonLabel(
  row: Pick<CoupangShipmentArchiveRow, "archiveReason">,
) {
  if (row.archiveReason === "cancel_completed") {
    return "취소완료 자동보관";
  }

  if (row.archiveReason === "return_completed") {
    return "반품완료 자동보관";
  }

  if (row.archiveReason === "not_found_in_coupang") {
    return "쿠팡 미조회 제외";
  }

  return "일반 보관";
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
  source: ShipmentColumnSource,
): ReactNode {
  if (source.kind === "raw") {
    const rawValue = row.rawFields?.[source.key];
    if (typeof rawValue === "number") {
      return formatNumber(rawValue);
    }
    if (typeof rawValue === "boolean") {
      return renderTextCell(rawValue ? "true" : "false");
    }
    return renderTextCell(rawValue ?? null);
  }

  switch (source.key) {
    case "blank":
      return renderTextCell(null);
    case "quantity":
      return formatNumber(row.quantity);
    case "salePrice":
      return formatCurrency(row.salePrice);
    case "shippingFee":
      return formatCurrency(row.shippingFee);
    default:
      return renderTextCell(row[source.key] as string | null | undefined);
  }
}

function getShipmentExportValue(row: CoupangShipmentWorksheetRow, source: ShipmentColumnSource) {
  if (source.kind === "raw") {
    const rawValue = row.rawFields?.[source.key];
    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      return String(rawValue);
    }
    return formatExportText(rawValue ?? null);
  }

  switch (source.key) {
    case "blank":
      return "";
    case "quantity":
      return row.quantity ?? "";
    case "salePrice":
      return formatExportCurrency(row.salePrice);
    case "shippingFee":
      return formatExportCurrency(row.shippingFee);
    default:
      return formatExportText(row[source.key] as string | null | undefined);
  }
}

function summarizeShipmentColumnPreviewRow(
  row: Pick<CoupangShipmentWorksheetRow, "selpickOrderNumber" | "exposedProductName" | "productName">,
  mode: "selected" | "visible" | "manual",
) {
  const basisLabel = mode === "selected" ? "선택한 행 기준" : "현재 목록 첫 행 기준";
  const summaryParts = [
    row.selpickOrderNumber?.trim() ? `셀픽 ${row.selpickOrderNumber.trim()}` : null,
    row.exposedProductName?.trim() || row.productName?.trim() || null,
  ].filter(Boolean);

  return summaryParts.length ? `${basisLabel} · ${summaryParts.join(" · ")}` : basisLabel;
}

function describeShipmentColumnPreviewRow(
  row: Pick<CoupangShipmentWorksheetRow, "selpickOrderNumber" | "exposedProductName" | "productName">,
  mode: "selected" | "visible" | "manual",
) {
  const basisLabel =
    mode === "selected"
      ? "선택한 행 기준"
      : mode === "manual"
        ? "직접 고른 행 기준"
        : "현재 목록 첫 행 기준";
  const summaryParts = [
    row.selpickOrderNumber?.trim() ? `주문 ${row.selpickOrderNumber.trim()}` : null,
    row.exposedProductName?.trim() || row.productName?.trim() || null,
  ].filter(Boolean);

  return summaryParts.length ? `${basisLabel} · ${summaryParts.join(" · ")}` : basisLabel;
}

function truncateShipmentPreviewRowText(value: string, maxLength = 42) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function buildShipmentPreviewRowOption(
  row: Pick<
    CoupangShipmentWorksheetRow,
    | "id"
    | "selpickOrderNumber"
    | "productOrderNumber"
    | "exposedProductName"
    | "productName"
    | "receiverName"
    | "orderStatus"
  >,
): ShipmentPreviewRowOption {
  const orderIdentity = row.selpickOrderNumber?.trim() || row.productOrderNumber?.trim() || row.id;
  const productLabel = row.exposedProductName?.trim() || row.productName?.trim() || "상품명 없음";
  const receiverLabel = row.receiverName?.trim() ? `수령인 ${row.receiverName.trim()}` : null;
  const statusLabel = row.orderStatus?.trim() ? `상태 ${row.orderStatus.trim()}` : null;

  return {
    id: row.id,
    label: `${orderIdentity} · ${truncateShipmentPreviewRowText(productLabel, 30)}`,
    description: [orderIdentity, productLabel, receiverLabel, statusLabel].filter(Boolean).join(" · "),
  };
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
    row.coupangDisplayProductName,
    row.productOptionNumber,
    row.sellerProductCode,
    ...Object.values(row.rawFields ?? {}).map((value) =>
      value === null || value === undefined ? "" : String(value),
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function upsertRowMap(
  current: Record<string, CoupangShipmentWorksheetRow>,
  rows: readonly CoupangShipmentWorksheetRow[],
) {
  if (!rows.length) {
    return current;
  }

  const next = { ...current };
  for (const row of rows) {
    next[row.id] = row;
  }
  return next;
}

function omitRowsFromMap(
  current: Record<string, CoupangShipmentWorksheetRow>,
  rowIds: Iterable<string>,
) {
  const next = { ...current };
  let changed = false;

  for (const rowId of Array.from(rowIds)) {
    if (rowId in next) {
      delete next[rowId];
      changed = true;
    }
  }

  return changed ? next : current;
}

export default function CoupangShipmentsPage() {
  const [pathname, navigate] = useLocation();
  const search = useSearch();
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
  const [sheetSnapshot, setSheetSnapshot] = useState<CoupangShipmentWorksheetViewResponse | null>(null);
  const [draftRows, setDraftRows] = useState<CoupangShipmentWorksheetRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, CoupangShipmentWorksheetRow>>({});
  const [dirtySourceKeys, setDirtySourceKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [dirtyRowsBySourceKey, setDirtyRowsBySourceKey] = useState<
    Record<string, CoupangShipmentWorksheetRow>
  >({});
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [auditResult, setAuditResult] =
    useState<CoupangShipmentWorksheetAuditMissingResponse | null>(null);
  const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastAutoFullSyncSignature, setLastAutoFullSyncSignature] = useState<string | null>(null);
  const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);
  const [selectedCell, setSelectedCell] = useState<SelectedCellState>(null);
  const [detailRowSnapshot, setDetailRowSnapshot] = useState<CoupangShipmentWorksheetRow | null>(null);
  const [isFullDetailDialogOpen, setIsFullDetailDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FulfillmentWorkspaceTab>("worksheet");
  const [settingsReturnTab, setSettingsReturnTab] = useState<FulfillmentWorkspaceTab>("worksheet");
  const [worksheetMode, setWorksheetMode] = useState<WorksheetMode>("default");
  const effectiveWorksheetMode: WorksheetMode =
    activeTab === "confirmed" ? "default" : worksheetMode;
  const [quickCollectFocus, setQuickCollectFocus] = useState<QuickCollectFocusState | null>(null);
  const [worksheetPageSize, setWorksheetPageSize] = usePersistentState<number>(
    "kikit:coupang-shipments:worksheet-page-size",
    50,
  );
  const [detailFiltersOpen, setDetailFiltersOpen] = usePersistentState<boolean>(
    "kikit:coupang-shipments:detail-filters-open",
    false,
  );
  const [worksheetPage, setWorksheetPage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);
  const [isInvoiceInputDialogOpen, setIsInvoiceInputDialogOpen] = useState(false);
  const [invoiceInputDialogValue, setInvoiceInputDialogValue] = useState("");
  const [isExcelSortDialogOpen, setIsExcelSortDialogOpen] = useState(false);
  const [excelExportScope, setExcelExportScope] = useState<ShipmentExcelExportScope>("selected");
  const [draggingConfigId, setDraggingConfigId] = useState<string | null>(null);
  const [persistedColumnConfigs, setColumnConfigs] = usePersistentState<ShipmentColumnConfig[]>(
    "kikit:coupang-shipments:columns",
    createDefaultShipmentColumnConfigs(),
  );
  const [columnPreviewRowId, setColumnPreviewRowId] = useState<string | null>(null);
  const columnConfigs = useMemo(
    () => normalizeShipmentColumnConfigs(persistedColumnConfigs),
    [persistedColumnConfigs],
  );
  const [columnWidths, setColumnWidths] = usePersistentState<Record<string, number>>(
    "kikit:layout:rdg:coupang-shipments",
    {},
  );
  const activeColumnPreset = useMemo(
    () => detectShipmentColumnPresetKey(columnConfigs),
    [columnConfigs],
  );
  const routeWorkspaceState = useMemo(
    () => parseFulfillmentWorkspaceSearch(search),
    [search],
  );
  const isRouteWorkspaceStatePending = useMemo(
    () =>
      (routeWorkspaceState.activeTab !== null && routeWorkspaceState.activeTab !== activeTab) ||
      (routeWorkspaceState.filterPatch.selectedStoreId !== undefined &&
        routeWorkspaceState.filterPatch.selectedStoreId !== filters.selectedStoreId) ||
      (routeWorkspaceState.filterPatch.scope !== undefined &&
        routeWorkspaceState.filterPatch.scope !== filters.scope) ||
      (routeWorkspaceState.filterPatch.decisionStatus !== undefined &&
        routeWorkspaceState.filterPatch.decisionStatus !== filters.decisionStatus) ||
      (routeWorkspaceState.filterPatch.query !== undefined &&
        routeWorkspaceState.filterPatch.query !== filters.query),
    [
      activeTab,
      filters.decisionStatus,
      filters.query,
      filters.scope,
      filters.selectedStoreId,
      routeWorkspaceState.activeTab,
      routeWorkspaceState.filterPatch.decisionStatus,
      routeWorkspaceState.filterPatch.query,
      routeWorkspaceState.filterPatch.scope,
      routeWorkspaceState.filterPatch.selectedStoreId,
    ],
  );

  const changeWorkspaceTab = (nextTab: FulfillmentWorkspaceTab) => {
    setActiveTab(nextTab);

    if (!isFiltersLoaded) {
      return;
    }

    const nextHref = buildFulfillmentWorkspaceHref({
      tab: nextTab,
      storeId: filters.selectedStoreId || null,
      scope: filters.scope,
      decisionStatus: filters.decisionStatus,
      query: filters.query,
    });
    const currentHref = `${pathname}${search}`;

    if (nextHref !== currentHref) {
      navigate(nextHref, { replace: true });
    }
  };

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
    if (JSON.stringify(columnConfigs) === JSON.stringify(persistedColumnConfigs)) {
      return;
    }

    setColumnConfigs(columnConfigs);
  }, [columnConfigs, persistedColumnConfigs, setColumnConfigs]);

  useEffect(() => {
    if (!isFiltersLoaded || filters.selectedStoreId || !stores[0]) {
      return;
    }

    setFilters((current) => ({
      ...current,
      selectedStoreId: stores[0].id,
    }));
  }, [filters.selectedStoreId, isFiltersLoaded, setFilters, stores]);

  useEffect(() => {
    if (!isFiltersLoaded) {
      return;
    }

    if (routeWorkspaceState.activeTab && routeWorkspaceState.activeTab !== activeTab) {
      setActiveTab(routeWorkspaceState.activeTab);
    }

    if (!Object.keys(routeWorkspaceState.filterPatch).length) {
      return;
    }

    setFilters((current) => {
      const next = {
        ...current,
        ...routeWorkspaceState.filterPatch,
      };
      return areFiltersEqual(current, next) ? current : next;
    });
  }, [
    activeTab,
    isFiltersLoaded,
    routeWorkspaceState.activeTab,
    routeWorkspaceState.filterPatch,
    setFilters,
  ]);

  const deferredQuery = useDeferredValue(filters.query);
  const effectiveWorksheetScope: CoupangShipmentWorksheetViewScope =
    activeTab === "confirmed" ? "confirmed" : filters.scope;
  const activeSortColumn = sortColumns[0] ?? null;
  const activeSortField = useMemo(
    () => resolveShipmentSortField(activeSortColumn?.columnKey, columnConfigs),
    [activeSortColumn?.columnKey, columnConfigs],
  );
  const activeSortDirection = activeSortColumn?.direction === "DESC" ? "desc" : "asc";
  useEffect(() => {
    if (!isFiltersLoaded) {
      return;
    }

    if (isRouteWorkspaceStatePending) {
      return;
    }

    const nextHref = buildFulfillmentWorkspaceHref({
      tab: activeTab,
      storeId: filters.selectedStoreId || null,
      scope: filters.scope,
      decisionStatus: filters.decisionStatus,
      query: filters.query,
    });
    const currentHref = `${pathname}${search}`;

    if (nextHref !== currentHref) {
      navigate(nextHref, { replace: true });
    }
  }, [
    activeTab,
    filters.decisionStatus,
    filters.query,
    filters.scope,
    filters.selectedStoreId,
    isRouteWorkspaceStatePending,
    isFiltersLoaded,
    navigate,
    pathname,
    search,
  ]);

  const worksheetViewStaleTimeMs = 30_000;

  const worksheetQuery = useQuery({
    queryKey: [
      "/api/coupang/shipments/worksheet/view",
      filters.selectedStoreId,
      filters.createdAtFrom,
      filters.createdAtTo,
      effectiveWorksheetScope,
      worksheetPage,
      worksheetPageSize,
      deferredQuery,
      filters.decisionStatus,
      filters.priorityCard,
      filters.pipelineCard,
      filters.issueFilter,
      filters.invoiceStatusCard,
      filters.orderStatusCard,
      filters.outputStatusCard,
      activeSortField,
      activeSortDirection,
    ],
    queryFn: () =>
      getJson<CoupangShipmentWorksheetViewResponse>(
        buildWorksheetViewUrl({
          storeId: filters.selectedStoreId,
          createdAtFrom: filters.createdAtFrom,
          createdAtTo: filters.createdAtTo,
          scope: effectiveWorksheetScope,
          decisionStatus: filters.decisionStatus,
          priorityCard: filters.priorityCard,
          pipelineCard: filters.pipelineCard,
          issueFilter: filters.issueFilter,
          page: worksheetPage,
          pageSize: worksheetPageSize,
          query: deferredQuery,
          invoiceStatusCard: filters.invoiceStatusCard,
          orderStatusCard: filters.orderStatusCard,
          outputStatusCard: filters.outputStatusCard,
          sortField: activeSortField,
          sortDirection: activeSortDirection,
        }),
      ),
    enabled: Boolean(filters.selectedStoreId),
    staleTime: worksheetViewStaleTimeMs,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const archiveQuery = useQuery({
    queryKey: [
      "/api/coupang/shipments/archive/view",
      filters.selectedStoreId,
      archivePage,
      worksheetPageSize,
      deferredQuery,
      activeTab,
    ],
    queryFn: () =>
      getJson<CoupangShipmentArchiveViewResponse>(
        buildShipmentArchiveViewUrl({
          storeId: filters.selectedStoreId,
          page: archivePage,
          pageSize: worksheetPageSize,
          query: deferredQuery,
        }),
      ),
    enabled: Boolean(filters.selectedStoreId && activeTab === "archive"),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  useEffect(() => {
    if (!worksheetQuery.data) {
      return;
    }

    setSheetSnapshot(worksheetQuery.data);
    setDraftRows(
      sortShipmentRows(
        worksheetQuery.data.items.map((row) => dirtyRowsBySourceKey[row.sourceKey] ?? row),
        sortColumns,
        columnConfigs,
      ),
    );
    setSelectedRowsById((current) => {
      const next = { ...current };
      let changed = false;

      for (const row of worksheetQuery.data.items) {
        if (current[row.id]) {
          next[row.id] = dirtyRowsBySourceKey[row.sourceKey] ?? row;
          changed = true;
        }
      }

      return changed ? next : current;
    });
    setDetailRowSnapshot((current) => {
      if (!current) {
        return current;
      }

      const matched = worksheetQuery.data.items.find((row) => row.id === current.id);
      return matched ? dirtyRowsBySourceKey[matched.sourceKey] ?? matched : current;
    });
  }, [columnConfigs, dirtyRowsBySourceKey, sortColumns, worksheetQuery.data]);

  useEffect(() => {
    if (!filters.selectedStoreId) {
      setSheetSnapshot(null);
      setAuditResult(null);
      setIsAuditDialogOpen(false);
      setDraftRows([]);
      setQuickCollectFocus(null);
      setSelectedRowIds(new Set());
      setSelectedRowsById({});
      setDirtySourceKeys(new Set());
      setDirtyRowsBySourceKey({});
      setSelectedCell(null);
      setDetailRowSnapshot(null);
      setIsFullDetailDialogOpen(false);
    }
  }, [filters.selectedStoreId]);

  useEffect(() => {
    setDetailRowSnapshot(null);
    setIsFullDetailDialogOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "worksheet") {
      setQuickCollectFocus(null);
    }
  }, [activeTab]);

  useEffect(() => {
    setWorksheetPage(1);
    setArchivePage(1);
    setSelectedCell(null);
  }, [
    filters.selectedStoreId,
    filters.scope,
    filters.decisionStatus,
    filters.priorityCard,
    filters.pipelineCard,
    filters.issueFilter,
    deferredQuery,
    filters.invoiceStatusCard,
    filters.orderStatusCard,
    filters.outputStatusCard,
  ]);

  useEffect(() => {
    if (!archiveQuery.data) {
      return;
    }

    setDetailRowSnapshot((current) => {
      if (!current) {
        return current;
      }

      const matched = archiveQuery.data.items.find((row) => row.id === current.id);
      return matched ?? current;
    });
  }, [archiveQuery.data]);

  useEffect(() => {
    setAuditResult(null);
    setIsAuditDialogOpen(false);
  }, [
    filters.selectedStoreId,
    filters.createdAtFrom,
    filters.createdAtTo,
    filters.scope,
    filters.priorityCard,
    filters.pipelineCard,
    filters.issueFilter,
    deferredQuery,
    filters.invoiceStatusCard,
    filters.orderStatusCard,
    filters.outputStatusCard,
  ]);

  useEffect(() => {
    setSelectedRowIds(new Set());
    setSelectedRowsById({});
  }, [
    filters.createdAtFrom,
    filters.createdAtTo,
    filters.selectedStoreId,
    filters.scope,
    filters.decisionStatus,
    filters.priorityCard,
    filters.pipelineCard,
    filters.issueFilter,
    deferredQuery,
    filters.invoiceStatusCard,
    filters.orderStatusCard,
    filters.outputStatusCard,
  ]);

  const baseActiveSheet = sheetSnapshot ?? worksheetQuery.data ?? null;
  const archiveSheet = archiveQuery.data ?? null;
  const selectedStore = stores.find((store) => store.id === filters.selectedStoreId) ?? null;
  const selectedStoreName = selectedStore?.storeName ?? null;
  const activeInvoiceStatusCard = normalizeInvoiceStatusCardKey(filters.invoiceStatusCard);
  const activeOrderStatusCard = normalizeOrderStatusCardKey(filters.orderStatusCard);
  const activeOutputStatusCard = normalizeOutputStatusCardKey(filters.outputStatusCard);
  const activeDecisionStatus = filters.decisionStatus ?? "all";
  const quickCollectFocusSignature = useMemo(
    () =>
      buildQuickCollectFocusSignature({
        selectedStoreId: filters.selectedStoreId,
        createdAtFrom: filters.createdAtFrom,
        createdAtTo: filters.createdAtTo,
        query: filters.query,
        scope: filters.scope,
        decisionStatus: activeDecisionStatus,
        priorityCard: filters.priorityCard,
        pipelineCard: filters.pipelineCard,
        issueFilter: filters.issueFilter,
        invoiceStatusCard: activeInvoiceStatusCard,
        orderStatusCard: activeOrderStatusCard,
        outputStatusCard: activeOutputStatusCard,
      }),
    [
      activeDecisionStatus,
      activeInvoiceStatusCard,
      activeOrderStatusCard,
      activeOutputStatusCard,
      filters.createdAtFrom,
      filters.createdAtTo,
      filters.issueFilter,
      filters.pipelineCard,
      filters.priorityCard,
      filters.query,
      filters.scope,
      filters.selectedStoreId,
    ],
  );
  useEffect(() => {
    if (quickCollectFocus && quickCollectFocus.filterSignature !== quickCollectFocusSignature) {
      setQuickCollectFocus(null);
    }
  }, [quickCollectFocus, quickCollectFocusSignature]);
  const quickCollectFocusRows = useMemo(
    () =>
      quickCollectFocus
        ? sortShipmentRows(
            quickCollectFocus.rows.map((row) => dirtyRowsBySourceKey[row.sourceKey] ?? row),
            sortColumns,
            columnConfigs,
          )
        : [],
    [columnConfigs, dirtyRowsBySourceKey, quickCollectFocus, sortColumns],
  );
  const quickCollectFocusViewState = useMemo(
    () =>
      resolveQuickCollectFocusViewState({
        activeTab,
        quickCollectFocus,
        filterSignature: quickCollectFocusSignature,
        rows: quickCollectFocusRows,
        draftRows,
        decisionStatus: activeDecisionStatus,
        page: worksheetPage,
        pageSize: worksheetPageSize,
        baseActiveSheet,
        selectedStore: selectedStore
          ? {
              id: selectedStore.id,
              storeName: selectedStore.storeName,
              vendorId: selectedStore.vendorId,
            }
          : null,
        scope: effectiveWorksheetScope,
      }),
    [
      activeDecisionStatus,
      activeTab,
      baseActiveSheet,
      draftRows,
      effectiveWorksheetScope,
      quickCollectFocus,
      quickCollectFocusRows,
      quickCollectFocusSignature,
      selectedStore,
      worksheetPage,
      worksheetPageSize,
    ],
  );
  const isQuickCollectFocusActive = quickCollectFocusViewState.isActive;
  const quickCollectFocusResult = quickCollectFocusViewState.result;
  const activeSheet = quickCollectFocusViewState.activeSheet;
  const activeSheetForSelectedStore =
    activeSheet?.store.id === filters.selectedStoreId ? activeSheet : null;
  const worksheetMirrorSyncRequirement = useMemo(
    () =>
      resolveShipmentWorksheetMirrorSyncRequirement({
        selectedStoreId: filters.selectedStoreId,
        requestedCreatedAtFrom: filters.createdAtFrom,
        requestedCreatedAtTo: filters.createdAtTo,
        source: activeSheetForSelectedStore?.source ?? null,
        syncSummary: activeSheetForSelectedStore?.syncSummary ?? null,
        isAuthoritativeMirror: activeSheetForSelectedStore?.isAuthoritativeMirror ?? null,
        coverageCreatedAtFrom: activeSheetForSelectedStore?.coverageCreatedAtFrom ?? null,
        coverageCreatedAtTo: activeSheetForSelectedStore?.coverageCreatedAtTo ?? null,
      }),
    [
      activeSheetForSelectedStore?.source,
      activeSheetForSelectedStore?.syncSummary,
      activeSheetForSelectedStore?.isAuthoritativeMirror,
      activeSheetForSelectedStore?.coverageCreatedAtFrom,
      activeSheetForSelectedStore?.coverageCreatedAtTo,
      filters.createdAtFrom,
      filters.createdAtTo,
      filters.selectedStoreId,
    ],
  );
  const effectiveDraftRows = quickCollectFocusViewState.effectiveDraftRows;
  const shipmentColumnSourceOptions = useMemo(
    () =>
      buildShipmentColumnSourceOptions(
        activeSheet?.rawFieldCatalog ??
          worksheetQuery.data?.rawFieldCatalog ??
          archiveSheet?.rawFieldCatalog ??
          [],
      ),
    [activeSheet?.rawFieldCatalog, archiveSheet?.rawFieldCatalog, worksheetQuery.data?.rawFieldCatalog],
  );
  const decisionCounts = quickCollectFocusViewState.decisionCounts;
  const visibleRows = quickCollectFocusViewState.visibleRows;
  const worksheetTotalPages = activeSheet?.totalPages ?? 1;
  const archiveRows = archiveSheet?.items ?? [];
  const archiveTotalPages = archiveSheet?.totalPages ?? 1;
  const scopeCounts = quickCollectFocusViewState.scopeCounts;
  const activeDetailFilterCount = useMemo(
    () =>
      countActiveShipmentDetailFilters({
        decisionStatus: activeDecisionStatus,
        invoiceStatusCard: activeInvoiceStatusCard,
        orderStatusCard: activeOrderStatusCard,
        outputStatusCard: activeOutputStatusCard,
      }),
    [activeDecisionStatus, activeInvoiceStatusCard, activeOrderStatusCard, activeOutputStatusCard],
  );
  const activeFilterSummaryTokens = useMemo(() => {
    if (isQuickCollectFocusActive && quickCollectFocusResult) {
      return [
        ...(selectedStoreName ? [selectedStoreName] : []),
        ...(filters.createdAtFrom && filters.createdAtTo
          ? [`${filters.createdAtFrom} ~ ${filters.createdAtTo}`]
          : []),
        "신규 주문 우선 보기",
        ...(activeDecisionStatus !== "all"
          ? [FULFILLMENT_DECISION_OPTIONS.find((option) => option.value === activeDecisionStatus)?.label ?? ""]
          : []),
      ].filter(Boolean);
    }

    return buildShipmentFilterSummaryTokens({
      storeName: selectedStoreName,
      filters: {
        createdAtFrom: filters.createdAtFrom,
        createdAtTo: filters.createdAtTo,
        query: deferredQuery,
        scope: effectiveWorksheetScope,
        decisionStatus: activeDecisionStatus,
        priorityCard: filters.priorityCard,
        pipelineCard: filters.pipelineCard,
        issueFilter: filters.issueFilter,
        invoiceStatusCard: activeInvoiceStatusCard,
        orderStatusCard: activeOrderStatusCard,
        outputStatusCard: activeOutputStatusCard,
      },
    });
  }, [
      activeDecisionStatus,
      activeInvoiceStatusCard,
      activeOrderStatusCard,
      activeOutputStatusCard,
      deferredQuery,
      filters.createdAtFrom,
      filters.createdAtTo,
      filters.issueFilter,
      filters.pipelineCard,
      filters.priorityCard,
      effectiveWorksheetScope,
      isQuickCollectFocusActive,
      quickCollectFocusResult,
    selectedStoreName,
  ]);
  const hasCustomWorksheetFilters =
    Boolean(deferredQuery) ||
    effectiveWorksheetScope !== "all" ||
    filters.priorityCard !== "all" ||
    filters.pipelineCard !== "all" ||
    filters.issueFilter !== "all" ||
    activeDecisionStatus !== "all" ||
    activeDetailFilterCount > 0;
  const pageRowIdSet = useMemo(() => new Set(visibleRows.map((row) => row.id)), [visibleRows]);
  const pageSelectedRowIds = useMemo(
    () => new Set(visibleRows.filter((row) => selectedRowIds.has(row.id)).map((row) => row.id)),
    [selectedRowIds, visibleRows],
  );
  const selectedRows = useMemo(() => Object.values(selectedRowsById), [selectedRowsById]);
  const selectedPreviewRow = useMemo(() => {
    for (const rowId of Array.from(selectedRowIds)) {
      const row = selectedRowsById[rowId];
      if (row) {
        return row;
      }
    }

    return null;
  }, [selectedRowIds, selectedRowsById]);
  const previewRowCandidates = useMemo(() => {
    const rowMap = new Map<string, CoupangShipmentWorksheetRow>();
    const pushRow = (row: CoupangShipmentWorksheetRow | null | undefined) => {
      if (!row || rowMap.has(row.id)) {
        return;
      }

      rowMap.set(row.id, row);
    };

    pushRow(selectedPreviewRow);
    for (const row of visibleRows) {
      pushRow(row);
    }
    for (const row of selectedRows) {
      pushRow(row);
    }
    for (const row of activeSheet?.items ?? []) {
      pushRow(row);
    }

    return Array.from(rowMap.values());
  }, [activeSheet?.items, selectedPreviewRow, selectedRows, visibleRows]);
  const previewRowOptions = useMemo(
    () => previewRowCandidates.map((row) => buildShipmentPreviewRowOption(row)),
    [previewRowCandidates],
  );
  const manualPreviewRow = useMemo(() => {
    if (!columnPreviewRowId) {
      return null;
    }

    return previewRowCandidates.find((row) => row.id === columnPreviewRowId) ?? null;
  }, [columnPreviewRowId, previewRowCandidates]);
  useEffect(() => {
    if (!columnPreviewRowId || manualPreviewRow) {
      return;
    }

    setColumnPreviewRowId(null);
  }, [columnPreviewRowId, manualPreviewRow]);
  const columnPreviewRow = manualPreviewRow ?? selectedPreviewRow ?? visibleRows[0] ?? activeSheet?.items[0] ?? null;
  const columnPreviewDescription = columnPreviewRow
    ? describeShipmentColumnPreviewRow(
        columnPreviewRow,
        manualPreviewRow ? "manual" : selectedPreviewRow ? "selected" : "visible",
      )
    : null;
  const selectedPreviewRowOptionId = columnPreviewRow?.id ?? null;
  const selectedExportBlockedRows = useMemo(
    () => selectedRows.filter((row) => hasShipmentClaimIssue(row)),
    [selectedRows],
  );
  const selectedExportRows = useMemo(
    () => selectedRows.filter((row) => !hasShipmentClaimIssue(row)),
    [selectedRows],
  );
  const selectedInvoiceBlockedRows = useMemo(
    () => selectedRows.filter((row) => hasShipmentClaimIssue(row)),
    [selectedRows],
  );
  const selectedDecisionBlockedRows = useMemo(
    () => selectedRows.filter((row) => getFulfillmentDecision(row).shouldBlockBatchActions),
    [selectedRows],
  );
  const selectedReadyRows = useMemo(
    () => selectedRows.filter((row) => !getFulfillmentDecision(row).shouldBlockBatchActions),
    [selectedRows],
  );
  const selectedBlockedDecisionSummary = useMemo(
    () => summarizeShipmentBlockedDecisionRows(selectedDecisionBlockedRows),
    [selectedDecisionBlockedRows],
  );
  const selectedBlockedDecisionDetails = useMemo(
    () => buildShipmentBlockedDecisionDetails(selectedDecisionBlockedRows),
    [selectedDecisionBlockedRows],
  );
  const dirtyCount = dirtySourceKeys.size;
  const dirtySet = useMemo(() => new Set(dirtySourceKeys), [dirtySourceKeys]);
  const detailFilterToggleLabel =
    activeDetailFilterCount > 0 ? `세부 필터 ${formatNumber(activeDetailFilterCount)}개 적용` : "세부 필터";
  const effectiveDetailFilterCount = isQuickCollectFocusActive ? 0 : activeDetailFilterCount;
  const effectiveDetailFilterToggleLabel = isQuickCollectFocusActive
    ? "세부 필터"
    : detailFilterToggleLabel;
  const effectiveHasCustomWorksheetFilters = isQuickCollectFocusActive
    ? activeDecisionStatus !== "all" ||
      filters.priorityCard !== "all" ||
      filters.pipelineCard !== "all" ||
      filters.issueFilter !== "all"
    : hasCustomWorksheetFilters;
  const isAuthoritativeWorksheetMirrorView =
    activeTab === "worksheet" &&
    !isQuickCollectFocusActive &&
    !effectiveHasCustomWorksheetFilters;
  const shouldHoldAuthoritativeWorksheetCounts =
    isAuthoritativeWorksheetMirrorView && worksheetMirrorSyncRequirement.requiresFullSync;
  const authoritativeWorksheetSyncSignature =
    shouldHoldAuthoritativeWorksheetCounts && filters.selectedStoreId
      ? `${filters.selectedStoreId}:${filters.createdAtFrom}:${filters.createdAtTo}`
      : null;
  const isAuthoritativeWorksheetFullSyncBusy =
    shouldHoldAuthoritativeWorksheetCounts && busyAction === "collect-full";
  const filterSummarySupportText = [
    isQuickCollectFocusActive && quickCollectFocusResult
      ? `빠른 수집 신규 ${formatNumber(quickCollectFocusResult.focusedRows.length)}건 우선 표시 중`
      : null,
    dirtyCount > 0 ? `미저장 변경 ${formatNumber(dirtyCount)}건` : null,
    (activeSheet?.invoiceReadyCount ?? 0) > 0
      ? `송장 전송 대상 ${formatNumber(activeSheet?.invoiceReadyCount ?? 0)}건`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const worksheetOpsHandoffGuide = useMemo(() => {
    const blockedCount = decisionCounts.blocked;
    const holdCount = decisionCounts.hold;
    const recheckCount = decisionCounts.recheck;
    const sharedQuery = deferredQuery.trim() || null;

    if (
      activeDecisionStatus === "blocked" ||
      (activeDecisionStatus === "all" && blockedCount > 0)
    ) {
      return {
        title: `차단 ${formatNumber(blockedCount)}건은 CS 확인이 먼저입니다.`,
        description:
          "취소, 반품, 교환, 출고중지 문맥은 채널 원본 화면과 CS 허브에서 먼저 확인한 뒤 출고로 돌아오세요.",
        links: [
          {
            href: buildCsHubWorkspaceHref({
              focus: "claims",
              source: "fulfillment",
            }),
            label: "CS 허브에서 클레임 확인",
          },
          {
            href: buildWorkCenterWorkspaceHref({
              tab: "operations",
              channel: "coupang",
              status: "error",
              query: sharedQuery,
            }),
            label: "작업센터 복구 보기",
            variant: "ghost" as const,
          },
        ],
      };
    }

    if (
      activeDecisionStatus === "recheck" ||
      (activeDecisionStatus === "all" && recheckCount > 0)
    ) {
      return {
        title: `재확인 ${formatNumber(recheckCount)}건은 복구 로그와 같이 봅니다.`,
        description:
          "송장 실패, 동기화 지연, 데이터 누락은 작업센터 복구 기록을 먼저 보고 필요한 경우 CS 허브와 원본 화면으로 이어집니다.",
        links: [
          {
            href: buildWorkCenterWorkspaceHref({
              tab: "operations",
              channel: "coupang",
              status: "error",
              query: sharedQuery,
            }),
            label: "작업센터에서 복구 확인",
          },
          {
            href: buildCsHubWorkspaceHref({
              focus: "recovery",
              source: "fulfillment",
            }),
            label: "CS 영향 확인",
            variant: "ghost" as const,
          },
        ],
      };
    }

    if (
      activeDecisionStatus === "hold" ||
      (activeDecisionStatus === "all" && holdCount > 0)
    ) {
      return {
        title: `보류 ${formatNumber(holdCount)}건은 문의/영향 확인이 먼저입니다.`,
        description:
          "문의, 보류, 경미한 CS 영향은 CS 허브에서 먼저 분기하고, 경고 로그가 반복되면 작업센터로 이어서 확인하세요.",
        links: [
          {
            href: buildCsHubWorkspaceHref({
              focus: "fulfillment-impact",
              source: "fulfillment",
            }),
            label: "CS 허브 열기",
          },
          {
            href: buildWorkCenterWorkspaceHref({
              tab: "operations",
              channel: "coupang",
              status: "warning",
              query: sharedQuery,
            }),
            label: "경고 로그 보기",
            variant: "ghost" as const,
          },
        ],
      };
    }

    return null;
  }, [activeDecisionStatus, decisionCounts.blocked, decisionCounts.hold, decisionCounts.recheck, deferredQuery]);
  const invoiceReadyRows = useMemo(
    () => visibleRows.filter((row) => canSendInvoiceRow(row) && row.invoiceTransmissionStatus !== "pending"),
    [visibleRows],
  );
  const invoiceTransmitCandidateRows = useMemo(
    () => visibleRows.filter((row) => canAttemptInvoiceRow(row)),
    [visibleRows],
  );
  const detailRow = useMemo(() => {
    if (!detailRowSnapshot) {
      return null;
    }

    if (activeTab === "archive") {
      return archiveRows.find((row) => row.id === detailRowSnapshot.id) ?? detailRowSnapshot;
    }

    return visibleRows.find((row) => row.id === detailRowSnapshot.id) ??
      selectedRowsById[detailRowSnapshot.id] ??
      detailRowSnapshot;
  }, [activeTab, archiveRows, detailRowSnapshot, selectedRowsById, visibleRows]);

  useEffect(() => {
    setWorksheetPage((current) => Math.min(current, worksheetTotalPages));
  }, [worksheetTotalPages]);

  useEffect(() => {
    setArchivePage((current) => Math.min(current, archiveTotalPages));
  }, [archiveTotalPages]);

  useEffect(() => {
    setSelectedCell(null);
  }, [worksheetPage]);

  const shipmentDetailQuery = useQuery({
    queryKey: [
      activeTab === "archive"
        ? "/api/coupang/shipments/archive/detail"
        : "/api/coupang/shipments/worksheet/detail",
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
        buildShipmentDetailUrl(
          activeTab === "archive"
            ? "/api/coupang/shipments/archive/detail"
            : "/api/coupang/shipments/worksheet/detail",
          filters.selectedStoreId,
          detailRow!,
        ),
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
    effectiveWorksheetMode === "invoice"
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
  const detailDecisionPresentation = detailRow ? getFulfillmentDecision(detailRow) : null;
  const detailClaimLookupRange =
    detailItem?.claimLookupCreatedAtFrom && detailItem?.claimLookupCreatedAtTo
      ? `${detailItem.claimLookupCreatedAtFrom} ~ ${detailItem.claimLookupCreatedAtTo}`
      : "-";
  const detailHandoffQuery =
    detailRow?.shipmentBoxId ??
    detailRow?.productOrderNumber ??
    detailRow?.selpickOrderNumber ??
    detailRow?.orderId ??
    null;
  const detailHandoffGuide = useMemo(() => {
    if (!detailDecisionPresentation) {
      return null;
    }

    if (
      detailDecisionPresentation.status === "blocked" ||
      detailDecisionPresentation.status === "hold"
    ) {
      return {
        title:
          detailDecisionPresentation.status === "blocked"
            ? "클레임/출고중지 원인을 먼저 확인합니다."
            : "문의·CS 영향부터 정리합니다.",
        description:
          "이 주문은 출고 실행보다 CS 맥락 확인이 먼저입니다. 채널 원본 화면과 CS 허브를 본 뒤 다시 출고 판단으로 돌아오세요.",
        links: [
          {
            href: buildCsHubWorkspaceHref({
              focus:
                detailDecisionPresentation.status === "blocked"
                  ? "claims"
                  : "fulfillment-impact",
              source: "fulfillment",
            }),
            label: "CS 허브 열기",
          },
          {
            href: buildWorkCenterWorkspaceHref({
              tab: "operations",
              channel: "coupang",
              status: detailDecisionPresentation.status === "blocked" ? "error" : "warning",
              query: detailHandoffQuery,
            }),
            label: "관련 복구 로그 보기",
            variant: "ghost" as const,
          },
        ],
      };
    }

    if (detailDecisionPresentation.status === "recheck") {
      return {
        title: "복구 로그를 먼저 보고 다시 판단합니다.",
        description:
          "송장 실패나 동기화 지연 성격이면 작업센터 복구 기록을 먼저 확인하고, 필요하면 CS 허브에서 영향 범위를 다시 봅니다.",
        links: [
          {
            href: buildWorkCenterWorkspaceHref({
              tab: "operations",
              channel: "coupang",
              status: "error",
              query: detailHandoffQuery,
            }),
            label: "작업센터에서 복구 보기",
          },
          {
            href: buildCsHubWorkspaceHref({
              focus: "recovery",
              source: "fulfillment",
            }),
            label: "CS 영향 확인",
            variant: "ghost" as const,
          },
        ],
      };
    }

    return null;
  }, [detailDecisionPresentation, detailHandoffQuery]);

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
    setSelectedRowsById((current) => {
      if (!current[detailRow.id]) {
        return current;
      }

      return {
        ...current,
        [detailRow.id]: patchRow(current[detailRow.id]),
      };
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
  const detailOriginalStatusLabel = detailRow
    ? formatOrderStatusLabel(detailRow.rawOrderStatus ?? detailRow.orderStatus)
    : "-";
  const detailCustomerServiceSignalLabels =
    detailRow?.secondaryStatus?.customerServiceSignalLabels?.length
      ? detailRow.secondaryStatus.customerServiceSignalLabels
      : [
          detailCustomerServiceLabel,
          detailCustomerServiceSnapshot &&
          detailCustomerServiceSnapshot.customerServiceState !== "ready"
            ? `CS snapshot ${getCoupangCustomerServiceStateText(
                detailCustomerServiceSnapshot.customerServiceState,
              )}`
            : null,
        ].filter((value): value is string => Boolean(value));
  const detailCustomerServiceStateLabel =
    detailRow?.secondaryStatus?.customerServiceStateLabel ??
    (detailCustomerServiceSnapshot
      ? getCoupangCustomerServiceStateText(detailCustomerServiceSnapshot.customerServiceState)
      : detailRow
        ? getCoupangCustomerServiceStateText(detailRow.customerServiceState)
        : null);
  const detailRiskSummary = detailRow?.riskSummary ?? [];
  const detailResolvedHandoffLinks = useMemo(() => {
    if (detailRow?.nextHandoffLinks?.length) {
      return resolveShipmentHandoffLinks({
        links: detailRow.nextHandoffLinks,
        storeId: filters.selectedStoreId,
        query: detailHandoffQuery,
      });
    }

    return detailHandoffGuide?.links ?? [];
  }, [detailHandoffGuide, detailHandoffQuery, detailRow, filters.selectedStoreId]);
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
        {
          label: "출고 판단",
          value: detailDecisionPresentation
            ? getFulfillmentDecisionStatusLabel(detailDecisionPresentation.status)
            : "-",
        },
        {
          label: "판단 사유",
          value: detailDecisionPresentation
            ? getFulfillmentDecisionReasonLabel(detailDecisionPresentation.reason)
            : "-",
        },
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
  const detailOrderItemsTable: ShipmentDetailTable | null = detailOrderDetail?.items.length
    ? {
        title: "주문 상품",
        headers: ["상품", "옵션", "수량", "상태", "송장"],
        rows: detailOrderDetail.items.map((item, index) => ({
          key: `${item.id}:${index}`,
          cells: [
            item.productName,
            item.optionName ?? "-",
            formatNumber(item.quantity),
            formatOrderStatusLabel(item.status),
            formatJoinedText([item.deliveryCompanyCode, item.invoiceNumber]),
          ],
        })),
      }
    : null;
  const detailReturnClaimCards = useMemo<ShipmentDetailClaimCardView[]>(
    () =>
      detailReturnRows.map((row) => {
        const detail = returnDetailByReceiptId.get(row.receiptId) ?? null;
        const summaryRow = detail?.summaryRow ?? row;
        const actionLabels = buildReturnActionLabels(summaryRow);

        return {
          id: row.receiptId,
          title: summaryRow.cancelType === "RETURN" ? "반품" : summaryRow.cancelType,
          subtitle: summaryRow.receiptId,
          statusText: summaryRow.status,
          sections: [
            {
              title: "요청 상태",
              rows: [
                { label: "상품", value: formatJoinedText([summaryRow.productName, summaryRow.vendorItemName], " / ") },
                { label: "수량", value: `${formatNumber(summaryRow.cancelCount ?? summaryRow.purchaseCount)}개` },
                { label: "유형", value: formatJoinedText([summaryRow.cancelType, summaryRow.receiptType, summaryRow.returnDeliveryType], " · ") },
                { label: "사유", value: formatClaimReasonText(detail?.reason ?? summaryRow.reason, detail?.reasonCode ?? summaryRow.reasonCode) },
                { label: "책임 구분", value: formatText(detail?.faultByType ?? summaryRow.faultByType) },
                { label: "선환불", value: detail?.preRefund == null ? "-" : detail.preRefund ? "예" : "아니오" },
              ],
            },
            {
              title: "요청자 / 회수",
              rows: [
                { label: "요청자", value: formatJoinedText([detail?.requester.name ?? summaryRow.requesterName, detail?.requester.mobile ?? detail?.requester.phone ?? summaryRow.requesterMobile ?? summaryRow.requesterPhone]) },
                { label: "회수지", value: formatAddressText([detail?.requester.postCode ? `(${detail.requester.postCode})` : summaryRow.requesterPostCode ? `(${summaryRow.requesterPostCode})` : null, detail?.requester.address ?? summaryRow.requesterAddress, detail?.requester.addressDetail]) },
                { label: "회수송장", value: formatReturnDeliverySummary(detail, summaryRow) },
                { label: "반품비", value: formatCurrency(detail?.returnCharge.amount ?? summaryRow.retrievalChargeAmount) },
                { label: "가능 작업", value: formatActionsText(actionLabels) },
              ],
            },
            {
              title: "처리 이력",
              rows: [
                { label: "등록일", value: formatDateTimeLabel(detail?.createdAt ?? summaryRow.createdAt) },
                { label: "수정일", value: formatDateTimeLabel(detail?.modifiedAt ?? summaryRow.modifiedAt) },
                { label: "완료일", value: formatDateTimeLabel(detail?.completeConfirmDate ?? summaryRow.completeConfirmDate) },
                { label: "완료 유형", value: formatText(detail?.completeConfirmType ?? summaryRow.completeConfirmType) },
                { label: "출고 상태", value: formatText(summaryRow.releaseStatus) },
              ],
            },
          ],
          tables: [
            ...(detail?.items.length
              ? [{
                  title: "반품 상품",
                  headers: ["상품", "shipmentBoxId", "수량", "상태"],
                  rows: detail.items.map((item, index) => ({
                    key: `${summaryRow.receiptId}:item:${index}`,
                    cells: [item.vendorItemName ?? item.sellerProductName ?? item.vendorItemId ?? "-", item.shipmentBoxId ?? "-", formatNumber(item.cancelCount ?? item.purchaseCount), item.releaseStatusName ?? item.releaseStatus ?? "-"],
                  })),
                }]
              : []),
            ...(detail?.deliveries.length
              ? [{
                  title: "회수 송장 상세",
                  headers: ["구분", "택배사", "송장번호", "등록번호"],
                  rows: detail.deliveries.map((delivery, index) => ({
                    key: `${summaryRow.receiptId}:delivery:${index}`,
                    cells: [delivery.returnExchangeDeliveryType ?? "-", delivery.deliveryCompanyCode ?? "-", delivery.deliveryInvoiceNo ?? "-", delivery.regNumber ?? "-"],
                  })),
                }]
              : []),
          ],
        };
      }),
    [detailReturnRows, returnDetailByReceiptId],
  );
  const detailExchangeClaimCards = useMemo<ShipmentDetailClaimCardView[]>(
    () =>
      detailExchangeRows.map((row) => {
        const detail = exchangeDetailById.get(row.exchangeId) ?? null;
        const summaryRow = detail?.summaryRow ?? row;
        const actionLabels = buildExchangeActionLabels(summaryRow);

        return {
          id: row.exchangeId,
          title: "교환",
          subtitle: summaryRow.exchangeId,
          statusText: summaryRow.status,
          sections: [
            {
              title: "요청 상태",
              rows: [
                { label: "상품", value: formatJoinedText([summaryRow.productName, summaryRow.vendorItemName], " / ") },
                { label: "수량", value: `${formatNumber(summaryRow.quantity)}개` },
                { label: "회수 상태", value: formatText(detail?.collectStatus ?? summaryRow.collectStatus) },
                { label: "사유", value: formatClaimReasonText(detail?.reason ?? summaryRow.reason, detail?.reasonCode ?? summaryRow.reasonCode, detail?.reasonDetail ?? summaryRow.reasonDetail) },
                { label: "주문 배송상태", value: formatText(detail?.orderDeliveryStatusCode ?? summaryRow.orderDeliveryStatusCode) },
                { label: "가능 작업", value: formatActionsText(actionLabels) },
              ],
            },
            {
              title: "회수지 / 메모",
              rows: [
                { label: "회수지", value: formatJoinedText([detail?.requester.name ?? summaryRow.returnCustomerName, detail?.requester.mobile ?? detail?.requester.phone ?? summaryRow.returnMobile]) },
                { label: "주소", value: formatAddressText([detail?.requester.postCode ? `(${detail.requester.postCode})` : null, detail?.requester.address ?? summaryRow.returnAddress, detail?.requester.addressDetail]) },
                { label: "요청 메모", value: formatText(detail?.requester.memo) },
                { label: "회수 완료", value: formatDateTimeLabel(detail?.collectCompleteDate ?? summaryRow.collectCompleteDate) },
              ],
            },
            {
              title: "재배송지 / 메모",
              rows: [
                { label: "수령지", value: formatJoinedText([detail?.recipient.name ?? summaryRow.deliveryCustomerName, detail?.recipient.mobile ?? detail?.recipient.phone ?? summaryRow.deliveryMobile]) },
                { label: "주소", value: formatAddressText([detail?.recipient.postCode ? `(${detail.recipient.postCode})` : null, detail?.recipient.address ?? summaryRow.deliveryAddress, detail?.recipient.addressDetail]) },
                { label: "수령 메모", value: formatText(detail?.recipient.memo) },
                { label: "교환 송장", value: formatExchangeInvoiceSummary(detail, summaryRow) },
              ],
            },
          ],
          tables: [
            ...(detail?.items.length
              ? [{
                  title: "교환 상품",
                  headers: ["상품", "shipmentBoxId", "수량", "상태"],
                  rows: detail.items.map((item, index) => ({
                    key: `${summaryRow.exchangeId}:item:${index}`,
                    cells: [item.targetItemName ?? item.orderItemName ?? item.vendorItemName ?? "-", item.shipmentBoxId ?? "-", formatNumber(item.quantity), item.collectStatus ?? item.releaseStatus ?? "-"],
                  })),
                }]
              : []),
            ...(detail?.invoices.length
              ? [{
                  title: "교환 송장 상세",
                  headers: ["shipmentBoxId", "택배사", "송장번호", "예정일", "상태"],
                  rows: detail.invoices.map((invoice, index) => ({
                    key: `${summaryRow.exchangeId}:invoice:${index}`,
                    cells: [invoice.shipmentBoxId ?? "-", invoice.deliverCode ?? "-", invoice.invoiceNumber ?? "-", invoice.estimatedDeliveryDate ?? "-", invoice.statusCode ?? "-"],
                  })),
                }]
              : []),
          ],
        };
      }),
    [detailExchangeRows, exchangeDetailById],
  );
  const detailDialogWarningTitle =
    shipmentDetailQuery.data?.source === "fallback"
      ? "실시간 상세 일부를 불러오지 못했습니다."
      : shipmentDetailQuery.data?.message
        ? "쿠팡 상세 응답에 안내 메시지가 있습니다."
        : null;
  const detailDialogWarningMessage =
    shipmentDetailQuery.data?.source === "fallback" || shipmentDetailQuery.data?.message
      ? shipmentDetailQuery.data?.message ??
        "워크시트에 저장된 정보와 실시간 조회 결과를 함께 보여주고 있습니다."
      : null;
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
  const isArchiveTab = activeTab === "archive";
  const isConfirmedTab = activeTab === "confirmed";
  const transmitActionLabel = "송장 전송하기";
  const transmitActionBusyLabel =
    busyAction === "invoice-transmit" || busyAction === "execute"
      ? "송장 전송 중..."
      : transmitActionLabel;
  const transmitActionDisabled =
    !filters.selectedStoreId ||
    !(
      (activeSheet?.invoiceReadyCount ?? 0) ||
      invoiceReadyRows.length ||
      invoiceTransmitCandidateRows.length
    ) ||
    isFallback ||
    busyAction !== null;
  const selectedTransmitActionDisabled =
    !selectedReadyRows.length || isFallback || busyAction !== null;
  const collectActionDisabled = !filters.selectedStoreId || busyAction !== null;
  const reconcileLiveActionDisabled = !filters.selectedStoreId || busyAction !== null;
  const purchaseConfirmActionDisabled = !filters.selectedStoreId || busyAction !== null;
  const prepareActionDisabled =
    !filters.selectedStoreId ||
    isConfirmedTab ||
    isFallback ||
    busyAction !== null;
  const refreshActionDisabled =
    !filters.selectedStoreId || (isArchiveTab ? archiveQuery.isFetching : worksheetQuery.isFetching) || busyAction !== null;
  const openInvoiceInputDisabled =
    isConfirmedTab || !(activeSheet?.totalRowCount ?? effectiveDraftRows.length) || busyAction !== null;
  const openExcelExportDisabled = !selectedExportRows.length || busyAction !== null;
  const openNotExportedExcelExportDisabled =
    !(activeSheet?.outputCounts.notExported ?? 0) || busyAction !== null;

  useEffect(() => {
    if (!detailRowSnapshot) {
      return;
    }

    if (!detailRow) {
      setDetailRowSnapshot(null);
    }
  }, [detailRow, detailRowSnapshot]);

  function buildCurrentWorksheetViewQuery() {
    return {
      scope: effectiveWorksheetScope,
      decisionStatus: activeDecisionStatus,
      priorityCard: filters.priorityCard,
      pipelineCard: filters.pipelineCard,
      issueFilter: filters.issueFilter,
      page: worksheetPage,
      pageSize: worksheetPageSize,
      query: deferredQuery,
      invoiceStatusCard: filters.invoiceStatusCard,
      orderStatusCard: filters.orderStatusCard,
      outputStatusCard: filters.outputStatusCard,
      sortField: activeSortField,
      sortDirection: activeSortDirection,
    };
  }

  function buildCurrentWorksheetFilterQuery() {
    const viewQuery = buildCurrentWorksheetViewQuery();
    return {
      scope: viewQuery.scope,
      decisionStatus: viewQuery.decisionStatus,
      priorityCard: viewQuery.priorityCard,
      pipelineCard: viewQuery.pipelineCard,
      issueFilter: viewQuery.issueFilter,
      query: viewQuery.query,
      invoiceStatusCard: viewQuery.invoiceStatusCard,
      orderStatusCard: viewQuery.orderStatusCard,
      outputStatusCard: viewQuery.outputStatusCard,
    };
  }

  async function requestShipmentAuditMissingForCurrentFilters() {
    const requestFilters = normalizeFiltersToSeoulToday(filters);
    if (!requestFilters.selectedStoreId) {
      return null;
    }

    if (!areFiltersEqual(filters, requestFilters)) {
      setFilters(requestFilters);
    }

    return apiRequestJson<CoupangShipmentWorksheetAuditMissingResponse>(
      "POST",
      "/api/coupang/shipments/worksheet/audit-missing",
      buildShipmentWorksheetAuditRequest({
        storeId: requestFilters.selectedStoreId,
        createdAtFrom: requestFilters.createdAtFrom,
        createdAtTo: requestFilters.createdAtTo,
        scope: requestFilters.scope,
        query: deferredQuery,
        priorityCard: requestFilters.priorityCard,
        pipelineCard: requestFilters.pipelineCard,
        issueFilter: requestFilters.issueFilter,
        invoiceStatusCard: requestFilters.invoiceStatusCard,
        orderStatusCard: requestFilters.orderStatusCard,
        outputStatusCard: requestFilters.outputStatusCard,
      }),
    );
  }

  async function executeShipmentAuditMissing() {
    if (!filters.selectedStoreId) {
      return null;
    }

    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName: "쿠팡 배송 시트 누락 검수",
      targetCount: 1,
    });
    setBusyAction("audit-missing");
    setFeedback(null);
    setAuditResult(null);

    try {
      const response = await requestShipmentAuditMissingForCurrentFilters();
      if (!response) {
        return null;
      }

      const warning = response.missingCount > 0 || response.hiddenCount > 0;
      const details = buildShipmentWorksheetAuditDetails(response);

      setAuditResult(response);
      setIsAuditDialogOpen(warning);
      setFeedback({
        type: warning ? "warning" : "success",
        title: "누락 검수 완료",
        message: response.message ?? summarizeShipmentWorksheetAuditResult(response),
        details,
      });
      finishLocalOperation(localToastId, {
        status: warning ? "warning" : "success",
        summary: `누락 ${response.missingCount}건 / 숨김 ${response.hiddenCount}건`,
      });
      const finishedToastId = localToastId;
      if (finishedToastId) {
        window.setTimeout(() => removeLocalOperation(finishedToastId), 1_200);
      }
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "누락 검수에 실패했습니다.";
      setFeedback({
        type: "error",
        title: "누락 검수 실패",
        message,
        details: [],
      });
      finishLocalOperation(localToastId, {
        status: "error",
        errorMessage: message,
      });
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function executeReconcileShipmentWorksheetLive() {
    const requestFilters = normalizeFiltersToSeoulToday(filters);
    if (!requestFilters.selectedStoreId) {
      return;
    }

    if (!areFiltersEqual(filters, requestFilters)) {
      setFilters(requestFilters);
    }

    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName: "쿠팡 미조회 주문 정리 + 상태 재조회",
      targetCount: 1,
    });
    setBusyAction("reconcile-live");
    setFeedback(null);
    setQuickCollectFocus(null);

    try {
      const response = await apiRequestJson<ReconcileCoupangShipmentWorksheetResponse>(
        "POST",
        "/api/coupang/shipments/worksheet/reconcile-live",
        {
          storeId: requestFilters.selectedStoreId,
          createdAtFrom: requestFilters.createdAtFrom,
          createdAtTo: requestFilters.createdAtTo,
          viewQuery: buildCurrentWorksheetFilterQuery(),
        },
      );

      if (response.operation) {
        publishOperation(response.operation);
      }

      await refetchWorksheetView();
      void archiveQuery.refetch();

      const isNoop =
        response.archivedCount === 0 &&
        response.refreshedCount === 0 &&
        response.warningCount === 0;
      const hasWarning = response.warnings.length > 0 || response.source === "fallback" || isNoop;
      const summaryMessage = isNoop
        ? "현재 화면 필터와 조회 기간에서 정리할 주문이 없습니다."
        : `쿠팡 미조회 ${response.archivedCount}건을 정리하고 남은 ${response.refreshedCount}건의 상태를 다시 확인했습니다.${
            response.warningCount > 0 ? ` 경고 ${response.warningCount}건이 남았습니다.` : ""
          }`;

      setFeedback({
        type: hasWarning ? "warning" : "success",
        title: hasWarning ? "미조회 정리 + 상태 재조회 경고" : "미조회 정리 + 상태 재조회 완료",
        message:
          response.message && response.message !== summaryMessage
            ? `${summaryMessage} ${response.message}`
            : summaryMessage,
        details: response.warnings.slice(0, 8),
      });
      finishLocalOperation(localToastId, {
        status: hasWarning ? "warning" : "success",
        summary: isNoop
          ? "정리 대상 없음"
          : `미조회 ${response.archivedCount}건 정리 / ${response.refreshedCount}건 재조회`,
      });
      window.setTimeout(() => removeLocalOperation(localToastId), 1_200);
    } catch (error) {
      const message =
        error instanceof Error
          ? `미조회 정리 + 상태 재조회에 실패했습니다. ${error.message}`
          : "미조회 정리 + 상태 재조회에 실패했습니다.";
      setFeedback({
        type: "error",
        title: "미조회 정리 + 상태 재조회 실패",
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

  async function resolveWorksheetBulkRows(
    mode: "invoice_ready" | "not_exported_download" | "prepare_ready",
  ) {
    if (!filters.selectedStoreId) {
      return null;
    }

    return apiRequestJson<CoupangShipmentWorksheetBulkResolveResponse>(
      "POST",
      "/api/coupang/shipments/worksheet/resolve",
      {
        storeId: filters.selectedStoreId,
        mode,
        viewQuery: buildCurrentWorksheetViewQuery(),
      },
    );
  }

  async function executePrepareAcceptedOrders() {
    if (!filters.selectedStoreId) {
      return;
    }

    if (isFallback) {
      setFeedback({
        type: "warning",
        title: "\uBC1C\uC1A1\uC900\uBE44\uC911 \uCC98\uB9AC \uBD88\uAC00",
        message:
          "\uB300\uCCB4 \uB370\uC774\uD130\uC5D0\uC11C\uB294 \uACB0\uC81C\uC644\uB8CC \uC8FC\uBB38\uC744 \uBC1C\uC1A1\uC900\uBE44\uC911\uC73C\uB85C \uCC98\uB9AC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
        details: [],
      });
      return;
    }

    setBusyAction("prepare-orders");
    setFeedback(null);
    let localToastId: string | null = null;

    try {
      let auditResponse: CoupangShipmentWorksheetAuditMissingResponse | null = null;
      let auditFailureMessage: string | null = null;

      try {
        auditResponse = await requestShipmentAuditMissingForCurrentFilters();
      } catch (error) {
        auditFailureMessage =
          error instanceof Error
            ? error.message
            : "\uC218\uC9D1 \uB204\uB77D \uAC80\uC218\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
      }

      const resolvedRows = await resolveWorksheetBulkRows("prepare_ready");
      const preparePlan = resolvePrepareAcceptedOrdersPlan({
        auditResponse,
        resolvedRows,
        auditFailureMessage,
      });

      if (auditResponse && preparePlan.hasAuditWarnings) {
        setAuditResult(auditResponse);
        setIsAuditDialogOpen(true);
      }

      if (!preparePlan.shouldSubmitPrepare) {
        setFeedback({
          type: "warning",
          title: "\uBC1C\uC1A1\uC900\uBE44\uC911 \uCC98\uB9AC",
          message: resolvedRows?.matchedCount
            ? "\uD074\uB808\uC784\uC774 \uC788\uB294 \uC8FC\uBB38\uC774 \uC81C\uC678\uB418\uC5B4 \uBC1C\uC1A1\uC900\uBE44\uC911\uC73C\uB85C \uB118\uAE38 \uACB0\uC81C\uC644\uB8CC \uC8FC\uBB38\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."
            : "\uD604\uC7AC \uD654\uBA74 \uC870\uAC74\uC5D0\uC11C \uBC1C\uC1A1\uC900\uBE44\uC911\uC73C\uB85C \uB118\uAE38 \uACB0\uC81C\uC644\uB8CC \uC8FC\uBB38\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
          details: [...preparePlan.blockedClaimDetails, ...preparePlan.auditWarningDetails].slice(0, 8),
        });
        return;
      }

      localToastId = startLocalOperation({
        channel: "coupang",
        actionName:
          "\uCFE0\uD321 \uACB0\uC81C\uC644\uB8CC \uC8FC\uBB38 \uBC1C\uC1A1\uC900\uBE44\uC911 \uCC98\uB9AC",
        targetCount: preparePlan.targetRows.length,
      });

      const result = await apiRequestJson<CoupangBatchActionResponse>(
        "POST",
        "/api/coupang/orders/prepare",
        {
          storeId: filters.selectedStoreId,
          items: preparePlan.targetRows.map(
            (row) =>
              ({
                shipmentBoxId: row.shipmentBoxId,
                orderId: row.orderId,
                productName: row.productName,
              }) satisfies CoupangPrepareTarget,
          ),
        },
      );

      if (result.operation) {
        publishOperation(result.operation);
      }

      const succeededShipmentBoxIds = getSucceededPrepareShipmentBoxIds(result);
      if (succeededShipmentBoxIds.length > 0) {
        applyWorksheetRowUpdates(
          buildOptimisticPrepareRowUpdates({
            rows: effectiveDraftRows,
            shipmentBoxIds: succeededShipmentBoxIds,
            updatedAt: new Date().toISOString(),
          }),
          { markDirty: false },
        );
        void refreshWorksheetInBackground({
          storeId: filters.selectedStoreId,
          scope: "shipment_boxes",
          shipmentBoxIds: succeededShipmentBoxIds,
        });
      }

      const feedbackState = buildPrepareAcceptedOrdersFeedback({
        auditResponse,
        blockedClaimDetails: preparePlan.blockedClaimDetails,
        result,
        targetRowCount: preparePlan.targetRows.length,
        auditFailureMessage,
      });

      setFeedback(feedbackState);
      finishLocalOperation(localToastId, {
        status: feedbackState.type,
        summary: `${preparePlan.targetRows.length}\uAC74 \uBC1C\uC1A1\uC900\uBE44\uC911 \uCC98\uB9AC`,
      });
      const finishedToastId = localToastId;
      if (finishedToastId) {
        window.setTimeout(() => removeLocalOperation(finishedToastId), 1_200);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? `\uC218\uC9D1 \uB204\uB77D \uAC80\uC218 \uB610\uB294 \uC0C1\uD488\uC900\uBE44\uC911 \uCC98\uB9AC \uC911 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. ${error.message}`
          : "\uC218\uC9D1 \uB204\uB77D \uAC80\uC218 \uB610\uB294 \uC0C1\uD488\uC900\uBE44\uC911 \uCC98\uB9AC \uC911 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
      setFeedback({
        type: "error",
        title: "\uBC1C\uC1A1\uC900\uBE44\uC911 \uCC98\uB9AC \uCC28\uB2E8",
        message,
        details: [],
      });
      if (localToastId) {
        finishLocalOperation(localToastId, {
          status: "error",
          errorMessage: message,
        });
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function refetchWorksheetView() {
    const result = await worksheetQuery.refetch();
    const nextSheet = result.data ?? null;
    if (nextSheet) {
      setSheetSnapshot(nextSheet);
    }
    return nextSheet;
  }

  async function handleShipmentRefresh() {
    setQuickCollectFocus(null);
    if (activeTab === "archive") {
      await archiveQuery.refetch();
      return;
    }

    await refetchWorksheetView();
  }

  function applyWorksheetRowUpdates(
    updates: Map<string, CoupangShipmentWorksheetRow>,
    options?: { markDirty?: boolean },
  ) {
    if (!updates.size) {
      return;
    }

    const changedRows = Array.from(updates.values());
    const markDirty = options?.markDirty ?? true;
    setSheetSnapshot((current) => {
      if (!current) {
        return current;
      }

      const nextItems = current.items.map((row) => updates.get(row.id) ?? row);
      return nextItems.some((row, index) => row !== current.items[index])
        ? { ...current, items: nextItems }
        : current;
    });
    setDraftRows((current) =>
      sortShipmentRows(current.map((row) => updates.get(row.id) ?? row), sortColumns, columnConfigs),
    );
    setSelectedRowsById((current) => {
      const next = { ...current };
      let changed = false;

      for (const row of changedRows) {
        if (current[row.id]) {
          next[row.id] = row;
          changed = true;
        }
      }

      return changed ? next : current;
    });
    if (markDirty) {
      setDirtyRowsBySourceKey((current) => {
        const next = { ...current };
        for (const row of changedRows) {
          next[row.sourceKey] = row;
        }
        return next;
      });
    }
    setQuickCollectFocus((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => updates.get(row.id) ?? row),
          }
        : current,
    );
    setDetailRowSnapshot((current) => {
      if (!current) {
        return current;
      }

      return updates.get(current.id) ?? current;
    });
    if (markDirty) {
      setDirtySourceKeys((current) => {
        const next = new Set(current);
        for (const row of changedRows) {
          next.add(row.sourceKey);
        }
        return next;
      });
    }
  }

  async function refreshWorksheetInBackground(input: {
    storeId?: string;
    scope:
      | "pending_after_collect"
      | "shipment_boxes"
      | "customer_service"
      | "purchase_confirmed";
    shipmentBoxIds?: string[];
    createdAtFrom?: string;
    createdAtTo?: string;
  }) {
    const storeId = input.storeId ?? filters.selectedStoreId;
    if (!storeId || activeTab === "archive") {
      return null;
    }

    try {
      const response = await apiRequestJson<CoupangShipmentWorksheetRefreshResponse>(
        "POST",
        "/api/coupang/shipments/worksheet/refresh",
        {
          storeId,
          scope: input.scope,
          shipmentBoxIds: input.shipmentBoxIds,
          createdAtFrom: input.createdAtFrom,
          createdAtTo: input.createdAtTo,
        },
      );

      if (response.operation) {
        publishOperation(response.operation);
      }

      applyWorksheetRowUpdates(
        new Map(response.items.map((row) => [row.id, row] as const)),
        { markDirty: false },
      );
      await refetchWorksheetView();
      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? `후속 보강 중 일부 정보를 다시 맞추지 못했습니다. ${error.message}`
          : "후속 보강 중 일부 정보를 다시 맞추지 못했습니다.";

      setFeedback((current) =>
        current
          ? {
              ...current,
              type: current.type === "error" ? current.type : "warning",
              details: [...current.details, message].slice(0, 8),
            }
          : {
              type: "warning",
              title: "후속 보강 경고",
              message,
              details: [],
            },
      );
      return null;
    }
  }

  async function executePurchaseConfirmedSync() {
    const requestFilters = normalizeFiltersToSeoulToday(filters);
    if (!requestFilters.selectedStoreId) {
      return;
    }

    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName: "쿠팡 구매확정 sync",
      targetCount: 1,
    });
    setBusyAction("purchase-confirm-sync");

    try {
      const response = await refreshWorksheetInBackground({
        storeId: requestFilters.selectedStoreId,
        scope: "purchase_confirmed",
        createdAtFrom: requestFilters.createdAtFrom,
        createdAtTo: requestFilters.createdAtTo,
      });

      if (!response) {
        throw new Error("구매확정 sync 응답을 받지 못했습니다.");
      }

      const hasWarning =
        Boolean(response.message) || response.warningPhases.includes("purchase_confirm_refresh");
      const summaryMessage =
        response.updatedCount > 0
          ? `${response.refreshedCount}건을 점검해 ${response.updatedCount}건을 구매확정으로 반영했습니다.`
          : `${response.refreshedCount}건을 점검했고 새로 반영된 구매확정은 없습니다.`;
      const details = [
        response.message,
        hasWarning && !response.message
          ? "일부 후보는 매칭되지 않거나 안전 상한에 걸려 건너뛰었을 수 있습니다."
          : null,
      ].filter((value): value is string => Boolean(value));

      setFeedback({
        type: hasWarning ? "warning" : "success",
        title: response.updatedCount > 0 ? "구매확정 sync 완료" : "구매확정 점검 완료",
        message: response.message ? `${summaryMessage} ${response.message}` : summaryMessage,
        details,
      });
      finishLocalOperation(localToastId, {
        status: hasWarning ? "warning" : "success",
        summary:
          response.updatedCount > 0
            ? `구매확정 ${response.updatedCount}건 반영`
            : `${response.refreshedCount}건 점검 완료`,
      });
      window.setTimeout(() => removeLocalOperation(localToastId), 1_200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "구매확정 sync에 실패했습니다.";
      setFeedback({
        type: "error",
        title: "구매확정 sync 실패",
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

    await refetchWorksheetView();
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
    setDirtyRowsBySourceKey((current) => {
      const clearDirtyMode = options?.clearDirtyMode ?? "touched";
      if (clearDirtyMode === "all") {
        return {};
      }
      if (clearDirtyMode === "none") {
        return current;
      }

      const next = { ...current };
      for (const item of items) {
        if (item.sourceKey) {
          delete next[item.sourceKey];
        }
      }
      return next;
    });
    return response;
  }

  function clearDirtyRowsBySourceKeys(sourceKeys: readonly string[]) {
    if (!sourceKeys.length) {
      return;
    }

    setDirtySourceKeys((current) => {
      const next = new Set(current);
      for (const sourceKey of sourceKeys) {
        next.delete(sourceKey);
      }
      return next;
    });
    setDirtyRowsBySourceKey((current) => {
      const next = { ...current };
      for (const sourceKey of sourceKeys) {
        delete next[sourceKey];
      }
      return next;
    });
  }

  function clearDirtyRowsByRowIds(rowIds: readonly string[]) {
    const sourceKeys = resolveSourceKeysForTouchedRowIds(rowIds, [
      effectiveDraftRows,
      activeSheet?.items ?? [],
      Object.values(selectedRowsById),
      Object.values(dirtyRowsBySourceKey),
    ]);
    clearDirtyRowsBySourceKeys(sourceKeys);
  }

  async function applyInvoiceInputRows(
    rows: readonly CoupangShipmentWorksheetInvoiceInputApplyRow[],
    options: {
      title: string;
      emptyMessage: string;
      successMessage: (updatedCount: number) => string;
      issues: string[];
      closeDialog?: boolean;
    },
  ) {
    if (!filters.selectedStoreId) {
      return null;
    }

    const currentLookupRows = dedupeShipmentRowsBySourceKey([
      ...Object.values(dirtyRowsBySourceKey),
      ...Object.values(selectedRowsById),
      ...(activeSheet?.items ?? []),
      ...effectiveDraftRows,
    ]);
    const duplicateSelpickOrderNumbers = findDuplicateShipmentSelpickOrderNumbers(currentLookupRows);
    if (duplicateSelpickOrderNumbers.length) {
      setFeedback({
        type: "error",
        title: options.title,
        message:
          "운영 사용 이력이 있는 셀픽주문번호 중복이 있어 자동 복구 없이 송장 반영을 진행할 수 없습니다.",
        details: [
          `중복 셀픽주문번호: ${duplicateSelpickOrderNumbers.slice(0, 5).join(", ")}${duplicateSelpickOrderNumbers.length > 5 ? " 외" : ""}`,
        ],
      });
      return null;
    }

    const dedupedRows = dedupeInvoiceInputApplyRows(rows);
    if (!dedupedRows.length) {
      setFeedback({
        type: "warning",
        title: options.title,
        message: options.emptyMessage,
        details: options.issues,
      });
      return null;
    }

    setBusyAction("save");
    try {
      const response = await apiRequestJson<CoupangShipmentWorksheetInvoiceInputApplyResponse>(
        "POST",
        "/api/coupang/shipments/worksheet/invoice-input/apply",
        {
          storeId: filters.selectedStoreId,
          rows: dedupedRows,
        },
      );
      const nextIssues = [...options.issues, ...response.issues];

      clearDirtyRowsByRowIds(response.touchedRowIds);
      await refetchWorksheetView();

      if (options.closeDialog) {
        closeInvoiceInputDialog();
      }

      setWorksheetMode("invoice");
      setFeedback({
        type:
          response.updatedCount === 0 || nextIssues.length || Boolean(response.message)
            ? "warning"
            : "success",
        title: options.title,
        message:
          response.updatedCount > 0
            ? options.successMessage(response.updatedCount)
            : response.message ?? options.emptyMessage,
        details: nextIssues,
      });
      return response;
    } catch (error) {
      if (options.closeDialog) {
        closeInvoiceInputDialog();
      }

      setWorksheetMode("invoice");
      setFeedback({
        type: "error",
        title: options.title,
        message:
          error instanceof Error
            ? error.message
            : "송장 입력 반영 중 오류가 발생했습니다.",
        details: options.issues,
      });
      return null;
    } finally {
      setBusyAction(null);
    }
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
    () => getEditableColumnIds(columnConfigs, effectiveWorksheetMode),
    [columnConfigs, effectiveWorksheetMode],
  );

  const columns = useMemo(
    () =>
      buildShipmentGridColumns({
        columnConfigs,
        columnWidths,
        worksheetMode: effectiveWorksheetMode,
      }),
    [columnConfigs, columnWidths, effectiveWorksheetMode],
  );
  const gridColumns = useMemo(
    () =>
      isConfirmedTab
        ? columns.map((column) => ({
            ...column,
            editable: false,
            renderEditCell: undefined,
          }))
        : columns,
    [columns, isConfirmedTab],
  );

  function handlePageSelectedRowsChange(nextSelectedRows: ReadonlySet<string>) {
    setSelectedRowIds((current) => {
      const next = new Set(Array.from(current).filter((rowId) => !pageRowIdSet.has(rowId)));
      for (const rowId of Array.from(nextSelectedRows)) {
        next.add(rowId);
      }
      return next;
    });
    setSelectedRowsById((current) => {
      const cleared = omitRowsFromMap(current, pageRowIdSet);
      const nextRows = visibleRows.filter((row) => nextSelectedRows.has(row.id));
      return upsertRowMap(cleared, nextRows);
    });
  }

  function handleGridFill(event: {
    columnKey: string;
    sourceRow: CoupangShipmentWorksheetRow;
    targetRow: CoupangShipmentWorksheetRow;
  }) {
    if (isConfirmedTab) {
      return event.targetRow;
    }

    const config = columnConfigById.get(event.columnKey);
    if (!config || !isGridEditableSource(config.source, effectiveWorksheetMode)) {
      return event.targetRow;
    }

    return applyEditableCell(
      event.targetRow,
      config.source.key,
      event.sourceRow[config.source.key as keyof CoupangShipmentWorksheetRow],
    );
  }

  async function collectWorksheet(
    syncMode: "new_only" | "incremental" | "full" = "new_only",
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
            syncMode === "full"
              ? "쿠팡 배송 시트 재동기화"
              : syncMode === "incremental"
                ? "쿠팡 배송 시트 증분 갱신"
                : "쿠팡 배송 시트 빠른 수집",
          targetCount: 1,
        });
    if (!options?.skipBusyState) {
      setBusyAction(
        syncMode === "full"
          ? "collect-full"
          : syncMode === "incremental"
            ? "collect-incremental"
            : "collect-new",
      );
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
          maxPerPage: requestFilters.maxPerPage,
          syncMode,
        },
      );

      if (response.operation) {
        publishOperation(response.operation);
      }

      setSelectedRowIds(new Set());
      setSelectedRowsById({});
      setDirtySourceKeys(new Set());
      setDirtyRowsBySourceKey({});
      setSelectedCell(null);
      setDetailRowSnapshot(null);
      setWorksheetPage(1);
      await refetchWorksheetView();
      if (syncMode === "new_only") {
        const insertedSourceKeys = Array.from(
          new Set(response.syncSummary?.insertedSourceKeys ?? []),
        );
        if (insertedSourceKeys.length > 0) {
          setQuickCollectFocus({
            active: true,
            sourceKeys: insertedSourceKeys,
            rows: response.items,
            filterSignature: buildQuickCollectFocusSignature({
              selectedStoreId: requestFilters.selectedStoreId,
              createdAtFrom: requestFilters.createdAtFrom,
              createdAtTo: requestFilters.createdAtTo,
              query: requestFilters.query,
              scope: requestFilters.scope,
              decisionStatus: requestFilters.decisionStatus,
              priorityCard: requestFilters.priorityCard,
              pipelineCard: requestFilters.pipelineCard,
              issueFilter: requestFilters.issueFilter,
              invoiceStatusCard: requestFilters.invoiceStatusCard,
              orderStatusCard: requestFilters.orderStatusCard,
              outputStatusCard: requestFilters.outputStatusCard,
            }),
          });
        } else {
          setQuickCollectFocus(null);
        }
      } else {
        setQuickCollectFocus(null);
      }

      if (
        response.source === "live" &&
        (response.syncSummary?.pendingPhases?.length ?? 0) > 0
      ) {
        void refreshWorksheetInBackground({
          storeId: requestFilters.selectedStoreId,
          scope: "pending_after_collect",
        });
      }

      let autoAuditResponse: CoupangShipmentWorksheetAuditMissingResponse | null = null;
      if (syncMode === "new_only" && response.syncSummary?.autoAuditRecommended) {
        try {
          autoAuditResponse = await requestShipmentAuditMissingForCurrentFilters();
          if (autoAuditResponse) {
            setAuditResult(autoAuditResponse);
            if (autoAuditResponse.missingCount > 0 || autoAuditResponse.hiddenCount > 0) {
              setIsAuditDialogOpen(true);
            }
          }
        } catch {
          autoAuditResponse = null;
        }
      }

      if (!options?.silent) {
        const modeLabel =
          response.syncSummary?.mode === "full"
            ? "쿠팡 기준 재동기화"
            : response.syncSummary?.mode === "incremental"
              ? "증분 갱신"
              : "빠른 수집";
        const summary = response.syncSummary
          ? response.syncSummary.mode === "new_only"
            ? `${modeLabel}으로 신규 ${response.syncSummary.insertedCount}건을 워크시트에 추가했습니다.`
            : `${modeLabel}으로 조회 ${response.syncSummary.fetchedCount}건, 추가 ${response.syncSummary.insertedCount}건, 갱신 ${response.syncSummary.updatedCount}건을 반영했습니다.`
          : `${response.items.length}건을 셀픽 형식으로 정리했습니다.`;
        setFeedback({
          type: response.message || response.source === "fallback" ? "warning" : "success",
          title:
            modeLabel === "쿠팡 기준 재동기화"
              ? "배송 시트 재동기화 완료"
              : modeLabel === "증분 갱신"
                ? "배송 시트 증분 갱신 완료"
                : "신규 주문 빠른 수집 완료",
          message: response.message ? `${summary} ${response.message}` : summary,
          details: [
            ...(response.syncSummary?.failedStatuses?.length
              ? [`실패한 주문 상태 조회: ${response.syncSummary.failedStatuses.join(", ")}`]
              : []),
            ...(autoAuditResponse ? buildShipmentWorksheetAuditDetails(autoAuditResponse) : []),
          ].slice(0, 8),
        });
      }

      if (localToastId) {
        finishLocalOperation(localToastId, {
          status: response.message || response.source === "fallback" ? "warning" : "success",
          summary: response.syncSummary
            ? response.syncSummary.mode === "new_only"
              ? `${response.syncSummary.insertedCount}건 신규 추가`
              : `${response.syncSummary.insertedCount}건 추가, ${response.syncSummary.updatedCount}건 갱신`
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

  const triggerAutomaticFullSync = useEffectEvent(() => {
    void collectWorksheet("full", { silent: true });
  });

  useEffect(() => {
    if (!shouldHoldAuthoritativeWorksheetCounts || !authoritativeWorksheetSyncSignature) {
      setLastAutoFullSyncSignature(null);
      return;
    }

    if (worksheetMirrorSyncRequirement.isTrusted) {
      setLastAutoFullSyncSignature(null);
    }
  }, [
    authoritativeWorksheetSyncSignature,
    shouldHoldAuthoritativeWorksheetCounts,
    worksheetMirrorSyncRequirement.isTrusted,
  ]);

  useEffect(() => {
    if (!shouldHoldAuthoritativeWorksheetCounts || !authoritativeWorksheetSyncSignature) {
      return;
    }

    if (worksheetQuery.isFetching || busyAction !== null) {
      return;
    }

    if (lastAutoFullSyncSignature === authoritativeWorksheetSyncSignature) {
      return;
    }

    setLastAutoFullSyncSignature(authoritativeWorksheetSyncSignature);
    triggerAutomaticFullSync();
  }, [
    authoritativeWorksheetSyncSignature,
    busyAction,
    lastAutoFullSyncSignature,
    shouldHoldAuthoritativeWorksheetCounts,
    triggerAutomaticFullSync,
    worksheetQuery.isFetching,
  ]);

  async function saveWorksheetChanges() {
    if (!filters.selectedStoreId || !dirtyCount) {
      return true;
    }

    const items = Object.values(dirtyRowsBySourceKey)
      .filter((row) => dirtySet.has(row.sourceKey))
      .map((row) => buildWorksheetPatchItem(row));

    if (!items.length) {
      return true;
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
      return true;
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
      return false;
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
      [nextConfig.id]: resolveShipmentColumnDefaultWidth(nextConfig.source),
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
        nextConfigs.map((config) => [config.id, resolveShipmentColumnDefaultWidth(config.source)]),
      ),
    );
  }

  function applyColumnPreset(preset: ShipmentColumnPresetKey) {
    const nextConfigs = buildShipmentColumnPresetConfigs(preset);
    setColumnConfigs(nextConfigs);
    setColumnWidths(buildShipmentColumnPresetWidths(nextConfigs, preset));
    setWorksheetMode(preset === "invoice_input" ? "invoice" : "default");
    setWorksheetPage(1);
    setFeedback({
      type: "success",
      title: "보기 프리셋 적용",
      message:
        preset === "operations"
          ? "작업 보기 프리셋으로 기본 열 수를 줄였습니다."
          : preset === "invoice_input"
            ? "송장 입력 보기 프리셋으로 송장 작업 중심 열 구성을 적용했습니다."
            : "전체 열 보기 프리셋으로 기본 전체 열 구성을 적용했습니다.",
      details: [
        "기존 수집 데이터는 유지되고, 보이는 컬럼 순서와 폭만 바뀝니다.",
        "필요하면 화면 설정에서 다시 개별 컬럼을 조정할 수 있습니다.",
      ],
    });
  }

  async function ensureWorksheetChangesSavedForServerBulk() {
    if (!dirtyCount) {
      return true;
    }

    return saveWorksheetChanges();
  }

  async function downloadWorksheetXlsx(
    scope: ShipmentExcelExportScope,
    sortKey: ShipmentExcelSortKey,
  ) {
    if (!(activeSheet?.filteredRowCount ?? effectiveDraftRows.length)) {
      setFeedback({
        type: "warning",
        title: "엑셀 다운로드",
        message: "다운로드할 배송 시트가 없습니다.",
        details: [],
      });
      return;
    }

    if (scope === "notExported") {
      const saved = await ensureWorksheetChangesSavedForServerBulk();
      if (!saved) {
        return;
      }
    }

    const resolvedRows =
      scope === "selected" ? null : await resolveWorksheetBulkRows("not_exported_download");
    const sourceRows = scope === "selected" ? selectedRows : resolvedRows?.items ?? [];
    const blockedClaimRows =
      scope === "selected" ? selectedExportBlockedRows : resolvedRows?.blockedItems ?? [];
    const blockedClaimDetails = buildExcelClaimBlockedDetails(blockedClaimRows);
    const targetRows = scope === "selected" ? selectedExportRows : resolvedRows?.items ?? [];
    if (!targetRows.length) {
      setFeedback({
        type: "warning",
        title: "엑셀 다운로드",
        message:
          scope === "selected"
            ? sourceRows.length
              ? "클레임이 있는 주문은 엑셀 다운로드 대상에서 제외되어 다운로드할 주문건이 없습니다."
              : "체크한 행이 없어 엑셀을 다운로드할 수 없습니다."
            : resolvedRows?.matchedCount
              ? "미출력 행 중 클레임이 있는 주문은 엑셀 다운로드 대상에서 제외되어 다운로드할 주문건이 없습니다."
              : "미출력 행이 없어 엑셀을 다운로드할 수 없습니다.",
        details: blockedClaimDetails.slice(0, 8),
      });
      return;
    }

    const exportColumns = columnConfigs;
    const sortedRows = sortShipmentRowsForExcelExport(targetRows, sortKey);
    const rows = sortedRows.map((row) =>
      Object.fromEntries(
        exportColumns.map((config) => [config.label, getShipmentExportValue(row, config.source)]),
      ),
    );
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: exportColumns.map((config) => config.label),
    });

    worksheet["!cols"] = exportColumns.map((config) => ({
      wch: Math.max(
        10,
        Math.round((columnWidths[config.id] ?? resolveShipmentColumnDefaultWidth(config.source)) / 8),
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
      applyWorksheetRowUpdates(
        new Map(
          targetRows.map((row) => [
            row.id,
            {
              ...row,
              exportedAt,
            },
          ]),
        ),
      );
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
      type: blockedClaimRows.length ? "warning" : "success",
      title: "엑셀 다운로드 완료",
      message:
        blockedClaimRows.length > 0
          ? `${fileName} 파일을 ${getShipmentExcelSortLabel(sortKey)}으로 저장했고 ${getShipmentExcelExportScopeLabel(scope)} 주문건 ${targetRows.length}행을 출력 완료로 표시했습니다. 클레임 ${blockedClaimRows.length}건은 다운로드에서 제외했습니다.`
          : `${fileName} 파일을 ${getShipmentExcelSortLabel(sortKey)}으로 저장했고 ${getShipmentExcelExportScopeLabel(scope)} ${targetRows.length}행을 출력 완료로 표시했습니다.`,
      details: blockedClaimDetails.slice(0, 8),
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

    if (scope === "ready") {
      const saved = await ensureWorksheetChangesSavedForServerBulk();
      if (!saved) {
        return;
      }
    }

    const selectedShipmentBoxIds =
      scope === "selected"
        ? Array.from(
            new Set(
              selectedRows
                .map((row) => row.shipmentBoxId?.trim())
                .filter((shipmentBoxId): shipmentBoxId is string => Boolean(shipmentBoxId)),
            ),
          )
        : [];
    const selectedRefreshResponse =
      scope === "selected" && selectedShipmentBoxIds.length > 0
        ? await refreshWorksheetInBackground({
            storeId: filters.selectedStoreId,
            scope: "shipment_boxes",
            shipmentBoxIds: selectedShipmentBoxIds,
          })
        : null;
    const refreshedSelectedRowById = new Map(
      (selectedRefreshResponse?.items ?? []).map((row) => [row.id, row] as const),
    );
    const selectedTransmissionRows =
      scope === "selected"
        ? selectedRows.map((row) => refreshedSelectedRowById.get(row.id) ?? row)
        : [];
    let autoPreparedSummary: string | null = null;
    let autoPreparedFailureDetails: string[] = [];

    if (scope === "ready") {
      const prepareResolvedRows = await resolveWorksheetBulkRows("prepare_ready");
      const autoPrepareRows = resolveInvoiceAutoPrepareRows(prepareResolvedRows?.items ?? []);

      if (autoPrepareRows.length > 0) {
        const prepareResult = await apiRequestJson<CoupangBatchActionResponse>(
          "POST",
          "/api/coupang/orders/prepare",
          {
            storeId: filters.selectedStoreId,
            items: autoPrepareRows.map(
              (row) =>
                ({
                  shipmentBoxId: row.shipmentBoxId,
                  orderId: row.orderId,
                  productName: row.productName,
                }) satisfies CoupangPrepareTarget,
            ),
          },
        );

        if (prepareResult.operation) {
          publishOperation(prepareResult.operation);
        }

        autoPreparedFailureDetails = buildFailureDetails(prepareResult);
        if (prepareResult.summary.succeededCount > 0) {
          autoPreparedSummary = `상품준비중 ${prepareResult.summary.succeededCount}건 자동 처리`;
        }

        const succeededPrepareShipmentBoxIds = getSucceededPrepareShipmentBoxIds(prepareResult);
        if (succeededPrepareShipmentBoxIds.length > 0) {
          applyWorksheetRowUpdates(
            buildOptimisticPrepareRowUpdates({
              rows: effectiveDraftRows,
              shipmentBoxIds: succeededPrepareShipmentBoxIds,
              updatedAt: new Date().toISOString(),
            }),
            { markDirty: false },
          );
          await refreshWorksheetInBackground({
            storeId: filters.selectedStoreId,
            scope: "shipment_boxes",
            shipmentBoxIds: succeededPrepareShipmentBoxIds,
          });
        }
      }
    }

    const resolvedRows =
      scope === "selected" ? null : await resolveWorksheetBulkRows("invoice_ready");
    const blockedDecisionRows =
      scope === "selected"
        ? selectedTransmissionRows.filter((row) => getFulfillmentDecision(row).shouldBlockBatchActions)
        : [];
    const blockedDecisionDetails =
      scope === "selected" ? buildShipmentBlockedDecisionDetails(blockedDecisionRows) : [];
    const sourceRows =
      scope === "selected"
        ? selectedTransmissionRows.filter((row) => !getFulfillmentDecision(row).shouldBlockBatchActions)
        : resolvedRows?.items ?? [];
    const blockedClaimRows =
      scope === "selected"
        ? sourceRows.filter((row) => hasShipmentClaimIssue(row))
        : resolvedRows?.blockedItems ?? [];
    const blockedClaimDetails = buildInvoiceClaimBlockedDetails(blockedClaimRows);
    if (!sourceRows.length) {
      setFeedback({
        type: "warning",
        title: scope === "selected" ? "선택 송장 전송" : "송장 전송하기",
        message:
          scope === "selected"
            ? blockedDecisionRows.length > 0
              ? "선택한 주문이 모두 확인 후 처리 대상이라 송장 전송을 실행하지 않았습니다."
              : "선택된 행이 없습니다."
            : resolvedRows?.matchedCount
              ? "클레임 또는 현재 상태 때문에 전송 가능한 송장 행이 없습니다."
              : "전송할 신규/실패 송장 행이 없습니다. 이미 완료된 행은 값을 수정하면 다시 전송할 수 있습니다.",
        details: [
          ...blockedDecisionDetails,
          ...autoPreparedFailureDetails,
          ...blockedClaimDetails,
        ].slice(0, 8),
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
        details: [...blockedDecisionDetails, ...blockedClaimDetails, ...validationErrors],
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
      applyWorksheetRowUpdates(
        new Map(
          transmissionRows.map((row) => [
            row.id,
            {
              ...row,
              invoiceTransmissionStatus: "pending" as const,
              invoiceTransmissionMessage: null,
              invoiceTransmissionAt: transmissionStartedAt,
              invoiceAppliedAt: null,
            },
          ]),
        ),
        { markDirty: false },
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
      const combined = combineBatchResults(
        results.map((result) =>
          normalizeRepeatedInvoiceBatchResult(result, rowByInvoiceIdentity, previousRowBySourceKey),
        ),
      );
      await refetchWorksheetView();

      const mergedShipmentRowCount = transmissionRows.length - invoiceTransmissionGroups.length;
      const summaryBaseParts = [buildResultSummary(combined)];
      if (autoPreparedSummary) {
        summaryBaseParts.push(autoPreparedSummary);
      }
      if (mergedShipmentRowCount > 0) {
        summaryBaseParts.push(`합배송 ${mergedShipmentRowCount}행 묶음 처리`);
      }
      const summaryBase = summaryBaseParts.join(" / ");
      const summary =
        skippedRowCount > 0 || blockedDecisionRows.length > 0
          ? `${summaryBase}${skippedRowCount > 0 ? ` / 오류 ${skippedRowCount}행 건너뜀` : ""}${blockedDecisionRows.length > 0 ? ` / 확인 필요 ${blockedDecisionRows.length}행 자동 제외` : ""}`
          : summaryBase;
      const detailLines = [
        ...autoPreparedFailureDetails,
        ...buildFailureDetails(combined),
        ...validationErrors,
      ].slice(0, 8);
      setFeedback({
        type:
          blockedDecisionRows.length > 0 ||
          blockedClaimDetails.length > 0 ||
          autoPreparedFailureDetails.length > 0 ||
          validationErrors.length > 0 ||
          combined.summary.failedCount > 0 ||
          combined.summary.warningCount > 0 ||
          combined.summary.skippedCount > 0
            ? "warning"
            : "success",
        title: scope === "selected" ? "송장 전송 결과" : "송장 전송 결과",
        message: summary,
        details: [...blockedDecisionDetails, ...detailLines, ...blockedClaimDetails].slice(0, 8),
      });
      const succeededShipmentBoxIds = Array.from(
        new Set(
          combined.items
            .map((item) => (item.status === "succeeded" ? item.shipmentBoxId?.trim() ?? "" : ""))
            .filter(Boolean),
        ),
      );
      if (succeededShipmentBoxIds.length > 0) {
        void refreshWorksheetInBackground({
          storeId: filters.selectedStoreId,
          scope: "shipment_boxes",
          shipmentBoxIds: succeededShipmentBoxIds,
        });
      }
      finishLocalOperation(localToastId, {
        status:
          blockedDecisionRows.length > 0 ||
          blockedClaimDetails.length > 0 ||
          autoPreparedFailureDetails.length > 0 ||
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
        await refetchWorksheetView();
      } catch {
        const recoveryUpdates = new Map<string, CoupangShipmentWorksheetRow>();
        for (const row of transmissionRows) {
          const previousRow = previousRowBySourceKey.get(row.sourceKey);
          if (shouldPreserveSucceededInvoiceState(row, previousRow)) {
            recoveryUpdates.set(row.id, {
              ...row,
              invoiceTransmissionStatus: "succeeded",
              invoiceTransmissionMessage: resolveRepeatedInvoiceMessage(previousRow),
              invoiceTransmissionAt: previousRow?.invoiceTransmissionAt ?? failedAt,
              invoiceAppliedAt: previousRow?.invoiceAppliedAt ?? failedAt,
            });
            continue;
          }

          recoveryUpdates.set(row.id, {
            ...row,
            invoiceTransmissionStatus: "failed",
            invoiceTransmissionMessage: message,
            invoiceTransmissionAt: failedAt,
            invoiceAppliedAt: null,
          });
        }

        applyWorksheetRowUpdates(recoveryUpdates, { markDirty: false });
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

  function openShipmentDetailDialog(row: CoupangShipmentWorksheetRow) {
    setDetailRowSnapshot(row);
    setIsFullDetailDialogOpen(false);
  }

  function closeShipmentDetailDialog() {
    setIsFullDetailDialogOpen(false);
    setDetailRowSnapshot(null);
  }

  function openShipmentFullDetailDialog() {
    if (!detailRowSnapshot) {
      return;
    }

    setIsFullDetailDialogOpen(true);
  }

  function closeShipmentFullDetailDialog() {
    setIsFullDetailDialogOpen(false);
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
        title: "송장 입력하기",
        message: "반영할 행을 찾지 못했습니다.",
        details: issues,
      });
      return;
    }

    await applyInvoiceInputRows(rows, {
      title: "송장 입력하기 반영",
      emptyMessage: "현재 워크시트에서 일치하는 셀픽주문번호를 찾지 못했습니다.",
      successMessage: (updatedCount) =>
        `${updatedCount}건의 택배사와 운송장번호를 워크시트에 반영했습니다.`,
      issues,
      closeDialog: true,
    });
  }

  function handleVisibleRowsChange(
    nextVisibleRows: CoupangShipmentWorksheetRow[],
    data: RowsChangeData<CoupangShipmentWorksheetRow>,
  ) {
    if (isConfirmedTab) {
      return;
    }

    const columnId = String(data.column.key);
    const config = columnConfigById.get(columnId);
    const source = config?.source;
    if (!config || !source || !isGridEditableSource(source, effectiveWorksheetMode)) {
      return;
    }

    const changedRows = data.indexes
      .map((index) => nextVisibleRows[index])
      .filter((row): row is CoupangShipmentWorksheetRow => Boolean(row))
      .map((row) => {
        const nextRow = applyEditableCell(
          row,
          source.key,
          row[source.key as keyof CoupangShipmentWorksheetRow],
        );

        return nextRow === row ? null : nextRow;
      })
      .filter((row): row is CoupangShipmentWorksheetRow => Boolean(row));

    if (!changedRows.length) {
      return;
    }

    applyWorksheetRowUpdates(new Map(changedRows.map((row) => [row.id, row] as const)));
  }

  async function handleGridPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (isConfirmedTab) {
      return;
    }

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
      const currentLookupRows = dedupeShipmentRowsBySourceKey([
        ...Object.values(dirtyRowsBySourceKey),
        ...Object.values(selectedRowsById),
        ...(activeSheet?.items ?? []),
        ...effectiveDraftRows,
      ]);
      const duplicateSelpickOrderNumbers =
        findDuplicateShipmentSelpickOrderNumbers(currentLookupRows);
      if (duplicateSelpickOrderNumbers.length) {
        setFeedback({
          type: "error",
          title: "송장 붙여넣기",
          message:
            "운영 사용 이력이 있는 셀픽주문번호 중복이 있어 자동 복구 없이 송장 붙여넣기를 진행할 수 없습니다.",
          details: [
            `중복 셀픽주문번호: ${duplicateSelpickOrderNumbers.slice(0, 5).join(", ")}${duplicateSelpickOrderNumbers.length > 5 ? " 외" : ""}`,
          ],
        });
        return;
      }

      const currentRowsBySelpickOrderNumber = new Map(
        currentLookupRows.map((row) => [row.selpickOrderNumber, row] as const),
      );
      const { updates, issues } = parseInvoiceClipboardRows(
        clipboardText,
        currentRowsBySelpickOrderNumber,
      );
      const invoiceRows = Array.from(updates.values()).map(
        (row) =>
          ({
            selpickOrderNumber: row.selpickOrderNumber,
            deliveryCompanyCode: row.deliveryCompanyCode,
            invoiceNumber: row.invoiceNumber,
          }) satisfies CoupangShipmentWorksheetInvoiceInputApplyRow,
      );

      if (!invoiceRows.length) {
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

      await applyInvoiceInputRows(invoiceRows, {
        title: "송장 붙여넣기 적용",
        emptyMessage: "현재 워크시트에서 일치하는 셀픽주문번호를 찾지 못했습니다.",
        successMessage: (updatedCount) =>
          `${updatedCount}건의 택배사와 송장번호를 워크시트에 반영했습니다.`,
        issues,
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
      effectiveWorksheetMode === "invoice"
        ? stripWorksheetPasteHeaderRow(matrix, startColumnIndex, editableColumnIds, columnConfigById)
        : matrix;
    if (!sanitizedMatrix.length) {
      return;
    }

    event.preventDefault();
    const updates = new Map<string, CoupangShipmentWorksheetRow>();

    for (let rowOffset = 0; rowOffset < sanitizedMatrix.length; rowOffset += 1) {
      const targetRow = visibleRows[selectedCell.rowIdx + rowOffset];
      if (!targetRow) {
        continue;
      }

      let workingRow = updates.get(targetRow.id) ?? targetRow;
      const cells = sanitizedMatrix[rowOffset] ?? [];

      for (let columnOffset = 0; columnOffset < cells.length; columnOffset += 1) {
        const targetColumnId = editableColumnIds[startColumnIndex + columnOffset];
        const config = targetColumnId ? columnConfigById.get(targetColumnId) : undefined;
        if (!config || !isGridEditableSource(config.source, effectiveWorksheetMode)) {
          continue;
        }

        workingRow = applyEditableCell(workingRow, config.source.key, cells[columnOffset]);
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
    if (!isConfirmedTab && config && isGridEditableSource(config.source, effectiveWorksheetMode)) {
      return;
    }

    openShipmentDetailDialog(args.row);
  }

  function handleSettingsDrop(targetId: string) {
    if (!draggingConfigId || draggingConfigId === targetId) {
      return;
    }

    setColumnConfigs((current) => moveColumnConfigs(current, draggingConfigId, targetId));
    setDraggingConfigId(null);
  }

  const toolbarNode = (
    <FulfillmentToolbar
      activeTab={activeTab}
      activeSheetSource={activeSheet?.source ?? null}
      busyAction={busyAction}
      collectActionDisabled={collectActionDisabled}
      reconcileLiveActionDisabled={reconcileLiveActionDisabled}
      purchaseConfirmActionDisabled={purchaseConfirmActionDisabled}
      prepareActionDisabled={prepareActionDisabled}
      transmitActionDisabled={transmitActionDisabled}
      openInvoiceInputDisabled={openInvoiceInputDisabled}
      openExcelExportDisabled={openExcelExportDisabled}
      openNotExportedExcelExportDisabled={openNotExportedExcelExportDisabled}
      transmitActionBusyLabel={transmitActionBusyLabel}
      dirtyCount={dirtyCount}
      isFallback={isFallback}
      selectedRowsCount={selectedRows.length}
      selectedExportBlockedRowsCount={selectedExportBlockedRows.length}
      selectedInvoiceBlockedRowsCount={selectedInvoiceBlockedRows.length}
      notExportedCount={activeSheet?.outputCounts.notExported ?? 0}
      claimScopeCount={scopeCounts.claims}
      filtersProps={{
        activeTab,
        filters,
        stores,
        scopeCounts,
        scopeOptions: MAIN_WORKSHEET_SCOPE_OPTIONS,
        refreshDisabled: refreshActionDisabled,
        onPatchFilters: (patch) =>
          setFilters((current) => ({
            ...current,
            ...patch,
          })),
        onRefresh: () => void handleShipmentRefresh(),
      }}
      onChangeTab={changeWorkspaceTab}
      onQuickCollect={() => void collectWorksheet("new_only")}
      onReconcileLive={() => void executeReconcileShipmentWorksheetLive()}
      onSyncPurchaseConfirmed={() => void executePurchaseConfirmedSync()}
      onPrepareAcceptedOrders={() => void executePrepareAcceptedOrders()}
      onTransmit={() => void executeInvoiceInputMode()}
      onOpenInvoiceInput={openInvoiceInputDialog}
      onOpenSelectedExcelExport={() => openExcelSortDialog("selected")}
      onOpenNotExportedExcelExport={() => openExcelSortDialog("notExported")}
      onSaveChanges={() => void saveWorksheetChanges()}
      onAuditMissing={() => void executeShipmentAuditMissing()}
      onCollectIncremental={() => void collectWorksheet("incremental")}
      onCollectFull={() => void collectWorksheet("full")}
    />
  );

  const summaryNode = (
    <FulfillmentSummaryBar
      activeTab={activeTab}
      worksheetSummaryProps={{
        selectedStoreId: filters.selectedStoreId,
        quickCollectFocusActive: isQuickCollectFocusActive,
        quickCollectFocusCount: quickCollectFocusResult?.focusedRows.length ?? 0,
        quickCollectFocusMessage:
          isQuickCollectFocusActive && quickCollectFocusResult
            ? `빠른 수집으로 추가된 ${formatNumber(quickCollectFocusResult.focusedRows.length)}건을 먼저 보여줍니다.`
            : null,
        activeDecisionStatus,
        decisionCounts,
        detailFilterToggleLabel: effectiveDetailFilterToggleLabel,
        detailFiltersOpen,
        activeDetailFilterCount: effectiveDetailFilterCount,
        activeFilterSummaryTokens,
        filterSummarySupportText,
        hasCustomWorksheetFilters: effectiveHasCustomWorksheetFilters,
        pageRowCount: activeSheet?.filteredRowCount ?? effectiveDraftRows.length,
        visibleRowsCount: visibleRows.length,
        filters,
        activeSheet,
        authoritativeCountsReady: !shouldHoldAuthoritativeWorksheetCounts,
        authoritativeCountsAutoSyncing: isAuthoritativeWorksheetFullSyncBusy,
        authoritativeCountsSyncRequirement: worksheetMirrorSyncRequirement,
        activeInvoiceStatusCard,
        activeOrderStatusCard,
        activeOutputStatusCard,
        invoiceStatusOptions: INVOICE_STATUS_CARD_OPTIONS,
        outputStatusOptions: OUTPUT_STATUS_CARD_OPTIONS,
        orderStatusOptions: ORDER_STATUS_CARD_OPTIONS,
        onClearQuickCollectFocus: () => {
          setQuickCollectFocus(null);
          setWorksheetPage(1);
        },
        onPatchFilters: (patch) =>
          setFilters((current) => ({
            ...current,
            ...patch,
          })),
        onResetFilters: () =>
          setFilters((current) => ({
            ...current,
            query: "",
            scope: "all",
            decisionStatus: "all",
            priorityCard: "all",
            pipelineCard: "all",
            issueFilter: "all",
            invoiceStatusCard: "all",
            orderStatusCard: "all",
            outputStatusCard: "all",
          })),
        onToggleDetailFilters: () => setDetailFiltersOpen((current) => !current),
      }}
      archiveSummary={{
        totalRowCount: archiveSheet?.totalRowCount ?? 0,
        filteredRowCount: archiveSheet?.filteredRowCount ?? 0,
        archivePage,
        archiveTotalPages,
        worksheetPageSize,
      }}
    />
  );

  const activityNode = recentActivityItems.length ? (
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
  ) : null;

  const auditNode = auditResult ? (
    <div
      className={`feedback${auditResult.missingCount > 0 || auditResult.hiddenCount > 0 ? " warning" : " success"}`}
    >
      <strong>누락 검수 결과</strong>
      <div className="muted">{auditResult.message ?? summarizeShipmentWorksheetAuditResult(auditResult)}</div>
      <div className="toolbar" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <div className="muted">
          live {formatNumber(auditResult.liveCount)}건 / 누락 {formatNumber(auditResult.missingCount)}건
          / 현재 뷰 숨김 {formatNumber(auditResult.hiddenCount)}건
        </div>
        <button className="button ghost" onClick={() => setIsAuditDialogOpen(true)}>
          상세 보기
        </button>
      </div>
    </div>
  ) : null;

  const selectionNode = (
    <FulfillmentSelectionController
      activeTab={activeTab}
      selectedRowsCount={selectedRows.length}
      selectedReadyRowsCount={selectedReadyRows.length}
      selectedDecisionBlockedRowsCount={selectedDecisionBlockedRows.length}
      blockedDecisionSummary={selectedBlockedDecisionSummary}
      transmitDisabled={selectedTransmitActionDisabled}
      downloadDisabled={openExcelExportDisabled}
      onTransmit={() => void executeSelectedInvoices()}
      onDownload={() => openExcelSortDialog("selected")}
      onClear={() => {
        setSelectedRowIds(new Set());
        setSelectedRowsById({});
      }}
    />
  );

  const gridContentNode = (
    <FulfillmentGridController
      activeTab={activeTab}
      worksheet={{
        invoiceModeNotice,
        detailGuideNotice,
        readOnly: isConfirmedTab,
        worksheetMode: effectiveWorksheetMode,
        activeColumnPreset,
        isLoading: worksheetQuery.isLoading && !activeSheet,
        hasSheetRows: Boolean(activeSheet?.totalRowCount ?? 0),
        hasRowsForCurrentFilters: Boolean(effectiveDraftRows.length),
        filteredRowCount: activeSheet?.filteredRowCount ?? 0,
        visibleRowsCount: visibleRows.length,
        worksheetPage,
        worksheetTotalPages,
        worksheetPageSize,
        pageSizeOptions: SHIPMENT_WORKSHEET_PAGE_SIZE_OPTIONS,
        columns: gridColumns,
        rows: visibleRows,
        selectedRows: isConfirmedTab ? new Set<string>() : pageSelectedRowIds,
        sortColumns,
        dirtySourceKeys: dirtySet,
        onWorksheetModeChange: isConfirmedTab ? () => undefined : setWorksheetMode,
        onApplyColumnPreset: applyColumnPreset,
        onOpenSettings: () => {
          setSettingsReturnTab(activeTab === "settings" ? "worksheet" : activeTab);
          changeWorkspaceTab("settings");
        },
        onPageSizeChange: (pageSize) => {
          setWorksheetPageSize(pageSize);
          setWorksheetPage(1);
        },
        onPrevPage: () => setWorksheetPage((current) => Math.max(1, current - 1)),
        onNextPage: () => setWorksheetPage((current) => Math.min(worksheetTotalPages, current + 1)),
        onPasteCapture: handleGridPaste,
        onSortColumnsChange: (nextSortColumns) => setSortColumns(nextSortColumns.slice(-1)),
        onSelectedRowsChange: isConfirmedTab ? () => undefined : handlePageSelectedRowsChange,
        onRowsChange: isConfirmedTab ? () => undefined : handleVisibleRowsChange,
        onFill: handleGridFill,
        onCellClick: handleGridCellClick,
        onSelectedCellChange: (args: CellSelectArgs<CoupangShipmentWorksheetRow>) =>
          setSelectedCell({
            rowIdx: args.rowIdx,
            columnId: String(args.column.key),
          }),
        onColumnResize: (column, width) =>
          setColumnWidths((current) => ({
            ...current,
            [String(column.key)]: width,
          })),
        onColumnsReorder: handleGridColumnsReorder,
      }}
      archive={{
        detailGuideNotice,
        isLoading: archiveQuery.isLoading && !archiveSheet,
        totalRowCount: archiveSheet?.totalRowCount ?? 0,
        filteredRowCount: archiveSheet?.filteredRowCount ?? 0,
        rows: archiveRows,
        archivePage,
        archiveTotalPages,
        worksheetPageSize,
        pageSizeOptions: SHIPMENT_WORKSHEET_PAGE_SIZE_OPTIONS,
        getStatusPresentation: getWorksheetStatusPresentation,
        getArchiveReasonLabel: getShipmentArchiveReasonLabel,
        formatDateTimeLabel,
        formatInvoiceText: (row) => formatJoinedText([row.deliveryCompanyCode, row.invoiceNumber]),
        onOpenDetail: openShipmentDetailDialog,
        onPageSizeChange: (pageSize) => {
          setWorksheetPageSize(pageSize);
          setArchivePage(1);
        },
        onPrevPage: () => setArchivePage((current) => Math.max(1, current - 1)),
        onNextPage: () => setArchivePage((current) => Math.min(archiveTotalPages, current + 1)),
      }}
      settings={{
        columnConfigs,
        columnWidths,
        draggingConfigId,
        previewRow: columnPreviewRow,
        previewRowDescription: columnPreviewDescription,
        previewRowOptions,
        selectedPreviewRowId: selectedPreviewRowOptionId,
        openExcelExportDisabled,
        openNotExportedExcelExportDisabled,
        selectedRowsCount: selectedRows.length,
        selectedExportBlockedRowCount: selectedExportBlockedRows.length,
        claimScopeCount: scopeCounts.claims,
        notExportedCount: activeSheet?.outputCounts.notExported ?? 0,
        activeColumnPreset,
        shipmentColumnSourceOptions,
        onBack: () => changeWorkspaceTab(settingsReturnTab),
        onAdd: addColumnConfig,
        onApplyColumnPreset: applyColumnPreset,
        onReset: resetColumnConfigs,
        onDelete: deleteColumnConfig,
        onDragStart: (id) => setDraggingConfigId(id),
        onDragEnd: () => setDraggingConfigId(null),
        onDrop: handleSettingsDrop,
        onUpdate: updateColumnConfig,
        onPreviewRowChange: setColumnPreviewRowId,
        onOpenExcelSortDialog: openExcelSortDialog,
      }}
    />
  );

  const contentNode =
    activeTab === "worksheet" || activeTab === "confirmed" ? (
      <div className="shipment-hub-layout">
        <div className="shipment-hub-main">{gridContentNode}</div>
        <ShipmentHubSidePanel
          row={detailRow}
          heroMeta={detailHeroMeta}
          decision={detailDecisionPresentation}
          originalStatusLabel={detailOriginalStatusLabel}
          customerServiceSignalLabels={detailCustomerServiceSignalLabels}
          customerServiceStateLabel={detailCustomerServiceStateLabel}
          riskSummary={detailRiskSummary}
          handoffLinks={detailResolvedHandoffLinks}
          worksheetStatusValue={detailWorksheetStatusValue}
          invoiceStatusValue={detailInvoiceStatusValue}
          claimStatusValue={detailClaimStatusValue}
          statusRows={detailStatusRows}
          activityRows={detailRealtimeOrderRows}
          isLoading={shipmentDetailQuery.isLoading}
          errorMessage={shipmentDetailQuery.error ? (shipmentDetailQuery.error as Error).message : null}
          onClose={closeShipmentDetailDialog}
          onOpenFullDetail={openShipmentFullDetailDialog}
        />
      </div>
    ) : (
      gridContentNode
    );

  const drawersNode = (
    <FulfillmentDrawerController
      audit={{
        isOpen: isAuditDialogOpen,
        result: auditResult,
        onClose: () => setIsAuditDialogOpen(false),
      }}
      decisionDrawer={{
        isOpen: Boolean(detailRow && activeTab === "archive" && !isFullDetailDialogOpen),
        rowTitle: detailRow?.exposedProductName || detailRow?.productName || "",
        heroMeta: detailHeroMeta,
        decision: detailDecisionPresentation,
        worksheetStatusValue: detailWorksheetStatusValue,
        invoiceStatusValue: detailInvoiceStatusValue,
        claimStatusValue: detailClaimStatusValue,
        worksheetRows: detailWorksheetRows,
        deliveryRows: detailDeliveryRows,
        statusRows: detailStatusRows,
        activityRows: detailRealtimeOrderRows,
        handoffGuide: detailHandoffGuide,
        isLoading: shipmentDetailQuery.isLoading,
        errorMessage: shipmentDetailQuery.error ? (shipmentDetailQuery.error as Error).message : null,
        onClose: closeShipmentDetailDialog,
        onOpenFullDetail: openShipmentFullDetailDialog,
      }}
      detailDialog={{
        isOpen: Boolean(detailRow && isFullDetailDialogOpen),
        rowTitle: detailRow?.exposedProductName || detailRow?.productName || "",
        heroMeta: detailHeroMeta,
        worksheetStatusValue: detailWorksheetStatusValue,
        invoiceStatusValue: detailInvoiceStatusValue,
        claimStatusValue: detailClaimStatusValue,
        worksheetRows: detailWorksheetRows,
        deliveryRows: detailDeliveryRows,
        statusRows: detailStatusRows,
        isLoading: shipmentDetailQuery.isLoading,
        errorMessage: shipmentDetailQuery.error ? (shipmentDetailQuery.error as Error).message : null,
        warningTitle: detailDialogWarningTitle,
        warningMessage: detailDialogWarningMessage,
        realtimeOrderRows: detailRealtimeOrderRows,
        orderItemsTable: detailOrderItemsTable,
        returnSummaryText: `총 ${formatNumber(detailReturnRows.length)}건 · 조회 범위 ${detailClaimLookupRange}`,
        returnClaims: detailReturnClaimCards,
        exchangeSummaryText: `총 ${formatNumber(detailExchangeRows.length)}건 · 조회 범위 ${detailClaimLookupRange}`,
        exchangeClaims: detailExchangeClaimCards,
        detailRow,
        onClose: closeShipmentFullDetailDialog,
      }}
      excelSortDialog={{
        isOpen: isExcelSortDialogOpen,
        exportScope: excelExportScope,
        targetRowCount:
          excelExportScope === "selected"
            ? selectedExportRows.length
            : activeSheet?.outputCounts.notExported ?? 0,
        blockedClaimCount:
          excelExportScope === "selected" ? selectedExportBlockedRows.length : scopeCounts.claims,
        onClose: closeExcelSortDialog,
        onApply: applyExcelSortDialog,
        getScopeLabel: getShipmentExcelExportScopeLabel,
      }}
      invoiceInputDialog={{
        isOpen: isInvoiceInputDialogOpen,
        value: invoiceInputDialogValue,
        isBusy: busyAction !== null,
        onChange: setInvoiceInputDialogValue,
        onClose: closeInvoiceInputDialog,
        onApply: () => void applyInvoiceInputDialog(),
      }}
    />
  );

  return (
    <FulfillmentShell
      toolbar={toolbarNode}
      summary={summaryNode}
      activity={activityNode}
      audit={auditNode}
      selection={selectionNode}
      content={contentNode}
      drawers={drawersNode}
    />
  );
}
