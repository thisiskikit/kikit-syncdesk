import type {
  NaverSettlementCommissionRow,
  NaverSettlementDailyRow,
  NaverSettlementResponse,
  NaverSettlementVatRow,
} from "@shared/naver-settlements";
import {
  asArray,
  asNumber,
  asObject,
  asString,
  normalizeDateOnly,
  requestNaverJson,
  toSummedValue,
} from "./naver-api-client";
import { createStaleResponseCache } from "./shared/stale-response-cache";

const COMMISSION_DAY_LIMIT = 7;
const COMMISSION_PAGE_SIZE = 200;
const NAVER_SETTLEMENT_LIST_CACHE_TTL_MS = 60_000;

const naverSettlementListCache = createStaleResponseCache<NaverSettlementResponse>(
  NAVER_SETTLEMENT_LIST_CACHE_TTL_MS,
);

function startOfDayRange(startDate: string, endDate: string) {
  const start = new Date(`${normalizeDateOnly(startDate)}T00:00:00+09:00`);
  const end = new Date(`${normalizeDateOnly(endDate)}T00:00:00+09:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("A valid settlement date range is required.");
  }

  const from = start.getTime() <= end.getTime() ? start : end;
  const to = start.getTime() <= end.getTime() ? end : start;
  const dates: string[] = [];
  const cursor = new Date(from);

  while (cursor.getTime() <= to.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function normalizeDailyRow(raw: unknown, index: number) {
  const item = asObject(raw);
  return {
    id: `daily:${index}:${asString(item?.settleBasisStartDate) ?? asString(item?.settleExpectDate) ?? "row"}`,
    settleBasisStartDate: asString(item?.settleBasisStartDate),
    settleBasisEndDate: asString(item?.settleBasisEndDate),
    settleExpectDate: asString(item?.settleExpectDate),
    settleCompleteDate: asString(item?.settleCompleteDate),
    settleAmount: asNumber(item?.settleAmount),
    paySettleAmount: asNumber(item?.paySettleAmount),
    commissionSettleAmount: asNumber(item?.commissionSettleAmount),
    benefitSettleAmount: asNumber(item?.benefitSettleAmount),
    deductionRestoreSettleAmount: asNumber(item?.deductionRestoreSettleAmount),
    payHoldbackAmount: asNumber(item?.payHoldbackAmount),
    minusChargeAmount: asNumber(item?.minusChargeAmount),
    differenceSettleAmount: asNumber(item?.differenceSettleAmount),
    returnCareSettleAmount: asNumber(item?.returnCareSettleAmount),
    normalSettleAmount: asNumber(item?.normalSettleAmount),
    quickSettleAmount: asNumber(item?.quickSettleAmount),
    preferentialCommissionAmount: asNumber(item?.preferentialCommissionAmount),
    settlementLimitAmount: asNumber(item?.settlementLimitAmount),
    settleMethodType: asString(item?.settleMethodType),
    bankType: asString(item?.bankType),
    depositorName: asString(item?.depositorName),
    accountNo: asString(item?.accountNo),
    merchantId: asString(item?.merchantId),
    merchantName: asString(item?.merchantName),
  } satisfies NaverSettlementDailyRow;
}

function normalizeCommissionRow(raw: unknown, index: number) {
  const item = asObject(raw);
  return {
    id: `commission:${index}:${asString(item?.productOrderId) ?? asString(item?.orderNo) ?? "row"}`,
    orderNo: asString(item?.orderNo),
    productOrderId: asString(item?.productOrderId),
    productOrderType: asString(item?.productOrderType),
    productId: asString(item?.productId),
    productName: asString(item?.productName),
    merchantId: asString(item?.merchantId),
    merchantName: asString(item?.merchantName),
    purchaserName: asString(item?.purchaserName),
    settleType: asString(item?.settleType),
    settleBasisDate: asString(item?.settleBasisDate),
    settleExpectDate: asString(item?.settleExpectDate),
    settleCompleteDate: asString(item?.settleCompleteDate),
    taxReturnDate: asString(item?.taxReturnDate),
    commissionBasisAmount: asNumber(item?.commissionBasisAmount),
    commissionType: asString(item?.commissionType),
    sellingInterlockCommissionType: asString(item?.sellingInterlockCommissionType),
    payMeansType: asString(item?.payMeansType),
    commissionAmount: asNumber(item?.commissionAmount),
    maximumSellingInterlockCommissionAmount: asNumber(item?.maximumSellingInterlockCommissionAmount),
  } satisfies NaverSettlementCommissionRow;
}

function normalizeVatRow(raw: unknown, index: number) {
  const item = asObject(raw);
  return {
    id: `vat:${index}:${asString(item?.settleBasisDate) ?? "row"}`,
    settleBasisDate: asString(item?.settleBasisDate),
    totalSalesAmount: asNumber(item?.totalSalesAmount),
    taxationSalesAmount: asNumber(item?.taxationSalesAmount),
    taxExemptionSalesAmount: asNumber(item?.taxExemptionSalesAmount),
    creditCardAmount: asNumber(item?.creditCardAmount),
    cashIncomeDeductionAmount: asNumber(item?.cashInComeDeductionAmount),
    cashOutgoingEvidenceAmount: asNumber(item?.cashOutGoingEvidenceAmount),
    cashExclusionIssuanceAmount: asNumber(item?.cashExclusionIssuanceAmount),
    otherAmount: asNumber(item?.otherAmount),
    merchantId: asString(item?.merchantId),
    merchantName: asString(item?.merchantName),
  } satisfies NaverSettlementVatRow;
}

function getPayloadData(payload: unknown) {
  const root = asObject(payload);
  return asObject(root?.data) ?? root;
}

async function fetchDailySettlements(input: {
  storeId: string;
  startDate: string;
  endDate: string;
}) {
  const params = new URLSearchParams({
    startDate: normalizeDateOnly(input.startDate),
    endDate: normalizeDateOnly(input.endDate),
    pageNumber: "1",
    pageSize: "1000",
  });

  const { payload } = await requestNaverJson<unknown>({
    storeId: input.storeId,
    method: "GET",
    path: `/v1/pay-settle/settle/daily?${params.toString()}`,
  });
  const data = getPayloadData(payload);

  return asArray(data?.elements).map(normalizeDailyRow);
}

async function fetchDailyVat(input: {
  storeId: string;
  startDate: string;
  endDate: string;
}) {
  const params = new URLSearchParams({
    startDate: normalizeDateOnly(input.startDate),
    endDate: normalizeDateOnly(input.endDate),
    pageNumber: "1",
    pageSize: "1000",
  });

  const { payload } = await requestNaverJson<unknown>({
    storeId: input.storeId,
    method: "GET",
    path: `/v1/pay-settle/vat/daily?${params.toString()}`,
  });
  const data = getPayloadData(payload);

  return asArray(data?.elements).map(normalizeVatRow);
}

async function fetchCommissionDetails(input: {
  storeId: string;
  startDate: string;
  endDate: string;
}) {
  const warnings: string[] = [];
  const allDates = startOfDayRange(input.startDate, input.endDate);
  const dates =
    allDates.length > COMMISSION_DAY_LIMIT ? allDates.slice(-COMMISSION_DAY_LIMIT) : allDates;

  if (allDates.length > COMMISSION_DAY_LIMIT) {
    warnings.push(`수수료 상세는 최근 ${COMMISSION_DAY_LIMIT}일 범위만 조회했습니다.`);
  }

  const rows: NaverSettlementCommissionRow[] = [];

  for (const searchDate of dates) {
    const params = new URLSearchParams({
      searchDate,
      pageNumber: "1",
      pageSize: String(COMMISSION_PAGE_SIZE),
    });

    const { payload } = await requestNaverJson<unknown>({
      storeId: input.storeId,
      method: "GET",
      path: `/v1/pay-settle/settle/commission-details?${params.toString()}`,
    });
    const data = getPayloadData(payload);
    const pagination = asObject(data?.pagination);

    rows.push(...asArray(data?.elements).map(normalizeCommissionRow));

    if ((asNumber(pagination?.totalPages) ?? 1) > 1) {
      warnings.push(`${searchDate} 수수료 상세는 1페이지까지만 반영했습니다.`);
    }
  }

  return {
    items: rows,
    label:
      dates.length > 1 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : dates[0] ?? input.endDate,
    warnings,
  };
}

export async function listSettlements(input: {
  storeId: string;
  startDate: string;
  endDate: string;
  refresh?: boolean;
}) {
  const cacheKey = JSON.stringify({
    storeId: input.storeId,
    startDate: normalizeDateOnly(input.startDate),
    endDate: normalizeDateOnly(input.endDate),
  });

  return naverSettlementListCache.getOrLoad(cacheKey, {
    refresh: input.refresh,
    load: async () => {
  const warnings: string[] = [];
  const failures: string[] = [];

  const [dailyResult, commissionResult, vatResult] = await Promise.all([
    fetchDailySettlements(input).then((items) => ({ ok: true as const, items })).catch((error) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : "일별 정산 조회에 실패했습니다.",
    })),
    fetchCommissionDetails(input).then((result) => ({ ok: true as const, ...result })).catch((error) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : "수수료 상세 조회에 실패했습니다.",
    })),
    fetchDailyVat(input).then((items) => ({ ok: true as const, items })).catch((error) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : "부가세 조회에 실패했습니다.",
    })),
  ]);

  if (!dailyResult.ok) {
    failures.push(dailyResult.message);
  }
  if (!commissionResult.ok) {
    failures.push(commissionResult.message);
  } else {
    warnings.push(...commissionResult.warnings);
  }
  if (!vatResult.ok) {
    failures.push(vatResult.message);
  }

  if (!dailyResult.ok && !commissionResult.ok && !vatResult.ok) {
    throw new Error(failures[0] ?? "정산 데이터를 불러오지 못했습니다.");
  }

  warnings.push(...failures);

  const accountResult = await requestNaverJson<unknown>({
    storeId: input.storeId,
    method: "GET",
    path: "/v1/seller/account",
  }).catch(() => null);
  const accountRoot = asObject(accountResult?.payload);
  const accountData = asObject(accountRoot?.data) ?? accountRoot;

  const dailyItems = dailyResult.ok ? dailyResult.items : [];
  const commissionItems = commissionResult.ok ? commissionResult.items : [];
  const vatItems = vatResult.ok ? vatResult.items : [];

  return {
    store: {
      id: accountResult?.store.id ?? input.storeId,
      name: accountResult?.store.storeName ?? asString(accountData?.merchantName) ?? "NAVER 스토어",
    },
    dailyItems,
    commissionItems,
    vatItems,
    summary: {
      dailyCount: dailyItems.length,
      commissionCount: commissionItems.length,
      vatCount: vatItems.length,
      settleAmount: toSummedValue(dailyItems.map((item) => item.settleAmount)),
      paySettleAmount: toSummedValue(dailyItems.map((item) => item.paySettleAmount)),
      commissionSettleAmount:
        toSummedValue(dailyItems.map((item) => item.commissionSettleAmount)) ||
        toSummedValue(commissionItems.map((item) => item.commissionAmount)),
      taxationSalesAmount: toSummedValue(vatItems.map((item) => item.taxationSalesAmount)),
      taxExemptionSalesAmount: toSummedValue(vatItems.map((item) => item.taxExemptionSalesAmount)),
      totalSalesAmount: toSummedValue(vatItems.map((item) => item.totalSalesAmount)),
    },
    commissionSearchDate: commissionResult.ok ? commissionResult.label : normalizeDateOnly(input.endDate),
    fetchedAt: new Date().toISOString(),
    warnings,
  } satisfies NaverSettlementResponse;
    },
  });
}
