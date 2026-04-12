import { createPortal } from "react-dom";

import type { CoupangShipmentWorksheetAuditMissingResponse } from "@shared/coupang";

import { formatShipmentWorksheetAuditHiddenReason } from "./shipment-audit-missing";

export interface ShipmentAuditMissingDialogProps {
  isOpen: boolean;
  result: CoupangShipmentWorksheetAuditMissingResponse | null;
  onClose: () => void;
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
        style={{ maxWidth: 1080 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-box-header">
          <div>
            <h3 style={{ margin: 0 }}>쿠팡 배송/송장 누락 검수</h3>
            <p className="muted" style={{ marginTop: 8 }}>
              live 상품준비중/주문접수 주문과 현재 worksheet를 비교해 누락 주문과 현재 화면에서 숨겨진 주문을
              분리해서 보여줍니다.
            </p>
          </div>
          <div className="detail-actions">
            <button className="button secondary" onClick={props.onClose}>
              닫기
            </button>
          </div>
        </div>

        <div className="detail-grid" style={{ marginBottom: 16 }}>
          <div className="detail-card">
            <strong>live 주문</strong>
            <p>{result.liveCount}건</p>
          </div>
          <div className="detail-card">
            <strong>worksheet 매칭</strong>
            <p>{result.worksheetMatchedCount}건</p>
          </div>
          <div className="detail-card">
            <strong>누락</strong>
            <p>{result.missingCount}건</p>
          </div>
          <div className="detail-card">
            <strong>현재 뷰 숨김</strong>
            <p>{result.hiddenCount}건</p>
          </div>
        </div>

        <div className="detail-box" style={{ marginBottom: 16 }}>
          <div className="detail-box-header">
            <div>
              <strong>누락 주문</strong>
              <div className="table-note">쿠팡 live에는 있지만 현재 worksheet에는 없는 주문입니다.</div>
            </div>
          </div>
          {result.missingItems.length ? (
            <div className="shipment-detail-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>상태</th>
                    <th>상품</th>
                    <th>shipmentBoxId</th>
                    <th>orderId</th>
                    <th>vendorItemId</th>
                    <th>orderedAt</th>
                  </tr>
                </thead>
                <tbody>
                  {result.missingItems.map((item) => (
                    <tr key={item.sourceKey}>
                      <td>{item.status ?? "-"}</td>
                      <td>{item.productName}</td>
                      <td>{item.shipmentBoxId}</td>
                      <td>{item.orderId}</td>
                      <td>{item.vendorItemId ?? "-"}</td>
                      <td>{item.orderedAt ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted">누락으로 확인된 주문이 없습니다.</div>
          )}
        </div>

        <div className="detail-box">
          <div className="detail-box-header">
            <div>
              <strong>현재 뷰 숨김</strong>
              <div className="table-note">
                worksheet에는 있지만 현재 scope 또는 검색/카드 필터 때문에 화면에 보이지 않는 주문입니다.
              </div>
            </div>
          </div>
          {result.hiddenItems.length ? (
            <div className="shipment-detail-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>숨김 이유</th>
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
          ) : (
            <div className="muted">현재 화면 조건 때문에 숨겨진 live 주문은 없습니다.</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
