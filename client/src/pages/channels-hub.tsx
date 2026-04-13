import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type { CoupangStoreSummary } from "@shared/coupang";
import { StatusBadge } from "@/components/status-badge";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import { getJson } from "@/lib/queryClient";
import { buildChannelsHubSections } from "./hub-navigation";

interface NaverStoresResponse {
  items: ChannelStoreSummary[];
}

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

export default function ChannelsHubPage() {
  const naverStoresQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<NaverStoresResponse>("/api/settings/stores"),
  });
  const coupangStoresQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const naverConnected = (naverStoresQuery.data?.items ?? []).filter((store) => store.connectionTest.status === "success").length;
  const coupangConnected = (coupangStoresQuery.data?.items ?? []).filter((store) => store.connectionTest.status === "success").length;
  const totalConnected = naverConnected + coupangConnected;
  const sections = useMemo(
    () =>
      buildChannelsHubSections({
        naverConnected,
        coupangConnected,
      }),
    [coupangConnected, naverConnected],
  );
  const originalEntryCount = useMemo(
    () =>
      sections
        .filter((section) => section.key !== "connections")
        .reduce((count, section) => count + section.actions.length, 0),
    [sections],
  );

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="채널 허브" />
          <StatusBadge tone="coming" label="원본 / 연결 / 레거시" />
        </div>
        <h1>채널</h1>
        <p>
          채널 허브는 채널별 정보 모음이 아니라 연결 점검, 원본 화면 진입, 채널별 대표 도구로 나뉜 운영 진입점입니다.
          메인 동선에서 숨긴 세부 화면은 여기서 다시 엽니다.
        </p>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">NAVER 연결</div>
          <div className="metric-value">{naverConnected}</div>
        </div>
        <div className="metric">
          <div className="metric-label">COUPANG 연결</div>
          <div className="metric-value">{coupangConnected}</div>
        </div>
        <div className="metric">
          <div className="metric-label">연결된 채널 합계</div>
          <div className="metric-value">{totalConnected}</div>
        </div>
        <div className="metric">
          <div className="metric-label">대표 원본 진입</div>
          <div className="metric-value">{originalEntryCount}</div>
        </div>
      </div>

      {totalConnected === 0 ? (
        <div className="feedback warning">
          <strong>연결된 채널이 없습니다.</strong>
          <div className="muted">
            먼저 NAVER 또는 COUPANG 연결 설정으로 들어가 인증 상태를 확인해야 이후 원본 화면 진입이 자연스럽습니다.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="dashboard-section-header">
            <div>
              <h2>읽는 순서</h2>
              <p>1) 연결 상태 확인 2) 원본 화면 진입 3) 채널별 대표 도구 순서로 읽도록 정리했습니다.</p>
            </div>
          </div>
        </div>
      )}

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
        <summary>고급 / 레거시 화면</summary>
        <div className="dashboard-legacy-list">
          <WorkspaceEntryLink href="/engine/catalog" className="button ghost" workspaceBehavior="tab">
            초안 / 실행
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/engine/field-sync" className="button ghost" workspaceBehavior="tab">
            필드 동기화
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/naver/products" className="button ghost" workspaceBehavior="tab">
            NAVER 상품 화면
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/coupang/products" className="button ghost" workspaceBehavior="tab">
            COUPANG 상품 화면
          </WorkspaceEntryLink>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          bulk-price, product-edit, grouped products 같은 레거시 노출은 메인 운영 흐름에서 내리고 직접 진입만 유지합니다.
        </p>
      </details>
    </div>
  );
}
