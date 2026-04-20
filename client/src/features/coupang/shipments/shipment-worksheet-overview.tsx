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

const ACTION_QUEUE_ORDER = [
  "ready",
  "invoice_waiting",
  "recheck",
  "hold",
  "blocked",
] as const satisfies readonly Exclude<FulfillmentDecisionFilterValue, "all">[];

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

const ACTION_QUEUE_COPY: Record<
  Exclude<FulfillmentDecisionFilterValue, "all">,
  { headline: string; note: string }
> = {
  ready: {
    headline: "지금 바로 이어서 처리할 주문",
    note: "상품준비중 처리나 송장 단계로 바로 이어갈 수 있는 주문입니다.",
  },
  invoice_waiting: {
    headline: "송장 입력과 전송만 남은 주문",
    note: "송장 입력 또는 전송 상태를 먼저 정리하면 바로 다음 단계로 넘어갑니다.",
  },
  recheck: {
    headline: "데이터와 상태를 다시 봐야 하는 주문",
    note: "송장 실패, stale snapshot, 누락 데이터처럼 재확인이 필요한 주문입니다.",
  },
  hold: {
    headline: "CS 영향 때문에 잠시 멈춰야 하는 주문",
    note: "즉시 실행보다 문의·영향 확인이 먼저 필요한 주문입니다.",
  },
  blocked: {
    headline: "지금은 출고를 막아야 하는 주문",
    note: "취소·반품·교환·출고중지 계열 이슈가 확인된 주문입니다.",
  },
};

const PRIORITY_COPY: Record<
  Exclude<CoupangShipmentWorksheetPriorityCardFilter, "all">,
  string
> = {
  shipment_stop_requested: "가장 먼저 멈춰야 하는 건입니다.",
  same_day_dispatch: "오늘 출고 예정인데 아직 출고 단계로 못 넘어간 건입니다.",
  dispatch_delayed: "예정일이 지났는데 아직 결제완료·상품준비중에 머문 건입니다.",
  long_in_transit: "배송지시 또는 배송중 상태가 30일을 넘긴 건입니다.",
};

