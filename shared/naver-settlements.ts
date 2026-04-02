import type { ApiCacheState } from "./api";

export type NaverSettlementDetailType = "daily" | "commission" | "vat";

export interface NaverSettlementStoreRef {
  id: string;
  name: string;
}

export interface NaverSettlementDailyRow {
  id: string;
  settleBasisStartDate: string | null;
  settleBasisEndDate: string | null;
  settleExpectDate: string | null;
  settleCompleteDate: string | null;
  settleAmount: number | null;
  paySettleAmount: number | null;
  commissionSettleAmount: number | null;
  benefitSettleAmount: number | null;
  deductionRestoreSettleAmount: number | null;
  payHoldbackAmount: number | null;
  minusChargeAmount: number | null;
  differenceSettleAmount: number | null;
  returnCareSettleAmount: number | null;
  normalSettleAmount: number | null;
  quickSettleAmount: number | null;
  preferentialCommissionAmount: number | null;
  settlementLimitAmount: number | null;
  settleMethodType: string | null;
  bankType: string | null;
  depositorName: string | null;
  accountNo: string | null;
  merchantId: string | null;
  merchantName: string | null;
}

export interface NaverSettlementCommissionRow {
  id: string;
  orderNo: string | null;
  productOrderId: string | null;
  productOrderType: string | null;
  productId: string | null;
  productName: string | null;
  merchantId: string | null;
  merchantName: string | null;
  purchaserName: string | null;
  settleType: string | null;
  settleBasisDate: string | null;
  settleExpectDate: string | null;
  settleCompleteDate: string | null;
  taxReturnDate: string | null;
  commissionBasisAmount: number | null;
  commissionType: string | null;
  sellingInterlockCommissionType: string | null;
  payMeansType: string | null;
  commissionAmount: number | null;
  maximumSellingInterlockCommissionAmount: number | null;
}

export interface NaverSettlementVatRow {
  id: string;
  settleBasisDate: string | null;
  totalSalesAmount: number | null;
  taxationSalesAmount: number | null;
  taxExemptionSalesAmount: number | null;
  creditCardAmount: number | null;
  cashIncomeDeductionAmount: number | null;
  cashOutgoingEvidenceAmount: number | null;
  cashExclusionIssuanceAmount: number | null;
  otherAmount: number | null;
  merchantId: string | null;
  merchantName: string | null;
}

export interface NaverSettlementSummary {
  dailyCount: number;
  commissionCount: number;
  vatCount: number;
  settleAmount: number;
  paySettleAmount: number;
  commissionSettleAmount: number;
  taxationSalesAmount: number;
  taxExemptionSalesAmount: number;
  totalSalesAmount: number;
}

export interface NaverSettlementResponse {
  store: NaverSettlementStoreRef;
  dailyItems: NaverSettlementDailyRow[];
  commissionItems: NaverSettlementCommissionRow[];
  vatItems: NaverSettlementVatRow[];
  summary: NaverSettlementSummary;
  commissionSearchDate: string;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  warnings: string[];
}
