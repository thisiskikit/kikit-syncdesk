import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Router, useLocation, useSearch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { LayoutPersistenceManager } from "@/components/layout-persistence-manager";
import {
  WORKSPACE_TABS_STORAGE_KEY,
  buildWorkspaceHref,
  closeAllWorkspaceTabsState,
  closeOtherWorkspaceTabsState,
  closeWorkspaceTabState,
  createPersistedWorkspaceTabs,
  createWorkspaceTabRecord,
  getWorkspaceTabDisplayTitles,
  parseWorkspaceHref,
  restoreWorkspaceTabs,
  type PersistedWorkspaceTabs,
  type WorkspaceTabRecord,
  type WorkspaceTabRoute,
} from "@/lib/workspace-tabs";

type WorkspaceTabView = WorkspaceTabRecord & {
  displayTitle: string;
};

type WorkspaceTabsContextValue = {
  tabs: WorkspaceTabView[];
  activeTabId: string;
  activeTab: WorkspaceTabView;
  openTab: (href: string) => void;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  updateTabRoute: (tabId: string, route: WorkspaceTabRoute) => void;
};

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(null);
const WorkspaceTabActivityContext = createContext<boolean | null>(null);

const DASHBOARD_ROUTE: WorkspaceTabRoute = {
  pathname: "/dashboard",
  search: "",
};

function readPersistedWorkspaceTabs() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_TABS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedWorkspaceTabs;
  } catch {
    return null;
  }
}

function buildInitialWorkspaceState() {
  const persisted = readPersistedWorkspaceTabs();
  const fallbackRoute = parseWorkspaceHref(
    typeof window === "undefined"
      ? buildWorkspaceHref(DASHBOARD_ROUTE.pathname, DASHBOARD_ROUTE.search)
      : `${window.location.pathname}${window.location.search}`,
  );

  return restoreWorkspaceTabs(persisted, fallbackRoute, {
    fallbackId: "tab_dashboard",
  });
}

function WorkspaceTabRouteTracker(props: { tabId: string }) {
  const [pathname] = useLocation();
  const search = useSearch();
  const { updateTabRoute } = useWorkspaceTabs();

  useEffect(() => {
    updateTabRoute(props.tabId, {
      pathname,
      search,
    });
  }, [pathname, props.tabId, search, updateTabRoute]);

  return null;
}

function WorkspaceTabPanel(props: {
  tab: WorkspaceTabView;
  isActive: boolean;
  renderContent: () => ReactNode;
}) {
  const [router] = useState(() =>
    memoryLocation({
      path: buildWorkspaceHref(props.tab.pathname, props.tab.search),
    }),
  );
  const [scope, setScope] = useState<HTMLDivElement | null>(null);

  return (
    <div
      ref={setScope}
      className="workspace-panel"
      id={`workspace-panel-${props.tab.id}`}
      role="tabpanel"
      aria-hidden={!props.isActive}
      hidden={!props.isActive}
      data-tab-id={props.tab.id}
    >
      <Router hook={router.hook}>
        <WorkspaceTabActivityContext.Provider value={props.isActive}>
          <WorkspaceTabRouteTracker tabId={props.tab.id} />
          <LayoutPersistenceManager scope={scope} />
          {props.renderContent()}
        </WorkspaceTabActivityContext.Provider>
      </Router>
    </div>
  );
}

