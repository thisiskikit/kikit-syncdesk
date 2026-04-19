import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  OperationRuntimeStatusItem,
  OperationRuntimeStatusResponse,
} from "@shared/operations";
import { getOperationLogsHref } from "@/lib/operation-links";
import { getJson } from "@/lib/queryClient";
import { usePersistentState } from "@/lib/use-persistent-state";
import { type OperationToast, useOperations } from "./operation-provider";
import { useWorkspaceTabs } from "./workspace-tabs";

type PanelTone = "pending" | "success" | "warning" | "failed";

type PanelEntry = {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  statusLabel: string;
  tone: PanelTone;
  href: string;
  startedAt: string;
  updatedAt: string;
  active: boolean;
  dismissible: boolean;
  onDismiss?: () => void;
};

function isActiveOperationStatus(status: OperationToast["status"]) {
  return status === "queued" || status === "running";
}

export function canDismissOperationToast(_toast: Pick<OperationToast, "source" | "status">) {
  return true;
}

function getOperationTone(status: OperationToast["status"]): PanelTone {
  if (status === "error") return "failed";
  if (status === "warning") return "warning";
  if (status === "success") return "success";
  return "pending";
}

function formatStatusLabel(status: OperationToast["status"]) {
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

function shouldShowRecentOperation(toast: OperationToast) {
  const finishedAt = toast.finishedAt ? Date.parse(toast.finishedAt) : Number.NaN;
  if (Number.isNaN(finishedAt)) {
    return false;
  }

  return Date.now() - finishedAt <= 30 * 60_000;
}

function formatRelativeTime(updatedAtText: string) {
  const updatedAt = Date.parse(updatedAtText);
  if (Number.isNaN(updatedAt)) {
    return "";
  }

  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) {
    return `${seconds}초 전`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}시간 전`;
}

function formatPanelTime(entry: PanelEntry) {
  return formatRelativeTime(entry.updatedAt);
}

function formatRuntimeDuration(ms: number) {
  const normalized = Math.max(0, Math.round(ms));
  if (normalized < 1_000) {
    return `${normalized}ms`;
  }

  const seconds = normalized / 1_000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}초`;
  }

  if (seconds < 60) {
    return `${Math.round(seconds)}초`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds > 0 ? `${minutes}분 ${remainingSeconds}초` : `${minutes}분`;
}

function getRuntimeChannelLabel(channel: OperationRuntimeStatusItem["channel"]) {
  if (channel === "coupang") {
    return "쿠팡 API 요청 상태";
  }

  return `${channel.toUpperCase()} API 요청 상태`;
}

function getRuntimeTone(item: OperationRuntimeStatusItem): PanelTone {
  if (item.cooldownRemainingMs > 0) {
    return "warning";
  }

  if (item.activeRequestCount > 0 || item.queuedRequestCount > 0) {
    return "pending";
  }

  return "success";
}

function getRuntimeStatusLabel(item: OperationRuntimeStatusItem) {
  if (item.cooldownRemainingMs > 0) {
    return "백오프";
  }

  if (item.queuedRequestCount > 0) {
    return "대기열";
  }

  if (item.activeRequestCount > 0) {
    return "요청 중";
  }

  return "유휴";
}

function getRuntimeSummary(item: OperationRuntimeStatusItem) {
  if (item.cooldownRemainingMs > 0) {
    return `재시도 대기 중입니다. backoff ${formatRuntimeDuration(item.cooldownRemainingMs)} 남았습니다.`;
  }

  if (item.queuedRequestCount > 0) {
    return "대기열을 순서대로 처리 중입니다.";
  }

  if (item.activeRequestCount > 0) {
    return "외부 API 요청을 처리 중입니다.";
  }

  return "현재 진행 중인 외부 API 요청이 없습니다.";
}

function buildOperationEntry(toast: OperationToast, dismissToast: (toastId: string) => void): PanelEntry {
  const active = isActiveOperationStatus(toast.status);
  const dismissible = canDismissOperationToast(toast);

  return {
    id: toast.toastId,
    title: toast.title,
    subtitle: `${toast.channel.toUpperCase()} / ${toast.targetCount}건`,
    body: toast.errorMessage ?? toast.summary ?? "작업이 진행 중입니다.",
    statusLabel: formatStatusLabel(toast.status),
    tone: getOperationTone(toast.status),
    href: getOperationLogsHref(toast.channel, toast.operationId),
    startedAt: toast.startedAt,
    updatedAt: toast.finishedAt ?? toast.startedAt,
    active,
    dismissible,
    onDismiss: dismissible ? () => dismissToast(toast.toastId) : undefined,
  };
}

