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
        <strong>주문을 선택하면 쿠팡 원본 상태와 현재 화면 표시값의 차이를 한 자리에서 보여줍니다.</strong>
        <div className="muted">
          배송 단계, 이슈 단계, 마지막 동기화, 다음 이동 경로를 같이 확인할 수 있습니다.
        </div>
      </aside>
    );
  }

  const statusPresentation = getShipmentNormalizedStatusPresentation(row);

  return (
    <aside className="card shipment-hub-side-panel">
      <div className="shipment-hub-side-panel-header">
        <div>
          <div className="shipment-hub-side-panel-section-label">주문 판단 패널</div>
          <h3>{row.exposedProductName || row.productName || "선택 주문"}</h3>
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
          {statusPresentation.snapshot.issueStage !== "none" || statusPresentation.snapshot.isDirectDelivery ? (
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
        <div className="shipment-hub-side-panel-summary">
          {statusPresentation.mismatchReason ?? "쿠팡 원본 배송 상태와 이슈 상태를 분리해서 보여줍니다."}
        </div>
      </div>

      {isLoading ? <div className="feedback">상세 정보를 불러오는 중입니다...</div> : null}
      {errorMessage ? <div className="feedback error">{errorMessage}</div> : null}

      <section className="shipment-hub-side-panel-section">
        <div className="shipment-hub-side-panel-section-label">원본값 / 현재 표시값</div>
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
              {statusPresentation.snapshot.issueStage !== "none" || statusPresentation.snapshot.isDirectDelivery ? (
                <span className={`status-pill ${statusPresentation.issueTone}`}>
                  {statusPresentation.issueLabel}
                </span>
              ) : (
                <span className="shipment-hub-side-panel-muted">이슈 없음</span>
              )}
            </div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">마지막 동기화</span>
            <div className="shipment-hub-side-panel-info-value">{statusPresentation.lastSyncText}</div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">불일치 사유</span>
            <div className="shipment-hub-side-panel-info-value">
              {statusPresentation.mismatchReason ?? "없음"}
            </div>
          </div>
        </div>
      </section>

      <section className="shipment-hub-side-panel-section">
        <div className="shipment-hub-side-panel-section-label">운영 보조 정보</div>
        <div className="shipment-hub-side-panel-info-grid">
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">다음 액션</span>
            <div className="shipment-hub-side-panel-info-value">
              {decision ? (
                <>
                  <span className={decision.toneClassName}>{decision.statusLabel}</span>
                  <span className="shipment-decision-reason-pill">{decision.reasonLabel}</span>
                </>
              ) : (
                "-"
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
            <span className="shipment-hub-side-panel-info-name">CS 신호</span>
            <div className="shipment-hub-side-panel-info-value">
              {customerServiceSignalLabels.length ? customerServiceSignalLabels.join(", ") : "없음"}
              {customerServiceStateLabel ? (
                <div className="muted">snapshot: {customerServiceStateLabel}</div>
              ) : null}
            </div>
          </div>
          <div className="shipment-hub-side-panel-info-row">
            <span className="shipment-hub-side-panel-info-name">리스크 요약</span>
            <div className="shipment-hub-side-panel-info-value">
              {riskSummary.length ? riskSummary.join(", ") : "없음"}
            </div>
          </div>
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

      <details className="shipment-hub-side-panel-foldout">
        <summary>원본 상세 / 최근 상태 이력</summary>
        <div className="shipment-hub-side-panel-foldout-body">
          {renderInfoRows("워크시트 상세", statusRows)}
          {renderInfoRows("실시간 주문 상태", activityRows)}
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
