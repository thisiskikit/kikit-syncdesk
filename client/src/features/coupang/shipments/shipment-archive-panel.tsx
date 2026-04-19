import { formatNumber } from "@/lib/utils";
import type { CoupangShipmentArchiveRow } from "@shared/coupang";

type ArchiveStatusPresentation = {
  orderLabel: string;
  orderToneClassName: string;
};

type ShipmentArchivePanelProps = {
  detailGuideNotice: string;
  isLoading: boolean;
  totalRowCount: number;
  filteredRowCount: number;
  rows: readonly CoupangShipmentArchiveRow[];
  archivePage: number;
  archiveTotalPages: number;
  worksheetPageSize: number;
  pageSizeOptions: readonly number[];
  onPageSizeChange: (pageSize: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  getStatusPresentation: (row: CoupangShipmentArchiveRow) => ArchiveStatusPresentation;
  getArchiveReasonLabel: (row: CoupangShipmentArchiveRow) => string;
  formatDateTimeLabel: (value: string | null | undefined) => string;
  formatInvoiceText: (row: CoupangShipmentArchiveRow) => string;
  onOpenDetail: (row: CoupangShipmentArchiveRow) => void;
};

export default function ShipmentArchivePanel({
  detailGuideNotice,
  isLoading,
  totalRowCount,
  filteredRowCount,
  rows,
  archivePage,
  archiveTotalPages,
  worksheetPageSize,
  pageSizeOptions,
  onPageSizeChange,
  onPrevPage,
  onNextPage,
  getStatusPresentation,
  getArchiveReasonLabel,
  formatDateTimeLabel,
  formatInvoiceText,
  onOpenDetail,
}: ShipmentArchivePanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 style={{ margin: 0 }}>보관함</h2>
          <div className="muted shipment-grid-note">
            출력 완료 후 30일이 지난 일반 배송 주문과 완료된 취소/반품 주문이 이곳으로 이동합니다.
            보관함은 읽기 전용입니다.
          </div>
          <div className="muted shipment-grid-note">{detailGuideNotice}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="empty">보관함을 불러오는 중입니다...</div>
      ) : !totalRowCount ? (
        <div className="empty">현재 보관함에 저장된 주문이 없습니다.</div>
      ) : !rows.length ? (
        <div className="empty">현재 검색 조건에 맞는 보관 주문이 없습니다.</div>
      ) : (
        <>
          <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div className="selection-summary">
              전체 {formatNumber(filteredRowCount)}행 · 현재 페이지 {formatNumber(rows.length)}행 · {archivePage} /{" "}
              {archiveTotalPages} 페이지
            </div>
            <div className="toolbar" style={{ gap: "0.5rem" }}>
              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span className="muted">보기 행 수</span>
                <select
                  value={worksheetPageSize}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}행
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button ghost"
                onClick={onPrevPage}
                disabled={archivePage <= 1}
              >
                이전
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={onNextPage}
                disabled={archivePage >= archiveTotalPages}
              >
                다음
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>보관일시</th>
                  <th>주문일시</th>
                  <th>상태</th>
                  <th>상품명</th>
                  <th>수령자</th>
                  <th>송장</th>
                  <th>출력</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const statusPresentation = getStatusPresentation(row);

                  return (
                    <tr key={row.id}>
                      <td>{formatDateTimeLabel(row.archivedAt)}</td>
                      <td>{formatDateTimeLabel(row.orderedAtRaw)}</td>
                      <td>
                        <div className="table-cell-stack">
                          <span className={`status-pill ${statusPresentation.orderToneClassName}`}>
                            {statusPresentation.orderLabel}
                          </span>
                          <span className="muted">{getArchiveReasonLabel(row)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-cell-stack">
                          <strong>{row.exposedProductName || row.productName || "-"}</strong>
                          <span className="muted">{row.optionName || row.productOrderNumber || row.orderId}</span>
                        </div>
                      </td>
                      <td>{row.receiverName || "-"}</td>
                      <td>{formatInvoiceText(row)}</td>
                      <td>{row.exportedAt ? formatDateTimeLabel(row.exportedAt) : "미출력"}</td>
                      <td className="table-action-cell">
                        <button className="button ghost" onClick={() => onOpenDetail(row)}>
                          상세
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
