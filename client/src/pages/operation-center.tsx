import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  getLogChannelLabel,
  getLogEventTypeLabel,
  getLogSubtitle,
  getLogTitle,
  type LogChannel,
  type LogDetailResponse,
  type LogEntry,
  type LogLevel,
  type LogListResponse,
} from "@shared/logs";
import {
  getOperationActionLabel,
  getOperationMenuLabel,
  isOperationCancellable,
  isOperationCancellationPending,
  operationCancelRequestedLabel,
  operationCancelRequestedMessage,
  type OperationStatus,
} from "@shared/operations";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import {
  buildCsHubWorkspaceHref,
  buildFulfillmentWorkspaceHref,
  buildWorkCenterWorkspaceHref,
  extractOperationHandoffContext,
  parseWorkCenterWorkspaceSearch,
} from "@/lib/ops-handoff-links";
import { getJson, queryPresets, refreshQueryData } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatNumber } from "@/lib/utils";
import OperationCenterOperationDetailSections from "./operation-center-operation-detail-sections";
import {
  buildOperationTicketResultCounts,
  buildRecoveryDescriptor,
  buildRecoveryGroups,
  getEntryPriority,
} from "./operation-center-recovery";

type LogCenterTab = "operations" | "events";

type FilterState = {
  tab: LogCenterTab;
  channel: "all" | LogChannel;
  status: "all" | OperationStatus;
  level: "all" | LogLevel;
  query: string;
  slowOnly: boolean;
};

const DEFAULT_FILTERS: FilterState = {
  tab: "operations",
  channel: "all",
  status: "all",
  level: "all",
  query: "",
  slowOnly: false,
};

