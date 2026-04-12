import { describe, expect, it } from "vitest";
import {
  COUPANG_DEFAULT_WORKSPACE_HREF,
  COUPANG_HIDDEN_NAV_ITEMS,
  COUPANG_PRIMARY_NAV_ITEMS,
  COUPANG_SECONDARY_NAV_ITEMS,
  COUPANG_SECONDARY_NAV_TITLE,
} from "@/lib/coupang-navigation";

describe("coupang navigation config", () => {
  it("keeps the visible channel menu focused on product and connection screens", () => {
    expect(COUPANG_DEFAULT_WORKSPACE_HREF).toBe("/coupang/products");
    expect(COUPANG_PRIMARY_NAV_ITEMS.map((item) => item.href)).toEqual([
      "/coupang/products",
      "/coupang/control",
      "/coupang/connection",
    ]);
  });

  it("keeps raw channel work grouped separately and hides shipment plus temporary modules from nav", () => {
    expect(COUPANG_SECONDARY_NAV_TITLE).toBe("원본 업무");
    expect(COUPANG_SECONDARY_NAV_ITEMS.map((item) => item.href)).toEqual([
      "/coupang/orders",
      "/coupang/logistics",
      "/coupang/cancel-refunds",
      "/coupang/returns",
      "/coupang/exchanges",
      "/coupang/inquiries",
    ]);
    expect(COUPANG_HIDDEN_NAV_ITEMS).toEqual([
      "/coupang/shipments",
      "/coupang/product-edit",
      "/coupang/library",
      "/coupang/coupons",
      "/coupang/settlements",
      "/coupang/rocket-growth",
      "/coupang/logs",
    ]);
  });
});
