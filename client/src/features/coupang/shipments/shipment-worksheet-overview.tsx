import type {
  CoupangShipmentIssueFilter,
  CoupangShipmentWorksheetPipelineCardFilter,
  CoupangShipmentWorksheetPriorityCardFilter,
  CoupangShipmentWorksheetViewResponse,
} from "@shared/coupang";
import type {
  InvoiceStatusCardKey,
  OrderStatusCardKey,
  OutputStatusCardKey,
} from "@/lib/coupang-shipment-quick-filters";
import { formatNumber } from "@/lib/utils";
import {
  getShipmentIssueFilterLabel,
  getShipmentPipelineCardLabel,
  getShipmentPriorityCardLabel,
} from "./coupang-status-view";
import type { FilterState, FulfillmentDecisionFilterValue } from "./types";

type StatusOption<TValue extends string> = {
  value: TValue;
  label: string;
  toneClassName: string;
};

type ShipmentWorksheetOverviewProps = {
  selectedStoreId: string;
  quickCollectFocusActive: boolean;
  quickCollectFocusCount: number;
  quickCollectFocusMessage: string | null;
  activeDecisionStatus: FulfillmentDecisionFilterValue;
  decisionCounts: CoupangShipmentWorksheetViewResponse["decisionCounts"];
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
  onClearQuickCollectFocus: () => void;
  onPatchFilters: (patch: Partial<FilterState>) => void;
  onResetFilters: () => void;
  onToggleDetailFilters: () => void;
};

const PRIORITY_CARD_ORDER = [
  "shipment_stop_requested",
  "same_day_dispatch",
  "dispatch_delayed",
  "long_in_transit",
] as const satisfies readonly Exclude<CoupangShipmentWorksheetPriorityCardFilter, "all">[];

const PIPELINE_CARD_ORDER = [
  "payment_completed",
  "preparing_product",
  "shipping_instruction",
  "in_delivery",
  "delivered",
] as const satisfies readonly Exclude<CoupangShipmentWorksheetPipelineCardFilter, "all">[];

const ISSUE_FILTER_ORDER = [
  "cancel",
  "return",
  "exchange",
  "cs_open",
  "direct_delivery",
] as const satisfies readonly Exclude<
  CoupangShipmentIssueFilter,
  "all" | "shipment_stop_requested" | "shipment_stop_resolved"
>[];

const DECISION_FILTER_OPTIONS: Array<{
  value: FulfillmentDecisionFilterValue;
  label: string;
}> = [
  { value: "all", label: "전체 액션" },
  { value: "ready", label: "즉시 출고" },
  { value: "invoice_waiting", label: "송장 입력" },
  { value: "hold", label: "보류" },
  { value: "blocked", label: "차단" },
  { value: "recheck", label: "재확인" },
];

const PRIORITY_COPY: Record<
  Exclude<CoupangShipmentWorksheetPriorityCardFilter, "all">,
  string
> = {
  shipment_stop_requested: "가장 먼저 멈춰야 하는 주문입니다.",
  same_day_dispatch: "오늘 출고 예정인데 아직 출고 전 단계입니다.",
  dispatch_delayed: "예정일이 지났는데 아직 출고 전 단계입니다.",
  long_in_transit: "배송지시 이후 30일을 넘긴 장기 미배송 후보입니다.",
};

