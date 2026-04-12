import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type { CoupangShipmentWorksheetViewResponse, CoupangStoreSummary } from "@shared/coupang";
import type { MenuStateResponse } from "@shared/ui-state";
import {
  getOperationErrorSummary,
  getOperationResultSummaryText,
  getOperationTitle,
} from "@shared/operations";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import { getJson } from "@/lib/queryClient";
import { buildFulfillmentDecisionCounts } from "@/features/coupang/shipments/fulfillment-decision";

interface NaverStoresResponse {
  items: ChannelStoreSummary[];
}

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type ShipmentMenuState = {
  selectedStoreId?: string;
};

function buildWorksheetStartUrl(storeId: string) {
  const params = new URLSearchParams({
    storeId,
    scope: "dispatch_active",
    page: "1",
    pageSize: "50",
    query: "",
    invoiceStatusCard: "all",
    orderStatusCard: "all",
    outputStatusCard: "all",
  });

  return `/api/coupang/shipments/worksheet/view?${params.toString()}`;
}

function pickConnectedStore<T extends { id: string; connectionTest: { status: string } }>(
  stores: readonly T[],
  preferredId: string | null,
) {
  const connectedStores = stores.filter((store) => store.connectionTest.status === "success");
  if (!connectedStores.length) {
    return null;
  }

  return connectedStores.find((store) => store.id === preferredId) ?? connectedStores[0] ?? null;
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

  const shipmentMenuStateQuery = useQuery({
    queryKey: ["/api/ui-state", "coupang.shipments"],
    queryFn: () => getJson<MenuStateResponse<ShipmentMenuState>>("/api/ui-state?key=coupang.shipments"),
  });

  const preferredShipmentStoreId = shipmentMenuStateQuery.data?.item?.value?.selectedStoreId ?? null;
  const preferredShipmentStore = pickConnectedStore(
    coupangStoresQuery.data?.items ?? [],
    preferredShipmentStoreId,
  );

  const shipmentViewQuery = useQuery({
    queryKey: ["/api/coupang/shipments/worksheet/view", preferredShipmentStore?.id ?? null],
    queryFn: () =>
      getJson<CoupangShipmentWorksheetViewResponse>(
        buildWorksheetStartUrl(preferredShipmentStore?.id ?? ""),
      ),
    enabled: Boolean(preferredShipmentStore?.id),
  });

  const shipmentDecisionCounts = useMemo(
    () => buildFulfillmentDecisionCounts(shipmentViewQuery.data?.items ?? []),
    [shipmentViewQuery.data?.items],
  );

  const activeOperations = operations.filter(
    (operation) => operation.status === "queued" || operation.status === "running",
  );
  const retryableOperations = operations.filter((operation) => operation.retryable);
  const recentIssues = operations.filter(
    (operation) => operation.status === "warning" || operation.status === "error",
  );
  const connectedNaverCount = (naverStoresQuery.data?.items ?? []).filter(
    (store) => store.connectionTest.status === "success",
  ).length;
  const connectedCoupangCount = (coupangStoresQuery.data?.items ?? []).filter(
    (store) => store.connectionTest.status === "success",
  ).length;

  const priorityItems = [
    shipmentDecisionCounts.blocked > 0
      ? {
          title: "차단 주문 확인",
          summary: `현재 출고 화면 첫 페이지에 차단 ${shipmentDecisionCounts.blocked}건이 있습니다.`,
          href: "/fulfillment",
          tone: "blocked",
        }
      : null,
    shipmentDecisionCounts.recheck > 0
      ? {
          title: "재확인 필요 주문 점검",
          summary: `송장 실패나 동기화 이슈가 있는 주문 ${shipmentDecisionCounts.recheck}건을 먼저 확인하세요.`,
          href: "/fulfillment",
          tone: "recheck",
        }
      : null,
    retryableOperations.length > 0
      ? {
          title: "실패 작업 복구",
          summary: `재시도 가능한 작업 ${retryableOperations.length}건이 남아 있습니다.`,
          href: "/work-center",
          tone: "hold",
        }
      : null,
    activeOperations.length > 0
      ? {
          title: "진행 중 작업 확인",
          summary: `현재 실행 중인 작업 ${activeOperations.length}건의 상태를 확인하세요.`,
          href: "/work-center",
          tone: "invoice",
        }
      : null,
  ].filter(Boolean) as Array<{ title: string; summary: string; href: string; tone: string }>;

  return (
    <div className="page dashboard-ops-page">
      <div className="hero dashboard-ops-hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="운영 시작점" />
          {preferredShipmentStore ? <StatusBadge tone="live" label={preferredShipmentStore.storeName} /> : null}
        </div>
        <h1>KIKIT SyncDesk</h1>
        <p>
          오늘 필요한 출고 판단, CS 확인, 실패 작업 복구를 여기서 시작합니다. 채널 화면은 세부 작업과 원본 확인용
          레이어로 내려두고, 운영 동선은 액션 중심으로 다시 묶었습니다.
        </p>
      </div>

      <div className="dashboard-channel-strip card">
        <div className="dashboard-channel-strip-item">
          <span className="muted">COUPANG 연결</span>
          <strong>{connectedCoupangCount}개</strong>
        </div>
        <div className="dashboard-channel-strip-item">
          <span className="muted">NAVER 연결</span>
          <strong>{connectedNaverCount}개</strong>
        </div>
        <div className="dashboard-channel-strip-item">
          <span className="muted">실행 중 작업</span>
          <strong>{activeOperations.length}건</strong>
        </div>
        <div className="dashboard-channel-strip-item">
          <span className="muted">재시도 가능</span>
          <strong>{retryableOperations.length}건</strong>
        </div>
      </div>

      <section className="dashboard-section card">
        <div className="dashboard-section-header">
          <div>
            <h2>핵심 액션</h2>
            <p>작업이 필요한 화면으로 바로 진입합니다.</p>
          </div>
        </div>
        <div className="dashboard-grid dashboard-action-grid">
          <WorkspaceEntryLink href="/fulfillment" className="dashboard-card" workspaceBehavior="tab">
            <div className="dashboard-card-header">
              <strong>출고 판단</strong>
              <span className="shipment-decision-badge ready">출고</span>
            </div>
            <p>빠른 수집, 상품준비중 처리, 송장 입력과 전송까지 출고 실행을 한 화면에서 다룹니다.</p>
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/fulfillment" className="dashboard-card" workspaceBehavior="tab">
            <div className="dashboard-card-header">
              <strong>송장 대기</strong>
              <span className="shipment-decision-badge invoice">{shipmentDecisionCounts.invoice_waiting}건</span>
            </div>
            <p>송장 입력 또는 송장 전송이 필요한 주문부터 먼저 정리합니다.</p>
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/cs" className="dashboard-card" workspaceBehavior="tab">
            <div className="dashboard-card-header">
              <strong>CS 확인</strong>
              <span className="shipment-decision-badge hold">연결</span>
            </div>
            <p>문의, 반품, 교환, 출고 영향 이슈를 채널 화면으로 빠르게 이동해 확인합니다.</p>
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/work-center" className="dashboard-card" workspaceBehavior="tab">
            <div className="dashboard-card-header">
              <strong>실패 작업 복구</strong>
              <span className="shipment-decision-badge blocked">{recentIssues.length}건</span>
            </div>
            <p>warning, error, retryable 작업을 우선 순서로 확인하고 바로 재시도할 수 있습니다.</p>
          </WorkspaceEntryLink>
        </div>
      </section>

      <div className="dashboard-ops-layout">
        <section className="card dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <h2>지금 먼저 볼 것</h2>
              <p>오늘 운영에서 먼저 확인할 우선순위입니다.</p>
            </div>
          </div>
          {priorityItems.length ? (
            <div className="dashboard-priority-list">
              {priorityItems.map((item) => (
                <WorkspaceEntryLink key={item.title} href={item.href} className="dashboard-priority-item" workspaceBehavior="tab">
                  <span className={`shipment-decision-badge ${item.tone}`}>{item.title}</span>
                  <strong>{item.summary}</strong>
                </WorkspaceEntryLink>
              ))}
            </div>
          ) : (
            <div className="empty">지금 우선 처리할 경고 항목은 보이지 않습니다. 출고 화면에서 신규 수집 상태를 확인해 주세요.</div>
          )}
        </section>

        <section className="card dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <h2>최근 이슈</h2>
              <p>최근 warning/error 작업을 작업센터로 이어서 봅니다.</p>
            </div>
          </div>
          {recentIssues.length ? (
            <div className="dashboard-issue-list">
              {recentIssues.slice(0, 6).map((operation) => (
                <WorkspaceEntryLink
                  key={operation.id}
                  href={`/work-center?tab=operations&logId=${encodeURIComponent(operation.id)}`}
                  className="dashboard-issue-item"
                  workspaceBehavior="tab"
                >
                  <div className="dashboard-issue-item-header">
                    <strong>{getOperationTitle(operation)}</strong>
                    <span className={`status-pill ${operation.status}`}>{operation.status}</span>
                  </div>
                  <div className="muted">
                    {getOperationErrorSummary(operation) ??
                      getOperationResultSummaryText(operation.resultSummary) ??
                      "요약 정보 없음"}
                  </div>
                </WorkspaceEntryLink>
              ))}
            </div>
          ) : (
            <div className="empty">최근 warning / error 작업이 없습니다.</div>
          )}
        </section>
      </div>

      <section className="card dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <h2>빠른 작업 패널</h2>
            <p>운영자가 가장 자주 여는 화면을 바로 엽니다.</p>
          </div>
        </div>
        <div className="dashboard-quick-actions">
          <WorkspaceEntryLink href="/fulfillment" className="button" workspaceBehavior="tab">
            출고 화면 열기
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/cs" className="button secondary" workspaceBehavior="tab">
            CS 허브 열기
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/work-center" className="button ghost" workspaceBehavior="tab">
            작업센터 열기
          </WorkspaceEntryLink>
          <WorkspaceEntryLink href="/channels" className="button ghost" workspaceBehavior="tab">
            채널 허브 열기
          </WorkspaceEntryLink>
        </div>
      </section>
    </div>
  );
}
