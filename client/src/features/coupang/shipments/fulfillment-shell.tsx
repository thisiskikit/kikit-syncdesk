import type { ReactNode } from "react";

type FulfillmentShellProps = {
  toolbar: ReactNode;
  summary: ReactNode;
  activity: ReactNode;
  audit: ReactNode;
  selection: ReactNode;
  content: ReactNode;
  drawers: ReactNode;
};

export default function FulfillmentShell({
  toolbar,
  summary,
  activity,
  audit,
  selection,
  content,
  drawers,
}: FulfillmentShellProps) {
  return (
    <div className="page">
      {toolbar}
      {summary}
      {activity}
      {audit}
      {selection}
      {content}
      {drawers}
    </div>
  );
}
