import type { ReactNode } from "react";

export function CollapsibleSection(props: {
  title: ReactNode;
  description?: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={props.className}>
      <div className="collapsible-section-header">
        <div className="collapsible-section-heading">
          <div className="collapsible-section-title">{props.title}</div>
          {props.description ? <div className="muted">{props.description}</div> : null}
          {props.summary ? <div className="collapsible-section-summary">{props.summary}</div> : null}
        </div>

        <div className="collapsible-section-controls">
          {props.actions}
          <button
            className="button ghost collapsible-section-toggle"
            type="button"
            onClick={props.onToggle}
            aria-expanded={props.isOpen}
          >
            {props.isOpen ? "접기" : "펼치기"}
          </button>
        </div>
      </div>

      {props.isOpen ? (
        <div className={props.bodyClassName ?? "collapsible-section-body"}>{props.children}</div>
      ) : null}
    </div>
  );
}