export function WorkspaceTabsProvider(props: { children: ReactNode }) {
  const [browserPathname, browserNavigate] = useLocation();
  const browserSearch = useSearch();
  const [state, setState] = useState(buildInitialWorkspaceState);

  const tabs = useMemo(() => getWorkspaceTabDisplayTitles(state.tabs), [state.tabs]);
  const activeTab = tabs.find((tab) => tab.id === state.activeTabId) ?? tabs[0];
  const safeActiveTab = activeTab ?? tabs[0]!;

  useEffect(() => {
    const nextHref = buildWorkspaceHref(safeActiveTab.pathname, safeActiveTab.search);
    const currentHref = buildWorkspaceHref(browserPathname, browserSearch);

    if (nextHref === currentHref) {
      return;
    }

    browserNavigate(nextHref, { replace: true });
  }, [browserNavigate, browserPathname, browserSearch, safeActiveTab.pathname, safeActiveTab.search]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        WORKSPACE_TABS_STORAGE_KEY,
        JSON.stringify(createPersistedWorkspaceTabs(state.tabs, state.activeTabId)),
      );
    } catch {
      return;
    }
  }, [state.activeTabId, state.tabs]);

  const value = useMemo<WorkspaceTabsContextValue>(() => {
    const openTab = (href: string) => {
      const route = parseWorkspaceHref(href);

      startTransition(() => {
        setState((current) => {
          const nextTab = createWorkspaceTabRecord(route);
          return {
            tabs: [...current.tabs, nextTab],
            activeTabId: nextTab.id,
          };
        });
      });
    };

    const activateTab = (tabId: string) => {
      startTransition(() => {
        setState((current) =>
          current.activeTabId === tabId
            ? current
            : {
                ...current,
                activeTabId: tabId,
              },
        );
      });
    };

    const closeTab = (tabId: string) => {
      startTransition(() => {
        setState((current) =>
          closeWorkspaceTabState(current.tabs, current.activeTabId, tabId, DASHBOARD_ROUTE),
        );
      });
    };

    const closeOtherTabs = (tabId: string) => {
      startTransition(() => {
        setState((current) => closeOtherWorkspaceTabsState(current.tabs, tabId, DASHBOARD_ROUTE));
      });
    };

    const closeAllTabs = () => {
      startTransition(() => {
        setState(() =>
          closeAllWorkspaceTabsState(DASHBOARD_ROUTE, {
            fallbackId: "tab_dashboard",
          }),
        );
      });
    };

    const updateTabRoute = (tabId: string, route: WorkspaceTabRoute) => {
      setState((current) => {
        let changed = false;
        const nextTabs = current.tabs.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }

          const normalizedHref = buildWorkspaceHref(route.pathname, route.search);
          const currentHref = buildWorkspaceHref(tab.pathname, tab.search);
          if (normalizedHref === currentHref) {
            return tab;
          }

          changed = true;
          return {
            ...tab,
            pathname: route.pathname,
            search: route.search,
            title: createWorkspaceTabRecord(route, {
              id: tab.id,
              now: tab.updatedAt,
            }).title,
            updatedAt: new Date().toISOString(),
          };
        });

        return changed
          ? {
              ...current,
              tabs: nextTabs,
            }
          : current;
      });
    };

    return {
      tabs,
      activeTabId: safeActiveTab.id,
      activeTab: safeActiveTab,
      openTab,
      activateTab,
      closeTab,
      closeOtherTabs,
      closeAllTabs,
      updateTabRoute,
    };
  }, [safeActiveTab, tabs]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifier || !event.altKey || event.key.toLowerCase() !== "w") {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        value.closeOtherTabs(safeActiveTab.id);
        return;
      }

      value.closeAllTabs();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [safeActiveTab.id, value]);

  if (!activeTab) {
    return null;
  }

  return <WorkspaceTabsContext.Provider value={value}>{props.children}</WorkspaceTabsContext.Provider>;
}

export function WorkspaceTabsViewport(props: { renderContent: () => ReactNode }) {
  const { tabs, activeTabId } = useWorkspaceTabs();

  return (
    <div className="workspace-panels">
      {tabs.map((tab) => (
        <WorkspaceTabPanel
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          renderContent={props.renderContent}
        />
      ))}
    </div>
  );
}

export function WorkspaceEntryLink(
  props: Omit<ComponentPropsWithoutRef<"a">, "href"> & {
    href: string;
    workspaceBehavior?: "navigate" | "tab";
  },
) {
  const { openTab } = useWorkspaceTabs();
  const [, navigate] = useLocation();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      props.target === "_blank" ||
      props.download
    ) {
      return;
    }

    event.preventDefault();
    if (props.workspaceBehavior === "tab") {
      openTab(props.href);
      return;
    }

    navigate(props.href);
  };

  return <a {...props} href={props.href} onClick={handleClick} />;
}

export function useWorkspaceTabs() {
  const value = useContext(WorkspaceTabsContext);

  if (!value) {
    throw new Error("useWorkspaceTabs must be used inside WorkspaceTabsProvider.");
  }

  return value;
}

export function useWorkspaceTabActivity() {
  const value = useContext(WorkspaceTabActivityContext);
  return value ?? true;
}
