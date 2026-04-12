import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter";
import { AppErrorBoundary } from "./components/app-error-boundary";
import { ModulePlaceholderPage } from "./components/module-placeholder";
import { OperationProvider, useOperations } from "./components/operation-provider";
import { OperationToaster } from "./components/operation-toaster";
import {
  WorkspaceTabsProvider,
  WorkspaceTabsViewport,
  useWorkspaceTabs,
} from "./components/workspace-tabs";
import { SectionLayout, type SectionNavItem } from "./components/section-layout";
import { queryClient } from "./lib/queryClient";
import { resolveWorkspaceRouteMeta } from "./lib/workspace-tabs";
import CatalogPage from "./pages/catalog";
import ChannelsHubPage from "./pages/channels-hub";
import CsHubPage from "./pages/cs-hub";
import CoupangCancelRefundsPage from "./pages/coupang-cancel-refunds";
import CoupangConnectionPage from "./pages/coupang-connection";
import CoupangControlPage from "./pages/coupang-control";
import CoupangCouponsPage from "./pages/coupang-coupons";
import CoupangExchangesPage from "./pages/coupang-exchanges";
import CoupangInquiriesPage from "./pages/coupang-inquiries";
import CoupangLogisticsPage from "./pages/coupang-logistics";
import CoupangOrdersPage from "./pages/coupang-orders";
import CoupangProductsPage from "./pages/coupang-products";
import CoupangReturnsPage from "./pages/coupang-returns";
import CoupangRocketGrowthPage from "./pages/coupang-rocket-growth";
import CoupangSettlementsPage from "./pages/coupang-settlements";
import CoupangShipmentsPage from "./pages/coupang-shipments";
import DashboardPage from "./pages/dashboard";
import DraftPage from "./pages/draft";
import FieldSyncPage from "./pages/field-sync";
import FulfillmentPage from "./pages/fulfillment";
import NaverClaimsPage from "./pages/naver-claims";
import NaverGuidePage from "./pages/naver-guide";
import NaverInquiriesPage from "./pages/naver-inquiries";
import NaverOrdersPage from "./pages/naver-orders";
import NaverProductsPage from "./pages/naver-products";
import NaverSellerInfoPage from "./pages/naver-seller-info";
import NaverSettlementsPage from "./pages/naver-settlements";
import NaverShipmentPage from "./pages/naver-shipment";
import NaverStatsPage from "./pages/naver-stats";
import OperationCenterPage from "./pages/operation-center";
import ProductLibraryPage from "./pages/product-library";
import RunsPage from "./pages/runs";
import SettingsHubPage from "./pages/settings-hub";
import SettingsPage from "./pages/settings";

function isTopNavActive(pathname: string, href: string) {
  return (
    resolveWorkspaceRouteMeta(pathname).topLevelHref === resolveWorkspaceRouteMeta(href).topLevelHref
  );
}

function TopNavButton(props: { href: string; children: ReactNode }) {
  const { activeTab, tabs, activateTab, openTab } = useWorkspaceTabs();
  const active = isTopNavActive(activeTab.pathname, props.href);
  const targetTopLevelHref = resolveWorkspaceRouteMeta(props.href).topLevelHref;

  const handleClick = () => {
    const existingTab = tabs.find(
      (tab) =>
        resolveWorkspaceRouteMeta(tab.pathname, tab.search).topLevelHref === targetTopLevelHref,
    );

    if (existingTab) {
      activateTab(existingTab.id);
      return;
    }

    openTab(props.href);
  };

  return (
    <button
      type="button"
      className={`nav-link ${active ? "active" : ""}`}
      onClick={handleClick}
    >
      {props.children}
    </button>
  );
}

