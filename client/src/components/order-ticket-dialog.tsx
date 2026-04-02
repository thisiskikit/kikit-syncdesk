import { useEffect, useState, type ReactNode } from "react";

type OrderTicketTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function OrderTicketDialog(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  tabs: OrderTicketTab[];
  headerAside?: ReactNode;
  onClose: () => void;
}) {
  const [activeTabId, setActiveTabId] = useState(props.tabs[0]?.id ?? "");

  useEffect(() => {
    if (!props.open) {
      return;
    }

    setActiveTabId((current) =>
      props.tabs.some((tab) => tab.id === current) ? current : (props.tabs[0]?.id ?? ""),
    );
  }, [props.open, props.tabs]);

  if (!props.open) {
    return null;
  }

  const activeTab = props.tabs.find((tab) => tab.id === activeTabId) ?? props.tabs[0] ?? null;

  return (
    <div className="csv-overlay" onMouseDown={props.onClose}>
      <div
        className="csv-dialog detail-dialog order-ticket-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="order-ticket-header">
          <div className="order-ticket-title-block">
            <strong className="order-ticket-title">{props.title}</strong>
            {props.subtitle ? <div className="muted">{props.subtitle}</div> : null}
          </div>
          <div className="order-ticket-header-actions">
            {props.headerAside}
            <button
              type="button"
              className="order-ticket-close"
              aria-label="닫기"
              onClick={props.onClose}
            >
              ×
            </button>
          </div>
        </div>

        {props.tabs.length > 1 ? (
          <div className="order-ticket-tabs" role="tablist" aria-label="주문 상세 탭">
            {props.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={`order-ticket-tab ${tab.id === activeTab?.id ? "active" : ""}`}
                aria-selected={tab.id === activeTab?.id}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="order-ticket-body">{activeTab?.content}</div>

        <div className="order-ticket-footer">
          <button type="button" className="button secondary" onClick={props.onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
