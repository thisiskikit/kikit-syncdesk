import type { ReactNode } from "react";
import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import type { ResolvedShipmentHandoffLink } from "./fulfillment-handoff";
import type { ShipmentDetailInfoRow } from "./shipment-detail-dialog";
import type { FulfillmentDecisionPresentation } from "./types";

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
  details: "원본 상세 확인",
  cs: "CS 영향 확인",
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
        <div className="shipment-hub-side-panel-section-label">우측 판단 패널</div>
        <strong>주문을 하나 선택하면 왜 막혔는지와 다음 이동 경로를 여기서 바로 확인합니다.</strong>
        <div className="muted">
          메인 테이블에서 행을 클릭하면 업무 판단 상태, 쿠팡 원본 상태, CS·클레임 신호를 같은 순서로 묶어서 보여줍니다.
        </div>
      </aside>
    );
  }

  const actionLabels = decision
    ? decision.allowedActions
        .map((action: FulfillmentDecisionPresentation["allowedActions"][number]) => ACTION_LABELS[action])
        .filter((label): label is string => Boolean(label))
    : [];

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

      {decision ? (
        <div className="shipment-hub-side-panel-hero">
          <div className="hero-badges">
            <span className={decision.toneClassName}>{decision.statusLabel}</span>
            <span className="shipment-decision-reason-pill">{decision.reasonLabel}</span>
          </div>
          <div className="shipment-hub-side-panel-summary">{decision.description}</div>
        </div>
      ) : null}

      {isLoading ? <div className="feedback">상세 정보를 불러오는 중입니다...</div> : null}
      {errorMessage ? <div className="feedback error">{errorMessage}</div> : null}

      <section className="shipment-hub-side-panel-section">
        <div className="shipment-hub-side-panel-section-label">3층 상태</div>
        <div className="shipment-hub-side-panel-status-list">
          <div className="shipment-hub-side-panel-status-item">
            <span className="shipment-hub-side-panel-status-name">업무 판단 상태</span>
            <div className="shipment-hub-side-panel-status-value">
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
          <div className="shipment-hub-side-panel-status-item">
            <span className="shipment-hub-side-panel-status-name">쿠팡 원본 상태</span>
            <div className="shipment-hub-side-panel-status-value">{originalStatusLabel || "-"}</div>
          </div>
          <div className="shipment-hub-side-panel-status-item">
            <span className="shipment-hub-side-panel-status-name">CS · 클레임 신호</span>
            <div className="shipment-hub-side-panel-status-stack">
              {customerServiceSignalLabels.length ? (
                  <div className="shipment-hub-side-panel-chip-row">
                  {customerServiceSignalLabels.map((label: string) => (
                    <span key={label} className="shipment-hub-side-panel-chip">
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="shipment-hub-side-panel-muted">신호 없음</span>
              )}
              {customerServiceStateLabel ? (
                <span className="muted">CS snapshot: {customerServiceStateLabel}</span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="shipment-hub-side-panel-section">
        <div className="shipment-hub-side-panel-section-label">현재 할 수 있는 액션</div>
        {actionLabels.length ? (
          <div className="shipment-hub-side-panel-chip-row">
            {actionLabels.map((label) => (
              <span key={label} className="shipment-hub-side-panel-chip strong">
                {label}
              </span>
            ))}
          </div>
        ) : (
          <div className="shipment-hub-side-panel-muted">지금 바로 실행할 수 있는 액션이 없습니다.</div>
        )}
      </section>

      <section className="shipment-hub-side-panel-section">
        <div className="shipment-hub-side-panel-section-label">판단 근거</div>
        <div className="shipment-hub-side-panel-info-grid">
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
            <span className="shipment-hub-side-panel-info-name">리스크 요약</span>
            <div className="shipment-hub-side-panel-info-value">
              {riskSummary.length ? (
                <div className="shipment-hub-side-panel-chip-row">
                  {riskSummary.map((risk) => (
                    <span key={risk} className="shipment-hub-side-panel-chip">
                      {risk}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="shipment-hub-side-panel-muted">추가 경고 없음</span>
              )}
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
        <summary>원본 상세 / 최근 상태 펼치기</summary>
        <div className="shipment-hub-side-panel-foldout-body">
          {renderInfoRows("판단 상세", statusRows)}
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
