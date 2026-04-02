import type { SectionNavItem } from "@/components/section-layout";

export const COUPANG_DEFAULT_WORKSPACE_HREF = "/coupang/shipments";

export const COUPANG_PRIMARY_NAV_ITEMS = [
  { href: "/coupang/shipments", label: "Shipment / Dispatch", badge: "live" },
  { href: "/coupang/orders", label: "Orders / Outbound", badge: "live" },
  { href: "/coupang/products", label: "Products", badge: "live" },
  { href: "/coupang/control", label: "Price / Stock / Sale", badge: "live" },
  { href: "/coupang/bulk-price", label: "Bulk Price", badge: "live" },
  { href: "/coupang/connection", label: "Connection", badge: "live" },
] as const satisfies readonly SectionNavItem[];

export const COUPANG_SECONDARY_NAV_ITEMS = [
  { href: "/coupang/logistics", label: "Category / Logistics", badge: "live" },
  { href: "/coupang/cancel-refunds", label: "Cancel / Refund", badge: "live" },
  { href: "/coupang/returns", label: "Returns", badge: "live" },
  { href: "/coupang/exchanges", label: "Exchanges", badge: "live" },
  { href: "/coupang/inquiries", label: "Inquiries / CS", badge: "live" },
] as const satisfies readonly SectionNavItem[];

export const COUPANG_HIDDEN_NAV_ITEMS = [
  "/coupang/product-edit",
  "/coupang/library",
  "/coupang/coupons",
  "/coupang/settlements",
  "/coupang/rocket-growth",
  "/coupang/logs",
] as const;

export const COUPANG_SECONDARY_NAV_TITLE = "\uAE30\uD0C0 \uC5C5\uBB34";
