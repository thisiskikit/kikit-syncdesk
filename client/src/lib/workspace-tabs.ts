export type WorkspaceTabRoute = {
  pathname: string;
  search: string;
};

export type WorkspaceTabRecord = {
  id: string;
  pathname: string;
  search: string;
  title: string;
  openedAt: string;
  updatedAt: string;
};

export type PersistedWorkspaceTabs = {
  version: 1;
  tabs: WorkspaceTabRecord[];
  activeTabId: string | null;
};

export type WorkspaceRouteMeta = {
  title: string;
  topLevelHref: string;
};

type WorkspaceTabsState = {
  tabs: WorkspaceTabRecord[];
  activeTabId: string;
};

const WORKSPACE_SNAPSHOT_VERSION = 1;

export const WORKSPACE_TABS_STORAGE_KEY = "kikit:workspace-tabs:v1";

function capitalizeSegment(value: string) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanizePathSegment(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map(capitalizeSegment)
    .join(" ");
}

export function normalizeWorkspaceSearch(search: string | null | undefined) {
  if (!search) {
    return "";
  }

  return search.startsWith("?") ? search.slice(1) : search;
}

export function buildWorkspaceHref(pathname: string, search?: string | null) {
  const normalizedPathname = pathname || "/dashboard";
  const normalizedSearch = normalizeWorkspaceSearch(search);
  return normalizedSearch ? `${normalizedPathname}?${normalizedSearch}` : normalizedPathname;
}

export function parseWorkspaceHref(href: string) {
  const trimmed = href.trim();
  const resolved = new URL(trimmed || "/dashboard", "https://workspace.local");
  return {
    pathname: resolved.pathname || "/dashboard",
    search: normalizeWorkspaceSearch(resolved.search),
  } satisfies WorkspaceTabRoute;
}

export function resolveWorkspaceRouteMeta(pathname: string, search = ""): WorkspaceRouteMeta {
  if (pathname === "/" || pathname === "/dashboard") {
    return {
      title: "Dashboard",
      topLevelHref: "/dashboard",
    };
  }

  if (pathname === "/settings") {
    return {
      title: "Settings",
      topLevelHref: "/settings",
    };
  }

  if (pathname === "/operations") {
    return {
      title: "Operation Center",
      topLevelHref: "/operations",
    };
  }

  if (pathname === "/catalog" || pathname === "/engine/catalog") {
    return {
      title: "Catalog",
      topLevelHref: "/engine/catalog",
    };
  }

  if (pathname === "/runs" || pathname === "/engine/runs") {
    const params = new URLSearchParams(normalizeWorkspaceSearch(search));
    const runId = params.get("runId");
    return {
      title: runId ? `Runs ${runId.slice(0, 8)}` : "Runs",
      topLevelHref: "/engine/catalog",
    };
  }

  if (pathname.startsWith("/drafts/") || pathname.startsWith("/engine/drafts/")) {
    const segments = pathname.split("/").filter(Boolean);
    const draftId = segments[segments.length - 1] ?? "";
    return {
      title: draftId ? `Draft ${draftId.slice(0, 8)}` : "Draft",
      topLevelHref: "/engine/catalog",
    };
  }

  if (pathname.startsWith("/naver")) {
    const segment = pathname.split("/").filter(Boolean)[1] ?? "";
    return {
      title: segment ? `NAVER ${humanizePathSegment(segment)}` : "NAVER",
      topLevelHref: "/naver/products",
    };
  }

  if (pathname.startsWith("/coupang")) {
    const segment = pathname.split("/").filter(Boolean)[1] ?? "";
    return {
      title: segment ? `COUPANG ${humanizePathSegment(segment)}` : "COUPANG",
      topLevelHref: "/coupang/shipments",
    };
  }

  if (pathname.startsWith("/engine")) {
    const segment = pathname.split("/").filter(Boolean)[1] ?? "";
    return {
      title: segment ? `ENGINE ${humanizePathSegment(segment)}` : "ENGINE",
      topLevelHref: "/engine/catalog",
    };
  }

  const fallbackSegment = pathname.split("/").filter(Boolean).at(-1) ?? "workspace";
  return {
    title: humanizePathSegment(fallbackSegment) || "Workspace",
    topLevelHref: pathname,
  };
}

