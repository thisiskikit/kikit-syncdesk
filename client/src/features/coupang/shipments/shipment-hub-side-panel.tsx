import type { ReactNode } from "react";
import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import type { ResolvedShipmentHandoffLink } from "./fulfillment-handoff";
import type { ShipmentDetailInfoRow } from "./shipment-detail-dialog";
import type { FulfillmentDecisionPresentation } from "./types";
import { getShipmentNormalizedStatusPresentation } from "./coupang-status-view";

type ShipmentHubSidePanelProps = {
  row: CoupangShipmentWorksheetRow | null;
  heroMeta: string;
  decision: FulfillmentDecisionPresentation | null;
  originalStatusLabel: string;
  customerServiceSignalLabels: readonly string[];
  customerServiceStateLabel: string | null;
  riskSummary: readonly string[];
  handoffLinks: readonly ResolvedShipmentHandoffLink[];
  worksheetStatusValue: ReactNode;
  invoiceStatusValue: ReactNode;
  claimStatusValue: ReactNode;
  statusRows: ShipmentDetailInfoRow[];
  activityRows: ShipmentDetailInfoRow[];
  isLoading: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onOpenFullDetail: () => void;
};

const ACTION_LABELS: Record<string, string> = {
  prepare: "상품준비중 처리",
  invoice: "송장 전송",
  invoice_input: "송장 입력",
  details: "상세 확인",
  cs: "CS 확인",
};

