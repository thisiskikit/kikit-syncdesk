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
import {
  COUPANG_DEFAULT_WORKSPACE_HREF,
  COUPANG_PRIMARY_NAV_ITEMS,
  COUPANG_SECONDARY_NAV_ITEMS,
} from "./lib/coupang-navigation";
import { queryClient } from "./lib/queryClient";
import { resolveWorkspaceRouteMeta } from "./lib/workspace-tabs";
import CatalogPage from "./pages/catalog";
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
    pathname === href ||
    (href === "/dashboard" && pathname.startsWith("/dashboard")) ||
    (href === "/naver/products" && pathname.startsWith("/naver")) ||
    (href === COUPANG_DEFAULT_WORKSPACE_HREF && pathname.startsWith("/coupang")) ||
    (href === "/engine/catalog" && pathname.startsWith("/engine")) ||
    (href === "/settings" && pathname.startsWith("/settings")) ||
    (href === "/operations" && pathname.startsWith("/operations"))
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
                aria-label={`Close ${tab.displayTitle}`}
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
          title="현재 탭만 남기기 (Ctrl+Alt+Shift+W)"
        >
          다른 탭 닫기
        </button>
        <button
          type="button"
          className="workspace-tabstrip-action"
          onClick={closeAllTabs}
          title="모든 탭 닫기 (Ctrl+Alt+W)"
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
          subject: "Data grid and result table preparation complete",
          status: "Ready",
          updatedAt: "Waiting for channel wiring",
        },
        {
          id: "002",
          subject: "Channel-specific action flow will connect here next",
          status: "Draft",
          updatedAt: "Implementation scheduled",
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

  return `/operations?${nextSearch.toString()}`;
}

function LogCenterRedirect(props: { channel: "naver" | "coupang" }) {
  const search = useSearch();
  return <Redirect to={buildLogCenterRedirect(props.channel, search)} />;
}

function LegacyRunsRedirect() {
  const search = useSearch();
  return <Redirect to={`/engine/runs${search ? `?${search}` : ""}`} />;
}

function NaverSection() {
  const [location] = useLocation();
  const navItems: SectionNavItem[] = [
    { href: "/naver/connection", label: "Connection", badge: "live" },
    { href: "/naver/products", label: "Products", badge: "live" },
    { href: "/naver/control", label: "Price / Stock / Sale", badge: "live" },
    { href: "/naver/library", label: "Library", badge: "shared" },
    { href: "/naver/groups", label: "Grouped Products", badge: "coming" },
    { href: "/naver/orders", label: "Orders", badge: "live" },
    { href: "/naver/shipment", label: "Shipment", badge: "live" },
    { href: "/naver/returns", label: "Returns / Exchanges", badge: "live" },
    { href: "/naver/inquiries", label: "Inquiries", badge: "live" },
    { href: "/naver/settlements", label: "Settlements", badge: "live" },
    { href: "/naver/stats", label: "Stats", badge: "live" },
    { href: "/naver/seller-info", label: "Seller Info", badge: "live" },
    { href: "/naver/logs", label: "Logs", badge: "shared" },
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
      title: "NAVER Grouped Products",
      description: "Review grouped product composition and option relationships here.",
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
      title="NAVER Workspace"
      description="Manage NAVER products, orders, fulfillment, claims, settlements, and seller-facing operations."
      navItems={navItems}
    >
      {content}
    </SectionLayout>
  );
}

function CoupangSection() {
  const [location] = useLocation();
  const navItems: SectionNavItem[] = [...COUPANG_PRIMARY_NAV_ITEMS];
  const secondaryNavItems: SectionNavItem[] = [...COUPANG_SECONDARY_NAV_ITEMS];

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
    content = <CoupangShipmentsPage />;
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
      title="COUPANG Workspace"
      description="Run connection, product, pricing, order, shipping, claims, and settlement workflows for COUPANG."
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
    { href: "/engine/overview", label: "Overview", badge: "shared" },
    {
      href: "/engine/catalog",
      label: "Catalog / Draft",
      badge: "shared",
      matchPrefixes: ["/engine/drafts"],
    },
    { href: "/engine/field-sync", label: "Field Sync / Update", badge: "shared" },
    { href: "/engine/runs", label: "Runs", badge: "shared" },
  ];

  let content = (
    <ModulePlaceholderPage
      title="Shared Draft / Execution Engine"
      description="Bridge NAVER and COUPANG workflows through a shared Draft -> validate -> run pipeline."
      badge="shared"
      rows={[
        {
          id: "001",
          subject: "Drafts can be created from the shared catalog",
          status: "Shared",
          updatedAt: "Available",
        },
        {
          id: "002",
          subject: "Run logs and retries are available from one place",
          status: "Shared",
          updatedAt: "Available",
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
      title="Draft / Runs"
      description="Use shared draft validation and execution flows that sit above the channel-specific workspaces."
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

      <Route path="/naver">
        <Redirect to="/naver/products" />
      </Route>
      <Route path="/naver/:rest*">
        <NaverSection />
      </Route>

      <Route path="/coupang">
        <Redirect to={COUPANG_DEFAULT_WORKSPACE_HREF} />
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

      <Route path="/operations" component={OperationCenterPage} />

      <Route>
        <div className="page">
          <div className="empty">The page could not be found.</div>
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
            <div className="brand-title">KIKIT Channel Control v1</div>
            <div className="brand-subtitle">Operations console / shared draft engine / work center</div>
          </div>

          <nav className="nav" aria-label="Workspace menu">
            <TopNavButton href="/dashboard">Dashboard</TopNavButton>
            <TopNavButton href="/naver/products">NAVER</TopNavButton>
            <TopNavButton href={COUPANG_DEFAULT_WORKSPACE_HREF}>COUPANG</TopNavButton>
            <TopNavButton href="/engine/catalog">Draft / Runs</TopNavButton>
            <TopNavButton href="/settings">Settings</TopNavButton>
            <TopNavButton href="/operations">
              Work Center{activeOperations ? ` (${activeOperations})` : ""}
            </TopNavButton>
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
