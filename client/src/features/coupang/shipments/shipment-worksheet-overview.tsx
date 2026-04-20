import type { CoupangShipmentWorksheetViewResponse } from "@shared/coupang";
import type { CoupangShipmentDecisionPreviewItem } from "@shared/coupang-fulfillment";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import type {
  InvoiceStatusCardKey,
  OrderStatusCardKey,
  OutputStatusCardKey,
} from "@/lib/coupang-shipment-quick-filters";
import { formatNumber } from "@/lib/utils";
import { resolveShipmentHandoffLinks } from "./fulfillment-handoff";
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
  decisionPreviewGroups: CoupangShipmentWorksheetViewResponse["decisionPreviewGroups"];
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

const ACTION_QUEUE_ORDER = [
  "ready",
  "invoice_waiting",
  "recheck",
  "hold",
  "blocked",
] as const satisfies readonly Exclude<FulfillmentDecisionFilterValue, "all">[];

const ACTION_QUEUE_HEADLINES: Record<
  (typeof ACTION_QUEUE_ORDER)[number],
  { title: string; description: string; emptyMessage: string; ctaLabel: string }
> = {
  ready: {
    title: "즉시 출고",
    description: "지금 바로 출고 판단과 후속 액션을 이어서 실행할 수 있는 주문입니다.",
    emptyMessage: "현재 필터에서는 즉시 출고 후보가 없습니다.",
    ctaLabel: "즉시 출고 큐 보기",
  },
  invoice_waiting: {
    title: "송장 입력",
    description: "송장 입력 또는 송장 전송이 먼저 필요한 주문입니다.",
    emptyMessage: "현재 필터에서는 송장 입력 대기 주문이 없습니다.",
    ctaLabel: "송장 입력 큐 보기",
  },
  recheck: {
    title: "재확인",
    description: "CS stale, 송장 실패, 데이터 누락처럼 다시 확인해야 하는 주문입니다.",
    emptyMessage: "현재 필터에서는 재확인 주문이 없습니다.",
    ctaLabel: "재확인 큐 보기",
  },
  hold: {
    title: "보류",
    description: "CS 영향이나 문의 대응 때문에 출고보다 확인이 먼저 필요한 주문입니다.",
    emptyMessage: "현재 필터에서는 보류 주문이 없습니다.",
    ctaLabel: "보류 큐 보기",
  },
  blocked: {
    title: "차단",
    description: "취소, 반품, 교환, 출고중지처럼 출고를 막는 신호가 확인된 주문입니다.",
    emptyMessage: "현재 필터에서는 차단 주문이 없습니다.",
    ctaLabel: "차단 큐 보기",
  },
};

function buildPreviewMeta(item: CoupangShipmentDecisionPreviewItem) {
  return [
    item.optionName,
    item.receiverName,
    item.secondaryStatus.orderStatusLabel,
    ...item.secondaryStatus.customerServiceSignalLabels,
  ]
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
}

