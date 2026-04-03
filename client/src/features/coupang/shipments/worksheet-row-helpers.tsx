import type { ReactNode } from "react";
import { type RenderEditCellProps, textEditor } from "react-data-grid";
import type {
  CoupangExchangeDetail,
  CoupangExchangeRow,
  CoupangReturnDetail,
  CoupangReturnRow,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";
import { StatusBadge } from "@/components/status-badge";
import { getInvoiceStatusCardKey } from "@/lib/coupang-shipment-quick-filters";
import {
  formatShipmentWorksheetCustomerServiceLabel,
  getCoupangCustomerServiceStateText,
  getShipmentWorksheetCustomerServiceSearchText,
  hasCoupangCustomerServiceIssue,
} from "@/lib/coupang-customer-service";
import {
  formatCoupangOrderStatusLabel,
  getCoupangOrderStatusToneClass,
  resolveCoupangDisplayOrderStatus,
} from "@/lib/coupang-order-status";
import { formatNumber } from "@/lib/utils";
import { SHIPMENT_COLUMN_DEFAULT_WIDTHS } from "./worksheet-config";
import type {
  EditableColumnKey,
  ShipmentColumnConfig,
  ShipmentColumnSourceKey,
  ShipmentExcelExportScope,
  ShipmentExcelSortKey,
} from "./types";

const CURRENCY_FORMATTER = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

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

export function applyEditableCell(
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

export function compareShipmentSortValues(
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

export function sortShipmentRows(
  rows: CoupangShipmentWorksheetRow[],
  sortColumns: readonly { columnKey: string; direction: "ASC" | "DESC" }[] = [],
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

export function formatDateTimeText(value: string | null | undefined) {
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

export function formatDateTimeLabel(value: string | null | undefined) {
  const text = formatDateTimeText(value);
  return text || "-";
}

export function formatJoinedText(values: Array<string | null | undefined>, separator = " / ") {
  const parts = values.map((value) => formatExportText(value)).filter(Boolean);
  return parts.length ? parts.join(separator) : "-";
}

export function formatAddressText(values: Array<string | null | undefined>) {
  const parts = values.map((value) => formatExportText(value)).filter(Boolean);
  return parts.length ? parts.join(" ") : "-";
}

export function formatClaimReasonText(
  reason: string | null | undefined,
  reasonCode: string | null | undefined,
  reasonDetail?: string | null | undefined,
) {
  const parts = [formatExportText(reason), formatExportText(reasonCode), formatExportText(reasonDetail)].filter(
    (value, index, array) => Boolean(value) && array.indexOf(value) === index,
  );
  return parts.length ? parts.join(" / ") : "-";
}

export function formatActionsText(values: string[]) {
  return values.length ? values.join(" · ") : "없음";
}

export function buildReturnActionLabels(
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

  if (row.canMarkShipmentStopped) labels.push("출고 중지");
  if (row.canMarkAlreadyShipped) labels.push("이미 출고됨");
  if (row.canApproveReturn) labels.push("반품 승인");
  if (row.canConfirmInbound) labels.push("입고 확인");
  if (row.canUploadCollectionInvoice) labels.push("회수 송장 등록");

  return labels;
}

export function buildExchangeActionLabels(
  row: Pick<CoupangExchangeRow, "canConfirmInbound" | "canReject" | "canUploadExchangeInvoice">,
) {
  const labels: string[] = [];

  if (row.canConfirmInbound) labels.push("입고 확인");
  if (row.canReject) labels.push("교환 반려");
  if (row.canUploadExchangeInvoice) labels.push("교환 송장 등록");

  return labels;
}

export function formatReturnDeliverySummary(
  detail: CoupangReturnDetail | null,
  row: CoupangReturnRow | null,
) {
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

export function formatExchangeInvoiceSummary(
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

export function renderExportStatusCell(row: CoupangShipmentWorksheetRow) {
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

export function getShipmentExcelSortLabel(sortKey: ShipmentExcelSortKey) {
  return sortKey === "productName" ? "상품명순" : "날짜순";
}

export function getShipmentExcelExportScopeLabel(scope: ShipmentExcelExportScope) {
  return scope === "selected" ? "선택 행" : "미출력건 전체";
}

export function sortShipmentRowsForExcelExport(
  rows: readonly CoupangShipmentWorksheetRow[],
  sortKey: ShipmentExcelSortKey,
) {
  return rows.slice().sort((left, right) => {
    if (sortKey === "productName") {
      const productCompared = compareShipmentSortValues(
        left.exposedProductName ?? left.productName,
        right.exposedProductName ?? right.productName,
      );
      if (productCompared !== 0) return productCompared;

      const optionCompared = compareShipmentSortValues(left.optionName, right.optionName);
      if (optionCompared !== 0) return optionCompared;
    } else {
      const dateCompared = compareShipmentSortValues(
        left.orderedAtRaw ?? left.orderDateKey ?? left.orderDateText,
        right.orderedAtRaw ?? right.orderDateKey ?? right.orderDateText,
      );
      if (dateCompared !== 0) return dateCompared;
    }

    const fallbackCompared = compareShipmentSortValues(left.selpickOrderNumber, right.selpickOrderNumber);
    if (fallbackCompared !== 0) {
      return fallbackCompared;
    }

    return left.id.localeCompare(right.id);
  });
}

export function formatOrderStatusLabel(value: string | null | undefined) {
  return formatCoupangOrderStatusLabel(value);
}

function getOrderStatusToneClass(value: string | null | undefined) {
  return getCoupangOrderStatusToneClass(value);
}

function resolveWorksheetOrderStatus(row: CoupangShipmentWorksheetRow) {
  return resolveCoupangDisplayOrderStatus({
    orderStatus: row.orderStatus,
    customerServiceIssueSummary: row.customerServiceIssueSummary,
  });
}

export function getWorksheetStatusPresentation(row: CoupangShipmentWorksheetRow) {
  const resolvedOrderStatus = resolveWorksheetOrderStatus(row);
  const orderLabel = formatOrderStatusLabel(resolvedOrderStatus);
  const hasCustomerServiceIssue = hasCoupangCustomerServiceIssue({
    summary: row.customerServiceIssueSummary,
    count: row.customerServiceIssueCount,
  });
  const customerServiceLabel = formatShipmentWorksheetCustomerServiceLabel({
    summary: row.customerServiceIssueSummary,
    count: row.customerServiceIssueCount,
    state: row.customerServiceState,
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
    customerServiceIssueSummary,
    customerServiceStateText,
    title: title || orderLabel,
  };
}

export function renderOrderStatusCell(row: CoupangShipmentWorksheetRow) {
  const presentation = getWorksheetStatusPresentation(row);

  return (
    <div className="shipment-cell shipment-status-cell" title={presentation.title}>
      <div className="shipment-status-badges">
        <span className={`status-pill ${presentation.orderToneClassName}`}>
          {presentation.orderLabel}
        </span>
        {presentation.customerServiceLabel ? (
          <span className="status-pill attention">{presentation.customerServiceLabel}</span>
        ) : null}
      </div>
    </div>
  );
}

export function getInvoiceTransmissionPresentation(row: CoupangShipmentWorksheetRow) {
  switch (getInvoiceStatusCardKey(row)) {
    case "pending":
      return { label: "송장 전송 중", toneClassName: "shipment-transmission-status pending" };
    case "applied":
      return { label: "전송", toneClassName: "shipment-transmission-status succeeded" };
    case "failed":
      return { label: "전송 실패", toneClassName: "shipment-transmission-status failed" };
    case "ready":
      return { label: "전송 전", toneClassName: "shipment-transmission-status ready" };
    case "idle":
    default:
      return { label: "입력 전", toneClassName: "shipment-transmission-status idle" };
  }
}

export function renderInvoiceTransmissionStatusCell(row: CoupangShipmentWorksheetRow) {
  const presentation = getInvoiceTransmissionPresentation(row);
  const titleParts = [presentation.label];
  if (row.invoiceTransmissionMessage) {
    titleParts.push(row.invoiceTransmissionMessage);
  } else if (row.invoiceTransmissionAt) {
    titleParts.push(formatDateTimeText(row.invoiceTransmissionAt));
  }

  return (
    <div className="shipment-cell" title={titleParts.join(" · ")}>
      <span className={presentation.toneClassName}>{presentation.label}</span>
    </div>
  );
}

export function renderShipmentEditCell(
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

export function renderShipmentColumnValue(
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

export function getShipmentExportValue(
  row: CoupangShipmentWorksheetRow,
  sourceKey: ShipmentColumnSourceKey,
) {
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

export function matchesQuery(row: CoupangShipmentWorksheetRow, query: string) {
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

export function getWorksheetColumnWidth(
  columnWidths: Record<string, number>,
  config: ShipmentColumnConfig,
) {
  return columnWidths[config.id] ?? SHIPMENT_COLUMN_DEFAULT_WIDTHS[config.sourceKey];
}
