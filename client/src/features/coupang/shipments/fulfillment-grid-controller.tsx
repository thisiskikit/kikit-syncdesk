import { lazy, Suspense, type ClipboardEvent } from "react";
import {
  DataGrid,
  type CellClickArgs,
  type CellSelectArgs,
  type Column,
  type CalculatedColumn,
  type RowsChangeData,
  type SortColumn,
} from "react-data-grid";
import type { CoupangShipmentArchiveRow, CoupangShipmentWorksheetRow } from "@shared/coupang";
import ShipmentArchivePanel from "./shipment-archive-panel";
import ShipmentWorksheetPanel from "./shipment-worksheet-panel";
import {
  SHIPMENT_COLUMN_PRESETS,
  type ShipmentColumnPresetKey,
} from "./shipment-column-presets";
import type {
  ShipmentColumnConfig,
  ShipmentPreviewRowOption,
  ShipmentColumnSourceOption,
  WorksheetMode,
} from "./types";

const LazyShipmentColumnSettingsPanel = lazy(() => import("./shipment-column-settings-panel"));
const VISIBLE_SHIPMENT_COLUMN_PRESETS = SHIPMENT_COLUMN_PRESETS.filter((preset) => preset.key === "full");

type FulfillmentActiveTab = "worksheet" | "confirmed" | "archive" | "settings";

type FulfillmentGridControllerProps = {
  activeTab: FulfillmentActiveTab;
  worksheet: {
    invoiceModeNotice: string;
    detailGuideNotice: string;
    readOnly: boolean;
    worksheetMode: WorksheetMode;
    activeColumnPreset: ShipmentColumnPresetKey | "custom";
    isLoading: boolean;
    hasSheetRows: boolean;
    hasRowsForCurrentFilters: boolean;
    filteredRowCount: number;
    visibleRowsCount: number;
    worksheetPage: number;
    worksheetTotalPages: number;
    worksheetPageSize: number;
    pageSizeOptions: readonly number[];
    columns: readonly Column<CoupangShipmentWorksheetRow>[];
    rows: readonly CoupangShipmentWorksheetRow[];
    selectedRows: ReadonlySet<string>;
    sortColumns: readonly SortColumn[];
    dirtySourceKeys: ReadonlySet<string>;
    onWorksheetModeChange: (mode: WorksheetMode) => void;
    onApplyColumnPreset: (preset: ShipmentColumnPresetKey) => void;
    onOpenSettings: () => void;
    onPageSizeChange: (pageSize: number) => void;
    onPrevPage: () => void;
    onNextPage: () => void;
    onPasteCapture: (event: ClipboardEvent<HTMLDivElement>) => void;
    onSortColumnsChange: (nextSortColumns: readonly SortColumn[]) => void;
    onSelectedRowsChange: (selectedRows: ReadonlySet<string>) => void;
    onRowsChange: (
      rows: CoupangShipmentWorksheetRow[],
      data: RowsChangeData<CoupangShipmentWorksheetRow>,
    ) => void;
    onFill: (event: {
      columnKey: string;
      sourceRow: CoupangShipmentWorksheetRow;
      targetRow: CoupangShipmentWorksheetRow;
    }) => CoupangShipmentWorksheetRow;
    onCellClick: (args: CellClickArgs<CoupangShipmentWorksheetRow>) => void;
    onSelectedCellChange: (args: CellSelectArgs<CoupangShipmentWorksheetRow>) => void;
    onColumnResize: (
      column: CalculatedColumn<CoupangShipmentWorksheetRow, unknown>,
      width: number,
    ) => void;
    onColumnsReorder: (sourceColumnKey: string, targetColumnKey: string) => void;
  };
  archive: {
    detailGuideNotice: string;
    isLoading: boolean;
    totalRowCount: number;
    filteredRowCount: number;
    rows: CoupangShipmentArchiveRow[];
    archivePage: number;
    archiveTotalPages: number;
    worksheetPageSize: number;
    pageSizeOptions: readonly number[];
    getStatusPresentation: (row: CoupangShipmentArchiveRow) => {
      orderLabel: string;
      orderToneClassName: string;
      customerServiceLabel: string | null;
    };
    getArchiveReasonLabel: (row: CoupangShipmentArchiveRow) => string;
    formatDateTimeLabel: (value: string | null | undefined) => string;
    formatInvoiceText: (row: CoupangShipmentArchiveRow) => string;
    onOpenDetail: (row: CoupangShipmentArchiveRow) => void;
    onPageSizeChange: (pageSize: number) => void;
    onPrevPage: () => void;
    onNextPage: () => void;
  };
  settings: {
    columnConfigs: ShipmentColumnConfig[];
    columnWidths: Record<string, number>;
    draggingConfigId: string | null;
    previewRow: CoupangShipmentWorksheetRow | null;
    previewRowDescription: string | null;
    previewRowOptions: ShipmentPreviewRowOption[];
    selectedPreviewRowId: string | null;
    openExcelExportDisabled: boolean;
    openNotExportedExcelExportDisabled: boolean;
    selectedRowsCount: number;
    selectedExportBlockedRowCount: number;
    claimScopeCount: number;
    notExportedCount: number;
    activeColumnPreset: ShipmentColumnPresetKey | "custom";
    shipmentColumnSourceOptions: ShipmentColumnSourceOption[];
    onBack: () => void;
    onAdd: () => void;
    onApplyColumnPreset: (preset: ShipmentColumnPresetKey) => void;
    onReset: () => void;
    onDelete: (id: string) => void;
    onDragStart: (id: string) => void;
    onDragEnd: () => void;
    onDrop: (targetId: string) => void;
    onUpdate: (id: string, patch: Partial<ShipmentColumnConfig>) => void;
    onPreviewRowChange: (rowId: string | null) => void;
    onOpenExcelSortDialog: (scope: "selected" | "notExported") => void;
  };
};

