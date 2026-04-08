import { describe, expect, it } from "vitest";
import {
  COUPANG_DEFAULT_WORKSPACE_HREF,
  COUPANG_HIDDEN_NAV_ITEMS,
  COUPANG_PRIMARY_NAV_ITEMS,
  COUPANG_SECONDARY_NAV_ITEMS,
  COUPANG_SECONDARY_NAV_TITLE,
} from "@/lib/coupang-navigation";

describe("coupang navigation config", () => {
  it("promotes the shipment-first primary menu order", () => {
    expect(COUPANG_DEFAULT_WORKSPACE_HREF).toBe("/coupang/shipments");
    expect(COUPANG_PRIMARY_NAV_ITEMS.map((item) => item.href)).toEqual([
      "/coupang/shipments",
      "/coupang/orders",
      "/coupang/products",
      "/coupang/control",
      "/coupang/connection",
    ]);
  });

  it("keeps secondary work grouped separately and hides temporary modules from nav", () => {
    expect(COUPANG_SECONDARY_NAV_TITLE).toBe("\uAE30\uD0C0 \uC5C5\uBB34");
    expect(COUPANG_SECONDARY_NAV_ITEMS.map((item) => item.href)).toEqual([
      "/coupang/logistics",
      "/coupang/cancel-refunds",
      "/coupang/returns",
      "/coupang/exchanges",
      "/coupang/inquiries",
    ]);
    expect(COUPANG_HIDDEN_NAV_ITEMS).toEqual([
      "/coupang/product-edit",
      "/coupang/library",
      "/coupang/coupons",
      "/coupang/settlements",
      "/coupang/rocket-growth",
      "/coupang/logs",
    ]);
  });
});
