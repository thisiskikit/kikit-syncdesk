type SummaryCounts = {
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  warningCount?: number;
};

type SummaryStatusCounts = Pick<
  SummaryCounts,
  "failedCount" | "skippedCount" | "warningCount"
>;

export function buildOperationSummaryText(summary: SummaryCounts) {
  const parts = [`성공 ${summary.succeededCount}건`, `실패 ${summary.failedCount}건`];

  if (typeof summary.warningCount === "number") {
    parts.push(`경고 ${summary.warningCount}건`);
  }

  parts.push(`건너뜀 ${summary.skippedCount}건`);
  return parts.join(" / ");
}

export function resolveTrackedOperationStatus(summary: SummaryStatusCounts) {
  return summary.failedCount > 0 ||
    summary.skippedCount > 0 ||
    (typeof summary.warningCount === "number" && summary.warningCount > 0)
    ? "warning"
    : "success";
}
