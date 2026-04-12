import type { ReactNode } from "react";

import { formatNumber } from "@/lib/utils";

import type { ShipmentColumnPresetKey } from "./shipment-column-presets";
import type { WorksheetMode } from "./types";

type ShipmentColumnPresetOption = {
  key: ShipmentColumnPresetKey;
  label: string;
  description: string;
};

type ShipmentWorksheetPanelProps = {
  invoiceModeNotice: string;
  detailGuideNotice: string;
  worksheetMode: WorksheetMode;
  activeColumnPreset: ShipmentColumnPresetKey | "custom";
  columnPresetOptions: readonly ShipmentColumnPresetOption[];
  isLoading: boolean;
  hasSheetRows: boolean;
  hasRowsForCurrentFilters: boolean;
  filteredRowCount: number;
  visibleRowsCount: number;
  worksheetPage: number;
  worksheetTotalPages: number;
  worksheetPageSize: number;
  pageSizeOptions: readonly number[];
  onWorksheetModeChange: (mode: WorksheetMode) => void;
  onApplyColumnPreset: (preset: ShipmentColumnPresetKey) => void;
  onOpenSettings: () => void;
  onPageSizeChange: (pageSize: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  children: ReactNode;
};

export default function ShipmentWorksheetPanel({
  invoiceModeNotice,
  detailGuideNotice,
  worksheetMode,
  activeColumnPreset,
  columnPresetOptions,
  isLoading,
  hasSheetRows,
  hasRowsForCurrentFilters,
  filteredRowCount,
  visibleRowsCount,
  worksheetPage,
  worksheetTotalPages,
  worksheetPageSize,
  pageSizeOptions,
  onWorksheetModeChange,
  onApplyColumnPreset,
  onOpenSettings,
  onPageSizeChange,
  onPrevPage,
  onNextPage,
  children,
}: ShipmentWorksheetPanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 style={{ margin: 0 }}>출고 작업 목록</h2>
          <div className="muted shipment-grid-note">
            현재 조건에 맞는 주문만 얇은 목록으로 보여줍니다. 판단 근거와 긴 이력은 우측 패널에서 확인하세요.
          </div>
          <div className="muted shipment-grid-note">
            가로 스크롤이 불편하면 `작업 보기`나 `송장 입력 보기` 프리셋을 적용해 기본 열 수를 줄여보세요.
          </div>
          <div className="muted shipment-grid-note">{invoiceModeNotice}</div>
          <div className="muted shipment-grid-note">{detailGuideNotice}</div>
        </div>
        <div className="toolbar shipment-worksheet-toolbar">
          <div className="segmented-control">
            <button
              className={`segmented-button${worksheetMode === "default" ? " active" : ""}`}
              onClick={() => onWorksheetModeChange("default")}
            >
              기본 보기
            </button>
            <button
              className={`segmented-button${worksheetMode === "invoice" ? " active" : ""}`}
              onClick={() => onWorksheetModeChange("invoice")}
            >
              송장 입력하기
            </button>
          </div>
          <div className="shipment-view-preset-group">
            <div className="muted shipment-view-preset-label">
              보기 프리셋
              {activeColumnPreset === "custom" ? " · 사용자 정의" : ""}
            </div>
            <div className="segmented-control">
              {columnPresetOptions.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={`segmented-button${activeColumnPreset === preset.key ? " active" : ""}`}
                  title={preset.description}
                  onClick={() => onApplyColumnPreset(preset.key)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <button className="button ghost" onClick={onOpenSettings}>
            화면 설정
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="empty">배송 시트를 불러오는 중입니다...</div>
      ) : !hasSheetRows ? (
        <div className="empty">수집 버튼을 눌러 셀픽 형식 배송 시트를 생성해 주세요.</div>
      ) : !hasRowsForCurrentFilters ? (
        <div className="empty">현재 조건에 맞는 주문이 없습니다. 보기 범위나 세부 필터를 조정해 주세요.</div>
      ) : (
        <>
          <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div className="selection-summary">
              전체 {formatNumber(filteredRowCount)}행 · 현재 페이지 {formatNumber(visibleRowsCount)}행 · {worksheetPage} /{" "}
              {worksheetTotalPages} 페이지
            </div>
            <div className="toolbar" style={{ gap: "0.5rem" }}>
              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span className="muted">보기 행 수</span>
                <select
                  value={worksheetPageSize}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}행
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button ghost"
                onClick={onPrevPage}
                disabled={worksheetPage <= 1}
              >
                이전
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={onNextPage}
                disabled={worksheetPage >= worksheetTotalPages}
              >
                다음
              </button>
            </div>
          </div>
          {children}
        </>
      )}
    </div>
  );
}
