import type { ReactNode } from "react";

export function SortableHeaderButton(props: {
  label: ReactNode;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      className={`bulk-price-sort-button${props.active ? " active" : ""}`}
      type="button"
      onClick={props.onClick}
    >
      <span>{props.label}</span>
      <span className="bulk-price-sort-indicator" aria-hidden="true">
        {props.active ? (props.direction === "asc" ? "^" : "v") : "<>"}
      </span>
    </button>
  );
}
