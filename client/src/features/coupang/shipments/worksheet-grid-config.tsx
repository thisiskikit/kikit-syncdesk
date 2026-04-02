import { SelectColumn, type Column, type RenderEditCellProps } from "react-data-grid";
import { stripMatchingHeaderRow } from "@/lib/spreadsheet-grid";
import {
  SHIPMENT_COLUMN_DEFAULT_WIDTHS,
  isEditableSourceKey,
  isGridEditableSourceKey,
  isInvoiceInputSourceKey,
} from "./worksheet-config";
import {
  renderExportStatusCell,
  renderInvoiceTransmissionStatusCell,
  renderOrderStatusCell,
  renderShipmentColumnValue,
  renderShipmentEditCell,
} from "./worksheet-row-helpers";
import type {
  EditableColumnKey,
  ShipmentColumnConfig,
  WorksheetMode,
} from "./types";
import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

export function getEditableColumnIds(
  columnConfigs: ShipmentColumnConfig[],
  worksheetMode: WorksheetMode,
) {
  return columnConfigs
    .filter((config) =>
      worksheetMode === "invoice"
        ? isInvoiceInputSourceKey(config.sourceKey)
        : isEditableSourceKey(config.sourceKey),
    )
    .map((config) => config.id);
}

function getWorksheetEditableColumnConfigs(
  editableColumnIds: string[],
  columnConfigById: Map<string, ShipmentColumnConfig>,
) {
  return editableColumnIds
    .map((columnId) => columnConfigById.get(columnId))
    .filter((config): config is ShipmentColumnConfig => Boolean(config));
}

export function stripWorksheetPasteHeaderRow(
  matrix: string[][],
  startColumnIndex: number,
  editableColumnIds: string[],
  columnConfigById: Map<string, ShipmentColumnConfig>,
) {
  if (!matrix.length) {
    return matrix;
  }

  const firstRow = matrix[0] ?? [];
  if (!firstRow.length) {
    return matrix;
  }

  const expectedLabels = getWorksheetEditableColumnConfigs(editableColumnIds, columnConfigById)
    .slice(startColumnIndex, startColumnIndex + firstRow.length)
    .map((config) => config.label.trim());

  if (!expectedLabels.length || expectedLabels.length !== firstRow.length) {
    return matrix;
  }

  return stripMatchingHeaderRow(matrix, expectedLabels);
}

export function buildShipmentGridColumns(input: {
  columnConfigs: ShipmentColumnConfig[];
  columnWidths: Record<string, number>;
  worksheetMode: WorksheetMode;
}): Column<CoupangShipmentWorksheetRow>[] {
  const { columnConfigs, columnWidths, worksheetMode } = input;

  return [
    SelectColumn,
    {
      key: "__exportStatus",
      name: "출력상태",
      width: 110,
      minWidth: 96,
      editable: false,
      resizable: true,
      sortable: true,
      draggable: false,
      renderCell: ({ row }: { row: CoupangShipmentWorksheetRow }) => renderExportStatusCell(row),
    },
    {
      key: "__orderStatus",
      name: "상태",
      width: 190,
      minWidth: 170,
      editable: false,
      resizable: true,
      sortable: true,
      draggable: false,
      renderCell: ({ row }: { row: CoupangShipmentWorksheetRow }) => renderOrderStatusCell(row),
    },
    {
      key: "__invoiceTransmissionStatus",
      name: "송장상태",
      width: 120,
      minWidth: 110,
      editable: false,
      resizable: true,
      sortable: true,
      draggable: false,
      renderCell: ({ row }: { row: CoupangShipmentWorksheetRow }) =>
        renderInvoiceTransmissionStatusCell(row),
    },
    ...columnConfigs.map((config) => ({
      key: config.id,
      name: config.label,
      width: columnWidths[config.id] ?? SHIPMENT_COLUMN_DEFAULT_WIDTHS[config.sourceKey],
      minWidth: Math.min(SHIPMENT_COLUMN_DEFAULT_WIDTHS[config.sourceKey], 100),
      editable: isGridEditableSourceKey(config.sourceKey, worksheetMode),
      cellClass:
        worksheetMode === "invoice" && isInvoiceInputSourceKey(config.sourceKey)
          ? "shipment-invoice-input-cell"
          : undefined,
      headerCellClass:
        worksheetMode === "invoice" && isInvoiceInputSourceKey(config.sourceKey)
          ? "shipment-invoice-input-header"
          : undefined,
      renderEditCell: isGridEditableSourceKey(config.sourceKey, worksheetMode)
        ? (props: RenderEditCellProps<CoupangShipmentWorksheetRow>) =>
            renderShipmentEditCell(props, config.sourceKey as EditableColumnKey)
        : undefined,
      resizable: true,
      sortable: config.sourceKey !== "blank",
      draggable: true,
      renderCell: ({ row }: { row: CoupangShipmentWorksheetRow }) =>
        renderShipmentColumnValue(row, config.sourceKey),
    })),
  ];
}
