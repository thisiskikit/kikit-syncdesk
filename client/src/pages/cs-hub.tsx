import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type { CoupangShipmentWorksheetViewResponse, CoupangStoreSummary } from "@shared/coupang";
import { useSearch } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { WorkspaceEntryLink } from "@/components/workspace-tabs";
import {
  buildFulfillmentWorkspaceHref,
  buildWorkCenterWorkspaceHref,
  parseCsHubWorkspaceSearch,
} from "@/lib/ops-handoff-links";
import { getJson } from "@/lib/queryClient";
import { buildFulfillmentDecisionCounts } from "@/features/coupang/shipments/fulfillment-decision";

interface NaverStoresResponse {
  items: ChannelStoreSummary[];
}

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

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

export default function CsHubPage() {
  const search = useSearch();
  const naverStoresQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<NaverStoresResponse>("/api/settings/stores"),
  });
  const coupangStoresQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const firstCoupangStore = (coupangStoresQuery.data?.items ?? []).find(
    (store) => store.connectionTest.status === "success",
  );
  const fulfillmentImpactQuery = useQuery({
    queryKey: ["/api/coupang/shipments/worksheet/view", "cs-hub", firstCoupangStore?.id ?? null],
    queryFn: () =>
      getJson<CoupangShipmentWorksheetViewResponse>(buildWorksheetStartUrl(firstCoupangStore?.id ?? "")),
    enabled: Boolean(firstCoupangStore?.id),
  });

  const fulfillmentImpact = buildFulfillmentDecisionCounts(fulfillmentImpactQuery.data?.items ?? []);
  const naverConnected = (naverStoresQuery.data?.items ?? []).filter((store) => store.connectionTest.status === "success").length;
  const coupangConnected = (coupangStoresQuery.data?.items ?? []).filter((store) => store.connectionTest.status === "success").length;
  const handoffContext = useMemo(() => parseCsHubWorkspaceSearch(search), [search]);
  const contextGuide = useMemo(() => {
    const sourceLabel =
      handoffContext.source === "fulfillment"
        ? "출고"
        : handoffContext.source === "work-center"
          ? "작업센터"
          : handoffContext.source === "dashboard"
            ? "대시보드"
            : null;

    if (handoffContext.focus === "claims") {
      return {
        title: "차단 주문의 원인부터 확인합니다.",
        description: `${sourceLabel ?? "운영 화면"}에서 들어온 차단/클레임 문맥입니다. 취소, 반품, 교환, 출고중지 여부를 채널 원본 화면에서 먼저 확인한 뒤 출고로 돌아가세요.`,
        links: [
          {
            href: buildFulfillmentWorkspaceHref({ decisionStatus: "blocked" }),
            label: "차단 주문 다시 보기",
          },
          {
            href: buildWorkCenterWorkspaceHref({
              tab: "operations",
              channel: "coupang",
              status: "error",
            }),
            label: "작업센터 복구 보기",
            variant: "ghost" as const,
          },
        ],
      };
    }

    if (handoffContext.focus === "recovery") {
      return {
        title: "복구 전에 CS 영향부터 정리합니다.",
        description: `${sourceLabel ?? "운영 화면"}에서 들어온 복구 문맥입니다. 문의·클레임 영향이 남아 있으면 재시도보다 먼저 채널 원본 화면과 출고 판단을 다시 맞춥니다.`,
        links: [
          {
            href: buildWorkCenterWorkspaceHref({
              tab: "operations",
              channel: "coupang",
              status: "error",
            }),
            label: "작업센터로 돌아가기",
          },
          {
            href: buildFulfillmentWorkspaceHref({ decisionStatus: "recheck" }),
            label: "재확인 주문 보기",
            variant: "ghost" as const,
          },
        ],
      };
    }

    if (handoffContext.focus === "inquiries" || handoffContext.focus === "fulfillment-impact") {
      return {
        title: "CS 영향 주문을 먼저 분기합니다.",
        description: `${sourceLabel ?? "운영 화면"}에서 들어온 CS 영향 문맥입니다. 문의·보류·출고 영향 주문은 CS 허브에서 원본 화면으로 들어간 뒤 출고 판단으로 다시 이어집니다.`,
        links: [
          {
            href: buildFulfillmentWorkspaceHref({ decisionStatus: "hold" }),
            label: "보류 주문 다시 보기",
          },
          {
            href: buildWorkCenterWorkspaceHref({
              tab: "operations",
              channel: "coupang",
              status: "warning",
            }),
            label: "경고 로그 보기",
            variant: "ghost" as const,
          },
        ],
      };
    }

    return null;
  }, [handoffContext.focus, handoffContext.source]);

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="CS 허브" />
          <StatusBadge tone="live" label="출고 영향 연동" />
        </div>
        <h1>CS</h1>
        <p>
          CS는 별도 처리 화면이면서 동시에 출고 판단에 영향을 주는 레이어입니다. 채널별 원본 화면은 유지하되,
          운영자는 여기서 문의·클레임·출고 영향 이슈를 빠르게 분기합니다.
        </p>
      </div>

      {contextGuide ? (
        <div className="card">
          <div className="shipment-filter-summary-header">
            <div>
              <div className="shipment-filter-summary-label">이번 진입 문맥</div>
              <strong>{contextGuide.title}</strong>
              <div className="muted shipment-filter-summary-note">{contextGuide.description}</div>
            </div>
            <div className="shipment-filter-summary-actions">
              {contextGuide.links.map((link) => (
                <WorkspaceEntryLink
                  key={`${link.href}:${link.label}`}
                  href={link.href}
                  className={`button${link.variant === "ghost" ? " ghost" : " secondary"}`}
                  workspaceBehavior="tab"
                >
                  {link.label}
                </WorkspaceEntryLink>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="dashboard-grid">
        <WorkspaceEntryLink href="/naver/inquiries" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>응답 필요 문의</strong>
            <span className="shipment-decision-badge hold">NAVER</span>
          </div>
          <p>NAVER 문의 화면으로 이동해 고객 문의와 상품 문의 응답을 바로 처리합니다.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/coupang/inquiries" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>COUPANG 문의</strong>
            <span className="shipment-decision-badge hold">COUPANG</span>
          </div>
          <p>상품 문의와 고객센터 문의를 채널 원본 흐름 그대로 확인합니다.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink href="/naver/returns" className="dashboard-card" workspaceBehavior="tab">
          <div className="dashboard-card-header">
            <strong>반품 / 교환 / 클레임</strong>
            <span className="shipment-decision-badge blocked">예외</span>
          </div>
          <p>NAVER 클레임 화면에서 반품, 교환, 보류, 재배송 같은 예외 처리를 진행합니다.</p>
        </WorkspaceEntryLink>

        <WorkspaceEntryLink
          href={buildFulfillmentWorkspaceHref({ decisionStatus: "hold" })}
          className="dashboard-card"
          workspaceBehavior="tab"
        >
          <div className="dashboard-card-header">
            <strong>출고 영향 이슈</strong>
            <span className="shipment-decision-badge recheck">
              {fulfillmentImpact.blocked + fulfillmentImpact.hold + fulfillmentImpact.recheck}건
            </span>
          </div>
          <p>출고 차단·보류·재확인 필요 주문을 출고 화면에서 다시 판단합니다.</p>
        </WorkspaceEntryLink>
      </div>

      <div className="card">
        <div className="dashboard-section-header">
          <div>
            <h2>채널별 연결 상태</h2>
            <p>CS 허브는 채널별 원본 작업 화면으로 이어지는 운영용 허브입니다.</p>
          </div>
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
            <div className="metric-label">출고 차단</div>
            <div className="metric-value">{fulfillmentImpact.blocked}</div>
          </div>
          <div className="metric">
            <div className="metric-label">출고 재확인</div>
            <div className="metric-value">{fulfillmentImpact.recheck}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
