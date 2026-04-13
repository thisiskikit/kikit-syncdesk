import { describe, expect, it } from "vitest";
import { buildChannelsHubSections, buildSettingsHubSections } from "./hub-navigation";

describe("hub-navigation", () => {
  it("builds channel hub sections in operator-oriented groups", () => {
    const sections = buildChannelsHubSections({
      naverConnected: 1,
      coupangConnected: 2,
    });

    expect(sections.map((section) => section.key)).toEqual([
      "connections",
      "source-screens",
      "channel-tools",
    ]);
    expect(sections[0]?.actions.map((action) => action.href)).toEqual([
      "/coupang/connection",
      "/naver/connection",
    ]);
    expect(sections[2]?.actions.map((action) => action.href)).toContain("/coupang/orders");
    expect(sections[2]?.actions.map((action) => action.href)).toContain("/naver/claims");
  });

  it("builds settings hub sections with connections first and advanced tools second", () => {
    const sections = buildSettingsHubSections();

    expect(sections.map((section) => section.key)).toEqual([
      "connections",
      "advanced-tools",
    ]);
    expect(sections[0]?.actions.map((action) => action.href)).toEqual([
      "/naver/connection",
      "/coupang/connection",
    ]);
    expect(sections[1]?.actions.map((action) => action.href)).toContain("/work-center");
    expect(sections[1]?.actions.map((action) => action.href)).toContain("/engine/field-sync");
  });
});
