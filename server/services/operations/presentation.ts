import type { LogEntry } from "@shared/logs";
import type { OperationLogEntry, OperationResultSummary } from "@shared/operations";

const MAX_SUMMARY_TARGET_IDS = 10;
const MAX_SUMMARY_TEXT_LENGTH = 320;

function compactText(value: string | null | undefined, maxLength = MAX_SUMMARY_TEXT_LENGTH) {
  if (!value) {
    return null;
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

export function compactOperationResultSummary(
  summary: OperationResultSummary | null,
): OperationResultSummary | null {
  if (!summary) {
    return null;
  }

  return {
    headline: compactText(summary.headline),
    detail: compactText(summary.detail),
    preview: compactText(summary.preview),
    stats: null,
  };
}

export function compactOperationEntry(operation: OperationLogEntry): OperationLogEntry {
  return {
    ...operation,
    targetIds: operation.targetIds.slice(0, MAX_SUMMARY_TARGET_IDS),
    requestPayload: null,
    normalizedPayload: null,
    resultSummary: compactOperationResultSummary(operation.resultSummary),
    errorMessage: compactText(operation.errorMessage),
  };
}

export function compactLogEntry(entry: LogEntry): LogEntry {
  if (entry.kind !== "operation") {
    return entry;
  }

  return {
    ...entry,
    message: compactText(entry.message),
    operation: compactOperationEntry(entry.operation),
  };
}
