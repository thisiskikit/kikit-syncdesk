import type { SectionNavItem } from "@/components/section-layout";

export const COUPANG_DEFAULT_WORKSPACE_HREF = "/coupang/products";

export const COUPANG_PRIMARY_NAV_ITEMS = [
  { href: "/coupang/products", label: "상품", badge: "live" },
  { href: "/coupang/control", label: "상품 제어", badge: "live" },
  { href: "/coupang/connection", label: "연결 설정", badge: "live" },
] as const satisfies readonly SectionNavItem[];

export const COUPANG_SECONDARY_NAV_ITEMS = [
  { href: "/coupang/orders", label: "주문 / 출고", badge: "live" },
  { href: "/coupang/logistics", label: "물류", badge: "live" },
  { href: "/coupang/cancel-refunds", label: "취소 / 환불", badge: "live" },
  { href: "/coupang/returns", label: "반품", badge: "live" },
  { href: "/coupang/exchanges", label: "교환", badge: "live" },
  { href: "/coupang/inquiries", label: "문의", badge: "live" },
] as const satisfies readonly SectionNavItem[];

export const COUPANG_HIDDEN_NAV_ITEMS = [
  "/coupang/shipments",
  "/coupang/product-edit",
  "/coupang/library",
  "/coupang/coupons",
  "/coupang/settlements",
  "/coupang/rocket-growth",
  "/coupang/logs",
] as const;

export const COUPANG_SECONDARY_NAV_TITLE = "원본 업무";
