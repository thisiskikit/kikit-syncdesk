import type { CoupangShipmentWorksheetViewResponse } from "@shared/coupang";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import type {
  InvoiceStatusCardKey,
  OrderStatusCardKey,
  OutputStatusCardKey,
} from "@/lib/coupang-shipment-quick-filters";
import { formatNumber } from "@/lib/utils";
import type { FilterState, FulfillmentDecisionFilterValue } from "./types";

type DecisionOption = {
  value: FulfillmentDecisionFilterValue;
  label: string;
  description: string;
};

type StatusOption<TValue extends string> = {
  value: TValue;
  label: string;
  toneClassName: string;
};

type OpsHandoffLink = {
  href: string;
  label: string;
  variant?: "secondary" | "ghost";
};

type OpsHandoffGuide = {
  title: string;
  description: string;
  links: readonly OpsHandoffLink[];
};

type ShipmentWorksheetOverviewProps = {
  quickCollectFocusActive: boolean;
  quickCollectFocusCount: number;
  quickCollectFocusMessage: string | null;
  activeDecisionStatus: FulfillmentDecisionFilterValue;
  decisionCounts: Record<FulfillmentDecisionFilterValue, number>;
  decisionOptions: readonly DecisionOption[];
  detailFilterToggleLabel: string;
  detailFiltersOpen: boolean;
  activeDetailFilterCount: number;
  activeFilterSummaryTokens: readonly string[];
  filterSummarySupportText: string;
  hasCustomWorksheetFilters: boolean;
  pageRowCount: number;
  visibleRowsCount: number;
  filters: FilterState;
  activeSheet: CoupangShipmentWorksheetViewResponse | null;
  activeInvoiceStatusCard: InvoiceStatusCardKey;
  activeOrderStatusCard: OrderStatusCardKey;
  activeOutputStatusCard: OutputStatusCardKey;
  invoiceStatusOptions: readonly StatusOption<InvoiceStatusCardKey>[];
  outputStatusOptions: readonly StatusOption<OutputStatusCardKey>[];
  orderStatusOptions: readonly StatusOption<OrderStatusCardKey>[];
  opsHandoffGuide: OpsHandoffGuide | null;
  onClearQuickCollectFocus: () => void;
  onPatchFilters: (patch: Partial<FilterState>) => void;
  onResetFilters: () => void;
  onToggleDetailFilters: () => void;
};

