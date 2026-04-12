import { describe, expect, it } from "vitest";
import {
  closeAllWorkspaceTabsState,
  closeOtherWorkspaceTabsState,
  closeWorkspaceTabState,
  createPersistedWorkspaceTabs,
  createWorkspaceTabRecord,
  getWorkspaceTabDisplayTitles,
  resolveWorkspacePollingInterval,
  resolveWorkspaceRouteMeta,
  restoreWorkspaceTabs,
  type WorkspaceTabRoute,
} from "@/lib/workspace-tabs";

const DASHBOARD_ROUTE: WorkspaceTabRoute = {
  pathname: "/dashboard",
  search: "",
};

describe("workspace tab state helpers", () => {
  it("keeps the tab to the left active when closing the current tab", () => {
    const tabs = [
      createWorkspaceTabRecord({ pathname: "/dashboard", search: "" }, { id: "a", now: "2026-03-28T12:00:00.000Z" }),
      createWorkspaceTabRecord({ pathname: "/naver/products", search: "" }, { id: "b", now: "2026-03-28T12:01:00.000Z" }),
      createWorkspaceTabRecord({ pathname: "/coupang/products", search: "" }, { id: "c", now: "2026-03-28T12:02:00.000Z" }),
    ];

    expect(closeWorkspaceTabState(tabs, "b", "b", DASHBOARD_ROUTE)).toEqual({
      tabs: [tabs[0], tabs[2]],
      activeTabId: "a",
    });
  });

  it("creates a dashboard fallback tab when closing the last remaining tab", () => {
    const onlyTab = createWorkspaceTabRecord(
      { pathname: "/naver/products", search: "storeId=1" },
      { id: "naver-only", now: "2026-03-28T12:03:00.000Z" },
    );

    expect(
      closeWorkspaceTabState([onlyTab], onlyTab.id, onlyTab.id, DASHBOARD_ROUTE, {
        fallbackId: "dashboard-fallback",
        now: "2026-03-28T12:04:00.000Z",
      }),
    ).toEqual({
      tabs: [
        createWorkspaceTabRecord(DASHBOARD_ROUTE, {
          id: "dashboard-fallback",
          now: "2026-03-28T12:04:00.000Z",
        }),
      ],
      activeTabId: "dashboard-fallback",
    });
  });

  it("keeps only the requested tab when closing the others", () => {
    const tabs = [
      createWorkspaceTabRecord({ pathname: "/dashboard", search: "" }, { id: "a", now: "2026-03-28T12:00:00.000Z" }),
      createWorkspaceTabRecord({ pathname: "/naver/products", search: "" }, { id: "b", now: "2026-03-28T12:01:00.000Z" }),
      createWorkspaceTabRecord({ pathname: "/coupang/shipments", search: "" }, { id: "c", now: "2026-03-28T12:02:00.000Z" }),
    ];

    expect(closeOtherWorkspaceTabsState(tabs, "b", DASHBOARD_ROUTE)).toEqual({
      tabs: [tabs[1]],
      activeTabId: "b",
    });
  });

  it("creates a dashboard fallback tab when closing every workspace tab at once", () => {
    expect(
      closeAllWorkspaceTabsState(DASHBOARD_ROUTE, {
        fallbackId: "dashboard-fallback",
        now: "2026-03-28T12:04:00.000Z",
      }),
    ).toEqual({
      tabs: [
        createWorkspaceTabRecord(DASHBOARD_ROUTE, {
          id: "dashboard-fallback",
          now: "2026-03-28T12:04:00.000Z",
        }),
      ],
      activeTabId: "dashboard-fallback",
    });
  });

  it("restores persisted tabs and falls back to the first tab when the active id is stale", () => {
    const tabs = [
      createWorkspaceTabRecord({ pathname: "/fulfillment", search: "" }, { id: "fulfillment", now: "2026-03-28T12:00:00.000Z" }),
      createWorkspaceTabRecord({ pathname: "/work-center", search: "tab=operations" }, { id: "ops", now: "2026-03-28T12:01:00.000Z" }),
    ];

    const snapshot = createPersistedWorkspaceTabs(tabs, "missing");

    expect(restoreWorkspaceTabs(snapshot, DASHBOARD_ROUTE)).toEqual({
      tabs,
      activeTabId: "fulfillment",
    });
  });
});

describe("workspace route metadata", () => {
  it("resolves draft titles from dynamic routes", () => {
    expect(resolveWorkspaceRouteMeta("/engine/drafts/draft_1234567890", "")).toEqual({
      title: "초안 draft_12",
      topLevelHref: "/settings",
    });
  });

  it("pins all coupang routes to the shipments workspace entry", () => {
    expect(resolveWorkspaceRouteMeta("/coupang/products", "")).toEqual({
      title: "COUPANG Products",
      topLevelHref: "/channels",
    });

    expect(resolveWorkspaceRouteMeta("/coupang/returns", "storeId=1")).toEqual({
      title: "CS Returns",
      topLevelHref: "/cs",
    });

    expect(resolveWorkspaceRouteMeta("/coupang/shipments", "")).toEqual({
      title: "출고",
      topLevelHref: "/fulfillment",
    });
  });

  it("adds suffixes only for duplicate titles", () => {
    const tabs = [
      createWorkspaceTabRecord({ pathname: "/naver/products", search: "" }, { id: "naver-1", now: "2026-03-28T12:00:00.000Z" }),
      createWorkspaceTabRecord({ pathname: "/naver/products", search: "storeId=2" }, { id: "naver-2", now: "2026-03-28T12:01:00.000Z" }),
      createWorkspaceTabRecord({ pathname: "/work-center", search: "" }, { id: "ops", now: "2026-03-28T12:02:00.000Z" }),
    ];

    expect(getWorkspaceTabDisplayTitles(tabs)).toEqual([
      { ...tabs[0], displayTitle: "NAVER Products" },
      { ...tabs[1], displayTitle: "NAVER Products 2" },
      { ...tabs[2], displayTitle: "작업센터" },
    ]);
  });
});

describe("workspace polling helper", () => {
  it("disables polling when the tab is inactive", () => {
    expect(resolveWorkspacePollingInterval(false, true, 1000)).toBe(false);
    expect(resolveWorkspacePollingInterval(true, true, 1000)).toBe(1000);
    expect(resolveWorkspacePollingInterval(true, false, 1000)).toBe(false);
  });
});