export default function ShipmentWorksheetOverview({
  selectedStoreId,
  quickCollectFocusActive,
  quickCollectFocusCount,
  quickCollectFocusMessage,
  activeDecisionStatus,
  decisionCounts,
  decisionPreviewGroups,
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
  return (
    <>
      {quickCollectFocusActive ? (
        <div className="card shipment-focus-banner">
          <div>
            <div className="shipment-focus-banner-label">방금 수집한 주문만 먼저 보는 중</div>
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
            <div className="shipment-filter-summary-label">행동 큐 허브</div>
            <strong>
              현재 필터 전체 {formatNumber(decisionCounts.all)}건을 다음 액션 기준으로 다시 묶었습니다.
            </strong>
            <div className="muted shipment-filter-summary-note">
              상단 큐 카드를 누르면 하단 원본 테이블이 같은 판단 기준으로 연동됩니다.
            </div>
            <div className="muted shipment-filter-summary-meta">
              현재 페이지 {formatNumber(pageRowCount)}건 · 화면 노출 {formatNumber(visibleRowsCount)}건
            </div>
          </div>
          <div className="shipment-filter-summary-actions">
            {activeDecisionStatus !== "all" ? (
              <button
                type="button"
                className="button ghost"
                onClick={() => onPatchFilters({ decisionStatus: "all" })}
              >
                전체 큐 보기
              </button>
            ) : null}
            <button
              type="button"
              className={`button${detailFiltersOpen ? "" : " ghost"}`}
              onClick={onToggleDetailFilters}
            >
              {detailFiltersOpen ? "세부 필터 접기" : detailFilterToggleLabel}
            </button>
          </div>
        </div>

        <div className="shipment-action-queue-grid">
          {ACTION_QUEUE_ORDER.map((status) => {
            const group = decisionPreviewGroups[status];
            const headline = ACTION_QUEUE_HEADLINES[status];
            const active = activeDecisionStatus === status;
            const handoffLinks = resolveShipmentHandoffLinks({
              links: group.nextHandoffLinks,
              storeId: selectedStoreId,
              query: filters.query,
            });

            return (
              <section
                key={status}
                className={`card shipment-action-queue-card${active ? " active" : ""}`}
              >
                <div className="shipment-action-queue-header">
                  <div className="shipment-action-queue-copy">
                    <div className="shipment-action-queue-label">{headline.title}</div>
                    <strong>{headline.description}</strong>
                  </div>
                  {active ? <span className="shipment-action-queue-active">현재 큐</span> : null}
                </div>

                <div className="shipment-action-queue-count-row">
                  <div className="shipment-action-queue-count">{formatNumber(group.count)}</div>
                  <div className="muted shipment-action-queue-count-note">필터 전체 기준</div>
                </div>

                <div className="shipment-action-queue-reasons">
                  {group.topReasonLabels.length ? (
                    group.topReasonLabels.map((reasonLabel) => (
                      <span
                        key={`${status}:${reasonLabel}`}
                        className="shipment-action-queue-reason-pill"
                      >
                        {reasonLabel}
                      </span>
                    ))
                  ) : (
                    <span className="shipment-action-queue-empty-note">{headline.emptyMessage}</span>
                  )}
                </div>

                <div className="shipment-action-queue-preview">
                  <div className="shipment-action-queue-preview-title">대표 주문 미리보기</div>
                  {group.previewItems.length ? (
                    <ul className="shipment-action-queue-preview-list">
                      {group.previewItems.map((item) => (
                        <li key={`${status}:${item.rowId}`} className="shipment-action-queue-preview-item">
                          <strong>{item.productName}</strong>
                          <div className="muted shipment-action-queue-preview-meta">
                            {buildPreviewMeta(item) || item.primaryDecision.reasonLabel}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="shipment-action-queue-empty-note">{headline.emptyMessage}</div>
                  )}
                </div>

                <div className="shipment-action-queue-actions">
                  <button
                    type="button"
                    className={`button${active ? "" : " secondary"}`}
                    onClick={() => onPatchFilters({ decisionStatus: status })}
                  >
                    {active ? "이 큐 보는 중" : headline.ctaLabel}
                  </button>
                  {handoffLinks.slice(0, 2).map((link) => (
                    <WorkspaceEntryLink
                      key={`${status}:${link.href}:${link.label}`}
                      href={link.href}
                      className={`button${link.variant === "ghost" ? " ghost" : " secondary"}`}
                      workspaceBehavior="tab"
                    >
                      {link.label}
                    </WorkspaceEntryLink>
                  ))}
                </div>
              </section>
            );
          })}
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
            <div className="muted shipment-filter-summary-note">
              메인 판단 축을 먼저 고른 뒤, 필요할 때만 송장 상태, 출력 상태, 주문 상태를 세부로 좁혀 보세요.
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
              {detailFiltersOpen ? "세부 필터 접기" : detailFilterToggleLabel}
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
              <strong>세부 필터</strong>
              <div className="muted shipment-grid-note">
                액션 큐를 먼저 정한 뒤, 필요한 경우에만 송장 상태, 출력 상태, 주문 상태를 추가로 좁혀 보세요.
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