export default function ShipmentWorksheetOverview({
  quickCollectFocusActive,
  quickCollectFocusCount,
  quickCollectFocusMessage,
  activeDecisionStatus,
  decisionCounts,
  decisionOptions,
  detailFilterToggleLabel,
  detailFiltersOpen,
  activeDetailFilterCount,
  activeFilterSummaryTokens,
  filterSummarySupportText,
  hasCustomWorksheetFilters,
  pageRowCount,
  visibleRowsCount,
  filters,
  activeSheet,
  activeInvoiceStatusCard,
  activeOrderStatusCard,
  activeOutputStatusCard,
  invoiceStatusOptions,
  outputStatusOptions,
  orderStatusOptions,
  opsHandoffGuide,
  onClearQuickCollectFocus,
  onPatchFilters,
  onResetFilters,
  onToggleDetailFilters,
}: ShipmentWorksheetOverviewProps) {
  return (
    <>
      {quickCollectFocusActive ? (
        <div className="card shipment-focus-banner">
          <div>
            <div className="shipment-focus-banner-label">방금 수집한 신규 주문만 보는 중</div>
            <div className="muted shipment-focus-banner-note">
              {quickCollectFocusMessage ?? `빠른 수집으로 추가된 ${formatNumber(quickCollectFocusCount)}건을 먼저 보여줍니다.`}
            </div>
          </div>
          <button type="button" className="button ghost" onClick={onClearQuickCollectFocus}>
            전체 보기로 돌아가기
          </button>
        </div>
      ) : null}

      <div className="card shipment-decision-toolbar">
        <div className="shipment-status-group">
          <div className="shipment-status-group-label">
            출고 판단
            <span className="muted">현재 페이지 {formatNumber(pageRowCount)}건 기준</span>
          </div>
          <div className="shipment-status-pill-list">
            {decisionOptions.map((option) => {
              const active = activeDecisionStatus === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`shipment-filter-pill neutral${active ? " active" : ""}`}
                  aria-pressed={active}
                  title={option.description}
                  onClick={() =>
                    onPatchFilters({
                      decisionStatus: option.value,
                    })
                  }
                >
                  <span>{option.label}</span>
                  <strong>{formatNumber(decisionCounts[option.value])}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="metric-grid shipment-decision-summary-grid">
        <div className="metric">
          <div className="metric-label">현재 목록</div>
          <div className="metric-value">{formatNumber(visibleRowsCount)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">출고 가능</div>
          <div className="metric-value">{formatNumber(decisionCounts.ready)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">송장 대기</div>
          <div className="metric-value">{formatNumber(decisionCounts.invoice_waiting)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">보류</div>
          <div className="metric-value">{formatNumber(decisionCounts.hold)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">차단</div>
          <div className="metric-value">{formatNumber(decisionCounts.blocked)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">재확인 필요</div>
          <div className="metric-value">{formatNumber(decisionCounts.recheck)}</div>
        </div>
      </div>

      {opsHandoffGuide ? (
        <div className="card shipment-filter-summary-card">
          <div className="shipment-filter-summary-header">
            <div>
              <div className="shipment-filter-summary-label">다음 운영 이동</div>
              <strong>{opsHandoffGuide.title}</strong>
              <div className="muted shipment-filter-summary-note">{opsHandoffGuide.description}</div>
            </div>
            <div className="shipment-filter-summary-actions">
              {opsHandoffGuide.links.map((link) => (
                <WorkspaceEntryLink
                  key={`${link.href}:${link.label}`}
                  href={link.href}
                  className={`button${link.variant === "ghost" ? " ghost" : " secondary"}`}
                  workspaceBehavior="tab"
                >
                  {link.label}
                </WorkspaceEntryLink>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card shipment-filter-summary-card">
        <div className="shipment-filter-summary-header">
          <div>
            <div className="shipment-filter-summary-label">현재 적용 조건</div>
            <div className="shipment-filter-summary-tokens">
              {activeFilterSummaryTokens.map((token) => (
                <span key={token} className="shipment-filter-token">
                  {token}
                </span>
              ))}
            </div>
            <div className="muted shipment-filter-summary-note">
              세부 조건은 필요할 때만 열어서 송장 상태, 출력 상태, 주문 상태를 더 좁혀보세요.
            </div>
            {filterSummarySupportText ? (
              <div className="muted shipment-filter-summary-meta">{filterSummarySupportText}</div>
            ) : null}
          </div>
          <div className="shipment-filter-summary-actions">
            <button
              type="button"
              className={`button${detailFiltersOpen ? "" : " ghost"}`}
              onClick={onToggleDetailFilters}
            >
              {detailFiltersOpen ? "세부 필터 닫기" : detailFilterToggleLabel}
            </button>
            <button type="button" className="button ghost" disabled={!hasCustomWorksheetFilters} onClick={onResetFilters}>
              초기화
            </button>
          </div>
        </div>
      </div>

      {detailFiltersOpen ? (
        <div className="card shipment-detail-filter-card">
          <div className="shipment-detail-filter-header">
            <div>
              <strong>세부 필터</strong>
              <div className="muted shipment-grid-note">
                출고 판단으로 먼저 좁힌 뒤, 송장 상태·출력 상태·주문 상태가 필요할 때만 더 세밀하게 보세요.
              </div>
            </div>
            <div className="muted">
              {activeDetailFilterCount > 0 ? `${formatNumber(activeDetailFilterCount)}개 조건 적용 중` : "추가 조건 없음"}
            </div>
          </div>

          <div className="shipment-status-toolbar">
            <div className="shipment-status-group">
              <div className="shipment-status-group-label">
                송장 상태
                <span className="muted">{formatNumber(activeSheet?.invoiceCounts.all ?? 0)}건</span>
              </div>
              <div className="shipment-status-pill-list">
                {invoiceStatusOptions.map((option) => {
                  const active = activeInvoiceStatusCard === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`shipment-filter-pill ${option.toneClassName}${active ? " active" : ""}`}
                      aria-pressed={active}
                      onClick={() =>
                        onPatchFilters({
                          invoiceStatusCard: option.value,
                        })
                      }
                    >
                      <span>{option.label}</span>
                      <strong>{formatNumber(activeSheet?.invoiceCounts[option.value] ?? 0)}</strong>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="shipment-status-group">
              <div className="shipment-status-group-label">
                출력 상태
                <span className="muted">{formatNumber(activeSheet?.outputCounts.all ?? 0)}건</span>
              </div>
              <div className="shipment-status-pill-list">
                {outputStatusOptions.map((option) => {
                  const active = activeOutputStatusCard === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`shipment-filter-pill ${option.toneClassName}${active ? " active" : ""}`}
                      aria-pressed={active}
                      onClick={() =>
                        onPatchFilters({
                          outputStatusCard: option.value,
                        })
                      }
                    >
                      <span>{option.label}</span>
                      <strong>{formatNumber(activeSheet?.outputCounts[option.value] ?? 0)}</strong>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="shipment-status-group">
              <div className="shipment-status-group-label">
                주문 상태
                <span className="muted">{formatNumber(activeSheet?.orderCounts.all ?? 0)}건</span>
              </div>
              <div className="shipment-status-pill-list">
                {orderStatusOptions.map((option) => {
                  const active = activeOrderStatusCard === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`shipment-filter-pill ${option.toneClassName}${active ? " active" : ""}`}
                      aria-pressed={active}
                      onClick={() =>
                        onPatchFilters({
                          orderStatusCard: option.value,
                        })
                      }
                    >
                      <span>{option.label}</span>
                      <strong>{formatNumber(activeSheet?.orderCounts[option.value] ?? 0)}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
