import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import type { FulfillmentDecisionPresentation } from "./types";
import type { ShipmentDetailInfoRow } from "./shipment-detail-dialog";

function renderInfoRows(title: string, rows: ShipmentDetailInfoRow[]) {
  if (!rows.length) {
    return null;
  }

  return (
    <section className="shipment-decision-drawer-section" key={title}>
      <div className="shipment-decision-drawer-section-title">{title}</div>
      <div className="shipment-decision-drawer-info-grid">
        {rows.map((row) => (
          <div className="shipment-decision-drawer-info-row" key={`${title}:${row.label}`}>
            <span className="shipment-decision-drawer-info-label">{row.label}</span>
            <div className="shipment-decision-drawer-info-value">{row.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export interface ShipmentDecisionDrawerProps {
  isOpen: boolean;
  rowTitle: string;
  heroMeta: string;
  decision: FulfillmentDecisionPresentation | null;
  worksheetStatusValue: ReactNode;
  invoiceStatusValue: ReactNode;
  claimStatusValue: ReactNode;
  worksheetRows: ShipmentDetailInfoRow[];
  deliveryRows: ShipmentDetailInfoRow[];
  statusRows: ShipmentDetailInfoRow[];
  activityRows: ShipmentDetailInfoRow[];
  handoffGuide: {
    title: string;
    description: string;
    links: ReadonlyArray<{
      href: string;
      label: string;
      variant?: "secondary" | "ghost";
    }>;
  } | null;
  isLoading: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onOpenFullDetail: () => void;
}

export default function ShipmentDecisionDrawer(props: ShipmentDecisionDrawerProps) {
  if (!props.isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="shipment-decision-drawer-overlay" onMouseDown={props.onClose}>
      <aside
        className="product-library-drawer shipment-decision-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="출고 상세"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="shipment-decision-drawer-header">
          <div className="hero-badges">
            {props.decision ? (
              <>
                <span className={props.decision.toneClassName}>{props.decision.statusLabel}</span>
                <span className="shipment-decision-reason-pill">{props.decision.reasonLabel}</span>
              </>
            ) : null}
          </div>
          <div className="shipment-decision-drawer-header-main">
            <div>
              <h2>{props.rowTitle || "출고 상세"}</h2>
              <p>{props.heroMeta}</p>
            </div>
            <button type="button" className="button ghost" onClick={props.onClose}>
              닫기
            </button>
          </div>
          {props.decision ? (
            <div className="shipment-decision-drawer-summary">
              <strong>{props.decision.description}</strong>
              <div className="shipment-decision-drawer-meta-row">
                <div>
                  <span className="muted">워크시트 상태</span>
                  <div>{props.worksheetStatusValue}</div>
                </div>
                <div>
                  <span className="muted">송장 상태</span>
                  <div>{props.invoiceStatusValue}</div>
                </div>
                <div>
                  <span className="muted">CS 영향</span>
                  <div>{props.claimStatusValue}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shipment-decision-drawer-body">
          {props.isLoading ? <div className="empty">상세 정보를 불러오는 중입니다...</div> : null}
          {props.errorMessage ? <div className="feedback error">{props.errorMessage}</div> : null}
          {renderInfoRows("주문 정보", props.worksheetRows)}
          {renderInfoRows("배송 정보", props.deliveryRows)}
          {renderInfoRows("출고 판단", props.statusRows)}
          {renderInfoRows("최근 작업 / 실시간 상태", props.activityRows)}
          {props.handoffGuide ? (
            <section className="shipment-decision-drawer-section">
              <div className="shipment-decision-drawer-section-title">다음 운영 이동</div>
              <div className="shipment-decision-drawer-info-grid">
                <div className="shipment-decision-drawer-info-row">
                  <span className="shipment-decision-drawer-info-label">{props.handoffGuide.title}</span>
                  <div className="shipment-decision-drawer-info-value">
                    <div>{props.handoffGuide.description}</div>
                    <div className="shipment-decision-drawer-actions" style={{ marginTop: "0.75rem" }}>
                      {props.handoffGuide.links.map((link) => (
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
              </div>
            </section>
          ) : null}

          <details className="shipment-decision-drawer-foldout">
            <summary>원본 상세 / 클레임 / 기술 로그 보기</summary>
            <p className="muted">
              긴 상세 정보와 원본 이력은 별도 상세 화면으로 내려 보관합니다. 메인 목록에서는 판단과 실행에 필요한 정보만
              먼저 확인합니다.
            </p>
            <div className="shipment-decision-drawer-actions">
              <button type="button" className="button secondary" onClick={props.onOpenFullDetail}>
                전체 상세 열기
              </button>
              <WorkspaceEntryLink href="/cs" className="button ghost" workspaceBehavior="tab">
                CS 허브 열기
              </WorkspaceEntryLink>
            </div>
          </details>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
