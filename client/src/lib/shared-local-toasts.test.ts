import { describe, expect, it } from "vitest";
import {
  flattenSharedLocalToasts,
  pruneSharedLocalToastStore,
  removeSharedLocalToast,
  updateSharedLocalToastOwner,
  type SharedLocalToastStore,
} from "./shared-local-toasts";

function createStore(now: number): SharedLocalToastStore {
  return {
    ownerA: {
      ownerId: "ownerA",
      lastSeenAt: new Date(now).toISOString(),
      toasts: {
        "local:a": {
          id: "local:a",
          source: "local",
          ownerId: "ownerA",
          channel: "naver",
          title: "NAVER sync",
          targetCount: 1,
          status: "running",
          summary: null,
          errorMessage: null,
          startedAt: new Date(now).toISOString(),
          finishedAt: null,
          updatedAt: new Date(now).toISOString(),
        },
      },
    },
  };
}

describe("shared-local-toasts", () => {
  it("keeps owners isolated when one owner updates its own local toasts", () => {
    const now = Date.UTC(2026, 3, 1, 0, 0, 0);
    const initialStore = createStore(now);

    const nextStore = updateSharedLocalToastOwner(
      initialStore,
      "ownerB",
      {
        "local:b": {
          id: "local:b",
          source: "local",
          ownerId: "ownerB",
          channel: "coupang",
          title: "COUPANG sync",
          targetCount: 2,
          status: "running",
          summary: null,
          errorMessage: null,
          startedAt: new Date(now).toISOString(),
          finishedAt: null,
          updatedAt: new Date(now).toISOString(),
        },
      },
      now,
    );

    expect(Object.keys(flattenSharedLocalToasts(nextStore)).sort()).toEqual([
      "local:a",
      "local:b",
    ]);
  });

  it("drops stale running toasts when the owning window stops heartbeating", () => {
    const now = Date.UTC(2026, 3, 1, 0, 0, 30);
    const staleStore: SharedLocalToastStore = {
      ownerA: {
        ownerId: "ownerA",
        lastSeenAt: new Date(now - 25_000).toISOString(),
        toasts: {
          "local:a": {
            id: "local:a",
            source: "local",
            ownerId: "ownerA",
            channel: "naver",
            title: "NAVER sync",
            targetCount: 1,
            status: "running",
            summary: null,
            errorMessage: null,
            startedAt: new Date(now - 25_000).toISOString(),
            finishedAt: null,
            updatedAt: new Date(now - 25_000).toISOString(),
          },
        },
      },
    };

    expect(pruneSharedLocalToastStore(staleStore, now)).toEqual({});
  });

  it("keeps finished warning toasts only during their visibility window", () => {
    const now = Date.UTC(2026, 3, 1, 0, 0, 30);
    const store: SharedLocalToastStore = {
      ownerA: {
        ownerId: "ownerA",
        lastSeenAt: new Date(now).toISOString(),
        toasts: {
          "local:recent": {
            id: "local:recent",
            source: "local",
            ownerId: "ownerA",
            channel: "naver",
            title: "Recent warning",
            targetCount: 1,
            status: "warning",
            summary: "recent",
            errorMessage: null,
            startedAt: new Date(now - 2_000).toISOString(),
            finishedAt: new Date(now - 2_000).toISOString(),
            updatedAt: new Date(now - 2_000).toISOString(),
          },
          "local:expired": {
            id: "local:expired",
            source: "local",
            ownerId: "ownerA",
            channel: "coupang",
            title: "Expired warning",
            targetCount: 1,
            status: "warning",
            summary: "expired",
            errorMessage: null,
            startedAt: new Date(now - 20_000).toISOString(),
            finishedAt: new Date(now - 20_000).toISOString(),
            updatedAt: new Date(now - 20_000).toISOString(),
          },
        },
      },
    };

    expect(Object.keys(flattenSharedLocalToasts(pruneSharedLocalToastStore(store, now)))).toEqual([
      "local:recent",
    ]);
  });

  it("removes a toast without touching unrelated owners", () => {
    const now = Date.UTC(2026, 3, 1, 0, 0, 0);
    const store = updateSharedLocalToastOwner(
      createStore(now),
      "ownerB",
      {
        "local:b": {
          id: "local:b",
          source: "local",
          ownerId: "ownerB",
          channel: "coupang",
          title: "COUPANG sync",
          targetCount: 1,
          status: "running",
          summary: null,
          errorMessage: null,
          startedAt: new Date(now).toISOString(),
          finishedAt: null,
          updatedAt: new Date(now).toISOString(),
        },
      },
      now,
    );

    const nextStore = removeSharedLocalToast(store, "local:a", now);

    expect(Object.keys(flattenSharedLocalToasts(nextStore))).toEqual(["local:b"]);
  });
});