function WorkspaceTabStrip() {
  const { tabs, activeTabId, activateTab, closeTab, closeOtherTabs, closeAllTabs } = useWorkspaceTabs();

  return (
    <div className="topbar-tabs">
      <div className="workspace-tabstrip" role="tablist" aria-label="Workspace tabs">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;

          return (
            <div key={tab.id} className={`workspace-tab ${active ? "active" : ""}`}>
              <button
                type="button"
                role="tab"
                id={`workspace-tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`workspace-panel-${tab.id}`}
                className="workspace-tab-trigger"
                onClick={() => activateTab(tab.id)}
              >
                <span className="workspace-tab-title">{tab.displayTitle}</span>
              </button>
              <button
                type="button"
                className="workspace-tab-close"
                aria-label={`${tab.displayTitle} 닫기`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                x
              </button>
            </div>
          );
        })}
      </div>
      <div className="workspace-tabstrip-actions">
        <button
          type="button"
          className="workspace-tabstrip-action"
          onClick={() => closeOtherTabs(activeTabId)}
          disabled={tabs.length <= 1}
          title="다른 탭 닫기"
        >
          다른 탭 닫기
        </button>
        <button
          type="button"
          className="workspace-tabstrip-action"
          onClick={closeAllTabs}
          title="모두 닫기"
        >
          모두 닫기
        </button>
      </div>
    </div>
  );
}

function renderPlaceholder(input: {
  title: string;
  description: string;
  note?: string;
  badge?: "live" | "draft" | "coming" | "shared";
}) {
  return (
    <ModulePlaceholderPage
      title={input.title}
      description={input.description}
      badge={input.badge ?? "coming"}
      note={input.note}
      rows={[
        {
          id: "001",
          subject: "운영 테이블과 기본 동선은 준비되어 있습니다.",
          status: "준비",
          updatedAt: "채널 연동 대기",
        },
        {
          id: "002",
          subject: "채널별 세부 실행 흐름은 이 화면에 순차 연결됩니다.",
          status: "초안",
          updatedAt: "다음 차수 예정",
        },
      ]}
    />
  );
}

function buildLogCenterRedirect(channel: "naver" | "coupang", currentSearchValue: string) {
  const currentSearch = new URLSearchParams(currentSearchValue);
  const nextSearch = new URLSearchParams({
    tab: "operations",
    channel,
  });
  const logId = currentSearch.get("logId") ?? currentSearch.get("operationId");

  if (logId) {
    nextSearch.set("logId", logId);
  }

  return `/work-center?${nextSearch.toString()}`;
}

function LogCenterRedirect(props: { channel: "naver" | "coupang" }) {
  const search = useSearch();
  return <Redirect to={buildLogCenterRedirect(props.channel, search)} />;
}

function LegacyRunsRedirect() {
  const search = useSearch();
  return <Redirect to={`/engine/runs${search ? `?${search}` : ""}`} />;
}

function WorkCenterRedirect() {
  const search = useSearch();
  return <Redirect to={`/work-center${search ? `?${search}` : ""}`} />;
}

function NaverSection() {
  const [location] = useLocation();
  const navItems: SectionNavItem[] = [
    { href: "/naver/connection", label: "연결 설정", badge: "live" },
    { href: "/naver/orders", label: "주문", badge: "live" },
    { href: "/naver/shipment", label: "출고", badge: "live" },
    { href: "/naver/returns", label: "반품 / 교환", badge: "live" },
    { href: "/naver/inquiries", label: "문의", badge: "live" },
    { href: "/naver/settlements", label: "정산", badge: "live" },
    { href: "/naver/seller-info", label: "판매자 정보", badge: "live" },
    { href: "/naver/logs", label: "로그", badge: "shared" },
  ];

  let content = <NaverProductsPage />;

  if (location.startsWith("/naver/connection")) {
    content = <SettingsPage />;
  } else if (location.startsWith("/naver/bulk-price")) {
    content = <Redirect to="/naver/products" />;
  } else if (location.startsWith("/naver/library")) {
    content = <ProductLibraryPage fixedChannel="naver" />;
  } else if (location.startsWith("/naver/control")) {
    content = <NaverProductsPage />;
  } else if (location.startsWith("/naver/product-edit")) {
    content = <Redirect to="/naver/products" />;
  } else if (location.startsWith("/naver/groups")) {
    content = renderPlaceholder({
      title: "NAVER 묶음 상품",
      description: "묶음 상품 구성과 옵션 관계를 확인하는 레거시 화면입니다.",
    });
  } else if (location.startsWith("/naver/orders")) {
    content = <NaverOrdersPage />;
  } else if (location.startsWith("/naver/shipment")) {
    content = <NaverShipmentPage />;
  } else if (location.startsWith("/naver/returns")) {
    content = <NaverClaimsPage />;
  } else if (location.startsWith("/naver/inquiries")) {
    content = <NaverInquiriesPage />;
  } else if (location.startsWith("/naver/settlements")) {
    content = <NaverSettlementsPage />;
  } else if (location.startsWith("/naver/stats")) {
    content = <NaverStatsPage />;
  } else if (location.startsWith("/naver/seller-info")) {
    content = <NaverSellerInfoPage />;
  } else if (location.startsWith("/naver/logs")) {
    content = <LogCenterRedirect channel="naver" />;
  } else if (location.startsWith("/naver/guide")) {
    content = <NaverGuidePage />;
  }

  return (
    <SectionLayout
      section="NAVER"
      title="NAVER 세부 화면"
      description="메인 운영 데스크에서 내려둔 NAVER 원본 업무 화면입니다. 주문, 출고, 문의, 클레임을 채널 흐름 그대로 확인합니다."
      navItems={navItems}
    >
      {content}
    </SectionLayout>
  );
}

function CoupangSection() {
  const [location] = useLocation();
  const search = useSearch();
  const navItems: SectionNavItem[] = [
    { href: "/coupang/products", label: "상품", badge: "live" },
    { href: "/coupang/control", label: "상품 제어", badge: "live" },
    { href: "/coupang/connection", label: "연결 설정", badge: "live" },
  ];
  const secondaryNavItems: SectionNavItem[] = [
    { href: "/coupang/logistics", label: "물류", badge: "live" },
    { href: "/coupang/cancel-refunds", label: "취소 / 환불", badge: "live" },
    { href: "/coupang/returns", label: "반품", badge: "live" },
    { href: "/coupang/exchanges", label: "교환", badge: "live" },
    { href: "/coupang/inquiries", label: "문의", badge: "live" },
  ];

  let content = <CoupangShipmentsPage />;

  if (location.startsWith("/coupang/connection")) {
    content = <CoupangConnectionPage />;
  } else if (location.startsWith("/coupang/logistics")) {
    content = <CoupangLogisticsPage />;
  } else if (location.startsWith("/coupang/products")) {
    content = <CoupangProductsPage />;
  } else if (location.startsWith("/coupang/product-edit")) {
    content = <Redirect to="/coupang/products" />;
  } else if (location.startsWith("/coupang/bulk-price")) {
    content = <Redirect to="/coupang/products" />;
  } else if (location.startsWith("/coupang/library")) {
    content = <ProductLibraryPage fixedChannel="coupang" />;
  } else if (location.startsWith("/coupang/control")) {
    content = <CoupangControlPage />;
  } else if (location.startsWith("/coupang/orders")) {
    content = <CoupangOrdersPage />;
  } else if (location.startsWith("/coupang/shipments")) {
    content = <Redirect to={`/fulfillment${search ? `?${search}` : ""}`} />;
  } else if (location.startsWith("/coupang/cancel-refunds")) {
    content = <CoupangCancelRefundsPage />;
  } else if (location.startsWith("/coupang/returns")) {
    content = <CoupangReturnsPage />;
  } else if (location.startsWith("/coupang/exchanges")) {
    content = <CoupangExchangesPage />;
  } else if (location.startsWith("/coupang/inquiries")) {
    content = <CoupangInquiriesPage />;
  } else if (location.startsWith("/coupang/coupons")) {
    content = <CoupangCouponsPage />;
  } else if (location.startsWith("/coupang/settlements")) {
    content = <CoupangSettlementsPage />;
  } else if (location.startsWith("/coupang/rocket-growth")) {
    content = <CoupangRocketGrowthPage />;
  } else if (location.startsWith("/coupang/logs")) {
    content = <LogCenterRedirect channel="coupang" />;
  }

  return (
    <SectionLayout
      section="COUPANG"
      title="COUPANG 세부 화면"
      description="메인 운영 데스크에서 내려둔 COUPANG 원본 업무 화면입니다. 출고, 문의, 반품, 교환, 상품 제어를 채널 흐름 그대로 확인합니다."
      navItems={navItems}
      secondaryNavItems={secondaryNavItems}
      secondaryNavTitle="보조 메뉴"
    >
      {content}
    </SectionLayout>
  );
}

function EngineSection() {
  const [location] = useLocation();
  const navItems: SectionNavItem[] = [
    { href: "/engine/overview", label: "개요", badge: "shared" },
    {
      href: "/engine/catalog",
      label: "초안 카탈로그",
      badge: "shared",
      matchPrefixes: ["/engine/drafts"],
    },
    { href: "/engine/field-sync", label: "필드 동기화", badge: "shared" },
    { href: "/engine/runs", label: "실행 이력", badge: "shared" },
  ];

  let content = (
    <ModulePlaceholderPage
      title="고급 / 레거시 운영 엔진"
      description="채널별 운영 화면 아래로 내린 draft, run, field sync 도구입니다. 메인 동선에서는 숨기고 필요할 때만 직접 엽니다."
      badge="shared"
      rows={[
        {
          id: "001",
          subject: "초안은 공통 카탈로그에서 생성할 수 있습니다.",
          status: "공통",
          updatedAt: "사용 가능",
        },
        {
          id: "002",
          subject: "실행 이력과 재시도는 한 화면에서 다시 확인할 수 있습니다.",
          status: "공통",
          updatedAt: "사용 가능",
        },
      ]}
    />
  );

  if (location.startsWith("/engine/catalog")) {
    content = <CatalogPage />;
  } else if (location.startsWith("/engine/field-sync")) {
    content = <FieldSyncPage />;
  } else if (location.startsWith("/engine/library")) {
    content = <Redirect to="/naver/library" />;
  } else if (location.startsWith("/engine/drafts/")) {
    content = <DraftPage />;
  } else if (location.startsWith("/engine/runs")) {
    content = <RunsPage />;
  }

  return (
    <SectionLayout
      section="ENGINE"
      title="고급 / 레거시"
      description="초안, 실행 이력, 필드 동기화 같은 상위 도구를 유지하되 메인 운영 동선에서는 한 단계 내립니다."
      navItems={navItems}
    >
      {content}
    </SectionLayout>
  );
}

function WorkspaceRouteContent() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/fulfillment" component={FulfillmentPage} />
      <Route path="/cs" component={CsHubPage} />
      <Route path="/channels" component={ChannelsHubPage} />
      <Route path="/work-center" component={OperationCenterPage} />

      <Route path="/products">
        <Redirect to="/naver/products" />
      </Route>
      <Route path="/naver-guide">
        <Redirect to="/naver/guide" />
      </Route>
      <Route path="/catalog">
        <Redirect to="/engine/catalog" />
      </Route>
      <Route path="/runs">
        <LegacyRunsRedirect />
      </Route>
      <Route path="/drafts/:id">
        {(params: { id: string }) => <Redirect to={`/engine/drafts/${params.id}`} />}
      </Route>

      <Route path="/operations">
        <WorkCenterRedirect />
      </Route>

      <Route path="/naver">
        <Redirect to="/channels" />
      </Route>
      <Route path="/naver/:rest*">
        <NaverSection />
      </Route>

      <Route path="/coupang">
        <Redirect to="/channels" />
      </Route>
      <Route path="/coupang/:rest*">
        <CoupangSection />
      </Route>

      <Route path="/engine">
        <Redirect to="/engine/overview" />
      </Route>
      <Route path="/engine/:rest*">
        <EngineSection />
      </Route>

      <Route path="/settings">
        <SettingsHubPage />
      </Route>
      <Route path="/settings/naver">
        <Redirect to="/naver/connection" />
      </Route>
      <Route path="/settings/coupang">
        <Redirect to="/coupang/connection" />
      </Route>

      <Route>
        <div className="page">
          <div className="empty">요청한 화면을 찾지 못했습니다.</div>
        </div>
      </Route>
    </Switch>
  );
}

function AppShell() {
  const { operations } = useOperations();
  const { activeTab } = useWorkspaceTabs();
  const activeOperations = operations.filter(
    (operation) => operation.status === "queued" || operation.status === "running",
  ).length;
  const activeMeta = resolveWorkspaceRouteMeta(activeTab.pathname, activeTab.search);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-main">
          <div className="brand">
            <div className="brand-title">KIKIT SyncDesk</div>
            <div className="brand-subtitle">출고 · CS · 실패 작업 복구 중심 운영 데스크</div>
          </div>

          <nav className="nav" aria-label="Workspace menu">
            <TopNavButton href="/dashboard">대시보드</TopNavButton>
            <TopNavButton href="/fulfillment">출고</TopNavButton>
            <TopNavButton href="/cs">CS</TopNavButton>
            <TopNavButton href="/channels">채널</TopNavButton>
            <TopNavButton href="/work-center">
              작업센터{activeOperations ? ` (${activeOperations})` : ""}
            </TopNavButton>
            <TopNavButton href="/settings">설정</TopNavButton>
          </nav>
        </div>

        <WorkspaceTabStrip />
      </header>

      <main className="workspace-main" data-active-top-nav={activeMeta.topLevelHref}>
        <WorkspaceTabsViewport renderContent={() => <WorkspaceRouteContent />} />
      </main>

      <OperationToaster />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <OperationProvider>
        <AppErrorBoundary>
          <WorkspaceTabsProvider>
            <AppShell />
          </WorkspaceTabsProvider>
        </AppErrorBoundary>
      </OperationProvider>
    </QueryClientProvider>
  );
}
