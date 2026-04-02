import type { ApiCacheState } from "./api";

export interface NaverStatsStoreRef {
  id: string;
  name: string;
}

export interface NaverStatsOperationalSummary {
  totalProducts: number;
  recentOrders: number;
  executableOrders: number;
  recentClaims: number;
  executableClaims: number;
  unansweredCustomerInquiries: number;
  unansweredProductInquiries: number;
  settleAmount: number;
  commissionSettleAmount: number;
}

export interface NaverStatsBreakdownItem {
  label: string;
  count: number;
}

export interface NaverStatsSalesTrendItem {
  date: string;
  settleAmount: number | null;
  paySettleAmount: number | null;
  commissionSettleAmount: number | null;
}

export interface NaverCustomerInsightItem {
  aggregateDate: string;
  customerCount: number | null;
  newCustomerCount: number | null;
  existCustomerCount: number | null;
  purchaseCount: number | null;
  refundCount: number | null;
  interestCustomer: number | null;
  notificationCustomer: number | null;
  maleRatio: number | null;
  femaleRatio: number | null;
  isNotProvided: boolean;
}

export interface NaverCustomerInsightSummary {
  state: "available" | "not-provided" | "permission-required" | "unavailable";
  message: string | null;
  latest: NaverCustomerInsightItem | null;
  series: NaverCustomerInsightItem[];
}

export interface NaverStatsResponse {
  store: NaverStatsStoreRef;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: NaverStatsOperationalSummary;
  orderStatusBreakdown: NaverStatsBreakdownItem[];
  claimStatusBreakdown: NaverStatsBreakdownItem[];
  salesTrend: NaverStatsSalesTrendItem[];
  customerInsight: NaverCustomerInsightSummary;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  notes: string[];
}
