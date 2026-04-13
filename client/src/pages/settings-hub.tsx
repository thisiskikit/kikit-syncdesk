import { useMemo } from "react";
import { StatusBadge } from "@/components/status-badge";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import { buildSettingsHubSections } from "./hub-navigation";

export default function SettingsHubPage() {
  const sections = useMemo(() => buildSettingsHubSections(), []);
  const advancedToolCount = sections.find((section) => section.key === "advanced-tools")?.actions.length ?? 0;

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="설정 허브" />
          <StatusBadge tone="coming" label="연결 / 고급 / 레거시" />
        </div>
        <h1>설정</h1>
        <p>
          설정 허브는 연결 설정, 운영 고급 도구, 레거시 직접 진입을 분리해서 보여줍니다. 메인 운영 흐름과
          섞이지 않게 하되 기존 route 접근은 그대로 유지합니다.
        </p>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">연결 설정</div>
          <div className="metric-value">2</div>
        </div>
        <div className="metric">
          <div className="metric-label">운영 고급 도구</div>
          <div className="metric-value">{advancedToolCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">레거시 직접 진입</div>
          <div className="metric-value">2</div>
        </div>
      </div>

      <div className="card">
        <div className="dashboard-section-header">
          <div>
            <h2>읽는 순서</h2>
            <p>1) 연결 설정 2) 운영 고급 도구 3) 레거시 직접 진입 순서로 읽도록 정리했습니다.</p>
          </div>
        </div>
      </div>

      {sections.map((section) => (
        <section key={section.key} className="card dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
          </div>
          <div className="dashboard-grid">
            {section.actions.map((action) => (
              <WorkspaceEntryLink
                key={`${section.key}:${action.href}`}
                href={action.href}
                className="dashboard-card"
                workspaceBehavior="tab"
              >
                <div className="dashboard-card-header">
                  <strong>{action.title}</strong>
                  <StatusBadge tone={action.badgeTone} label={action.badgeLabel} />
                </div>
                <p>{action.description}</p>
              </WorkspaceEntryLink>
            ))}
          </div>
        </section>
      ))}

      <details className="card dashboard-legacy-panel">
        <summary>레거시 / 직접 진입</summary>
        <div className="dashboard-legacy-list">
          <WorkspaceEntryLink href="/naver/products" className="button ghost" workspaceBehavior="tab">
            NAVER 상품 화면
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/coupang/products" className="button ghost" workspaceBehavior="tab">
            COUPANG 상품 화면
          </WorkspaceEntryLink>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          상품 화면은 계속 지원하지만, 현재 운영 구조에서는 연결 설정과 고급 도구보다 뒤로 배치합니다.
        </p>
      </details>
    </div>
  );
}
