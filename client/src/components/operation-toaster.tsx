import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  BulkPriceRunRecentChange,
  BulkPriceRun,
  BulkPriceRunListResponse,
} from "@shared/coupang-bulk-price";
import type {
  NaverBulkPriceRun,
  NaverBulkPriceRunRecentChange,
  NaverBulkPriceRunListResponse,
} from "@shared/naver-bulk-price";
import { getBulkPriceRunHref, getOperationLogsHref } from "@/lib/operation-links";
import { apiRequestJson, getJson, queryClient } from "@/lib/queryClient";
import { usePersistentState } from "@/lib/use-persistent-state";
import { type OperationToast, useOperations } from "./operation-provider";
import { useWorkspaceTabs } from "./workspace-tabs";

type BulkRunChannel = "naver" | "coupang";
type PanelTone = "pending" | "success" | "warning" | "failed";

type BasePanelEntry = {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  statusLabel: string;
  statusValue: string;
  tone: PanelTone;
  href: string;
  startedAt: string;
  updatedAt: string;
  active: boolean;
};

type OperationPanelEntry = BasePanelEntry & {
  kind: "operation";
  dismissible: boolean;
  onDismiss?: () => void;
};

type BulkRunPanelEntry = BasePanelEntry & {
  kind: "bulk-run";
  channel: BulkRunChannel;
  runId: string;
  hiddenKey: string;
  recentChanges: Array<BulkPriceRunRecentChange | NaverBulkPriceRunRecentChange>;
};

type PanelEntry = OperationPanelEntry | BulkRunPanelEntry;

type BulkRunMutationInput = {
  channel: BulkRunChannel;
  runId: string;
};

type DeleteBulkRunResponse = {
  deleted: true;
  runId: string;
};

const ACTIVE_BULK_RUN_PANEL_POLL_MS = 5_000;
const IDLE_BULK_RUN_PANEL_POLL_MS = 10_000;

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR");

function isActiveOperationStatus(status: OperationToast["status"]) {
  return status === "queued" || status === "running";
}

function isActiveBulkRunStatus(status: string) {
  return status === "queued" || status === "running";
}

function isStoppableBulkRunStatus(status: string) {
  return status === "queued" || status === "running" || status === "paused";
}

function shouldShowRecentBulkRun(run: Pick<BulkPriceRun, "status" | "finishedAt"> | Pick<NaverBulkPriceRun, "status" | "finishedAt">) {
  return run.status === "paused" || isRecentlyFinished(run.finishedAt, 20_000);
}

function isRecentlyFinished(finishedAt: string | null, maxAgeMs: number) {
  if (!finishedAt) {
    return false;
  }

  const finishedTime = new Date(finishedAt).getTime();
  if (Number.isNaN(finishedTime)) {
    return false;
  }

  return Date.now() - finishedTime <= maxAgeMs;
}

function hasActiveBulkRuns(runs: Array<{ status: string }> | undefined) {
  return Boolean(runs?.some((run) => isActiveBulkRunStatus(run.status)));
}

