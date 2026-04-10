import { createPortal } from "react-dom";

export interface ShipmentInvoiceInputDialogProps {
  isOpen: boolean;
  value: string;
  isBusy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
}

export default function ShipmentInvoiceInputDialog(props: ShipmentInvoiceInputDialogProps) {
  if (!props.isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="csv-overlay" onMouseDown={props.onClose}>
      <div
        className="csv-dialog shipment-invoice-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <h3 style={{ margin: 0 }}>송장 입력하기</h3>
          <p className="muted shipment-invoice-dialog-note">
            아래 형식으로 붙여넣으면 `셀픽주문번호` 기준으로 현재 워크시트의 `택배사`, `운송장번호`
            값을 채웁니다.
          </p>
        </div>
        <div className="shipment-invoice-dialog-example">
          <strong>입력 형식</strong>
          <pre>{`택배사\t운송장번호\t셀픽주문번호\nCJ대한통운\t123456789\tO20260326K0001`}</pre>
        </div>
        <textarea
          className="shipment-invoice-dialog-textarea"
          rows={12}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={"택배사\t운송장번호\t셀픽주문번호"}
        />
        <div className="toolbar" style={{ justifyContent: "flex-end" }}>
          <button className="button secondary" onClick={props.onClose}>
            닫기
          </button>
          <button
            className="button"
            onClick={props.onApply}
            disabled={!props.value.trim() || props.isBusy}
          >
            {props.isBusy ? "반영 중..." : "값 반영"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
