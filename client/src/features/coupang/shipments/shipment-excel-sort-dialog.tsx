import { createPortal } from "react-dom";
import { formatNumber } from "@/lib/utils";
import type { ShipmentExcelExportScope, ShipmentExcelSortKey } from "./types";

export interface ShipmentExcelSortDialogProps {
  isOpen: boolean;
  exportScope: ShipmentExcelExportScope;
  targetRowCount: number;
  blockedClaimCount: number;
  onClose: () => void;
  onApply: (sortKey: ShipmentExcelSortKey) => void;
  getScopeLabel: (scope: ShipmentExcelExportScope) => string;
}

export default function ShipmentExcelSortDialog(props: ShipmentExcelSortDialogProps) {
  if (!props.isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="csv-overlay" onMouseDown={props.onClose}>
      <div
        className="csv-dialog shipment-export-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <h3 style={{ margin: 0 }}>엑셀 정렬 기준 선택</h3>
          <p className="muted shipment-export-dialog-note">
            {props.getScopeLabel(props.exportScope)} {formatNumber(props.targetRowCount)}행을 엑셀로
            내보내기 전에 정렬 기준을 선택해 주세요.
          </p>
          {props.blockedClaimCount > 0 ? (
            <p className="muted shipment-export-dialog-note">
              {props.exportScope === "selected"
                ? `클레임 ${formatNumber(props.blockedClaimCount)}건은 엑셀 다운로드에서 자동 제외됩니다.`
                : "클레임 주문은 실제 다운로드 대상 계산에서 자동 제외됩니다."}
            </p>
          ) : null}
        </div>
        <div className="shipment-export-dialog-options">
          <button
            type="button"
            className="button shipment-export-dialog-option"
            onClick={() => props.onApply("productName")}
          >
            상품명순으로 내보내기
          </button>
          <button
            type="button"
            className="button secondary shipment-export-dialog-option"
            onClick={() => props.onApply("date")}
          >
            날짜순으로 내보내기
          </button>
        </div>
        <div className="toolbar" style={{ justifyContent: "flex-end" }}>
          <button className="button secondary" onClick={props.onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
