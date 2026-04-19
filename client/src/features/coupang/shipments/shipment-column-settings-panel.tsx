import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

import type { ShipmentColumnPresetKey } from "./shipment-column-presets";
import { formatShipmentColumnPreviewValue } from "./shipment-column-preview";
import {
  formatShipmentColumnSourceOptionLabel,
  getShipmentColumnSourceStorageKey,
  resolveShipmentColumnDefaultWidth,
  resolveShipmentColumnLabelForSourceChange,
  resolveShipmentColumnSourceLabel,
} from "./worksheet-config";
import type {
  ShipmentColumnConfig,
  ShipmentColumnSourceOption,
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
  shipmentColumnSourceOptions: ShipmentColumnSourceOption[];
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

function groupSourceOptions(options: ShipmentColumnSourceOption[]) {
  const grouped = new Map<string, ShipmentColumnSourceOption[]>();

  for (const option of options) {
    const current = grouped.get(option.group) ?? [];
    current.push(option);
    grouped.set(option.group, current);
  }

  return Array.from(grouped.entries());
}

export default function ShipmentColumnSettingsPanel(props: ShipmentColumnSettingsPanelProps) {
  const sourceOptionByKey = new Map(
    props.shipmentColumnSourceOptions.map((option) => [option.key, option] as const),
  );
  const groupedSourceOptions = groupSourceOptions(props.shipmentColumnSourceOptions);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 style={{ margin: 0 }}>다운로드 컬럼 설정</h2>
          <div className="muted shipment-grid-note">
            컬럼명 변경, 필드 변경, 삭제, 추가가 가능합니다. 여기서 바꾼 구성은 워크시트와 엑셀 다운로드에
            함께 적용됩니다.
          </div>
          <div className="muted shipment-grid-note">
            source column은 `기본 필드`와 `쿠팡 raw field`로 나뉩니다. raw field는 수집된
            `order.*`, `detail.*`, `product.*` 평탄화 맵에서 읽어오며 읽기 전용입니다.
          </div>
          <div className="muted shipment-grid-note">
            {props.previewRowDescription
              ? `미리보기 기준: ${props.previewRowDescription}`
              : "배송 시트를 불러오면 여기에서 컬럼별 실제 미리보기 값을 확인할 수 있습니다."}
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
            미출력 전체 엑셀 다운로드
          </button>
        </div>
        {props.selectedRowsCount > 0 && props.selectedExportBlockedRowCount > 0 ? (
          <div className="muted action-disabled-reason">
            선택한 클레임 {props.selectedExportBlockedRowCount}건은 다운로드에서 제외됩니다.
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
              가로 스크롤을 줄이고 싶다면 먼저 프리셋을 적용한 뒤 필요한 컬럼만 조정하세요.
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
          const configSourceKey = getShipmentColumnSourceStorageKey(config.source);
          const selectedOption = sourceOptionByKey.get(configSourceKey);
          const previewValue = formatShipmentColumnPreviewValue(props.previewRow, config.source);
          const combinedPreviewValue = formatShipmentColumnPreviewValue(props.previewRow, {
            kind: "builtin",
            key: "exposedProductName",
          });
          const rawCoupangPreviewValue = formatShipmentColumnPreviewValue(props.previewRow, {
            kind: "builtin",
            key: "coupangDisplayProductName",
          });
          const shouldShowCoupangNameComparison =
            config.source.kind === "builtin" &&
            (config.source.key === "exposedProductName" ||
              config.source.key === "coupangDisplayProductName");

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
              <div style={{ minWidth: 0 }}>
                <div className="muted" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
                  다운로드 헤더
                </div>
                <input
                  value={config.label}
                  onChange={(event) => props.onUpdate(config.id, { label: event.target.value })}
                  placeholder="컬럼명"
                />
                <div className="toolbar" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => props.onUpdate(config.id, { label: configSourceKey })}
                  >
                    key명 적용
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() =>
                      props.onUpdate(config.id, {
                        label: resolveShipmentColumnSourceLabel(
                          config.source,
                          props.shipmentColumnSourceOptions
                            .map((option) => option.catalogItem)
                            .filter(
                              (
                                item,
                              ): item is NonNullable<typeof item> => Boolean(item),
                            ),
                        ),
                      })
                    }
                  >
                    표시명 적용
                  </button>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="muted" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
                  source column
                </div>
                <select
                  value={configSourceKey}
                  onChange={(event) => {
                    const nextOption = sourceOptionByKey.get(event.target.value);
                    if (!nextOption) {
                      return;
                    }

                    props.onUpdate(config.id, {
                      source: nextOption.source,
                      label: resolveShipmentColumnLabelForSourceChange({
                        currentLabel: config.label,
                        previousSource: config.source,
                        nextSource: nextOption.source,
                        rawFieldCatalog: props.shipmentColumnSourceOptions
                          .map((option) => option.catalogItem)
                          .filter(
                            (
                              item,
                            ): item is NonNullable<typeof item> => Boolean(item),
                          ),
                      }),
                    });
                  }}
                >
                  {groupedSourceOptions.map(([group, options]) => (
                    <optgroup key={group} label={group}>
                      {options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
                  현재 key: <code>{configSourceKey}</code>
                </div>
              </div>
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
                <div className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
                  기본 표시명:{" "}
                  {resolveShipmentColumnSourceLabel(
                    config.source,
                    props.shipmentColumnSourceOptions
                      .map((option) => option.catalogItem)
                      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
                  )}
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
                현재 너비{" "}
                {props.columnWidths[config.id] ??
                  resolveShipmentColumnDefaultWidth(config.source, selectedOption?.catalogItem)}
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
