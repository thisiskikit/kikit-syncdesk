import { useMemo } from "react";
import { getOperationLogsHref } from "@/lib/operation-links";
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

function getOperationTone(status: OperationToast["status"]): PanelTone {
  if (status === "error") return "failed";
  if (status === "warning") return "warning";
  if (status === "success") return "success";
  return "pending";
}

function formatStatusLabel(status: OperationToast["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "success":
      return "Done";
    case "warning":
      return "Warning";
    case "error":
      return "Failed";
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

function formatPanelTime(entry: PanelEntry) {
  const updatedAt = Date.parse(entry.updatedAt);
  if (Number.isNaN(updatedAt)) {
    return "";
  }

  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function buildOperationEntry(toast: OperationToast, dismissToast: (toastId: string) => void): PanelEntry {
  const active = isActiveOperationStatus(toast.status);

  return {
    id: toast.toastId,
    title: toast.title,
    subtitle: `${toast.channel.toUpperCase()} / ${toast.targetCount} items`,
    body: toast.errorMessage ?? toast.summary ?? "The operation is in progress.",
    statusLabel: formatStatusLabel(toast.status),
    tone: getOperationTone(toast.status),
    href: getOperationLogsHref(toast.channel, toast.operationId),
    startedAt: toast.startedAt,
    updatedAt: toast.finishedAt ?? toast.startedAt,
    active,
    dismissible: !active,
    onDismiss: !active ? () => dismissToast(toast.toastId) : undefined,
  };
}

export function OperationToaster() {
  const { toasts, dismissToast } = useOperations();
  const { openTab } = useWorkspaceTabs();
  const [collapsed, setCollapsed] = usePersistentState("kikit:task-status-panel:collapsed", false);

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
            Open
          </button>
          {entry.dismissible && entry.onDismiss ? (
            <button
              type="button"
              className="task-status-entry-button"
              onClick={() => entry.onDismiss?.()}
            >
              Hide
            </button>
          ) : null}
        </div>
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
          <strong>Task Status</strong>
          <span className="muted">{activeCount ? `${activeCount} active` : "No active jobs"}</span>
        </div>
        <span className={`status-pill ${activeCount ? "pending" : "draft"}`}>
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>

      {!collapsed ? (
        <div className="task-status-body">
          <section className="task-status-section">
            <div className="task-status-section-header">
              <strong>Running Now</strong>
              <span className="muted">{activeCount}</span>
            </div>

            {activeEntries.length ? (
              <div className="task-status-list">{activeEntries.map(renderEntry)}</div>
            ) : (
              <div className="task-status-empty">
                No jobs are currently running. This panel stays visible across tabs.
              </div>
            )}
          </section>

          {recentEntries.length ? (
            <section className="task-status-section">
              <div className="task-status-section-header">
                <strong>Recent Updates</strong>
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