export function createWorkspaceTabRecord(
  route: WorkspaceTabRoute,
  input?: {
    id?: string;
    now?: string;
  },
) {
  const timestamp = input?.now ?? new Date().toISOString();
  return {
    id: input?.id ?? `tab_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
    pathname: route.pathname,
    search: normalizeWorkspaceSearch(route.search),
    title: resolveWorkspaceRouteMeta(route.pathname, route.search).title,
    openedAt: timestamp,
    updatedAt: timestamp,
  } satisfies WorkspaceTabRecord;
}

export function getWorkspaceTabDisplayTitles(tabs: WorkspaceTabRecord[]) {
  const titleCounts = new Map<string, number>();
  const titledTabs = tabs.map((tab) => {
    const nextCount = (titleCounts.get(tab.title) ?? 0) + 1;
    titleCounts.set(tab.title, nextCount);
    return {
      ...tab,
      displayTitle: nextCount > 1 ? `${tab.title} ${nextCount}` : tab.title,
    };
  });

  return titledTabs;
}

export function closeWorkspaceTabState(
  tabs: WorkspaceTabRecord[],
  activeTabId: string,
  closingTabId: string,
  fallbackRoute: WorkspaceTabRoute,
  input?: {
    now?: string;
    fallbackId?: string;
  },
) {
  const closingIndex = tabs.findIndex((tab) => tab.id === closingTabId);
  if (closingIndex === -1) {
    return {
      tabs,
      activeTabId,
    };
  }

  const remainingTabs = tabs.filter((tab) => tab.id !== closingTabId);
  if (remainingTabs.length) {
    if (activeTabId !== closingTabId) {
      return {
        tabs: remainingTabs,
        activeTabId,
      };
    }

    const fallbackIndex = Math.max(0, closingIndex - 1);
    const nextActiveTab = remainingTabs[fallbackIndex] ?? remainingTabs[0];
    return {
      tabs: remainingTabs,
      activeTabId: nextActiveTab.id,
    };
  }

  const fallbackTab = createWorkspaceTabRecord(fallbackRoute, {
    id: input?.fallbackId,
    now: input?.now,
  });
  return {
    tabs: [fallbackTab],
    activeTabId: fallbackTab.id,
  };
}

export function closeOtherWorkspaceTabsState(
  tabs: WorkspaceTabRecord[],
  keepTabId: string,
  fallbackRoute: WorkspaceTabRoute,
  input?: {
    now?: string;
    fallbackId?: string;
  },
) {
  const preservedTab = tabs.find((tab) => tab.id === keepTabId);

  if (!preservedTab) {
    return closeAllWorkspaceTabsState(fallbackRoute, input);
  }

  return {
    tabs: [preservedTab],
    activeTabId: preservedTab.id,
  };
}

export function closeAllWorkspaceTabsState(
  fallbackRoute: WorkspaceTabRoute,
  input?: {
    now?: string;
    fallbackId?: string;
  },
) {
  const fallbackTab = createWorkspaceTabRecord(fallbackRoute, {
    id: input?.fallbackId,
    now: input?.now,
  });

  return {
    tabs: [fallbackTab],
    activeTabId: fallbackTab.id,
  };
}

export function restoreWorkspaceTabs(
  snapshot: PersistedWorkspaceTabs | null | undefined,
  fallbackRoute: WorkspaceTabRoute,
  input?: {
    now?: string;
    fallbackId?: string;
  },
): WorkspaceTabsState {
  const validTabs =
    snapshot?.version === WORKSPACE_SNAPSHOT_VERSION && Array.isArray(snapshot.tabs)
      ? snapshot.tabs.filter(
          (tab) =>
            Boolean(
              tab &&
                typeof tab.id === "string" &&
                typeof tab.pathname === "string" &&
                typeof tab.search === "string" &&
                typeof tab.title === "string" &&
                typeof tab.openedAt === "string" &&
                typeof tab.updatedAt === "string",
            ),
        )
      : [];

  if (!validTabs.length) {
    const fallbackTab = createWorkspaceTabRecord(fallbackRoute, {
      id: input?.fallbackId,
      now: input?.now,
    });
    return {
      tabs: [fallbackTab],
      activeTabId: fallbackTab.id,
    };
  }

  const activeTabId =
    snapshot?.activeTabId && validTabs.some((tab) => tab.id === snapshot.activeTabId)
      ? snapshot.activeTabId
      : validTabs[0].id;

  return {
    tabs: validTabs.map((tab) => ({
      ...tab,
      search: normalizeWorkspaceSearch(tab.search),
      title: resolveWorkspaceRouteMeta(tab.pathname, tab.search).title,
    })),
    activeTabId,
  };
}

export function createPersistedWorkspaceTabs(
  tabs: WorkspaceTabRecord[],
  activeTabId: string | null,
): PersistedWorkspaceTabs {
  return {
    version: WORKSPACE_SNAPSHOT_VERSION,
    tabs,
    activeTabId,
  };
}

export function resolveWorkspacePollingInterval(
  isActiveTab: boolean,
  isPollingEnabled: boolean,
  intervalMs: number,
) {
  return isActiveTab && isPollingEnabled ? intervalMs : false;
}
