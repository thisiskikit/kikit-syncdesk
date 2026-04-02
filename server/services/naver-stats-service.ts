import type {
  NaverCustomerInsightItem,
  NaverCustomerInsightSummary,
  NaverStatsBreakdownItem,
  NaverStatsResponse,
} from "@shared/naver-stats";
import { fetchNaverProducts } from "./naver-product-service";
import { listOrders } from "./naver-order-service";
import { listClaims } from "./naver-claim-service";
import { listCustomerInquiries, listProductInquiries } from "./naver-inquiry-service";
import { listSettlements } from "./naver-settlement-service";
import { asArray, asBoolean, asNumber, asObject, normalizeDateOnly, requestNaverJson } from "./naver-api-client";

function buildBreakdown(items: string[]) {
  const counter = new Map<string, number>();

  for (const item of items.filter(Boolean)) {
    counter.set(item, (counter.get(item) ?? 0) + 1);
  }

  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count } satisfies NaverStatsBreakdownItem))
    .sort((left, right) => right.count - left.count);
}

function normalizeCustomerInsight(payload: unknown): NaverCustomerInsightSummary {
  const root = asObject(payload);
  const rawItems = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(payload)
      ? payload
      : [];

  const series = rawItems
    .map((rawItem) => {
      const item = asObject(rawItem);
      const purchaseStats = asObject(item?.purchaseStats);
      const interestStats = asObject(item?.interestStats);
      const malePurchaseStats = asObject(item?.malePurchaseStats);
      const femalePurchaseStats = asObject(item?.femalePurchaseStats);
      const aggregateDate = typeof item?.aggregateDate === "string" ? item.aggregateDate : null;

      if (!aggregateDate) {
        return null;
      }

      return {
        aggregateDate,
        customerCount: asNumber(purchaseStats?.customerCount),
        newCustomerCount: asNumber(purchaseStats?.newCustomerCount),
        existCustomerCount: asNumber(purchaseStats?.existCustomerCount),
        purchaseCount: asNumber(purchaseStats?.purchaseCount),
        refundCount: asNumber(purchaseStats?.refundCount),
        interestCustomer: asNumber(interestStats?.interestCustomer),
        notificationCustomer: asNumber(interestStats?.notificationCustomer),
        maleRatio: asNumber(malePurchaseStats?.ratio),
        femaleRatio: asNumber(femalePurchaseStats?.ratio),
        isNotProvided: asBoolean(item?.isNotProvided) ?? false,
      } satisfies NaverCustomerInsightItem;
    })
    .filter((item): item is NaverCustomerInsightItem => Boolean(item));

  const latest = series[series.length - 1] ?? null;

  if (!series.length) {
    return {
      state: "unavailable",
      message: "고객 데이터가 아직 집계되지 않았습니다.",
      latest: null,
      series,
    };
  }

  if (latest?.isNotProvided) {
    return {
      state: "not-provided",
      message: "집계 고객 수가 10건 미만이라 상세 고객 통계를 제공하지 않습니다.",
      latest,
      series,
    };
  }

  return {
    state: "available",
    message: null,
    latest,
    series,
  };
}

function resolveInsightError(message: string): NaverCustomerInsightSummary {
  const normalized = message.toLowerCase();
  const isPermissionRelated =
    normalized.includes("브랜드스토어") ||
    normalized.includes("403") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    normalized.includes("scope");

  return {
    state: isPermissionRelated ? "permission-required" : "unavailable",
    message: isPermissionRelated
      ? "브랜드스토어 권한 또는 API 데이터 솔루션 구독이 필요합니다."
      : message,
    latest: null,
    series: [],
  };
}

