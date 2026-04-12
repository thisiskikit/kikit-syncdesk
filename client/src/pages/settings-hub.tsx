import { StatusBadge } from "@/components/status-badge";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";

export default function SettingsHubPage() {
  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="설정" />
          <StatusBadge tone="coming" label="고급 / 레거시 포함" />
        </div>
        <h1>설정</h1>
        <p>
          채널 연결과 공통 운영 설정을 관리합니다. 초안, 실행 이력, 필드 동기화 같은 고급 화면은 메인 동선에서 한 단계
          내리고 여기서 접근하도록 정리했습니다.
        </p>
      </div>

      <div className="dashboard-grid">
        <WorkspaceEntryLink href="/naver/connection" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>NAVER 연결 설정</strong>
            <StatusBadge tone="live" />
          </div>
          <p>NAVER Commerce API 연결, 점검, 판매자 설정을 관리합니다.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/coupang/connection" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>COUPANG 연결 설정</strong>
            <StatusBadge tone="live" />
          </div>
          <p>vendorId, accessKey, secretKey, base URL과 연결 검증을 관리합니다.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/work-center" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>작업 로그 / 복구</strong>
            <StatusBadge tone="shared" label="운영" />
          </div>
          <p>실패 작업 복구 화면과 로그 상세를 함께 확인합니다.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/engine/field-sync" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>필드 동기화</strong>
            <StatusBadge tone="shared" label="고급" />
          </div>
          <p>플랫폼 필드를 대상 테이블로 반영하는 운영용 동기화 규칙을 관리합니다.</p>
        </WorkspaceEntryLink>
      </div>

      <details className="card dashboard-legacy-panel">
        <summary>고급 / 레거시 도구</summary>
        <div className="dashboard-legacy-list">
          <WorkspaceEntryLink href="/engine/catalog" className="button ghost" workspaceBehavior="tab">
            초안 카탈로그
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/engine/runs" className="button ghost" workspaceBehavior="tab">
            실행 이력
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/naver/products" className="button ghost" workspaceBehavior="tab">
            NAVER 상품 화면
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/coupang/products" className="button ghost" workspaceBehavior="tab">
            COUPANG 상품 화면
          </WorkspaceEntryLink>
        </div>
      </details>
    </div>
  );
}
