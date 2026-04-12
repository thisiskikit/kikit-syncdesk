import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  getLogChannelLabel,
  getLogEventTypeLabel,
  getLogSubtitle,
  getLogTitle,
  isLogChannel,
  type LogChannel,
  type LogDetailResponse,
  type LogEntry,
  type LogLevel,
  type LogListResponse,
} from "@shared/logs";
import {
  getOperationActionLabel,
  getOperationErrorSummary,
  getOperationMenuLabel,
  getOperationPayloadPreview,
  getOperationResultSummaryText,
  type OperationStatus,
} from "@shared/operations";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { getJson, queryPresets, refreshQueryData } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";

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
  const search = new URLSearchParams({
    tab: filters.tab,
    channel: filters.channel,
  });

  if (logId) {
    search.set("logId", logId);
  }

  return `/work-center?${search.toString()}`;
}

function isLogCenterTab(value: string | null): value is LogCenterTab {
  return value === "operations" || value === "events";
}

function getEntryPriority(entry: LogEntry) {
  const statusScore =
    entry.status === "error"
      ? 50
      : entry.status === "warning"
        ? 40
        : entry.status === "running"
          ? 30
          : entry.status === "queued"
            ? 20
            : 10;

  const levelScore =
    entry.level === "error" ? 20 : entry.level === "warning" ? 10 : 0;

  const retryScore =
    entry.kind === "operation" && entry.operation.retryable ? 15 : 0;

  const slowScore = entry.meta?.slow ? 5 : 0;

  return statusScore + levelScore + retryScore + slowScore;
}

