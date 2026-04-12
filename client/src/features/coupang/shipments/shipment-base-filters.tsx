import { RefreshCcw } from "lucide-react";
import type { CoupangStoreSummary, CoupangShipmentWorksheetViewScope } from "@shared/coupang";
import { formatNumber } from "@/lib/utils";
import type { FilterState } from "./types";

type ScopeOption = {
  value: CoupangShipmentWorksheetViewScope;
  label: string;
  description: string;
};

type ShipmentBaseFiltersProps = {
  activeTab: "worksheet" | "archive" | "settings";
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
          placeholder="셀픽주문번호, 상품명, 수령자명, 송장번호 검색"
        />
      </div>

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
          </div>
        </div>
      ) : null}
    </div>
  );
}
