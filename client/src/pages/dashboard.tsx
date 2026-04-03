import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type { CoupangStoreSummary } from "@shared/coupang";
import {
  getOperationErrorSummary,
  getOperationResultSummaryText,
  getOperationTitle,
} from "@shared/operations";
import { useOperations } from "@/components/operation-provider";
import { StatusBadge } from "@/components/status-badge";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import { getJson } from "@/lib/queryClient";

interface NaverStoresResponse {
  items: ChannelStoreSummary[];
}

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

export default function DashboardPage() {
  const { operations } = useOperations();

  const naverStoresQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<NaverStoresResponse>("/api/settings/stores"),
  });

  const coupangStoresQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const naverConnected = (naverStoresQuery.data?.items || []).filter(
    (store) => store.connectionTest.status === "success",
  ).length;
  const coupangConnected = (coupangStoresQuery.data?.items || []).filter(
    (store) => store.connectionTest.status === "success",
  ).length;
  const runningOperations = operations.filter(
    (operation) => operation.status === "queued" || operation.status === "running",
  ).length;

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="Workspace" />
        </div>
        <h1>KIKIT Channel Control Dashboard</h1>
        <p>Open channel workspaces, shared draft flows, and the operation center from one place.</p>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">NAVER Connected</div>
          <div className="metric-value">{naverConnected}</div>
        </div>
        <div className="metric">
          <div className="metric-label">COUPANG Connected</div>
          <div className="metric-value">{coupangConnected}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Running Operations</div>
          <div className="metric-value">{runningOperations}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Recent Operation Logs</div>
          <div className="metric-value">{operations.length}</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <WorkspaceEntryLink href="/naver/products" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>NAVER Workspace</strong>
            <StatusBadge tone="live" />
          </div>
          <p>Open product management, order, shipment, inquiry, and settlement workflows for NAVER.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/coupang/products" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>COUPANG Workspace</strong>
            <StatusBadge tone="draft" />
          </div>
          <p>Jump into COUPANG product, control, logistics, order, and support workflows.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/engine/catalog" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>Draft / Runs</strong>
            <StatusBadge tone="shared" />
          </div>
          <p>Use the shared catalog, draft validation, and execution run history across channels.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/operations" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>Work Center</strong>
            <StatusBadge tone="live" label="Live" />
          </div>
          <p>Review recent work, failures, retries, and operation details without leaving the dashboard.</p>
        </WorkspaceEntryLink>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Recent Operations</h3>
          <WorkspaceEntryLink href="/operations" className="button ghost" workspaceBehavior="tab">
            Open Work Center
          </WorkspaceEntryLink>
        </div>

        {operations.length ? (
          <div className="run-list" style={{ marginTop: "1rem" }}>
            {operations.slice(0, 6).map((operation) => (
              <div key={operation.id} className="run-row">
                <div>
                  <strong>{getOperationTitle(operation)}</strong>
                  <div className="muted">
                    {operation.channel.toUpperCase()} / {operation.targetCount} items / {operation.mode}
                  </div>
                  <div className="muted">
                    {getOperationErrorSummary(operation) ??
                      getOperationResultSummaryText(operation.resultSummary) ??
                      "-"}
                  </div>
                </div>
                <div className={`status-pill ${operation.status}`}>{operation.status}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">No operations have been recorded yet.</div>
        )}
      </div>
    </div>
  );
}
