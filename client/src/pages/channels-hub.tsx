import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type { CoupangStoreSummary } from "@shared/coupang";
import { StatusBadge } from "@/components/status-badge";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import { getJson } from "@/lib/queryClient";

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

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="채널 허브" />
          <StatusBadge tone="coming" label="세부 / 원본 화면" />
        </div>
        <h1>채널</h1>
        <p>
          쿠팡과 네이버는 운영 데스크의 주인공이 아니라 데이터 출처와 세부 설정 레이어입니다. 메인 동선에서 숨긴
          채널별 세부 화면은 여기서 다시 진입합니다.
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
      </div>

      <div className="dashboard-grid">
        <WorkspaceEntryLink href="/coupang/connection" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>COUPANG 연결 / 설정</strong>
            <StatusBadge tone="live" label={`${coupangConnected}개 연결`} />
          </div>
          <p>vendorId, 인증키, 연결 확인과 쿠팡 세부 운영 화면으로 이어지는 진입점입니다.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/naver/connection" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>NAVER 연결 / 설정</strong>
            <StatusBadge tone="live" label={`${naverConnected}개 연결`} />
          </div>
          <p>NAVER 커머스 API 연결 상태와 정산, 문의, 클레임 원본 화면으로 이동합니다.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/coupang/inquiries" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>COUPANG 원본 화면</strong>
            <StatusBadge tone="shared" label="세부" />
          </div>
          <p>문의, 반품, 교환, 물류, 주문 같은 채널별 세부 화면을 원본 흐름 그대로 엽니다.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/naver/inquiries" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>NAVER 원본 화면</strong>
            <StatusBadge tone="shared" label="세부" />
          </div>
          <p>문의, 클레임, 주문, 정산, 판매자 정보 같은 채널별 세부 화면을 다시 확인합니다.</p>
        </WorkspaceEntryLink>
      </div>

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
          bulk-price, product-edit, grouped products 같은 레거시 노출은 메인 동선에서 내리고 직접 URL 접근만 유지합니다.
        </p>
      </details>
    </div>
  );
}
