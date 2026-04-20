import { createPortal } from "react-dom";

import type { CoupangShipmentWorksheetAuditMissingResponse } from "@shared/coupang";

import {
  formatShipmentWorksheetAuditAutoAppliedAction,
  formatShipmentWorksheetAuditExceptionReason,
  formatShipmentWorksheetAuditHiddenReason,
} from "./shipment-audit-missing";

export interface ShipmentAuditMissingDialogProps {
  isOpen: boolean;
  result: CoupangShipmentWorksheetAuditMissingResponse | null;
  onClose: () => void;
}

function SummaryCard(props: { label: string; value: number; helper?: string | null }) {
  return (
    <div className="detail-card">
      <strong>{props.label}</strong>
      <p>{props.value}건</p>
      {props.helper ? <div className="table-note">{props.helper}</div> : null}
    </div>
  );
}

export default function ShipmentAuditMissingDialog(props: ShipmentAuditMissingDialogProps) {
  if (!props.isOpen || !props.result || typeof document === "undefined") {
    return null;
  }

  const { result } = props;

  return createPortal(
    <div className="csv-overlay" onMouseDown={props.onClose}>
      <div
        className="csv-dialog detail-dialog"
        style={{ maxWidth: 1180 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-box-header">
          <div>
            <h3 style={{ margin: 0 }}>쿠팡 누락 검수 자동 반영</h3>
            <p className="muted" style={{ marginTop: 8 }}>
              live ACCEPT/INSTRUCT 주문을 기준으로 정상 행은 자동 반영하고, 자동 처리할 수 없는
              예외만 남겨 보여줍니다.
            </p>
            {result.message ? <p className="muted">{result.message}</p> : null}
          </div>
          <div className="detail-actions">
            <button className="button secondary" onClick={props.onClose}>
              닫기
            </button>
          </div>
        </div>

        <div className="detail-grid" style={{ marginBottom: 16 }}>
          <SummaryCard label="live 주문" value={result.liveCount} />
          <SummaryCard label="worksheet 매칭" value={result.worksheetMatchedCount} />
          <SummaryCard
            label="자동 반영"
            value={result.autoAppliedCount}
            helper={result.restoredCount > 0 ? `보관함 복구 ${result.restoredCount}건 포함` : null}
          />
          <SummaryCard label="예외" value={result.exceptionCount} />
          <SummaryCard label="현재 뷰 숨김" value={result.hiddenInfoCount} />
        </div>

        <div className="detail-box" style={{ marginBottom: 16 }}>
          <div className="detail-box-header">
            <div>
              <strong>예외 항목</strong>
              <div className="table-note">
                자동 반영하지 못한 주문만 남습니다. 사용자가 실제로 확인해야 하는 대상입니다.
              </div>
            </div>
          </div>
          {result.exceptionItems.length ? (
            <div className="shipment-detail-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>예외 사유</th>
                    <th>상태</th>
                    <th>상품</th>
                    <th>shipmentBoxId</th>
                    <th>orderId</th>
                    <th>메시지</th>
                  </tr>
                </thead>
                <tbody>
                  {result.exceptionItems.map((item) => (
                    <tr key={`${item.sourceKey}:${item.reasonCode}`}>
                      <td>{formatShipmentWorksheetAuditExceptionReason(item.reasonCode)}</td>
                      <td>{item.status ?? "-"}</td>
                      <td>{item.productName}</td>
                      <td>{item.shipmentBoxId ?? "-"}</td>
                      <td>{item.orderId ?? "-"}</td>
                      <td>{item.message ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted">예외로 남은 주문이 없습니다.</div>
          )}
        </div>

        <div className="detail-box" style={{ marginBottom: 16 }}>
          <div className="detail-box-header">
            <div>
              <strong>자동 반영 프리뷰</strong>
              <div className="table-note">
                상태 자동 갱신, worksheet 자동 추가, 보관함 복구를 여기서 확인할 수 있습니다.
              </div>
            </div>
          </div>
          {result.autoAppliedItems.length ? (
            <div className="shipment-detail-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>반영 방식</th>
                    <th>상태</th>
                    <th>상품</th>
                    <th>shipmentBoxId</th>
                    <th>orderId</th>
                  </tr>
                </thead>
                <tbody>
                  {result.autoAppliedItems.slice(0, 10).map((item) => (
                    <tr key={`${item.sourceKey}:${item.action}`}>
                      <td>{formatShipmentWorksheetAuditAutoAppliedAction(item.action)}</td>
                      <td>{item.status ?? "-"}</td>
                      <td>{item.productName}</td>
                      <td>{item.shipmentBoxId}</td>
                      <td>{item.orderId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted">이번 검수에서 자동 반영된 주문이 없습니다.</div>
          )}
        </div>

        {result.hiddenItems.length ? (
          <details className="detail-box">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>현재 뷰 숨김 정보</summary>
            <div className="table-note" style={{ marginTop: 8 }}>
              worksheet에는 있지만 현재 scope 또는 검색/카드 필터 때문에 화면에서 보이지 않는
              주문입니다. 정보용이며 작업을 막지 않습니다.
            </div>
            <div className="shipment-detail-table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>숨김 사유</th>
                    <th>상태</th>
                    <th>상품</th>
                    <th>rowId</th>
                    <th>sourceKey</th>
                  </tr>
                </thead>
                <tbody>
                  {result.hiddenItems.map((item) => (
                    <tr key={item.rowId}>
                      <td>{formatShipmentWorksheetAuditHiddenReason(item.hiddenReason)}</td>
                      <td>{item.status ?? "-"}</td>
                      <td>{item.productName}</td>
                      <td>{item.rowId}</td>
                      <td>{item.sourceKey}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