function formatTimeRange(startedAt: string, finishedAt: string | null) {
  const startedText = new Date(startedAt).toLocaleString("ko-KR");
  if (!finishedAt) {
    return `${startedText} ~ 진행 중`;
  }

  return `${startedText} ~ ${new Date(finishedAt).toLocaleString("ko-KR")}`;
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null || !Number.isFinite(durationMs)) {
    return "-";
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getLogKindLabel(entry: LogEntry) {
  return entry.kind === "operation" ? "작업" : "이벤트";
}

function formatOperationStatusLabel(status: OperationStatus) {
  switch (status) {
    case "queued":
      return "대기";
    case "running":
      return "진행 중";
    case "success":
      return "완료";
    case "warning":
      return "경고";
    case "error":
      return "실패";
    default:
      return status;
  }
}

function getEntryStatusLabel(entry: LogEntry) {
  if (entry.kind === "operation" && isOperationCancellationPending(entry.operation)) {
    return operationCancelRequestedLabel;
  }

  return formatOperationStatusLabel(entry.status);
}

function getEntryStatusTone(entry: LogEntry) {
  if (entry.kind === "operation" && isOperationCancellationPending(entry.operation)) {
    return "warning";
  }

  return entry.status;
}

function isEntryCancellable(entry: LogEntry) {
  return entry.kind === "operation" && isOperationCancellable(entry.operation);
}

function formatLogLevelLabel(level: LogLevel) {
  switch (level) {
    case "info":
      return "정보";
    case "warning":
      return "경고";
    case "error":
      return "오류";
    default:
      return level;
  }
}

function buildLogsUrl(filters: FilterState) {
  const search = new URLSearchParams({
    kind: filters.tab === "operations" ? "operation" : "event",
    limit: "80",
  });

  if (filters.channel !== "all") {
    search.set("channel", filters.channel);
  }
  if (filters.status !== "all") {
    search.set("status", filters.status);
  }
  if (filters.level !== "all") {
    search.set("level", filters.level);
  }
  if (filters.query.trim()) {
    search.set("q", filters.query.trim());
  }
  if (filters.slowOnly) {
    search.set("slowOnly", "true");
  }

  return `/api/logs?${search.toString()}`;
}

function buildWorkCenterHref(filters: FilterState, logId?: string | null) {
  return buildWorkCenterWorkspaceHref({
    tab: filters.tab,
    channel: filters.channel,
    status: filters.status,
    level: filters.level,
    query: filters.query,
    slowOnly: filters.slowOnly,
    logId,
  });
}

function isLogCenterTab(value: string | null): value is LogCenterTab {
  return value === "operations" || value === "events";
}

export default function OperationCenterPage() {
  const [pathname, navigate] = useLocation();
  const search = useSearch();
  const {
    retryOperation,
    cancelOperation,
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
  } = useOperations();
  const {
    state: filters,
    setState: setFilters,
    isLoaded,
  } = useServerMenuState("operations.center", DEFAULT_FILTERS);
  const routeState = useMemo(() => parseWorkCenterWorkspaceSearch(search), [search]);
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const selectedLogId = searchParams.get("logId") ?? searchParams.get("operationId");
  const isRouteStatePending = useMemo(
    () =>
      (routeState.tab !== null && routeState.tab !== filters.tab) ||
      (routeState.channel !== null && routeState.channel !== filters.channel) ||
      (routeState.status !== null && routeState.status !== filters.status) ||
      (routeState.level !== null && routeState.level !== filters.level) ||
      (routeState.query !== null && routeState.query !== filters.query) ||
      (routeState.slowOnly !== null && routeState.slowOnly !== filters.slowOnly),
    [
      filters.channel,
      filters.level,
      filters.query,
      filters.slowOnly,
      filters.status,
      filters.tab,
      routeState.channel,
      routeState.level,
      routeState.query,
      routeState.slowOnly,
      routeState.status,
      routeState.tab,
    ],
  );
  const logsQueryKey = ["/api/logs", filters] as const;
  const selectedLogQueryKey = ["/api/logs/detail", selectedLogId] as const;

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const nextTab = routeState.tab && isLogCenterTab(routeState.tab) ? routeState.tab : null;

    if (nextTab && filters.tab !== nextTab) {
      setFilters((current) => ({
        ...current,
        tab: nextTab,
      }));
    }

    if (
      routeState.channel === null &&
      routeState.status === null &&
      routeState.level === null &&
      routeState.query === null &&
      routeState.slowOnly === null
    ) {
      return;
    }

    setFilters((current) => {
      const next: FilterState = {
        tab: current.tab,
        channel: routeState.channel ?? current.channel,
        status: routeState.status ?? current.status,
        level: routeState.level ?? current.level,
        query: routeState.query ?? current.query,
        slowOnly: routeState.slowOnly ?? current.slowOnly,
      };

      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [filters.tab, isLoaded, routeState, setFilters]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (isRouteStatePending) {
      return;
    }

    const nextHref = buildWorkCenterHref(filters, selectedLogId);
    const currentHref = `${pathname}${search}`;

    if (nextHref !== currentHref) {
      navigate(nextHref, { replace: true });
    }
  }, [filters, isLoaded, isRouteStatePending, navigate, pathname, search, selectedLogId]);

  const logsQuery = useQuery({
    enabled: isLoaded,
    queryKey: logsQueryKey,
    queryFn: () => getJson<LogListResponse>(buildLogsUrl(filters)),
    ...queryPresets.listSnapshot,
  });

  const selectedLogQuery = useQuery({
    enabled: Boolean(selectedLogId),
    queryKey: selectedLogQueryKey,
    queryFn: () => getJson<LogDetailResponse>(`/api/logs/${encodeURIComponent(selectedLogId ?? "")}`),
    ...queryPresets.detail,
  });

  const refreshLogs = () =>
    refreshQueryData({
      queryKey: logsQueryKey,
      queryFn: () => getJson<LogListResponse>(buildLogsUrl(filters)),
      gcTime: queryPresets.listSnapshot.gcTime,
    });

  const refreshSelectedLog = () =>
    selectedLogId
      ? refreshQueryData({
          queryKey: selectedLogQueryKey,
          queryFn: () => getJson<LogDetailResponse>(`/api/logs/${encodeURIComponent(selectedLogId)}`),
          gcTime: queryPresets.detail.gcTime,
        })
      : Promise.resolve(null);

  const selectedLog =
    selectedLogQuery.data?.item ??
    logsQuery.data?.items.find((item) => item.id === selectedLogId) ??
    null;
  const selectedRecoveryDescriptor = useMemo(
    () => (selectedLog ? buildRecoveryDescriptor(selectedLog) : null),
    [selectedLog],
  );
  const selectedOperationTicketState = selectedRecoveryDescriptor?.ticketState ?? null;
  const selectedTicketCounts = useMemo(
    () => buildOperationTicketResultCounts(selectedOperationTicketState),
    [selectedOperationTicketState],
  );
  const selectedOperationHandoff = useMemo(() => {
    if (selectedLog?.kind !== "operation" || selectedLog.channel !== "coupang") {
      return null;
    }

    const context = extractOperationHandoffContext(selectedLog);
    const decisionStatus =
      selectedRecoveryDescriptor?.lane === "retry-now" || selectedRecoveryDescriptor?.lane === "manual-check"
        ? "recheck"
        : "all";

    return {
      fulfillmentHref: buildFulfillmentWorkspaceHref({
        storeId: context.storeId,
        query: context.query,
        decisionStatus,
      }),
      csHref: buildCsHubWorkspaceHref({
        focus:
          selectedRecoveryDescriptor?.lane === "manual-check"
            ? "recovery"
            : "fulfillment-impact",
        source: "work-center",
      }),
      query: context.query,
      storeId: context.storeId,
    };
  }, [selectedLog, selectedRecoveryDescriptor?.lane]);

  useEffect(() => {
    if (!selectedLogId || !selectedLogQuery.isSuccess || selectedLogQuery.data.item) {
      return;
    }

    navigate(buildWorkCenterHref(filters), { replace: true });
  }, [filters, navigate, selectedLogId, selectedLogQuery.data, selectedLogQuery.isSuccess]);

  const items = logsQuery.data?.items ?? [];
  const prioritizedEntries = useMemo(
    () =>
      [...items]
        .map((entry) => ({
          entry,
          recovery: buildRecoveryDescriptor(entry),
        }))
        .sort((left, right) => {
          const priorityGap = getEntryPriority(right.entry) - getEntryPriority(left.entry);
          if (priorityGap !== 0) {
            return priorityGap;
          }

          return new Date(right.entry.startedAt).getTime() - new Date(left.entry.startedAt).getTime();
        }),
    [items],
  );

  const slowCount = items.filter((item) => item.meta?.slow).length;
  const retryNowCount = prioritizedEntries.filter(
    ({ recovery }) => recovery.lane === "retry-now",
  ).length;
  const manualCheckCount = prioritizedEntries.filter(
    ({ recovery }) => recovery.lane === "manual-check",
  ).length;
  const monitorCount = prioritizedEntries.filter(
    ({ recovery }) => recovery.lane === "monitor",
  ).length;
  const doneCount = prioritizedEntries.filter(({ recovery }) => recovery.lane === "done").length;
  const recoveryGroups = useMemo(() => buildRecoveryGroups(items).slice(0, 4), [items]);

  const handleRetry = async (entry: LogEntry) => {
    if (entry.kind !== "operation" || !entry.operation.retryable) {
      return;
    }

    const localId = startLocalOperation({
      channel: entry.operation.channel,
      actionName: `${getOperationActionLabel(entry.operation.actionKey)} 재시도`,
      targetCount: entry.operation.targetCount,
    });

    try {
      await retryOperation(entry.operation.id);
      finishLocalOperation(localId, {
        status: "success",
        summary: "재시도 요청을 등록했습니다.",
      });
      window.setTimeout(() => removeLocalOperation(localId), 1_200);
      await refreshLogs();
      if (selectedLogId) {
        await refreshSelectedLog();
      }
    } catch (error) {
      finishLocalOperation(localId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "재시도에 실패했습니다.",
      });
    }
  };

  const handleCancel = async (entry: LogEntry) => {
    if (entry.kind !== "operation") {
      return;
    }

    if (!isOperationCancellable(entry.operation) || isOperationCancellationPending(entry.operation)) {
      return;
    }

    const operation = entry.operation;

    const localId = startLocalOperation({
      channel: operation.channel,
      actionName: `${getOperationActionLabel(operation.actionKey)} 중단`,
      targetCount: operation.targetCount,
    });

    try {
      await cancelOperation(operation.id);
      finishLocalOperation(localId, {
        status: "success",
        summary: operationCancelRequestedMessage,
      });
      window.setTimeout(() => removeLocalOperation(localId), 1_200);
      await refreshLogs();
      if (selectedLogId) {
        await refreshSelectedLog();
      }
    } catch (error) {
      finishLocalOperation(localId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "중단 요청에 실패했습니다.",
      });
    }
  };

  return (
    <div className="page work-center-page">
      <div className="hero work-center-hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="작업센터" />
          <StatusBadge tone="live" label="실패 작업 복구" />
        </div>
        <h1>작업센터</h1>
        <p>
          경고, 실패, 재시도 가능 작업을 먼저 보고 복구합니다. 원본 payload와 기술 로그는 상세 패널로
          내리고, 메인 목록에서는 판단과 재시도에 필요한 정보만 우선 노출합니다.
        </p>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">조회 로그</div>
          <div className="metric-value">{formatNumber(items.length)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">즉시 재시도</div>
          <div className="metric-value">{formatNumber(retryNowCount)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">원인 확인</div>
          <div className="metric-value">{formatNumber(manualCheckCount)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">진행 관찰</div>
          <div className="metric-value">{formatNumber(monitorCount)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">완료 / 참고</div>
          <div className="metric-value">{formatNumber(doneCount)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">느린 요청</div>
          <div className="metric-value">{formatNumber(slowCount)}</div>
        </div>
      </div>

      <div className="card work-center-guide-card">
        <div className="work-center-guide-grid">
          <div className="work-center-guide-item">
            <strong>즉시 재시도</strong>
            <p className="muted">실패 또는 경고 중 재시도 가능한 작업을 제일 먼저 복구합니다.</p>
          </div>
          <div className="work-center-guide-item">
            <strong>원인 확인</strong>
            <p className="muted">수동 확인이 필요한 실패와 경고는 영향 범위와 요약을 먼저 보여줍니다.</p>
          </div>
          <div className="work-center-guide-item">
            <strong>시스템 / 성능 관찰</strong>
            <p className="muted">이벤트 탭은 복구보다 관찰이 필요한 항목을 분리해서 보여줍니다.</p>
          </div>
        </div>
      </div>

      {recoveryGroups.length ? (
        <div className="card">
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <strong>지금 먼저 볼 복구 묶음</strong>
            <span className="muted">같은 성격 실패를 묶어 operator 판단 비용을 줄입니다.</span>
          </div>
          <div className="work-center-ticket-list">
            {recoveryGroups.map((group) => (
              <div key={group.key} className="work-center-ticket-item">
                <div className="work-center-ticket-item-header">
                  <div className="table-cell-stack">
                    <strong>{group.label}</strong>
                    <div className="muted">{group.hint || "원인 요약 없음"}</div>
                  </div>
                  <span className={`status-pill ${group.toneClassName}`}>
                    {formatNumber(group.count)}건
                  </span>
                </div>
                <div className="work-center-ticket-item-meta">
                  재시도 가능 {formatNumber(group.retryableCount)}건 · 영향 범위{" "}
                  {formatNumber(group.affectedCount)}건
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <div className="segmented-control">
            <button
              className={`segmented-button ${filters.tab === "operations" ? "active" : ""}`}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  tab: "operations",
                }))
              }
            >
              작업 로그
            </button>
            <button
              className={`segmented-button ${filters.tab === "events" ? "active" : ""}`}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  tab: "events",
                }))
              }
            >
              시스템 / 성능
            </button>
          </div>

          <div className="toolbar">
            <select
              value={filters.channel}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  channel: event.target.value as FilterState["channel"],
                }))
              }
            >
              <option value="all">전체 채널</option>
              <option value="naver">NAVER</option>
              <option value="coupang">COUPANG</option>
              <option value="draft">DRAFT</option>
              <option value="shared">공통</option>
              <option value="system">SYSTEM</option>
            </select>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as FilterState["status"],
                }))
              }
            >
              <option value="all">전체 상태</option>
              <option value="queued">대기</option>
              <option value="running">진행 중</option>
              <option value="success">완료</option>
              <option value="warning">경고</option>
              <option value="error">실패</option>
            </select>
            <select
              value={filters.level}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  level: event.target.value as FilterState["level"],
                }))
              }
            >
              <option value="all">전체 레벨</option>
              <option value="info">정보</option>
              <option value="warning">경고</option>
              <option value="error">오류</option>
            </select>
            <input
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              placeholder="메뉴, 액션, 메시지, payload 검색"
              style={{ minWidth: 280 }}
            />
            <label className="toolbar" style={{ gap: "0.45rem" }}>
              <input
                type="checkbox"
                checked={filters.slowOnly}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    slowOnly: event.target.checked,
                  }))
                }
              />
              <span className="muted">느린 요청만 보기</span>
            </label>
            <button className="button secondary" onClick={() => void refreshLogs()}>
              새로고침
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {logsQuery.isLoading ? (
          <div className="empty">작업 로그를 불러오는 중입니다.</div>
        ) : logsQuery.isError ? (
          <div className="empty">
            {logsQuery.error instanceof Error
              ? logsQuery.error.message
              : "작업 로그를 불러오지 못했습니다."}
          </div>
        ) : prioritizedEntries.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>복구</th>
                  <th>제목</th>
                  <th>채널</th>
                  <th>상태</th>
                  <th>시간</th>
                  <th>영향</th>
                  <th>원인 / 조치</th>
                  <th>실행</th>
                </tr>
              </thead>
              <tbody>
                {prioritizedEntries.map(({ entry, recovery }) => (
                  <tr
                    key={entry.id}
                    className={selectedLogId === entry.id ? "table-row-selected" : ""}
                    onClick={() => navigate(buildWorkCenterHref(filters, entry.id))}
                  >
                    <td>
                      <div className="table-cell-stack">
                        <span className={`status-pill ${recovery.toneClassName}`}>{recovery.label}</span>
                        <div className="muted">{recovery.retryable ? "재시도 가능" : recovery.hint}</div>
                      </div>
                    </td>
                    <td>
                      <div className="table-cell-stack">
                        <strong>{getLogTitle(entry)}</strong>
                        <div className="muted">
                          {entry.kind === "operation"
                            ? `${getLogSubtitle(entry) ?? "-"} · ${getLogKindLabel(entry)}`
                            : `${getLogEventTypeLabel(entry.eventType)} · ${getLogSubtitle(entry) ?? "-"}`
                          }
                        </div>
                      </div>
                    </td>
                    <td>{getLogChannelLabel(entry.channel)}</td>
                    <td>
                      <div className="table-cell-stack">
                        <span className={`status-pill ${getEntryStatusTone(entry)}`}>
                          {getEntryStatusLabel(entry)}
                        </span>
                        <span className={`status-pill ${entry.level === "info" ? "queued" : entry.level}`}>
                          {formatLogLevelLabel(entry.level)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-cell-stack">
                        <span className="muted">{formatTimeRange(entry.startedAt, entry.finishedAt)}</span>
                        <span>{formatDuration(entry.durationMs)}</span>
                      </div>
                    </td>
                    <td>
                      {recovery.affectedCount !== null ? `${formatNumber(recovery.affectedCount)}건` : "-"}
                    </td>
                    <td>
                      <div className="table-cell-stack">
                        <strong>{recovery.groupLabel}</strong>
                        <div className="muted">{recovery.summary ?? recovery.hint}</div>
                      </div>
                    </td>
                    <td>
                      <div className="table-inline-actions">
                        <button
                          className="button ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(buildWorkCenterHref(filters, entry.id));
                          }}
                        >
                          상세
                        </button>
                        {entry.kind === "operation" ? (
                          <>
                            {isEntryCancellable(entry) ? (
                              <button
                                className="button ghost"
                                disabled={isOperationCancellationPending(entry.operation)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleCancel(entry);
                                }}
                              >
                                {isOperationCancellationPending(entry.operation) ? "중단 요청됨" : "중단"}
                              </button>
                            ) : null}
                            <button
                              className="button secondary"
                              disabled={!entry.operation.retryable}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleRetry(entry);
                              }}
                            >
                              재시도
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">조건에 맞는 로그가 없습니다.</div>
        )}
      </div>

      {selectedLog ? (
        <div className="csv-overlay" onClick={() => navigate(buildWorkCenterHref(filters))}>
          <div className="csv-dialog detail-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="detail-box-header">
              <div>
                <strong>{getLogTitle(selectedLog)}</strong>
                <div className="muted">
                  {selectedLog.kind === "operation"
                    ? `${getOperationMenuLabel(selectedLog.operation.menuKey)} / ${getOperationActionLabel(selectedLog.operation.actionKey)}`
                    : `${getLogEventTypeLabel(selectedLog.eventType)} / ${selectedLog.id}`}
                </div>
              </div>
              <div className="table-inline-actions">
                <span className={`status-pill ${getEntryStatusTone(selectedLog)}`}>
                  {getEntryStatusLabel(selectedLog)}
                </span>
                <button className="button ghost" onClick={() => navigate(buildWorkCenterHref(filters))}>
                  닫기
                </button>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-card">
                <strong>기본 정보</strong>
                <p>구분: {selectedLog.kind === "operation" ? "작업 로그" : getLogEventTypeLabel(selectedLog.eventType)}</p>
                <p>채널: {getLogChannelLabel(selectedLog.channel)}</p>
                <p>레벨: {formatLogLevelLabel(selectedLog.level)}</p>
                <p>상태: {getEntryStatusLabel(selectedLog)}</p>
                <p>시간: {formatTimeRange(selectedLog.startedAt, selectedLog.finishedAt)}</p>
                <p>소요: {formatDuration(selectedLog.durationMs)}</p>
              </div>

              <div className="detail-card">
                <strong>지금 할 일</strong>
                {selectedRecoveryDescriptor ? (
                  <>
                    <p>
                      <span className={`status-pill ${selectedRecoveryDescriptor.toneClassName}`}>
                        {selectedRecoveryDescriptor.label}
                      </span>
                    </p>
                    <p>{selectedRecoveryDescriptor.hint}</p>
                    <p>요약: {selectedRecoveryDescriptor.summary ?? "요약 정보 없음"}</p>
                    {selectedLog.kind === "operation" ? (
                      <div className="table-inline-actions">
                        {isEntryCancellable(selectedLog) ? (
                          <button
                            className="button ghost"
                            disabled={isOperationCancellationPending(selectedLog.operation)}
                            onClick={() => void handleCancel(selectedLog)}
                          >
                            {isOperationCancellationPending(selectedLog.operation) ? "중단 요청됨" : "중단"}
                          </button>
                        ) : null}
                        <button
                          className="button secondary"
                          disabled={!selectedLog.operation.retryable}
                          onClick={() => void handleRetry(selectedLog)}
                        >
                          재시도
                        </button>
                        <span className="muted">
                          {isOperationCancellationPending(selectedLog.operation)
                            ? operationCancelRequestedMessage
                            : isEntryCancellable(selectedLog)
                              ? "현재 단계가 끝나면 안전 지점에서 멈추도록 요청할 수 있습니다."
                              : selectedLog.operation.retryable
                                ? "재시도 요청을 바로 등록할 수 있습니다."
                                : "재시도 전 payload와 오류 원인을 먼저 확인하세요."}
                        </span>
                      </div>
                    ) : null}
                    {selectedOperationHandoff ? (
                      <div className="table-inline-actions" style={{ marginTop: "0.75rem" }}>
                        <WorkspaceEntryLink
                          href={selectedOperationHandoff.fulfillmentHref}
                          className="button secondary"
                          workspaceBehavior="tab"
                        >
                          관련 출고 보기
                        </WorkspaceEntryLink>
                        <WorkspaceEntryLink
                          href={selectedOperationHandoff.csHref}
                          className="button ghost"
                          workspaceBehavior="tab"
                        >
                          CS 허브 열기
                        </WorkspaceEntryLink>
                        <span className="muted">
                          {selectedOperationHandoff.query
                            ? `${selectedOperationHandoff.query} 기준으로 같은 주문 흐름을 이어봅니다.`
                            : "스토어 문맥 기준으로 출고/CS 화면을 이어서 엽니다."}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>복구 판단 정보를 계산하지 못했습니다.</p>
                )}
              </div>

              {selectedLog.kind === "operation" ? (
                <div className="detail-card">
                  <strong>영향 범위</strong>
                  <p>대상 유형: {selectedLog.operation.targetType}</p>
                  <p>대상 건수: {formatNumber(selectedLog.operation.targetCount)}</p>
                  <p>기록된 티켓: {formatNumber(selectedOperationTicketState?.recordedCount ?? 0)}</p>
                  <p>실패/경고: {formatNumber(selectedTicketCounts.actionable)}</p>
                  <p>건너뜀: {formatNumber(selectedTicketCounts.skipped)}</p>
                  <p>
                    {selectedOperationTicketState?.truncated
                      ? "추정: 일부 성공 건은 기록에서 생략됐을 수 있습니다."
                      : "기록된 티켓 범위에서 영향도를 바로 확인할 수 있습니다."}
                  </p>
                </div>
              ) : null}
            </div>

            {selectedLog.kind === "operation" ? (
              <OperationCenterOperationDetailSections
                entry={selectedLog}
                ticketState={selectedOperationTicketState}
                formatJson={formatJson}
              />
            ) : (
              <details className="work-center-detail-foldout" open>
                <summary>이벤트 메타</summary>
                <div className="detail-box">
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {formatJson(selectedLog.meta)}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
