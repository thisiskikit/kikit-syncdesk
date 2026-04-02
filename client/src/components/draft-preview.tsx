import type { DraftPreviewRow } from "@shared/channel-control";
import { formatNumber } from "@/lib/utils";

interface DraftPreviewProps {
  rows: DraftPreviewRow[];
}

export function DraftPreview(props: DraftPreviewProps) {
  if (props.rows.length === 0) {
    return <div className="empty">아직 draft item이 없습니다.</div>;
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>실행 전 미리보기</h3>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {props.rows.map((row) => (
          <div key={row.draftItemId} className="card" style={{ padding: "0.85rem" }}>
            <div className={`status-pill ${row.validationStatus}`}>{row.validationStatus}</div>
            <div style={{ marginTop: "0.65rem", fontWeight: 600 }}>
              {row.current?.productName ?? "미매칭 옵션"} / {row.current?.optionName ?? row.draftItemId}
            </div>
            <div className="muted" style={{ marginTop: "0.35rem" }}>
              {`가격 ${formatNumber(row.current?.price)} -> ${formatNumber(row.next.price)} / 재고 ${formatNumber(row.current?.stockQuantity)} -> ${formatNumber(row.next.stockQuantity)}`}
            </div>
            <div className="muted">
              {`판매 ${row.current?.saleStatus ?? "-"} -> ${row.next.saleStatus ?? "-"} / 품절 ${row.current?.soldOutStatus ?? "-"} -> ${row.next.soldOutStatus ?? "-"}`}
            </div>
            {row.messages.length > 0 ? (
              <ul className="messages">
                {row.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
