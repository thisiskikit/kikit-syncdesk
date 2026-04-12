import clsx from "clsx";

type StatusBadgeTone = "live" | "draft" | "coming" | "shared";

const labelMap: Record<StatusBadgeTone, string> = {
  live: "운영중",
  draft: "초안",
  coming: "준비중",
  shared: "공통",
};

export function StatusBadge(props: { tone: StatusBadgeTone; label?: string }) {
  return <span className={clsx("module-badge", props.tone)}>{props.label ?? labelMap[props.tone]}</span>;
}
