import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { OrderTicketSection, TicketInfoTable } from "@/components/order-ticket-sections";

export interface ShipmentDetailInfoRow {
  label: string;
  value: ReactNode;
}

export interface ShipmentDetailTableRow {
  key: string;
  cells: ReactNode[];
}

export interface ShipmentDetailTable {
  title: string;
  headers: string[];
  rows: ShipmentDetailTableRow[];
}

export interface ShipmentDetailClaimCardSection {
  title: string;
  rows: ShipmentDetailInfoRow[];
}

export interface ShipmentDetailClaimCardView {
  id: string;
  title: string;
  subtitle: string;
  statusText: string;
  sections: ShipmentDetailClaimCardSection[];
  tables: ShipmentDetailTable[];
}

export interface ShipmentDetailDialogProps {
  isOpen: boolean;
  rowTitle: string;
  heroMeta: string;
  worksheetStatusValue: ReactNode;
  invoiceStatusValue: ReactNode;
  claimStatusValue: ReactNode;
  worksheetRows: ShipmentDetailInfoRow[];
  deliveryRows: ShipmentDetailInfoRow[];
  statusRows: ShipmentDetailInfoRow[];
  isLoading: boolean;
  errorMessage: string | null;
  warningTitle: string | null;
  warningMessage: string | null;
  realtimeOrderRows: ShipmentDetailInfoRow[];
  orderItemsTable: ShipmentDetailTable | null;
  returnSummaryText: string;
  returnClaims: ShipmentDetailClaimCardView[];
  exchangeSummaryText: string;
  exchangeClaims: ShipmentDetailClaimCardView[];
  onClose: () => void;
}

function renderTable(table: ShipmentDetailTable) {
  return (
    <div className="shipment-detail-claim-table" key={table.title}>
      <strong>{table.title}</strong>
      <table className="table">
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td key={`${row.key}:${index}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderClaimCard(card: ShipmentDetailClaimCardView) {
  return (
    <div key={card.id} className="detail-card shipment-detail-claim-card">
      <div className="detail-box-header">
        <div>
          <strong>{card.title}</strong>
          <div className="table-note">{card.subtitle}</div>
        </div>
        <div className="muted">{card.statusText}</div>
      </div>

      <div className="detail-grid">
        {card.sections.map((section) => (
          <div key={section.title} className="detail-card">
            <strong>{section.title}</strong>
            {section.rows.map((row) => (
              <p key={`${section.title}:${row.label}`}>
                {row.label}: {row.value}
              </p>
            ))}
          </div>
        ))}
      </div>

      {card.tables.map(renderTable)}
    </div>
  );
}

export default function ShipmentDetailDialog(props: ShipmentDetailDialogProps) {
  if (!props.isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="csv-overlay" onMouseDown={props.onClose}>
      <div
        className="csv-dialog detail-dialog shipment-detail-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-box-header">
          <div className="shipment-detail-header-stack">
            <div>
              <h3 className="shipment-detail-title">셀픽 워크시트 상세</h3>
              <p className="muted shipment-detail-dialog-note">
                메모, 현재 상태, 쿠팡 주문 상세와 클레임 내용을 한 번에 확인합니다.
              </p>
            </div>

            <div className="shipment-detail-hero">
              <div className="shipment-detail-hero-copy">
                <div className="shipment-detail-hero-eyebrow">워크시트 행 요약</div>
                <strong className="shipment-detail-hero-title">{props.rowTitle}</strong>
                <div className="shipment-detail-hero-meta">{props.heroMeta}</div>
              </div>
              <div className="shipment-detail-hero-badges">
                <div className="shipment-detail-hero-badge">
                  <span className="shipment-detail-hero-badge-label">워크시트</span>
                  {props.worksheetStatusValue}
                </div>
                <div className="shipment-detail-hero-badge">
                  <span className="shipment-detail-hero-badge-label">송장</span>
                  {props.invoiceStatusValue}
                </div>
                <div className="shipment-detail-hero-badge">
                  <span className="shipment-detail-hero-badge-label">클레임</span>
                  {props.claimStatusValue}
                </div>
              </div>
            </div>
          </div>
          <div className="detail-actions">
            <button className="button secondary" onClick={props.onClose}>
              닫기
            </button>
          </div>
        </div>

        <div className="shipment-detail-section-grid">
          <OrderTicketSection title="주문 정보">
            <TicketInfoTable rows={props.worksheetRows} />
          </OrderTicketSection>

          <OrderTicketSection title="배송 정보">
            <TicketInfoTable rows={props.deliveryRows} />
          </OrderTicketSection>

          <OrderTicketSection title="상태 / 메모">
            <TicketInfoTable rows={props.statusRows} />
          </OrderTicketSection>
        </div>

        {props.isLoading ? (
          <div className="empty">쿠팡 주문 상세와 클레임 정보를 불러오는 중입니다...</div>
        ) : props.errorMessage ? (
          <div className="feedback error">
            <strong>상세 정보를 불러오지 못했습니다.</strong>
            <div>{props.errorMessage}</div>
          </div>
        ) : (
          <>
            {props.warningTitle && props.warningMessage ? (
              <div className="feedback warning">
                <strong>{props.warningTitle}</strong>
                <div>{props.warningMessage}</div>
              </div>
            ) : null}

            <div className="shipment-detail-section-grid">
              <OrderTicketSection title="실시간 주문 상세">
                <TicketInfoTable rows={props.realtimeOrderRows} />
              </OrderTicketSection>

              <OrderTicketSection title="주문 상품">
                {props.orderItemsTable?.rows.length ? (
                  <div className="shipment-detail-table-wrap">{renderTable(props.orderItemsTable)}</div>
                ) : (
                  <div className="muted">실시간 주문 상품 상세가 없습니다.</div>
                )}
              </OrderTicketSection>
            </div>

            <div className="detail-box">
              <div className="detail-box-header">
                <div>
                  <strong>취소 / 반품 클레임</strong>
                  <div className="table-note">{props.returnSummaryText}</div>
                </div>
              </div>
              {props.returnClaims.length ? (
                <div className="shipment-detail-claim-list">
                  {props.returnClaims.map(renderClaimCard)}
                </div>
              ) : (
                <div className="muted">현재 확인된 취소/반품 클레임이 없습니다.</div>
              )}
            </div>

            <div className="detail-box">
              <div className="detail-box-header">
                <div>
                  <strong>교환 클레임</strong>
                  <div className="table-note">{props.exchangeSummaryText}</div>
                </div>
              </div>
              {props.exchangeClaims.length ? (
                <div className="shipment-detail-claim-list">
                  {props.exchangeClaims.map(renderClaimCard)}
                </div>
              ) : (
                <div className="muted">현재 확인된 교환 클레임이 없습니다.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
