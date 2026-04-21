import {
  getLogEventTypeLabel,
  type LogEntry,
  type OperationLogRecord,
} from "@shared/logs";
import {
  getOperationActionLabel,
  getOperationErrorSummary,
  isOperationCancellationPending,
  operationCancelRequestedMessage,
  getOperationResultSummaryText,
  getOperationTicketDetailState,
  type OperationTicketDetailState,
} from "@shared/operations";

export type RecoveryLane = "retry-now" | "manual-check" | "monitor" | "done";

export type RecoveryDescriptor = {
  lane: RecoveryLane;
  label: string;
  toneClassName: "failed" | "attention" | "queued" | "success";
  hint: string;
  summary: string | null;
  groupKey: string;
  groupLabel: string;
  affectedCount: number | null;
  ticketState: OperationTicketDetailState | null;
  retryable: boolean;
};

export type RecoveryGroup = {
  key: string;
  label: string;
  hint: string;
  toneClassName: RecoveryDescriptor["toneClassName"];
  count: number;
  retryableCount: number;
  latestStartedAt: string;
  affectedCount: number;
};

export type OperationTicketResultCounts = {
  success: number;
  warning: number;
  error: number;
  skipped: number;
  actionable: number;
};

function normalizeGroupText(text: string | null | undefined) {
  return (text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function getEntrySummary(entry: LogEntry) {
  if (entry.kind === "operation") {
    return (
      getOperationErrorSummary(entry.operation) ??
      getOperationResultSummaryText(entry.operation.resultSummary) ??
      entry.message
    );
  }

  return entry.message;
}

function getTicketState(entry: LogEntry) {
  return entry.kind === "operation"
    ? getOperationTicketDetailState(entry.operation.resultSummary)
    : null;
}

function getAffectedCount(entry: LogEntry, ticketState: OperationTicketDetailState | null) {
  if (ticketState?.totalCount) {
    return ticketState.totalCount;
  }

  if (entry.kind === "operation" && entry.operation.targetCount > 0) {
    return entry.operation.targetCount;
  }

  return null;
}

function buildOperationGroupLabel(entry: OperationLogRecord, suffix: string) {
  return `${getOperationActionLabel(entry.operation.actionKey)} ${suffix}`;
}

export function buildRecoveryDescriptor(entry: LogEntry): RecoveryDescriptor {
  const summary = getEntrySummary(entry);
  const ticketState = getTicketState(entry);
  const affectedCount = getAffectedCount(entry, ticketState);
  const affectedLabel =
    affectedCount && affectedCount > 0 ? `${affectedCount}건 영향 범위를 먼저 확인하세요.` : null;

  if (entry.kind === "operation") {
    if (isOperationCancellationPending(entry.operation)) {
      return {
        lane: "monitor",
        label: "중단 요청",
        toneClassName: "attention",
        hint: operationCancelRequestedMessage,
        summary,
        groupKey: `cancel:${entry.operation.actionKey}`,
        groupLabel: buildOperationGroupLabel(entry, "중단 요청"),
        affectedCount,
        ticketState,
        retryable: false,
      };
    }

    if (entry.operation.retryable && (entry.status === "error" || entry.status === "warning")) {
      return {
        lane: "retry-now",
        label: entry.status === "error" ? "즉시 재시도" : "재시도 우선",
        toneClassName: entry.status === "error" ? "failed" : "attention",
        hint: affectedLabel ?? "원인 확인 후 바로 재시도할 수 있습니다.",
        summary,
        groupKey: `retry:${entry.operation.actionKey}:${normalizeGroupText(summary)}`,
        groupLabel: buildOperationGroupLabel(entry, "재시도"),
        affectedCount,
        ticketState,
        retryable: true,
      };
    }

    if (entry.status === "error" || entry.level === "error") {
      return {
        lane: "manual-check",
        label: "원인 확인",
        toneClassName: "failed",
        hint: affectedLabel ?? "실패 원인과 payload를 확인한 뒤 수동 조치가 필요합니다.",
        summary,
        groupKey: `check:${entry.operation.actionKey}:${normalizeGroupText(summary)}`,
        groupLabel: buildOperationGroupLabel(entry, "실패"),
        affectedCount,
        ticketState,
        retryable: false,
      };
    }

    if (entry.status === "warning" || entry.level === "warning" || entry.meta?.slow === true) {
      return {
        lane: "manual-check",
        label: entry.meta?.slow === true ? "지연 확인" : "경고 확인",
        toneClassName: "attention",
        hint:
          affectedLabel ??
          (entry.meta?.slow === true
            ? "외부 응답 지연과 재시도 필요 여부를 확인하세요."
            : "경고 사유를 확인하고 필요한 경우 재시도하세요."),
        summary,
        groupKey: `warn:${entry.operation.actionKey}:${normalizeGroupText(summary)}`,
        groupLabel: buildOperationGroupLabel(entry, "경고"),
        affectedCount,
        ticketState,
        retryable: entry.operation.retryable,
      };
    }

    if (entry.status === "running" || entry.status === "queued") {
      return {
        lane: "monitor",
        label: "진행 관찰",
        toneClassName: "queued",
        hint: "아직 처리 중입니다. 완료 후 결과를 다시 확인하세요.",
        summary,
        groupKey: `monitor:${entry.operation.actionKey}:${entry.status}`,
        groupLabel: buildOperationGroupLabel(entry, "진행"),
        affectedCount,
        ticketState,
        retryable: false,
      };
    }

    return {
      lane: "done",
      label: "완료",
      toneClassName: "success",
      hint: "복구 조치가 필요한 항목은 아닙니다.",
      summary,
      groupKey: `done:${entry.operation.actionKey}`,
      groupLabel: buildOperationGroupLabel(entry, "완료"),
      affectedCount,
      ticketState,
      retryable: false,
    };
  }

  if (entry.status === "error" || entry.level === "error") {
    return {
      lane: "manual-check",
      label: "시스템 확인",
      toneClassName: "failed",
      hint: "이벤트 메타와 연결 상태를 확인하세요.",
      summary,
      groupKey: `event:error:${entry.eventType}:${normalizeGroupText(summary)}`,
      groupLabel: `${getLogEventTypeLabel(entry.eventType)} 오류`,
      affectedCount,
      ticketState,
      retryable: false,
    };
  }

  if (entry.status === "warning" || entry.level === "warning" || entry.meta?.slow === true) {
    return {
      lane: "monitor",
      label: entry.meta?.slow === true ? "성능 관찰" : "경고 관찰",
      toneClassName: "attention",
      hint: "이벤트 추이를 확인하고 반복되면 원인을 추적하세요.",
      summary,
      groupKey: `event:warn:${entry.eventType}:${normalizeGroupText(summary)}`,
      groupLabel: `${getLogEventTypeLabel(entry.eventType)} 경고`,
      affectedCount,
      ticketState,
      retryable: false,
    };
  }

  return {
    lane: "done",
    label: "기록",
    toneClassName: "success",
    hint: "참고용 이벤트입니다.",
    summary,
    groupKey: `event:done:${entry.eventType}`,
    groupLabel: `${getLogEventTypeLabel(entry.eventType)} 기록`,
    affectedCount,
    ticketState,
    retryable: false,
  };
}

export function getEntryPriority(entry: LogEntry) {
  const descriptor = buildRecoveryDescriptor(entry);
  const laneScore =
    descriptor.lane === "retry-now"
      ? 90
      : descriptor.lane === "manual-check"
        ? 70
        : descriptor.lane === "monitor"
          ? 40
          : 10;
  const statusScore =
    entry.status === "error"
      ? 20
      : entry.status === "warning"
        ? 15
        : entry.status === "running"
          ? 10
          : entry.status === "queued"
            ? 5
            : 0;
  const retryScore = descriptor.retryable ? 10 : 0;
  const slowScore = entry.meta?.slow === true ? 5 : 0;

  return laneScore + statusScore + retryScore + slowScore;
}

export function buildRecoveryGroups(entries: readonly LogEntry[]) {
  const groups = new Map<string, RecoveryGroup>();

  for (const entry of entries) {
    const descriptor = buildRecoveryDescriptor(entry);
    if (descriptor.lane === "done") {
      continue;
    }

    const current = groups.get(descriptor.groupKey);
    const nextLatestStartedAt =
      current && new Date(current.latestStartedAt).getTime() > new Date(entry.startedAt).getTime()
        ? current.latestStartedAt
        : entry.startedAt;

    groups.set(descriptor.groupKey, {
      key: descriptor.groupKey,
      label: descriptor.groupLabel,
      hint: descriptor.summary ?? descriptor.hint,
      toneClassName: descriptor.toneClassName,
      count: (current?.count ?? 0) + 1,
      retryableCount: (current?.retryableCount ?? 0) + (descriptor.retryable ? 1 : 0),
      latestStartedAt: nextLatestStartedAt,
      affectedCount: (current?.affectedCount ?? 0) + (descriptor.affectedCount ?? 0),
    });
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (right.retryableCount !== left.retryableCount) {
      return right.retryableCount - left.retryableCount;
    }
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return new Date(right.latestStartedAt).getTime() - new Date(left.latestStartedAt).getTime();
  });
}

export function buildOperationTicketResultCounts(
  state: OperationTicketDetailState | null,
): OperationTicketResultCounts {
  const counts: OperationTicketResultCounts = {
    success: 0,
    warning: 0,
    error: 0,
    skipped: 0,
    actionable: 0,
  };

  for (const item of state?.items ?? []) {
    counts[item.result] += 1;
  }
  counts.actionable = counts.error + counts.warning;

  return counts;
}