function buildWorksheetRowClassName(
  row: CoupangShipmentWorksheetRow,
  dirtySourceKeys: ReadonlySet<string>,
) {
  const classNames = [];

  if (dirtySourceKeys.has(row.sourceKey)) {
    classNames.push("shipment-row-dirty");
  }
  if (row.invoiceTransmissionStatus === "failed") {
    classNames.push("shipment-row-failed");
  }
  if (row.invoiceTransmissionStatus === "pending") {
    classNames.push("shipment-row-pending");
  }

  return classNames.length ? classNames.join(" ") : undefined;
}

export default function FulfillmentGridController({
  activeTab,
  worksheet,
  archive,
  settings,
}: FulfillmentGridControllerProps) {
  if (activeTab === "worksheet" || activeTab === "confirmed") {
    return (
      <ShipmentWorksheetPanel
        invoiceModeNotice={worksheet.invoiceModeNotice}
        detailGuideNotice={worksheet.detailGuideNotice}
        readOnly={worksheet.readOnly}
        worksheetMode={worksheet.worksheetMode}
        activeColumnPreset={worksheet.activeColumnPreset}
        columnPresetOptions={VISIBLE_SHIPMENT_COLUMN_PRESETS}
        isLoading={worksheet.isLoading}
        hasSheetRows={worksheet.hasSheetRows}
        hasRowsForCurrentFilters={worksheet.hasRowsForCurrentFilters}
        filteredRowCount={worksheet.filteredRowCount}
        visibleRowsCount={worksheet.visibleRowsCount}
        worksheetPage={worksheet.worksheetPage}
        worksheetTotalPages={worksheet.worksheetTotalPages}
        worksheetPageSize={worksheet.worksheetPageSize}
        pageSizeOptions={worksheet.pageSizeOptions}
        onWorksheetModeChange={worksheet.onWorksheetModeChange}
        onApplyColumnPreset={worksheet.onApplyColumnPreset}
        onOpenSettings={worksheet.onOpenSettings}
        onPageSizeChange={worksheet.onPageSizeChange}
        onPrevPage={worksheet.onPrevPage}
        onNextPage={worksheet.onNextPage}
      >
        <div className="grid-shell shipment-grid-shell" onPasteCapture={worksheet.onPasteCapture}>
          <DataGrid
            className={`rdg-light shipment-grid${worksheet.worksheetMode === "invoice" ? " invoice-input-mode" : ""}`}
            columns={worksheet.columns}
            defaultColumnOptions={{ resizable: true }}
            rows={worksheet.rows}
            rowKeyGetter={(row: CoupangShipmentWorksheetRow) => row.id}
            selectedRows={worksheet.selectedRows}
            sortColumns={worksheet.sortColumns}
            onSortColumnsChange={worksheet.onSortColumnsChange}
            onSelectedRowsChange={worksheet.onSelectedRowsChange}
            onRowsChange={worksheet.onRowsChange}
            onFill={worksheet.onFill}
            onCellClick={worksheet.onCellClick}
            onSelectedCellChange={worksheet.onSelectedCellChange}
            onColumnResize={worksheet.onColumnResize}
            onColumnsReorder={worksheet.onColumnsReorder}
            rowClass={(row) => buildWorksheetRowClassName(row, worksheet.dirtySourceKeys)}
            style={{ height: 640 }}
          />
        </div>
      </ShipmentWorksheetPanel>
    );
  }

  if (activeTab === "archive") {
    return (
      <ShipmentArchivePanel
        detailGuideNotice={archive.detailGuideNotice}
        isLoading={archive.isLoading}
        totalRowCount={archive.totalRowCount}
        filteredRowCount={archive.filteredRowCount}
        rows={archive.rows}
        archivePage={archive.archivePage}
        archiveTotalPages={archive.archiveTotalPages}
        worksheetPageSize={archive.worksheetPageSize}
        pageSizeOptions={archive.pageSizeOptions}
        onPageSizeChange={archive.onPageSizeChange}
        onPrevPage={archive.onPrevPage}
        onNextPage={archive.onNextPage}
        getStatusPresentation={archive.getStatusPresentation}
        getArchiveReasonLabel={archive.getArchiveReasonLabel}
        formatDateTimeLabel={archive.formatDateTimeLabel}
        formatInvoiceText={archive.formatInvoiceText}
        onOpenDetail={archive.onOpenDetail}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <div className="card">
          <div className="empty">컬럼 설정을 불러오는 중입니다...</div>
        </div>
      }
    >
      <LazyShipmentColumnSettingsPanel
        columnConfigs={settings.columnConfigs}
        columnWidths={settings.columnWidths}
        draggingConfigId={settings.draggingConfigId}
        previewRow={settings.previewRow}
        previewRowDescription={settings.previewRowDescription}
        previewRowOptions={settings.previewRowOptions}
        selectedPreviewRowId={settings.selectedPreviewRowId}
        openExcelExportDisabled={settings.openExcelExportDisabled}
        openNotExportedExcelExportDisabled={settings.openNotExportedExcelExportDisabled}
        selectedRowsCount={settings.selectedRowsCount}
        selectedExportBlockedRowCount={settings.selectedExportBlockedRowCount}
        claimScopeCount={settings.claimScopeCount}
        notExportedCount={settings.notExportedCount}
        activeColumnPreset={settings.activeColumnPreset}
        columnPresetOptions={VISIBLE_SHIPMENT_COLUMN_PRESETS}
        shipmentColumnSourceOptions={settings.shipmentColumnSourceOptions}
        onBack={settings.onBack}
        onAdd={settings.onAdd}
        onApplyColumnPreset={settings.onApplyColumnPreset}
        onReset={settings.onReset}
        onDelete={settings.onDelete}
        onDragStart={settings.onDragStart}
        onDragEnd={settings.onDragEnd}
        onDrop={settings.onDrop}
        onUpdate={settings.onUpdate}
        onPreviewRowChange={settings.onPreviewRowChange}
        onOpenExcelSortDialog={settings.onOpenExcelSortDialog}
      />
    </Suspense>
  );
}