export default function OperationCenterPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const {
    retryOperation,
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
  } = useOperations();
  const {
    state: filters,
    setState: setFilters,
    isLoaded,
  } = useServerMenuState("operations.center", DEFAULT_FILTERS);

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const selectedLogId = searchParams.get("logId") ?? searchParams.get("operationId");
  const routeTab = searchParams.get("tab");
  const routeChannel = searchParams.get("channel");
  const logsQueryKey = ["/api/logs", filters] as const;
  const selectedLogQueryKey = ["/api/logs/detail", selectedLogId] as const;

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const nextTab = isLogCenterTab(routeTab) ? routeTab : null;
    const nextChannel =
      routeChannel === "all"
        ? "all"
        : routeChannel && isLogChannel(routeChannel)
          ? routeChannel
          : null;

    if (
      nextTab &&
      (filters.tab !== nextTab || (nextChannel && filters.channel !== nextChannel))
    ) {
      setFilters((current) => ({
        ...current,
        tab: nextTab,
        channel: nextChannel ?? current.channel,
      }));
    }
  }, [filters.channel, filters.tab, isLoaded, routeChannel, routeTab, setFilters]);

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

  useEffect(() => {
    if (!selectedLogId || !selectedLogQuery.isSuccess || selectedLogQuery.data.item) {
      return;
    }

    navigate(buildWorkCenterHref(filters), { replace: true });
  }, [filters, navigate, selectedLogId, selectedLogQuery.data, selectedLogQuery.isSuccess]);

  const items = logsQuery.data?.items ?? [];
  const prioritizedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        const priorityGap = getEntryPriority(right) - getEntryPriority(left);
        if (priorityGap !== 0) {
          return priorityGap;
        }

        return new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime();
      }),
    [items],
  );

  const warningCount = items.filter((item) => item.level === "warning").length;
  const errorCount = items.filter((item) => item.level === "error").length;
  const slowCount = items.filter((item) => item.meta?.slow).length;
  const retryableCount = items.filter(
    (item) => item.kind === "operation" && item.operation.retryable,
  ).length;
  const activeCount = items.filter(
    (item) => item.status === "queued" || item.status === "running",
  ).length;

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

  return (
    <div className="page work-center-page">
      <div className="hero work-center-hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="작업센터" />
          <StatusBadge tone="live" label="실패 작업 복구" />
        </div>
        <h1>작업센터</h1>
        <p>
          warning, error, retryable 작업을 먼저 보고 복구합니다. 원본 payload와 기술 로그는 상세 패널로 내려 두고,
          메인 목록에서는 판단과 재시도에 필요한 정보만 우선 노출합니다.
        </p>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">조회 로그</div>
          <div className="metric-value">{items.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">재시도 가능</div>
          <div className="metric-value">{retryableCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">경고</div>
          <div className="metric-value">{warningCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">오류</div>
          <div className="metric-value">{errorCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">진행 중</div>
          <div className="metric-value">{activeCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">느린 요청</div>
          <div className="metric-value">{slowCount}</div>
        </div>
      </div>

      <div className="card work-center-guide-card">
        <div className="work-center-guide-grid">
          <div className="work-center-guide-item">
            <strong>재시도 가능 작업</strong>
            <p className="muted">warning 또는 error 중 재시도 가능한 작업부터 먼저 복구합니다.</p>
          </div>
          <div className="work-center-guide-item">
            <strong>최근 실패</strong>
            <p className="muted">error, warning, 느린 요청을 우선 순서로 정렬해 보여줍니다.</p>
          </div>
          <div className="work-center-guide-item">
            <strong>시스템 / 성능</strong>
            <p className="muted">이벤트 탭에서 시스템, 성능, 연결 상태 로그를 분리해서 볼 수 있습니다.</p>
          </div>
        </div>
      </div>

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
              <option value="queued">queued</option>
              <option value="running">running</option>
              <option value="success">success</option>
              <option value="warning">warning</option>
              <option value="error">error</option>
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
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="error">error</option>
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
        ) : prioritizedItems.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th>제목</th>
                  <th>채널</th>
                  <th>레벨</th>
                  <th>상태</th>
                  <th>시간</th>
                  <th>소요</th>
                  <th>요약</th>
                  <th>실행</th>
                </tr>
              </thead>
              <tbody>
                {prioritizedItems.map((entry) => (
                  <tr
                    key={entry.id}
                    className={selectedLogId === entry.id ? "table-row-selected" : ""}
                    onClick={() => navigate(buildWorkCenterHref(filters, entry.id))}
                  >
                    <td>
                      <div className="table-cell-stack">
                        <strong>{entry.kind === "operation" ? "작업" : getLogEventTypeLabel(entry.eventType)}</strong>
                        <div className="muted">{entry.kind}</div>
                      </div>
                    </td>
                    <td>
                      <div className="table-cell-stack">
                        <strong>{getLogTitle(entry)}</strong>
                        <div className="muted">{getLogSubtitle(entry) ?? "-"}</div>
                      </div>
                    </td>
                    <td>{getLogChannelLabel(entry.channel)}</td>
                    <td>
                      <span className={`status-pill ${entry.level === "info" ? "queued" : entry.level}`}>
                        {entry.level}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${entry.status}`}>{entry.status}</span>
                    </td>
                    <td className="muted">{formatTimeRange(entry.startedAt, entry.finishedAt)}</td>
                    <td>{formatDuration(entry.durationMs)}</td>
                    <td className="muted">
                      {entry.kind === "operation"
                        ? getOperationResultSummaryText(entry.operation.resultSummary) ??
                          getOperationErrorSummary(entry.operation) ??
                          "-"
                        : entry.message ?? "-"}
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
                <span className={`status-pill ${selectedLog.status}`}>{selectedLog.status}</span>
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
                <p>레벨: {selectedLog.level}</p>
                <p>상태: {selectedLog.status}</p>
                <p>시간: {formatTimeRange(selectedLog.startedAt, selectedLog.finishedAt)}</p>
                <p>소요: {formatDuration(selectedLog.durationMs)}</p>
              </div>

              <div className="detail-card">
                <strong>복구 판단</strong>
                {selectedLog.kind === "operation" ? (
                  <>
                    <p>재시도 가능: {selectedLog.operation.retryable ? "예" : "아니오"}</p>
                    <p>대상: {selectedLog.operation.targetType}</p>
                    <p>건수: {selectedLog.operation.targetCount}</p>
                    <p>
                      요약:{" "}
                      {getOperationErrorSummary(selectedLog.operation) ??
                        getOperationResultSummaryText(selectedLog.operation.resultSummary) ??
                        "요약 정보 없음"}
                    </p>
                  </>
                ) : (
                  <p>{selectedLog.message ?? "이벤트 메시지가 없습니다."}</p>
                )}
              </div>
            </div>

            {selectedLog.kind === "operation" ? (
              <div className="work-center-detail-sections">
                <details className="work-center-detail-foldout" open>
                  <summary>요청 / 결과 요약</summary>
                  <div className="detail-columns">
                    <div className="detail-box">
                      <strong>Result Summary</strong>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {formatJson(selectedLog.operation.resultSummary)}
                      </pre>
                    </div>
                    <div className="detail-box">
                      <strong>Error</strong>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {formatJson({
                          errorCode: selectedLog.operation.errorCode,
                          errorMessage: selectedLog.operation.errorMessage,
                          payloadPreview: getOperationPayloadPreview(selectedLog.operation),
                        })}
                      </pre>
                    </div>
                  </div>
                </details>

                <details className="work-center-detail-foldout">
                  <summary>원본 요청 payload</summary>
                  <div className="detail-box">
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {formatJson(selectedLog.operation.requestPayload)}
                    </pre>
                  </div>
                </details>

                <details className="work-center-detail-foldout">
                  <summary>정규화 payload</summary>
                  <div className="detail-box">
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {formatJson(selectedLog.operation.normalizedPayload)}
                    </pre>
                  </div>
                </details>
              </div>
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