function formatQueuePreviewMeta(item: {
  optionName: string | null;
  receiverName: string;
  selpickOrderNumber: string;
  primaryDecision: { reasonLabel: string };
}) {
  const parts = [
    item.optionName?.trim() || null,
    item.receiverName.trim() || null,
    item.primaryDecision.reasonLabel,
    item.selpickOrderNumber.trim() || null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(" · ");
}

export default function ShipmentWorksheetOverview({
  selectedStoreId,
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
  const decisionPreviewGroups = activeSheet?.decisionPreviewGroups;

  return (
    <>
      {quickCollectFocusActive ? (
        <div className="card shipment-focus-banner">
          <div>
            <div className="shipment-focus-banner-label">방금 수집한 주문 먼저 보기</div>
            <div className="muted shipment-focus-banner-note">
              {quickCollectFocusMessage ??
                `빠른 수집으로 들어온 ${formatNumber(quickCollectFocusCount)}건을 먼저 보여주고 있습니다.`}
            </div>
          </div>
          <button type="button" className="button ghost" onClick={onClearQuickCollectFocus}>
            전체 목록으로 돌아가기
          </button>
        </div>
      ) : null}

      <div className="shipment-hub-board">
        <div className="card shipment-hub-board-intro">
          <div>
            <div className="shipment-filter-summary-label">출고 작업 허브</div>
            <strong>
              {selectedStoreId
                ? `현재 필터 전체 ${formatNumber(activeSheet?.filteredRowCount ?? 0)}건을 다음 액션 기준으로 다시 정리했습니다.`
                : "스토어를 선택하면 현재 조건의 작업 큐를 바로 정리해서 보여줍니다."}
            </strong>
            <div className="muted shipment-filter-summary-note">
              상단 카드는 현재 필터 전체 기준이고, 아래 원본 테이블은 같은 기준을 유지한 채 페이지 단위로 보여줍니다.
            </div>
            <div className="shipment-hub-quick-stats">
              <span className="shipment-hub-side-panel-chip strong">
                필터 전체 {formatNumber(activeSheet?.filteredRowCount ?? 0)}건
              </span>
              <span className="shipment-hub-side-panel-chip">
                현재 페이지 {formatNumber(pageRowCount)}건
              </span>
              <span className="shipment-hub-side-panel-chip">
                화면 표시 {formatNumber(visibleRowsCount)}건
              </span>
              <span className="shipment-hub-side-panel-chip">
                {activeDetailFilterCount > 0
                  ? `보조 필터 ${formatNumber(activeDetailFilterCount)}개`
                  : "보조 필터 없음"}
              </span>
            </div>
          </div>
          <div className="shipment-filter-summary-actions">
            <button
              type="button"
              className={`button${detailFiltersOpen ? "" : " ghost"}`}
              onClick={onToggleDetailFilters}
            >
              {detailFiltersOpen ? "보조 필터 접기" : detailFilterToggleLabel}
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={!hasCustomWorksheetFilters}
              onClick={onResetFilters}
            >
              필터 초기화
            </button>
          </div>
        </div>

        <div className="card shipment-filter-summary-card shipment-priority-strip">
          <div className="shipment-status-group">
            <div className="shipment-status-group-label">먼저 확인</div>
            <div className="shipment-status-pill-list">
              <button
                type="button"
                className={`shipment-filter-pill neutral${
                  filters.priorityCard === "all" ? " active" : ""
                }`}
                aria-pressed={filters.priorityCard === "all"}
                onClick={() => onPatchFilters({ priorityCard: "all" })}
              >
                <span>전체</span>
                <strong>{formatNumber(priorityCounts?.all ?? 0)}</strong>
              </button>
              {PRIORITY_CARD_ORDER.map((card) => {
                const active = filters.priorityCard === card;
                return (
                  <button
                    key={card}
                    type="button"
                    className={`shipment-filter-pill attention${active ? " active" : ""}`}
                    aria-pressed={active}
                    onClick={() => onPatchFilters({ priorityCard: active ? "all" : card })}
                    title={PRIORITY_COPY[card]}
                  >
                    <span>{getShipmentPriorityCardLabel(card)}</span>
                    <strong>{formatNumber(priorityCounts?.[card] ?? 0)}</strong>
                  </button>
                );
              })}
            </div>
            <div className="muted shipment-filter-summary-note">
              배송 상태를 덮어쓰지 않고, 우선 확인이 필요한 주문만 별도 묶음으로 먼저 보여줍니다.
            </div>
          </div>
        </div>

        <div className="shipment-action-queue-grid">
          {ACTION_QUEUE_ORDER.map((status) => {
            const group = decisionPreviewGroups?.[status];
            const active = activeDecisionStatus === status;
            const previewItems = group?.previewItems.slice(0, 3) ?? [];
            const reasonLabels = group?.topReasonLabels ?? [];

            return (
              <section
                key={status}
                className={`card shipment-action-queue-card${active ? " active" : ""}`}
              >
                <div className="shipment-action-queue-header">
                  <div className="shipment-action-queue-copy">
                    <div className="shipment-action-queue-label">다음 액션 큐</div>
                    <strong>{group?.statusLabel ?? DECISION_FILTER_OPTIONS.find((item) => item.value === status)?.label}</strong>
                    <div className="shipment-action-queue-meta">{ACTION_QUEUE_COPY[status].headline}</div>
                  </div>
                  {active ? <span className="shipment-action-queue-active">현재 보기</span> : null}
                </div>

                <div className="shipment-action-queue-count-row">
                  <div className="shipment-action-queue-count">{formatNumber(group?.count ?? 0)}</div>
                  <div className="muted shipment-action-queue-count-note">현재 필터 전체 기준</div>
                </div>

                <div className="shipment-action-queue-meta">{ACTION_QUEUE_COPY[status].note}</div>

                <div className="shipment-action-queue-reasons">
                  {reasonLabels.length ? (
                    reasonLabels.map((label) => (
                      <span key={`${status}:${label}`} className="shipment-action-queue-reason-pill">
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="shipment-action-queue-reason-pill">대표 사유 없음</span>
                  )}
                </div>

                <div className="shipment-action-queue-preview">
                  <div className="shipment-action-queue-preview-title">대표 주문</div>
                  {previewItems.length ? (
                    <ol className="shipment-action-queue-preview-list">
                      {previewItems.map((item) => (
                        <li key={`${status}:${item.rowId}`} className="shipment-action-queue-preview-item">
                          <strong className="shipment-action-queue-preview-name">
                            {item.productName || item.selpickOrderNumber || item.productOrderNumber}
                          </strong>
                          <div className="shipment-action-queue-preview-meta">
                            {formatQueuePreviewMeta(item)}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="muted shipment-action-queue-empty-note">
                      현재 조건에 해당하는 주문이 없습니다.
                    </div>
                  )}
                </div>

                <div className="shipment-action-queue-actions">
                  <button
                    type="button"
                    className={`button${active ? "" : " secondary"}`}
                    onClick={() =>
                      onPatchFilters({
                        decisionStatus: active ? "all" : status,
                      })
                    }
                  >
                    {active ? "전체로 되돌리기" : `${group?.statusLabel ?? "이 큐"} 보기`}
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
              `NONE_TRACKING`은 별도 단계로 빼지 않고 `배송중`으로 묶고, 필요할 때만 `업체 직접 배송` 필터로 다시 좁힙니다.
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
              취소·반품·교환·일반 CS는 이슈 축으로 남기고, 배송 단계는 그대로 유지합니다.
            </div>
            <div className="muted shipment-filter-summary-meta">
              stale sync 경고 {formatNumber(activeSheet?.staleSyncCount ?? 0)}건
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
              {detailFiltersOpen ? "보조 필터 접기" : detailFilterToggleLabel}
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
                다음 액션 허브 아래에서 세부 상태, 송장, 출력, 레거시 주문 상태를 추가로 좁혀볼 수 있습니다.
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
                레거시 주문 상태
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
