import { describe, expect, it } from "vitest";

import { buildMirrorSyncNotice } from "./shipment-worksheet-overview";

describe("buildMirrorSyncNotice", () => {
  it("tells the user to run re-sync manually when authoritative counts are stale", () => {
    const notice = buildMirrorSyncNotice({
      countsReady: false,
      autoSyncing: false,
      requirement: {
        requiresFullSync: true,
        isTrusted: false,
        reason: "partial_sync",
        syncRangeLabel: "최근 30일",
      },
      partialCount: 278,
    });

    expect(notice).toMatchObject({
      title: "쿠팡 기준 재동기화 필요",
    });
    expect(notice?.message).toContain("자동으로 돌지 않으니 직접 실행해 주세요.");
    expect(notice?.message).toContain("278건은 부분 집계");
  });

  it("shows an in-progress message only while a manual full sync is actually running", () => {
    const notice = buildMirrorSyncNotice({
      countsReady: false,
      autoSyncing: true,
      requirement: {
        requiresFullSync: true,
        isTrusted: false,
        reason: "fallback",
        syncRangeLabel: null,
      },
      partialCount: 10,
    });

    expect(notice).toMatchObject({
      title: "쿠팡 기준 재동기화 중",
    });
    expect(notice?.message).toContain("쿠팡 기준 재동기화를 실행 중입니다.");
    expect(notice?.message).not.toContain("자동");
  });
});