function renderInfoRows(title: string, rows: ShipmentDetailInfoRow[]) {
  if (!rows.length) {
    return null;
  }

  return (
    <section className="shipment-hub-side-panel-section" key={title}>
      <div className="shipment-hub-side-panel-section-label">{title}</div>
      <div className="shipment-hub-side-panel-info-grid">
        {rows.map((row) => (
          <div className="shipment-hub-side-panel-info-row" key={`${title}:${row.label}`}>
            <span className="shipment-hub-side-panel-info-name">{row.label}</span>
            <div className="shipment-hub-side-panel-info-value">{row.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function renderNoteList(items: readonly string[], emptyText: string) {
  if (!items.length) {
    return <div className="shipment-hub-side-panel-note-item">{emptyText}</div>;
  }

  return (
    <div className="shipment-hub-side-panel-note-list">
      {items.map((item) => (
        <div key={item} className="shipment-hub-side-panel-note-item">
          {item}
        </div>
      ))}
    </div>
  );
}

export default function ShipmentHubSidePanel({
  row,
  heroMeta,
  decision,
  originalStatusLabel,
  customerServiceSignalLabels,
  customerServiceStateLabel,
  riskSummary,
  handoffLinks,
  worksheetStatusValue,
  invoiceStatusValue,
  claimStatusValue,
  statusRows,
  activityRows,
  isLoading,
  errorMessage,
  onClose,
  onOpenFullDetail,
}: ShipmentHubSidePanelProps) {
  if (!row) {
    return (
      <aside className="card shipment-hub-side-panel shipment-hub-side-panel-empty">
        <div className="shipment-hub-side-panel-section-label">판단 패널</div>
        <strong>주문 하나를 고르면 왜 멈췄는지와 지금 해야 할 일을 먼저 보여줍니다.</strong>
        <div className="muted">
          배송 상태, 이슈 신호, 다음 이동 링크, 원본 상세는 한 자리에서 바로 비교할 수 있습니다.
        </div>
      </aside>
    );
  }

  const statusPresentation = getShipmentNormalizedStatusPresentation(row);
  const shouldShowIssueSignal =
    statusPresentation.snapshot.issueStage !== "none" || statusPresentation.snapshot.isDirectDelivery;
  const allowedActionLabels =
    decision?.allowedActions.map((action) => ACTION_LABELS[action] ?? action) ?? [];
  const decisionNotes = [
    ...(decision ? [decision.description] : []),
    ...(statusPresentation.mismatchReason ? [statusPresentation.mismatchReason] : []),
  ];
  const reasoningNotes = [
    ...riskSummary,
    ...(customerServiceStateLabel ? [`CS snapshot ${customerServiceStateLabel}`] : []),
  ];

  return (
    <aside className="card shipment-hub-side-panel">
      <div className="shipment-hub-side-panel-header">
        <div>
          <div className="shipment-hub-side-panel-section-label">주문 판단 패널</div>
          <h3>{row.exposedProductName || row.productName || "선택된 주문"}</h3>
          <div className="muted shipment-hub-side-panel-meta">{heroMeta}</div>
        </div>
        <button type="button" className="button ghost" onClick={onClose}>
          선택 해제
        </button>
      </div>

      <div className="shipment-hub-side-panel-hero">
        <div className="hero-badges">
          <span className={`status-pill ${statusPresentation.shippingTone}`}>
            {statusPresentation.shippingLabel}
          </span>
          {shouldShowIssueSignal ? (
            <span className={`status-pill ${statusPresentation.issueTone}`}>
              {statusPresentation.issueLabel}
            </span>
          ) : null}
          {statusPresentation.priorityLabel ? (
            <span className={`status-pill ${statusPresentation.priorityTone}`}>
              {statusPresentation.priorityLabel}
            </span>
          ) : null}
        </div>
        <div className="shipment-hub-side-panel-hero-title">
          {decision ? `지금은 ${decision.statusLabel} 큐로 보는 주문입니다.` : "현재 상태를 정리한 주문입니다."}
        </div>
        <div className="shipment-hub-side-panel-summary">
          {decision?.description ??
            statusPresentation.mismatchReason ??
            "쿠팡 원본 상태와 이슈 축을 분리해서 현재 주문을 설명합니다."}
        </div>
      </div>

      {isLoading ? <div className="feedback">상세 정보를 불러오는 중입니다...</div> : null}
      {errorMessage ? <div className="feedback error">{errorMessage}</div> : null}

      <section className="shipment-hub-side-panel-section">
        <div className="shipment-hub-side-panel-section-label">지금 해야 할 일</div>
        <div className="shipment-hub-side-panel-focus-card">
          <div className="shipment-hub-side-panel-chip-row">
            {decision ? (
              <>
                <span className={decision.toneClassName}>{decision.statusLabel}</span>
                <span className="shipment-decision-reason-pill">{decision.reasonLabel}</span>
              </>
            ) : (
              <span className="shipment-hub-side-panel-chip">판단 정보 없음</span>
            )}
          </div>
          <div className="shipment-hub-side-panel-focus-copy">
            <div className="shipment-hub-side-panel-focus-title">현재 판단</div>
            <div className="shipment-hub-side-panel-summary">
              {decisionNotes[0] ?? "현재 주문은 별도 액션 안내 없이 상태 비교만 가능합니다."}
            </div>
          </div>
          <div className="shipment-hub-side-panel-chip-row">
            {allowedActionLabels.length ? (
              allowedActionLabels.map((label) => (
                <span key={label} className="shipment-hub-side-panel-chip">
                  {label}
                </span>
              ))
            ) : (
              <span className="shipment-hub-side-panel-chip">가능한 액션 없음</span>
            )}
          </div>
        </div>
      </section>

      <section className="shipment-hub-side-panel-section">
        <div className="shipment-hub-side-panel-section-label">왜 이 큐에 들어왔는지</div>
        {renderNoteList(reasoningNotes, "현재 별도 위험 요약은 없습니다.")}
      </section>

      <section className="shipment-hub-side-panel-section">
        <div className="shipment-hub-side-panel-section-label">CS·클레임 신호</div>
        <div className="shipment-hub-side-panel-chip-row">
          {customerServiceSignalLabels.length ? (
            customerServiceSignalLabels.map((label) => (
              <span key={label} className="shipment-hub-side-panel-chip">
                {label}
              </span>
            ))
          ) : (
            <span className="shipment-hub-side-panel-chip">신호 없음</span>
          )}
        </div>
      </section>

      {handoffLinks.length ? (
        <section className="shipment-hub-side-panel-section">
          <div className="shipment-hub-side-panel-section-label">다음 이동</div>
          <div className="shipment-hub-side-panel-actions">
            {handoffLinks.map((link) => (
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
        </section>
      ) : null}

      <section className="shipment-hub-side-panel-section">
        <div className="shipment-hub-side-panel-section-label">현재 상태 비교</div>
        <div className="shipment-hub-side-panel-info-grid">
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">쿠팡 원본 상태</span>
            <div className="shipment-hub-side-panel-info-value">
              {originalStatusLabel || statusPresentation.rawOrderLabel}
            </div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">현재 배송 단계</span>
            <div className="shipment-hub-side-panel-info-value">
              <span className={`status-pill ${statusPresentation.shippingTone}`}>
                {statusPresentation.shippingLabel}
              </span>
            </div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">현재 이슈 단계</span>
            <div className="shipment-hub-side-panel-info-value">
              {shouldShowIssueSignal ? (
                <span className={`status-pill ${statusPresentation.issueTone}`}>
                  {statusPresentation.issueLabel}
                </span>
              ) : (
                <span className="shipment-hub-side-panel-muted">이슈 없음</span>
              )}
            </div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">워크시트 상태</span>
            <div className="shipment-hub-side-panel-info-value">{worksheetStatusValue}</div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">송장 상태</span>
            <div className="shipment-hub-side-panel-info-value">{invoiceStatusValue}</div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">클레임 현황</span>
            <div className="shipment-hub-side-panel-info-value">{claimStatusValue}</div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">마지막 동기화</span>
            <div className="shipment-hub-side-panel-info-value">
              {statusPresentation.lastSyncText}
            </div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">불일치 사유</span>
            <div className="shipment-hub-side-panel-info-value">
              {statusPresentation.mismatchReason ?? "없음"}
            </div>
          </div>
        </div>
      </section>

      <details className="shipment-hub-side-panel-foldout">
        <summary>원본 상세와 최근 이력 보기</summary>
        <div className="shipment-hub-side-panel-foldout-body">
          {renderInfoRows("워크시트 상세", statusRows)}
          {renderInfoRows("최근 주문 상태", activityRows)}
          <div className="shipment-hub-side-panel-actions">
            <button type="button" className="button secondary" onClick={onOpenFullDetail}>
              전체 상세 열기
            </button>
          </div>
        </div>
      </details>
    </aside>
  );
}
