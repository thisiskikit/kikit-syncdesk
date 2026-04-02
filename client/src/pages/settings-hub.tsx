import { StatusBadge } from "@/components/status-badge";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";

export default function SettingsHubPage() {
  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="Settings Hub" />
        </div>
        <h1>Settings</h1>
        <p>Open channel connection settings and shared operational configuration from one place.</p>
      </div>

      <div className="dashboard-grid">
        <WorkspaceEntryLink href="/naver/connection" className="dashboard-card">
          <div className="dashboard-card-header">
            <strong>NAVER Connection</strong>
            <StatusBadge tone="live" />
          </div>
          <p>Manage NAVER Commerce API credentials and connection checks.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/coupang/connection" className="dashboard-card">
          <div className="dashboard-card-header">
            <strong>COUPANG Connection</strong>
            <StatusBadge tone="draft" />
          </div>
          <p>Manage vendorId, accessKey, secretKey, base URL, and connection verification.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/operations" className="dashboard-card">
          <div className="dashboard-card-header">
            <strong>Operation Logs</strong>
            <StatusBadge tone="live" label="JSON" />
          </div>
          <p>Open the work center to review file-based operation logs and live execution history.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/engine/field-sync" className="dashboard-card">
          <div className="dashboard-card-header">
            <strong>Field Sync / Update</strong>
            <StatusBadge tone="shared" />
          </div>
          <p>Append, update, or upsert platform field values into a selected Postgres target table.</p>
        </WorkspaceEntryLink>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Current Data Layout</h3>
        <div className="guide-grid two">
          <div className="guide-note">
            <strong>Channel Settings</strong>
            <p>
              NAVER settings are stored in <code>data/channel-settings.json</code> and COUPANG
              settings are stored in <code>data/coupang-settings.json</code>.
            </p>
          </div>
          <div className="guide-note">
            <strong>Operation Logs</strong>
            <p>
              Work center history is stored in <code>data/operation-logs.json</code> and streamed
              into the UI in real time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