export default function ShipmentWorksheetOverview({
  quickCollectFocusActive,
  quickCollectFocusCount,
  quickCollectFocusMessage,
  activeDecisionStatus,
  decisionCounts,
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
  onClearQuickCollectFocus,
  onPatchFilters,
  onResetFilters,
  onToggleDetailFilters,
}: ShipmentWorksheetOverviewProps) {
  const priorityCounts = activeSheet?.priorityCounts;
  const pipelineCounts = activeSheet?.pipelineCounts;
  const issueCounts = activeSheet?.issueCounts;

  return (
    <>
      {quickCollectFocusActive ? (
        <div className="card shipment-focus-banner">
          <div>
            <div className="shipment-focus-banner-label">방금 수집한 주문 중심 보기</div>
            <div className="muted shipment-focus-banner-note">
              {quickCollectFocusMessage ??
                `빠른 수집으로 추가된 ${formatNumber(quickCollectFocusCount)}건을 먼저 보여줍니다.`}
            </div>
          </div>
          <button type="button" className="button ghost" onClick={onClearQuickCollectFocus}>
            전체 보기로 돌아가기
          </button>
        </div>
      ) : null}

      <div className="shipment-hub-board">
        <div className="card shipment-hub-board-intro">
          <div>
            <div className="shipment-filter-summary-label">쿠팡 기준 정합 허브</div>
            <strong>
              상단 카드는 현재 필터 전체 {formatNumber(activeSheet?.filteredRowCount ?? 0)}건을
              쿠팡 기준 배송 단계와 이슈 축으로 다시 묶어 보여줍니다.
            </strong>
            <div className="muted shipment-filter-summary-note">
              우선 처리 카드, 배송 단계 카드, 이슈 필터를 같은 기준으로 계산하고 하단 원본
              테이블도 같은 필터로 맞춥니다.
            </div>
            <div className="muted shipment-filter-summary-meta">
              현재 페이지 {formatNumber(pageRowCount)}건 쨌 화면 표시 {formatNumber(visibleRowsCount)}건
            </div>
          </div>
          <div className="shipment-filter-summary-actions">
            <button
              type="button"
              className={`button${detailFiltersOpen ? "" : " ghost"}`}
              onClick={onToggleDetailFilters}
            >
              {detailFiltersOpen ? "상세 필터 닫기" : detailFilterToggleLabel}
            </button>
          </div>
        </div>

        <div className="shipment-action-queue-grid">
          {PRIORITY_CARD_ORDER.map((card) => {
            const active = filters.priorityCard === card;
            const count = priorityCounts?.[card] ?? 0;

            return (
              <section
                key={card}
                className={`card shipment-action-queue-card${active ? " active" : ""}`}
              >
                <div className="shipment-action-queue-header">
                  <div className="shipment-action-queue-copy">
                    <div className="shipment-action-queue-label">
                      {getShipmentPriorityCardLabel(card)}
                    </div>
                    <strong>{PRIORITY_COPY[card]}</strong>
                  </div>
                </div>
                <div className="shipment-action-queue-count-row">
                  <div className="shipment-action-queue-count">{formatNumber(count)}</div>
                  <div className="muted shipment-action-queue-count-note">현재 필터 기준</div>
                </div>
                <div className="shipment-action-queue-actions">
                  <button
                    type="button"
                    className={`button${active ? "" : " secondary"}`}
                    onClick={() =>
                      onPatchFilters({
                        priorityCard: active ? "all" : card,
                      })
                    }
                  >
                    {active ? "선택 해제" : "이 카드로 보기"}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="card shipment-filter-summary-card">
        <div className="shipment-filter-summary-header">
          <div>
            <div className="shipment-filter-summary-label">배송 단계</div>
            <div className="shipment-status-pill-list">
              <button
                type="button"
                className={`shipment-filter-pill neutral${
                  filters.pipelineCard === "all" ? " active" : ""
                }`}
                aria-pressed={filters.pipelineCard === "all"}
                onClick={() => onPatchFilters({ pipelineCard: "all" })}
              >
                <span>전체</span>
                <strong>{formatNumber(pipelineCounts?.all ?? 0)}</strong>
              </button>
              {PIPELINE_CARD_ORDER.map((card) => {
                const active = filters.pipelineCard === card;
                return (
                  <button
                    key={card}
                    type="button"
                    className={`shipment-filter-pill progress${active ? " active" : ""}`}
                    aria-pressed={active}
                    onClick={() => onPatchFilters({ pipelineCard: active ? "all" : card })}
                  >
                    <span>{getShipmentPipelineCardLabel(card)}</span>
                    <strong>{formatNumber(pipelineCounts?.[card] ?? 0)}</strong>
                  </button>
                );
              })}
            </div>
            <div className="muted shipment-filter-summary-note">
              NONE_TRACKING은 업체 직접 배송으로 표시하되 배송 단계는 배송중으로 정규화합니다.
            </div>
          </div>
        </div>
      </div>

      <div className="card shipment-filter-summary-card">
        <div className="shipment-filter-summary-header">
          <div>
            <div className="shipment-filter-summary-label">이슈 필터</div>
            <div className="shipment-status-pill-list">
              <button
                type="button"
                className={`shipment-filter-pill neutral${
                  filters.issueFilter === "all" ? " active" : ""
                }`}
                aria-pressed={filters.issueFilter === "all"}
                onClick={() => onPatchFilters({ issueFilter: "all" })}
              >
                <span>전체</span>
                <strong>{formatNumber(issueCounts?.all ?? 0)}</strong>
              </button>
              {ISSUE_FILTER_ORDER.map((filter) => {
                const active = filters.issueFilter === filter;
                const count =
                  filter === "direct_delivery"
                    ? activeSheet?.directDeliveryCount ?? 0
                    : issueCounts?.[filter] ?? 0;

                return (
                  <button
                    key={filter}
                    type="button"
                    className={`shipment-filter-pill attention${active ? " active" : ""}`}
                    aria-pressed={active}
                    onClick={() => onPatchFilters({ issueFilter: active ? "all" : filter })}
                  >
                    <span>{getShipmentIssueFilterLabel(filter)}</span>
                    <strong>{formatNumber(count)}</strong>
                  </button>
                );
              })}
            </div>
            <div className="muted shipment-filter-summary-note">
              출고중지요청은 우선 처리 카드에서 따로 끌어올리고, 취소/반품/교환/일반 CS는
              이슈 축으로 유지합니다.
            </div>
            <div className="muted shipment-filter-summary-meta">
              동기화 경고 {formatNumber(activeSheet?.staleSyncCount ?? 0)}건
            </div>
          </div>
        </div>
      </div>

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
              {detailFiltersOpen ? "상세 필터 닫기" : detailFilterToggleLabel}
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={!hasCustomWorksheetFilters}
              onClick={onResetFilters}
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      {detailFiltersOpen ? (
        <div className="card shipment-detail-filter-card">
          <div className="shipment-detail-filter-header">
            <div>
              <strong>보조 운영 필터</strong>
              <div className="muted shipment-grid-note">
                쿠팡 기준 카드 아래에서 내부 액션, 송장, 출력, 기존 주문 상태 필터를 추가로
                좁힐 수 있습니다.
              </div>
            </div>
            <div className="muted">
              {activeDetailFilterCount > 0
                ? `${formatNumber(activeDetailFilterCount)}개 조건 적용 중`
                : "추가 조건 없음"}
            </div>
          </div>

          <div className="shipment-status-toolbar">
            <div className="shipment-status-group">
              <div className="shipment-status-group-label">
                다음 액션
                <span className="muted">{formatNumber(decisionCounts.all)}건</span>
              </div>
              <div className="shipment-status-pill-list">
                {DECISION_FILTER_OPTIONS.map((option) => {
                  const active = activeDecisionStatus === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`shipment-filter-pill neutral${active ? " active" : ""}`}
                      aria-pressed={active}
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
                기존 주문 상태
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
