import type {
  ShipmentColumnConfig,
  ShipmentColumnSourceKey,
  ShipmentExcelExportScope,
} from "./types";

export interface ShipmentColumnSettingsPanelProps {
  columnConfigs: ShipmentColumnConfig[];
  columnWidths: Record<string, number>;
  draggingConfigId: string | null;
  openExcelExportDisabled: boolean;
  openNotExportedExcelExportDisabled: boolean;
  selectedRowsCount: number;
  selectedExportBlockedRowCount: number;
  claimScopeCount: number;
  notExportedCount: number;
  shipmentColumnLabels: Record<ShipmentColumnSourceKey, string>;
  shipmentColumnDefaultWidths: Record<ShipmentColumnSourceKey, number>;
  shipmentColumnSourceOptions: ShipmentColumnSourceKey[];
  onBack: () => void;
  onAdd: () => void;
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
            컬럼명 변경, 소스 변경, 삭제와 추가가 가능합니다. 여기에서 바꾼 순서와 구성이
            워크시트와 엑셀 다운로드에 같이 적용됩니다.
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
            미출력건 전부 다운로드
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

      <div className="column-settings-list">
        {props.columnConfigs.map((config) => (
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
            <div className="muted">
              현재 너비{" "}
              {props.columnWidths[config.id] ??
                props.shipmentColumnDefaultWidths[config.sourceKey]}
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
        ))}
      </div>
    </div>
  );
}
