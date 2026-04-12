import { formatNumber } from "@/lib/utils";

type ShipmentSelectionActionBarProps = {
  selectedRowsCount: number;
  selectedReadyRowsCount: number;
  selectedDecisionBlockedRowsCount: number;
  blockedDecisionSummary: string | null;
  transmitDisabled: boolean;
  downloadDisabled: boolean;
  onTransmit: () => void;
  onDownload: () => void;
  onClear: () => void;
};

export default function ShipmentSelectionActionBar({
  selectedRowsCount,
  selectedReadyRowsCount,
  selectedDecisionBlockedRowsCount,
  blockedDecisionSummary,
  transmitDisabled,
  downloadDisabled,
  onTransmit,
  onDownload,
  onClear,
}: ShipmentSelectionActionBarProps) {
  return (
    <div className="card shipment-selection-bar">
      <div>
        <strong>선택 주문 {formatNumber(selectedRowsCount)}건</strong>
        <div className="muted">
          즉시 실행 {formatNumber(selectedReadyRowsCount)}건 / 제외 또는 확인 필요 {formatNumber(selectedDecisionBlockedRowsCount)}건
        </div>
        {selectedDecisionBlockedRowsCount > 0 ? (
          <div className="muted shipment-selection-note">
            송장 전송은 실행 가능한 주문만 진행합니다. {blockedDecisionSummary ?? "확인 후 처리 대상"}은 자동 제외됩니다.
          </div>
        ) : null}
      </div>
      <div className="shipment-selection-actions">
        <button className="button secondary" onClick={onTransmit} disabled={transmitDisabled}>
          선택 주문 송장 전송
        </button>
        <button className="button ghost" onClick={onDownload} disabled={downloadDisabled}>
          선택 주문 다운로드
        </button>
        <button className="button ghost" onClick={onClear}>
          선택 해제
        </button>
      </div>
    </div>
  );
}
