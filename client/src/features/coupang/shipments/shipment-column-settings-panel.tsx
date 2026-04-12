import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

import type { ShipmentColumnPresetKey } from "./shipment-column-presets";
import { formatShipmentColumnPreviewValue } from "./shipment-column-preview";
import type {
  ShipmentColumnConfig,
  ShipmentColumnSourceKey,
  ShipmentExcelExportScope,
} from "./types";

type ShipmentColumnPresetOption = {
  key: ShipmentColumnPresetKey;
  label: string;
  description: string;
};

export interface ShipmentColumnSettingsPanelProps {
  columnConfigs: ShipmentColumnConfig[];
  columnWidths: Record<string, number>;
  draggingConfigId: string | null;
  previewRow: CoupangShipmentWorksheetRow | null;
  previewRowDescription: string | null;
  openExcelExportDisabled: boolean;
  openNotExportedExcelExportDisabled: boolean;
  selectedRowsCount: number;
  selectedExportBlockedRowCount: number;
  claimScopeCount: number;
  notExportedCount: number;
  activeColumnPreset: ShipmentColumnPresetKey | "custom";
  columnPresetOptions: readonly ShipmentColumnPresetOption[];
  shipmentColumnLabels: Record<ShipmentColumnSourceKey, string>;
  shipmentColumnDefaultWidths: Record<ShipmentColumnSourceKey, number>;
  shipmentColumnSourceOptions: ShipmentColumnSourceKey[];
  onBack: () => void;
  onAdd: () => void;
  onApplyColumnPreset: (preset: ShipmentColumnPresetKey) => void;
  onReset: () => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ShipmentColumnConfig>) => void;
  onOpenExcelSortDialog: (scope: ShipmentExcelExportScope) => void;
}

export default function ShipmentColumnSettingsPanel(props: ShipmentColumnSettingsPanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 style={{ margin: 0 }}>다운로드 컬럼 설정</h2>
          <div className="muted shipment-grid-note">
            컬럼명 변경, 필드 변경, 삭제, 추가가 가능합니다. 여기에서 바꾸는 순서와 구성은
            워크시트와 엑셀 다운로드에 같이 적용됩니다.
          </div>
          <div className="muted shipment-grid-note">
            {props.previewRowDescription
              ? `미리보기 기준: ${props.previewRowDescription}`
              : "배송 시트를 불러오면 여기에서 컬럼별 실제 값을 미리 볼 수 있습니다."}
          </div>
          <div className="muted shipment-grid-note">
            `노출상품명`은 현재 워크시트 조합값이고, `쿠팡 원본 노출상품명`은 상품 상세에서 받은
            `displayProductName` 기준으로 따로 저장됩니다.
          </div>
          <div className="muted shipment-grid-note">
            추천 프리셋을 적용하면 기본 열 수와 폭을 한 번에 바꿀 수 있습니다. 현재 프리셋:
            {" "}
            {props.activeColumnPreset === "custom"
              ? "사용자 정의"
              : props.columnPresetOptions.find((preset) => preset.key === props.activeColumnPreset)?.label ?? "사용자 정의"}
          </div>
        </div>
        <div className="toolbar">
          <button className="button ghost" onClick={props.onBack}>
            워크시트로 돌아가기
          </button>
          <button className="button ghost" onClick={props.onAdd}>
            컬럼 추가
          </button>
          <button className="button ghost" onClick={props.onReset}>
            기본값 복원
          </button>
          <button
            className="button"
            onClick={() => props.onOpenExcelSortDialog("selected")}
            disabled={props.openExcelExportDisabled}
          >
            선택 행 엑셀 다운로드
          </button>
          <button
            className="button ghost"
            onClick={() => props.onOpenExcelSortDialog("notExported")}
            disabled={props.openNotExportedExcelExportDisabled}
          >
            미출력건 전체 다운로드
          </button>
        </div>
        {props.selectedRowsCount > 0 && props.selectedExportBlockedRowCount > 0 ? (
          <div className="muted action-disabled-reason">
            선택한 클레임 {props.selectedExportBlockedRowCount}건은 엑셀 다운로드에서 제외됩니다.
          </div>
        ) : null}
        {props.notExportedCount > 0 && props.claimScopeCount > 0 ? (
          <div className="muted action-disabled-reason">
            클레임 주문은 미출력 전체 다운로드에서 자동 제외됩니다.
          </div>
        ) : null}
      </div>

      <div className="card shipment-column-preset-card">
        <div className="shipment-column-preset-card-header">
          <div>
            <strong>추천 보기 프리셋</strong>
            <div className="muted shipment-grid-note">
              가로 스크롤을 줄이고 싶다면 먼저 프리셋을 적용한 뒤 필요할 때만 개별 컬럼을 조정하세요.
            </div>
          </div>
          <div className="toolbar shipment-column-preset-actions">
            {props.columnPresetOptions.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className={`button${props.activeColumnPreset === preset.key ? "" : " ghost"}`}
                title={preset.description}
                onClick={() => props.onApplyColumnPreset(preset.key)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="column-settings-list">
        {props.columnConfigs.map((config) => {
          const previewValue = formatShipmentColumnPreviewValue(props.previewRow, config.sourceKey);
          const combinedPreviewValue = formatShipmentColumnPreviewValue(
            props.previewRow,
            "exposedProductName",
          );
          const rawCoupangPreviewValue = formatShipmentColumnPreviewValue(
            props.previewRow,
            "coupangDisplayProductName",
          );
          const shouldShowCoupangNameComparison =
            config.sourceKey === "exposedProductName" ||
            config.sourceKey === "coupangDisplayProductName";
          return (
            <div
              key={config.id}
              className={`column-settings-row${props.draggingConfigId === config.id ? " dragging" : ""}`}
              draggable
              onDragStart={() => props.onDragStart(config.id)}
              onDragEnd={props.onDragEnd}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => props.onDrop(config.id)}
            >
              <div className="column-settings-handle">드래그</div>
              <input
                value={config.label}
                onChange={(event) => props.onUpdate(config.id, { label: event.target.value })}
                placeholder="컬럼명"
              />
              <select
                value={config.sourceKey}
                onChange={(event) =>
                  props.onUpdate(config.id, {
                    sourceKey: event.target.value as ShipmentColumnSourceKey,
                    label:
                      config.label ||
                      props.shipmentColumnLabels[event.target.value as ShipmentColumnSourceKey],
                  })
                }
              >
                {props.shipmentColumnSourceOptions.map((sourceKey) => (
                  <option key={sourceKey} value={sourceKey}>
                    {props.shipmentColumnLabels[sourceKey]}
                  </option>
                ))}
              </select>
              <div style={{ minWidth: 0, flex: "1 1 18rem" }}>
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  미리보기
                </div>
                <div
                  title={previewValue}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {previewValue}
                </div>
                {shouldShowCoupangNameComparison ? (
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    현재 조합값: {combinedPreviewValue}
                    <br />
                    쿠팡 원본값: {rawCoupangPreviewValue}
                  </div>
                ) : null}
              </div>
              <div className="muted">
                현재 너비 {props.columnWidths[config.id] ?? props.shipmentColumnDefaultWidths[config.sourceKey]}
                px
              </div>
              <button
                className="button ghost"
                onClick={() => props.onDelete(config.id)}
                disabled={props.columnConfigs.length <= 1}
              >
                삭제
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
