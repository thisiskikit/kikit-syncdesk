import type { OperationLogRecord } from "@shared/logs";
import type { OperationTicketDetail, OperationTicketDetailState } from "@shared/operations";
import { getOperationPayloadPreview } from "@shared/operations";

function getOperationTicketResultLabel(result: OperationTicketDetail["result"]) {
  if (result === "error") {
    return "실패";
  }
  if (result === "warning") {
    return "경고";
  }
  if (result === "skipped") {
    return "건너뜀";
  }
  return "성공";
}

function getOperationTicketResultTone(result: OperationTicketDetail["result"]) {
  if (result === "error") {
    return "failed";
  }
  if (result === "warning") {
    return "attention";
  }
  if (result === "skipped") {
    return "draft";
  }
  return "success";
}

function getOperationTicketPrimaryId(ticket: OperationTicketDetail) {
  return (
    ticket.selpickOrderNumber ??
    ticket.productOrderNumber ??
    ticket.shipmentBoxId ??
    ticket.orderId ??
    ticket.receiptId ??
    ticket.targetId ??
    ticket.sourceKey ??
    "-"
  );
}

function buildOperationTicketMeta(ticket: OperationTicketDetail) {
  const parts: string[] = [];
  if (ticket.productName) {
    parts.push(ticket.productName);
  }
  if (ticket.receiverName) {
    parts.push(ticket.receiverName);
  }
  if (ticket.deliveryCompanyCode || ticket.invoiceNumber) {
    parts.push([ticket.deliveryCompanyCode, ticket.invoiceNumber].filter(Boolean).join(" / "));
  }
  if (ticket.sourceKey) {
    parts.push(`sourceKey ${ticket.sourceKey}`);
  }
  return parts;
}

type OperationCenterOperationDetailSectionsProps = {
  entry: OperationLogRecord;
  ticketState: OperationTicketDetailState | null;
  formatJson: (value: unknown) => string;
};

export default function OperationCenterOperationDetailSections({
  entry,
  ticketState,
  formatJson,
}: OperationCenterOperationDetailSectionsProps) {
  return (
    <div className="work-center-detail-sections">
      {ticketState && ticketState.items.length ? (
        <details className="work-center-detail-foldout" open>
          <summary>작업 티켓 상세</summary>
          <div className="detail-box">
            <p className="muted" style={{ marginTop: 0 }}>
              총 {ticketState.totalCount}건 중 {ticketState.recordedCount}건만 상세 기록합니다.
              {ticketState.truncated
                ? " 실패·경고·건너뜀을 우선 기록했고 나머지 성공 건은 생략했습니다."
                : ""}
            </p>
            <div className="work-center-ticket-list">
              {ticketState.items.map((ticket, index) => (
                <div
                  key={`${ticket.targetId ?? ticket.sourceKey ?? "ticket"}-${index}`}
                  className="work-center-ticket-item"
                >
                  <div className="work-center-ticket-item-header">
                    <div className="table-cell-stack">
                      <strong>{getOperationTicketPrimaryId(ticket)}</strong>
                      {ticket.label ? (
                        <span className="work-center-ticket-item-label">{ticket.label}</span>
                      ) : null}
                    </div>
                    <span className={`status-pill ${getOperationTicketResultTone(ticket.result)}`}>
                      {getOperationTicketResultLabel(ticket.result)}
                    </span>
                  </div>
                  {ticket.message ? <p className="muted">{ticket.message}</p> : null}
                  {buildOperationTicketMeta(ticket).length ? (
                    <div className="work-center-ticket-item-meta">
                      {buildOperationTicketMeta(ticket).join(" · ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </details>
      ) : null}

      <details className="work-center-detail-foldout" open>
        <summary>요청 / 결과 요약</summary>
        <div className="detail-columns">
          <div className="detail-box">
            <strong>결과 요약</strong>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {formatJson(entry.operation.resultSummary)}
            </pre>
          </div>
          <div className="detail-box">
            <strong>오류 및 payload 미리보기</strong>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {formatJson({
                errorCode: entry.operation.errorCode,
                errorMessage: entry.operation.errorMessage,
                payloadPreview: getOperationPayloadPreview(entry.operation),
              })}
            </pre>
          </div>
        </div>
      </details>

      <details className="work-center-detail-foldout">
        <summary>원본 요청 payload</summary>
        <div className="detail-box">
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {formatJson(entry.operation.requestPayload)}
          </pre>
        </div>
      </details>

      <details className="work-center-detail-foldout">
        <summary>정규화 payload</summary>
        <div className="detail-box">
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {formatJson(entry.operation.normalizedPayload)}
          </pre>
        </div>
      </details>
    </div>
  );
}