async function fetchCustomerInsight(input: {
  storeId: string;
  startDate: string;
  endDate: string;
}) {
  try {
    const params = new URLSearchParams({
      startDate: normalizeDateOnly(input.startDate),
      endDate: normalizeDateOnly(input.endDate),
    });

    const { payload } = await requestNaverJson<unknown>({
      storeId: input.storeId,
      method: "GET",
      path: `/v1/customer-data/customer-status/account/statistics?${params.toString()}`,
    });

    return normalizeCustomerInsight(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "고객 데이터 솔루션 통계를 불러오지 못했습니다.";
    return resolveInsightError(message);
  }
}

async function capture<T>(request: () => Promise<T>) {
  try {
    return {
      ok: true as const,
      data: await request(),
      message: null,
    };
  } catch (error) {
    return {
      ok: false as const,
      data: null,
      message: error instanceof Error ? error.message : "Failed to load NAVER stats section.",
    };
  }
}

export async function getNaverStats(input: {
  storeId: string;
  startDate: string;
  endDate: string;
}) {
  const [productsResult, ordersResult, claimsResult, customerInquiryResult, productInquiryResult, settlementResult, customerInsightResult] =
    await Promise.all([
      capture(() =>
        fetchNaverProducts({
          storeId: input.storeId,
          page: 1,
          size: 100,
        }),
      ),
      capture(() =>
        listOrders({
          storeId: input.storeId,
          lastChangedFrom: input.startDate,
          lastChangedTo: input.endDate,
          maxItems: 60,
        }),
      ),
      capture(() =>
        listClaims({
          storeId: input.storeId,
          lastChangedFrom: input.startDate,
          lastChangedTo: input.endDate,
          claimType: "all",
          maxItems: 60,
        }),
      ),
      capture(() =>
        listCustomerInquiries({
          storeId: input.storeId,
          startDate: input.startDate,
          endDate: input.endDate,
          page: 1,
          size: 100,
        }),
      ),
      capture(() =>
        listProductInquiries({
          storeId: input.storeId,
          startDate: input.startDate,
          endDate: input.endDate,
          page: 1,
          size: 100,
        }),
      ),
      capture(() =>
        listSettlements({
          storeId: input.storeId,
          startDate: input.startDate,
          endDate: input.endDate,
        }),
      ),
      capture(() =>
        fetchCustomerInsight({
          storeId: input.storeId,
          startDate: input.startDate,
          endDate: input.endDate,
        }),
      ),
    ]);

  if (!productsResult.ok && !ordersResult.ok && !claimsResult.ok && !settlementResult.ok) {
    throw new Error(
      productsResult.message ||
        ordersResult.message ||
        claimsResult.message ||
        settlementResult.message ||
        "NAVER 통계 데이터를 불러오지 못했습니다.",
    );
  }

  const notes = [
    productsResult.message,
    ordersResult.message,
    claimsResult.message,
    customerInquiryResult.message,
    productInquiryResult.message,
    settlementResult.message,
    customerInsightResult.message,
    ...(settlementResult.ok ? settlementResult.data.warnings : []),
  ].filter((value): value is string => Boolean(value));

  const store =
    productsResult.ok
      ? productsResult.data.store
      : ordersResult.ok
        ? ordersResult.data.store
        : claimsResult.ok
          ? claimsResult.data.store
          : settlementResult.ok
            ? settlementResult.data.store
            : {
                id: input.storeId,
                name: "NAVER 스토어",
              };

  return {
    store,
    period: {
      startDate: normalizeDateOnly(input.startDate),
      endDate: normalizeDateOnly(input.endDate),
    },
    summary: {
      totalProducts: productsResult.ok ? productsResult.data.totalElements : 0,
      recentOrders: ordersResult.ok ? ordersResult.data.totalCount : 0,
      executableOrders: ordersResult.ok
        ? ordersResult.data.items.filter((item) => item.isExecutable).length
        : 0,
      recentClaims: claimsResult.ok ? claimsResult.data.totalCount : 0,
      executableClaims: claimsResult.ok
        ? claimsResult.data.items.filter((item) => item.isExecutable).length
        : 0,
      unansweredCustomerInquiries: customerInquiryResult.ok
        ? customerInquiryResult.data.items.filter((item) => item.kind === "customer" && !item.answered).length
        : 0,
      unansweredProductInquiries: productInquiryResult.ok
        ? productInquiryResult.data.items.filter((item) => item.kind === "product" && !item.answered).length
        : 0,
      settleAmount: settlementResult.ok ? settlementResult.data.summary.settleAmount : 0,
      commissionSettleAmount: settlementResult.ok
        ? settlementResult.data.summary.commissionSettleAmount
        : 0,
    },
    orderStatusBreakdown: ordersResult.ok
      ? buildBreakdown(ordersResult.data.items.map((item) => item.productOrderStatusLabel))
      : [],
    claimStatusBreakdown: claimsResult.ok
      ? buildBreakdown(claimsResult.data.items.map((item) => item.claimStatusLabel))
      : [],
    salesTrend: settlementResult.ok
      ? settlementResult.data.dailyItems.map((item) => ({
          date: item.settleBasisEndDate ?? item.settleExpectDate ?? item.settleBasisStartDate ?? "-",
          settleAmount: item.settleAmount,
          paySettleAmount: item.paySettleAmount,
          commissionSettleAmount: item.commissionSettleAmount,
        }))
      : [],
    customerInsight: customerInsightResult.ok
      ? customerInsightResult.data
      : resolveInsightError(customerInsightResult.message ?? "고객 데이터 솔루션 통계를 불러오지 못했습니다."),
    fetchedAt: new Date().toISOString(),
    notes,
  } satisfies NaverStatsResponse;
}