function getBulkRunHiddenKey(
  channel: BulkRunChannel,
  run: Pick<BulkPriceRun, "id" | "status"> | Pick<NaverBulkPriceRun, "id" | "status">,
) {
  return `${channel}:${run.id}:${run.status}`;
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatPanelTime(entry: Pick<PanelEntry, "active" | "startedAt" | "updatedAt">) {
  const value = entry.active ? entry.startedAt : entry.updatedAt;
  const prefix = entry.active ? "Started" : "Updated";
  return `${prefix} ${new Date(value).toLocaleTimeString("ko-KR")}`;
}

function formatBulkRunSummary(summary: {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  paused: number;
  stopped: number;
  skippedConflict: number;
  skippedUnmatched: number;
}) {
  return [
    `Done ${summary.succeeded}/${summary.total}`,
    summary.running ? `Running ${summary.running}` : null,
    summary.queued ? `Queued ${summary.queued}` : null,
    summary.paused ? `Paused ${summary.paused}` : null,
    summary.failed ? `Failed ${summary.failed}` : null,
    summary.stopped ? `Stopped ${summary.stopped}` : null,
    summary.skippedConflict ? `Conflict ${summary.skippedConflict}` : null,
    summary.skippedUnmatched ? `Skipped ${summary.skippedUnmatched}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function formatBulkRunPrice(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  return `${KRW_FORMATTER.format(value)}원`;
}

function formatBulkRunChange(
  change: BulkPriceRunRecentChange | NaverBulkPriceRunRecentChange,
) {
  const label = [change.label, change.matchedCode].filter(Boolean).join(" / ");
  const details: string[] = [];
  const beforePrice = formatBulkRunPrice(change.beforePrice);
  const afterPrice = formatBulkRunPrice(change.afterPrice);

  if (beforePrice || afterPrice) {
    details.push(`${beforePrice ?? "-"} -> ${afterPrice ?? "-"}`);
  }
  if (change.beforeSaleStatus || change.afterSaleStatus) {
    details.push(`${formatStatusLabel(change.beforeSaleStatus ?? "-")} -> ${formatStatusLabel(change.afterSaleStatus ?? "-")}`);
  }

  if (!details.length) {
    return label;
  }

  return `${label}: ${details.join(" · ")}`;
}

function getOperationTone(status: OperationToast["status"]): PanelTone {
  if (status === "queued" || status === "running") {
    return "pending";
  }

  if (status === "success") {
    return "success";
  }

  if (status === "warning") {
    return "warning";
  }

  return "failed";
}

function getBulkRunTone(status: string): PanelTone {
  if (status === "queued" || status === "running") {
    return "pending";
  }

  if (status === "succeeded") {
    return "success";
  }

  if (status === "paused" || status === "partially_succeeded" || status === "stopped") {
    return "warning";
  }

  return "failed";
}

function compareEntries(left: PanelEntry, right: PanelEntry) {
  if (left.active !== right.active) {
    return left.active ? -1 : 1;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function buildOperationEntry(
  toast: OperationToast,
  dismissToast: (toastId: string) => void,
): OperationPanelEntry {
  const active = isActiveOperationStatus(toast.status);

  return {
    kind: "operation",
    id: toast.toastId,
    title: toast.title,
    subtitle: `${toast.channel.toUpperCase()} / ${toast.targetCount} items`,
    body: toast.errorMessage ?? toast.summary ?? "The operation is in progress.",
    statusLabel: toast.status,
    statusValue: toast.status,
    tone: getOperationTone(toast.status),
    href: getOperationLogsHref(toast.channel, toast.operationId),
    startedAt: toast.startedAt,
    updatedAt: toast.finishedAt ?? toast.startedAt,
    active,
    dismissible: !active,
    onDismiss: !active ? () => dismissToast(toast.toastId) : undefined,
  };
}

function buildBulkRunEntry(
  channel: BulkRunChannel,
  run: BulkPriceRun | NaverBulkPriceRun,
): BulkRunPanelEntry {
  const active = isActiveBulkRunStatus(run.status);

  return {
    kind: "bulk-run",
    id: `${channel}:${run.id}`,
    channel,
    runId: run.id,
    hiddenKey: getBulkRunHiddenKey(channel, run),
    title: `${channel.toUpperCase()} Bulk Price`,
    subtitle: `Run ${run.id.slice(0, 8)} / ${run.summary.total} items`,
    body: formatBulkRunSummary(run.summary),
    statusLabel: formatStatusLabel(run.status),
    statusValue: run.status,
    tone: getBulkRunTone(run.status),
    href: getBulkPriceRunHref(channel, run.id),
    startedAt: run.startedAt ?? run.createdAt,
    updatedAt: run.finishedAt ?? run.updatedAt,
    active,
    recentChanges: run.summary.recentChanges ?? [],
  };
}

export function OperationToaster() {
  const { toasts, dismissToast } = useOperations();
  const { openTab } = useWorkspaceTabs();
  const [collapsed, setCollapsed] = usePersistentState(
    "kikit:task-status-panel:collapsed",
    false,
  );
  const [hiddenBulkRuns, setHiddenBulkRuns] = usePersistentState<Record<string, true>>(
    "kikit:task-status-panel:hidden-bulk-runs",
    {},
  );

  const invalidateBulkRunQueries = async (channel: BulkRunChannel) => {
    await queryClient.invalidateQueries({
      queryKey: [`/api/${channel}/bulk-price/runs`],
    });
  };

  const stopRunMutation = useMutation<unknown, Error, BulkRunMutationInput>({
    mutationFn: async ({ channel, runId }) =>
      apiRequestJson("POST", `/api/${channel}/bulk-price/runs/${runId}/stop`, {}),
    onSuccess: async (_result, variables) => {
      await invalidateBulkRunQueries(variables.channel);
    },
  });

  const deleteRunMutation = useMutation<DeleteBulkRunResponse, Error, BulkRunMutationInput>({
    mutationFn: async ({ channel, runId }) =>
      apiRequestJson("DELETE", `/api/${channel}/bulk-price/runs/${runId}`),
    onSuccess: async (_result, variables) => {
      await invalidateBulkRunQueries(variables.channel);
    },
  });

  const naverRunsQuery = useQuery({
    queryKey: ["/api/naver/bulk-price/runs", "status-panel"],
    queryFn: () => getJson<NaverBulkPriceRunListResponse>("/api/naver/bulk-price/runs"),
    refetchInterval: (query) =>
      hasActiveBulkRuns((query.state.data as NaverBulkPriceRunListResponse | undefined)?.items)
        ? ACTIVE_BULK_RUN_PANEL_POLL_MS
        : IDLE_BULK_RUN_PANEL_POLL_MS,
    placeholderData: (previousData) => previousData,
  });

  const coupangRunsQuery = useQuery({
    queryKey: ["/api/coupang/bulk-price/runs", "status-panel"],
    queryFn: () => getJson<BulkPriceRunListResponse>("/api/coupang/bulk-price/runs"),
    refetchInterval: (query) =>
      hasActiveBulkRuns((query.state.data as BulkPriceRunListResponse | undefined)?.items)
        ? ACTIVE_BULK_RUN_PANEL_POLL_MS
        : IDLE_BULK_RUN_PANEL_POLL_MS,
    placeholderData: (previousData) => previousData,
  });

  const isBulkRunHidden = (
    channel: BulkRunChannel,
    run: BulkPriceRun | NaverBulkPriceRun,
  ) => Boolean(hiddenBulkRuns[getBulkRunHiddenKey(channel, run)]);

  const hideBulkRun = (entry: BulkRunPanelEntry) => {
    setHiddenBulkRuns((current) => ({
      ...current,
      [entry.hiddenKey]: true,
    }));
  };

  const activeEntries = useMemo(() => {
    const operationEntries = toasts
      .filter((toast) => isActiveOperationStatus(toast.status))
      .map((toast) => buildOperationEntry(toast, dismissToast));
    const bulkEntries = [
      ...(naverRunsQuery.data?.items ?? [])
        .filter((run) => isActiveBulkRunStatus(run.status))
        .filter((run) => !isBulkRunHidden("naver", run))
        .map((run) => buildBulkRunEntry("naver", run)),
      ...(coupangRunsQuery.data?.items ?? [])
        .filter((run) => isActiveBulkRunStatus(run.status))
        .filter((run) => !isBulkRunHidden("coupang", run))
        .map((run) => buildBulkRunEntry("coupang", run)),
    ];

    return [...operationEntries, ...bulkEntries].sort(compareEntries);
  }, [
    coupangRunsQuery.data?.items,
    dismissToast,
    hiddenBulkRuns,
    naverRunsQuery.data?.items,
    toasts,
  ]);

  const recentEntries = useMemo(() => {
    const recentOperationEntries = toasts
      .filter((toast) => !isActiveOperationStatus(toast.status))
      .map((toast) => buildOperationEntry(toast, dismissToast));
    const recentBulkEntries = [
      ...(naverRunsQuery.data?.items ?? [])
        .filter((run) => !isActiveBulkRunStatus(run.status))
        .filter((run) => shouldShowRecentBulkRun(run))
        .filter((run) => !isBulkRunHidden("naver", run))
        .map((run) => buildBulkRunEntry("naver", run)),
      ...(coupangRunsQuery.data?.items ?? [])
        .filter((run) => !isActiveBulkRunStatus(run.status))
        .filter((run) => shouldShowRecentBulkRun(run))
        .filter((run) => !isBulkRunHidden("coupang", run))
        .map((run) => buildBulkRunEntry("coupang", run)),
    ];

    return [...recentOperationEntries, ...recentBulkEntries].sort(compareEntries);
  }, [
    coupangRunsQuery.data?.items,
    dismissToast,
    hiddenBulkRuns,
    naverRunsQuery.data?.items,
    toasts,
  ]);

  const syncWarningVisible = naverRunsQuery.isError || coupangRunsQuery.isError;
  const actionError =
    (stopRunMutation.error as Error | null) ??
    (deleteRunMutation.error as Error | null);
  const activeCount = activeEntries.length;

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
          <span className="muted">
            {activeCount ? `${activeCount} active` : "No active jobs"}
          </span>
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
              <div className="task-status-list">
                {activeEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`task-status-entry ${entry.tone}`}
                  >
                    <div className="task-status-entry-header">
                      <div>
                        <strong>{entry.title}</strong>
                        <div className="muted">{entry.subtitle}</div>
                      </div>
                      <span className={`status-pill ${entry.tone}`}>{entry.statusLabel}</span>
                    </div>
                    <div className="task-status-entry-body">{entry.body}</div>
                    {entry.kind === "bulk-run" && entry.recentChanges.length ? (
                      <div className="task-status-entry-updates">
                        {entry.recentChanges.slice(0, 5).map((change) => (
                          <div
                            key={`${entry.id}:${change.rowId}:${change.appliedAt}`}
                            className="task-status-entry-update"
                          >
                            {formatBulkRunChange(change)}
                          </div>
                        ))}
                      </div>
                    ) : null}
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
                        {entry.kind === "bulk-run" && isStoppableBulkRunStatus(entry.statusValue) ? (
                          <button
                            type="button"
                            className="task-status-entry-button"
                            disabled={
                              stopRunMutation.isPending &&
                              stopRunMutation.variables?.channel === entry.channel &&
                              stopRunMutation.variables?.runId === entry.runId
                            }
                            onClick={() => stopRunMutation.mutate({
                              channel: entry.channel,
                              runId: entry.runId,
                            })}
                          >
                            {stopRunMutation.isPending &&
                            stopRunMutation.variables?.channel === entry.channel &&
                            stopRunMutation.variables?.runId === entry.runId
                              ? "Stopping..."
                              : "Stop"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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

              <div className="task-status-list">
                {recentEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`task-status-entry ${entry.tone}`}
                  >
                    <div className="task-status-entry-header">
                      <div>
                        <strong>{entry.title}</strong>
                        <div className="muted">{entry.subtitle}</div>
                      </div>
                      <span className={`status-pill ${entry.tone}`}>{entry.statusLabel}</span>
                    </div>
                    <div className="task-status-entry-body">{entry.body}</div>
                    {entry.kind === "bulk-run" && entry.recentChanges.length ? (
                      <div className="task-status-entry-updates">
                        {entry.recentChanges.slice(0, 5).map((change) => (
                          <div
                            key={`${entry.id}:${change.rowId}:${change.appliedAt}`}
                            className="task-status-entry-update"
                          >
                            {formatBulkRunChange(change)}
                          </div>
                        ))}
                      </div>
                    ) : null}
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
                        {entry.kind === "operation" && entry.dismissible && entry.onDismiss ? (
                          <button
                            type="button"
                            className="task-status-entry-button"
                            onClick={() => entry.onDismiss?.()}
                          >
                            Hide
                          </button>
                        ) : null}
                        {entry.kind === "bulk-run" ? (
                          <>
                            {isStoppableBulkRunStatus(entry.statusValue) ? (
                              <button
                                type="button"
                                className="task-status-entry-button"
                                disabled={
                                  stopRunMutation.isPending &&
                                  stopRunMutation.variables?.channel === entry.channel &&
                                  stopRunMutation.variables?.runId === entry.runId
                                }
                                onClick={() => stopRunMutation.mutate({
                                  channel: entry.channel,
                                  runId: entry.runId,
                                })}
                              >
                                {stopRunMutation.isPending &&
                                stopRunMutation.variables?.channel === entry.channel &&
                                stopRunMutation.variables?.runId === entry.runId
                                  ? "Stopping..."
                                  : "Stop"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="task-status-entry-button"
                              onClick={() => hideBulkRun(entry)}
                            >
                              Hide
                            </button>
                            <button
                              type="button"
                              className="task-status-entry-button danger"
                              disabled={
                                deleteRunMutation.isPending &&
                                deleteRunMutation.variables?.channel === entry.channel &&
                                deleteRunMutation.variables?.runId === entry.runId
                              }
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Delete ${entry.channel.toUpperCase()} run ${entry.runId.slice(0, 8)}?`,
                                  )
                                ) {
                                  return;
                                }

                                deleteRunMutation.mutate({
                                  channel: entry.channel,
                                  runId: entry.runId,
                                });
                              }}
                            >
                              {deleteRunMutation.isPending &&
                              deleteRunMutation.variables?.channel === entry.channel &&
                              deleteRunMutation.variables?.runId === entry.runId
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {syncWarningVisible ? (
            <div className="task-status-footnote">
              Bulk price status sync is temporarily delayed. Running tasks already loaded here will
              keep updating when the endpoint responds again.
            </div>
          ) : null}

          {actionError ? (
            <div className="task-status-footnote error">
              {actionError.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