export function OperationToaster() {
  const { toasts, dismissToast } = useOperations();
  const { openTab } = useWorkspaceTabs();
  const [collapsed, setCollapsed] = usePersistentState("kikit:task-status-panel:collapsed", false);
  const runtimeStatusQuery = useQuery({
    queryKey: ["operations", "runtime-status"],
    queryFn: () => getJson<OperationRuntimeStatusResponse>("/api/operations/runtime-status"),
    enabled: !collapsed,
    staleTime: 1_000,
    refetchInterval: collapsed ? false : 2_000,
    refetchIntervalInBackground: true,
  });

  const activeEntries = useMemo(
    () =>
      toasts
        .filter((toast) => isActiveOperationStatus(toast.status))
        .map((toast) => buildOperationEntry(toast, dismissToast)),
    [dismissToast, toasts],
  );

  const recentEntries = useMemo(
    () =>
      toasts
        .filter((toast) => !isActiveOperationStatus(toast.status))
        .filter((toast) => shouldShowRecentOperation(toast))
        .map((toast) => buildOperationEntry(toast, dismissToast))
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [dismissToast, toasts],
  );

  const activeCount = activeEntries.length;
  const runtimeEntries = runtimeStatusQuery.data?.items ?? [];

  const renderEntry = (entry: PanelEntry) => (
    <div key={entry.id} className={`task-status-entry ${entry.tone}`}>
      <div className="task-status-entry-header">
        <div>
          <strong>{entry.title}</strong>
          <div className="muted">{entry.subtitle}</div>
        </div>
        <span className={`status-pill ${entry.tone}`}>{entry.statusLabel}</span>
      </div>
      <div className="task-status-entry-body">{entry.body}</div>
      <div className="task-status-entry-actions">
        <span className="muted">{formatPanelTime(entry)}</span>
        <div className="task-status-entry-buttons">
          <button
            type="button"
            className="task-status-entry-button"
            onClick={() => openTab(entry.href)}
          >
            열기
          </button>
          {entry.dismissible && entry.onDismiss ? (
            <button
              type="button"
              className="task-status-entry-button"
              onClick={() => entry.onDismiss?.()}
            >
              숨기기
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  const renderRuntimeEntry = (entry: OperationRuntimeStatusItem) => (
    <div key={entry.channel} className={`task-status-entry ${getRuntimeTone(entry)}`}>
      <div className="task-status-entry-header">
        <div>
          <strong>{getRuntimeChannelLabel(entry.channel)}</strong>
          <div className="muted">
            실행 {entry.activeRequestCount} / {entry.concurrencyLimit} · 대기 {entry.queuedRequestCount} ·
            스케줄러 {entry.schedulerCount}
          </div>
        </div>
        <span className={`status-pill ${getRuntimeTone(entry)}`}>{getRuntimeStatusLabel(entry)}</span>
      </div>
      <div className="task-status-entry-body">{getRuntimeSummary(entry)}</div>
      <div className="task-status-entry-updates">
        <div className="task-status-entry-update">
          기본 요청 간격 {formatRuntimeDuration(entry.minRequestGapMs)}
        </div>
        <div className="task-status-entry-update">
          현재 동시 실행 {entry.activeRequestCount} / {entry.concurrencyLimit}
        </div>
        <div className="task-status-entry-update">대기열 {entry.queuedRequestCount}건</div>
        {entry.cooldownRemainingMs > 0 ? (
          <div className="task-status-entry-update">
            backoff {formatRuntimeDuration(entry.cooldownRemainingMs)} 남음 · 제한 스케줄러{" "}
            {entry.coolingDownSchedulerCount}개
          </div>
        ) : null}
      </div>
      <div className="task-status-entry-actions">
        <span className="muted">{formatRelativeTime(entry.fetchedAt)}</span>
      </div>
    </div>
  );

  return (
    <div className={`task-status-panel ${collapsed ? "collapsed" : ""}`}>
      <button
        type="button"
        className="task-status-toggle"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
      >
        <div className="task-status-toggle-copy">
          <strong>작업 상태</strong>
          <span className="muted">{activeCount ? `${activeCount}건 진행 중` : "진행 중인 작업 없음"}</span>
        </div>
        <span className={`status-pill ${activeCount ? "pending" : "draft"}`}>
          {collapsed ? "보기" : "숨기기"}
        </span>
      </button>

      {!collapsed ? (
        <div className="task-status-body">
          {runtimeEntries.length ? (
            <section className="task-status-section">
              <div className="task-status-section-header">
                <strong>API 런타임</strong>
                <span className="muted">{runtimeEntries.length}</span>
              </div>
              <div className="task-status-list">{runtimeEntries.map(renderRuntimeEntry)}</div>
            </section>
          ) : null}

          <section className="task-status-section">
            <div className="task-status-section-header">
              <strong>현재 진행 중</strong>
              <span className="muted">{activeCount}</span>
            </div>

            {activeEntries.length ? (
              <div className="task-status-list">{activeEntries.map(renderEntry)}</div>
            ) : (
              <div className="task-status-empty">
                현재 진행 중인 작업이 없습니다. 이 패널은 탭을 옮겨도 계속 유지됩니다.
              </div>
            )}
          </section>

          {recentEntries.length ? (
            <section className="task-status-section">
              <div className="task-status-section-header">
                <strong>최근 업데이트</strong>
                <span className="muted">{recentEntries.length}</span>
              </div>
              <div className="task-status-list">{recentEntries.map(renderEntry)}</div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
