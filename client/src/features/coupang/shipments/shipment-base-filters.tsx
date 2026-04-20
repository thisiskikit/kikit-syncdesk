import { RefreshCcw } from "lucide-react";
import type { CoupangStoreSummary, CoupangShipmentWorksheetViewScope } from "@shared/coupang";
import { formatNumber } from "@/lib/utils";
import type { FilterState } from "./types";

type ScopeOption = {
  value: CoupangShipmentWorksheetViewScope;
  label: string;
  description: string;
};

const SEOUL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_PRESET_OPTIONS = [
  { key: "today", label: "오늘", fromOffset: 0, toOffset: 0 },
  { key: "last7", label: "지난 7일", fromOffset: -6, toOffset: 0 },
  { key: "last30", label: "지난 30일", fromOffset: -29, toOffset: 0 },
] as const;

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

type ShipmentBaseFiltersProps = {
  activeTab: "worksheet" | "confirmed" | "archive" | "settings";
  filters: FilterState;
  stores: readonly CoupangStoreSummary[];
  scopeCounts: Record<CoupangShipmentWorksheetViewScope, number>;
  scopeOptions: readonly ScopeOption[];
  refreshDisabled: boolean;
  onPatchFilters: (patch: Partial<FilterState>) => void;
  onRefresh: () => void;
};

export default function ShipmentBaseFilters({
  activeTab,
  filters,
  stores,
  scopeCounts,
  scopeOptions,
  refreshDisabled,
  onPatchFilters,
  onRefresh,
}: ShipmentBaseFiltersProps) {
  const isWorksheetTab = activeTab === "worksheet";
  const isArchiveTab = activeTab === "archive";
  const activeDatePresetKey = DATE_PRESET_OPTIONS.find(
    (option) =>
      filters.createdAtFrom === defaultSeoulDate(option.fromOffset) &&
      filters.createdAtTo === defaultSeoulDate(option.toOffset),
  )?.key;

  return (
    <div className="card shipment-filter-bar">
      <div className="shipment-filter-fields">
        <select
          value={filters.selectedStoreId}
          onChange={(event) =>
            onPatchFilters({
              selectedStoreId: event.target.value,
            })
          }
        >
          <option value="">스토어 선택</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.storeName}
            </option>
          ))}
        </select>
        {!isArchiveTab ? (
          <>
            <input
              type="date"
              value={filters.createdAtFrom}
              onChange={(event) =>
                onPatchFilters({
                  createdAtFrom: event.target.value,
                })
              }
            />
            <input
              type="date"
              value={filters.createdAtTo}
              onChange={(event) =>
                onPatchFilters({
                  createdAtTo: event.target.value,
                })
              }
            />
          </>
        ) : null}
        <input
          value={filters.query}
          onChange={(event) =>
            onPatchFilters({
              query: event.target.value,
            })
          }
          placeholder="주문번호, 상품명, 수령인명, 송장번호 검색"
        />
      </div>

      {!isArchiveTab ? (
        <div className="shipment-filter-scope-row">
          <div className="shipment-status-group">
            <div className="shipment-status-group-label">조회 기간 프리셋</div>
            <div className="shipment-status-pill-list">
              {DATE_PRESET_OPTIONS.map((option) => {
                const active = activeDatePresetKey === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`shipment-filter-pill neutral${active ? " active" : ""}`}
                    aria-pressed={active}
                    onClick={() =>
                      onPatchFilters({
                        createdAtFrom: defaultSeoulDate(option.fromOffset),
                        createdAtTo: defaultSeoulDate(option.toOffset),
                      })
                    }
                  >
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="shipment-filter-support">
        {!isArchiveTab ? (
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span className="muted">수집 건수</span>
            <select
              aria-label="빠른 수집 조회 건수"
              value={filters.maxPerPage}
              onChange={(event) =>
                onPatchFilters({
                  maxPerPage: Number(event.target.value),
                })
              }
            >
              <option value={10}>10건</option>
              <option value={20}>20건</option>
              <option value={50}>50건</option>
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="button ghost shipment-icon-button"
          aria-label={isArchiveTab ? "보관함 새로고침" : "워크시트 새로고침"}
          title={isArchiveTab ? "보관함 새로고침" : "워크시트 새로고침"}
          onClick={onRefresh}
          disabled={refreshDisabled}
        >
          <RefreshCcw size={16} aria-hidden="true" />
        </button>
      </div>

      {isWorksheetTab ? (
        <div className="shipment-filter-scope-row">
          <div className="shipment-status-group">
            <div className="shipment-status-group-label">
              보기 범위
              <span className="muted">{formatNumber(scopeCounts.all)}건</span>
            </div>
            <div className="shipment-status-pill-list">
              {scopeOptions.map((option) => {
                const active = filters.scope === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`shipment-filter-pill neutral${active ? " active" : ""}`}
                    aria-pressed={active}
                    title={option.description}
                    onClick={() =>
                      onPatchFilters({
                        scope: option.value,
                      })
                    }
                  >
                    <span>{option.label}</span>
                    <strong>{formatNumber(scopeCounts[option.value])}</strong>
                  </button>
                );
              })}
            </div>
            <div className="muted shipment-filter-summary-note">
              메인 카드와 목록은 전체 배송관리 기준으로 계산되고, 이 범위 버튼은 내부 작업 보조 보기로만 사용됩니다.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
