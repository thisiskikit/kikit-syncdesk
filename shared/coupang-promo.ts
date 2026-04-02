import type { OperationLogEntry } from "./operations";
import type { CoupangDataSource, CoupangStoreRef } from "./coupang";
import type { CoupangPagination } from "./coupang-support";

export interface CoupangCouponBudgetRow {
  contractId: string;
  targetMonth: string | null;
  vendorShareRatio: number | null;
  totalBudgetAmount: number | null;
  usedBudgetAmount: number | null;
}

export interface CoupangCouponBudgetListResponse {
  store: CoupangStoreRef;
  items: CoupangCouponBudgetRow[];
  pagination: CoupangPagination;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangCouponContractRow {
  contractId: string;
  vendorContractId: string | null;
  sellerId: string | null;
  sellerShareRatio: number | null;
  coupangShareRatio: number | null;
  gmvRatio: number | null;
  start: string | null;
  end: string | null;
  type: string | null;
  useBudget: boolean | null;
  modifiedAt: string | null;
  modifiedBy: string | null;
}

export interface CoupangCouponContractListResponse {
  store: CoupangStoreRef;
  items: CoupangCouponContractRow[];
  pagination: CoupangPagination;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangCouponRequestFailure {
  vendorItemId: string;
  reason: string;
}

export interface CoupangCouponRequestStatus {
  requestedId: string;
  couponId: string | null;
  type: string | null;
  status: string | null;
  total: number | null;
  succeeded: number | null;
  failed: number | null;
  failedVendorItems: CoupangCouponRequestFailure[];
}

export interface CoupangCouponRequestStatusResponse {
  store: CoupangStoreRef;
  item: CoupangCouponRequestStatus | null;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangInstantCouponRow {
  couponId: string;
  contractId: string | null;
  vendorContractId: string | null;
  promotionName: string;
  status: string | null;
  type: string | null;
  discount: number | null;
  maxDiscountPrice: number | null;
  startAt: string | null;
  endAt: string | null;
  vendorItemCount: number | null;
  couponItemCount: number | null;
  issuedCount: number | null;
  downloadedCount: number | null;
  rawData: Record<string, unknown> | null;
}

export interface CoupangInstantCouponItemRow {
  id: string;
  couponItemId: string | null;
  vendorItemId: string | null;
  status: string | null;
  startAt: string | null;
  endAt: string | null;
  rawData: Record<string, unknown> | null;
}

export interface CoupangInstantCouponListResponse {
  store: CoupangStoreRef;
  items: CoupangInstantCouponRow[];
  pagination: CoupangPagination;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangInstantCouponDetailResponse {
  store: CoupangStoreRef;
  item: CoupangInstantCouponRow | null;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangInstantCouponItemsResponse {
  store: CoupangStoreRef;
  items: CoupangInstantCouponItemRow[];
  pagination: CoupangPagination;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangDownloadCouponPolicyRow {
  title: string;
  typeOfDiscount: string | null;
  description: string | null;
  minimumPrice: number | null;
  discount: number | null;
  maximumDiscountPrice: number | null;
  maximumPerDaily: number | null;
  manageCode: string | null;
}

export interface CoupangDownloadCouponRow {
  couponId: string;
  vendorId: string | null;
  title: string;
  couponType: string | null;
  couponStatus: string | null;
  publishedDate: string | null;
  startDate: string | null;
  endDate: string | null;
  appliedOptionCount: number | null;
  usageAmount: number | null;
  lastModifiedBy: string | null;
  lastModifiedDate: string | null;
  couponPolicies: CoupangDownloadCouponPolicyRow[];
}

export interface CoupangDownloadCouponDetailResponse {
  store: CoupangStoreRef;
  item: CoupangDownloadCouponRow | null;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangCashbackRuleRow {
  vendorItemId: string;
  ruleId: string;
  valueType: string | null;
  value: number | null;
  maxAmount: number | null;
  startAt: string | null;
  endAt: string | null;
  disabled: boolean | null;
  disabledAt: string | null;
}

export interface CoupangCashbackRuleResponse {
  store: CoupangStoreRef;
  item: CoupangCashbackRuleRow | null;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CreateCoupangInstantCouponInput {
  storeId: string;
  contractId: string;
  name: string;
  type: "RATE" | "FIXED_WITH_QUANTITY" | "PRICE";
  discount: number;
  maxDiscountPrice: number;
  startAt: string;
  endAt: string;
  wowExclusive?: boolean | null;
}

export interface AttachCoupangInstantCouponItemsInput {
  storeId: string;
  couponId: string;
  vendorItemIds: string[];
}

export interface ExpireCoupangInstantCouponInput {
  storeId: string;
  couponId: string;
}

export interface CoupangDownloadCouponPolicyInput {
  title: string;
  typeOfDiscount: "RATE" | "PRICE";
  description?: string | null;
  minimumPrice: number;
  discount: number;
  maximumDiscountPrice: number;
  maximumPerDaily: number;
}

export interface CreateCoupangDownloadCouponInput {
  storeId: string;
  contractId: string;
  title: string;
  userId: string;
  startDate: string;
  endDate: string;
  couponPolicies: CoupangDownloadCouponPolicyInput[];
}

export interface AttachCoupangDownloadCouponItemsInput {
  storeId: string;
  couponId: string;
  userId: string;
  vendorItemIds: string[];
}

export interface ExpireCoupangDownloadCouponInput {
  storeId: string;
  couponId: string;
  userId: string;
}

export interface ApplyCoupangCashbackInput {
  storeId: string;
  ruleId: string;
  valueType: "FIXED" | "FIXED_WITH_QUANTITY";
  value: number;
  maxAmount?: number | null;
  vendorItemIds: string[];
  startAt: string;
  endAt: string;
}

export interface RemoveCoupangCashbackInput {
  storeId: string;
  ruleId: string;
  vendorItemId: string;
}

export interface CoupangPromotionMutationResponse {
  appliedAt: string;
  message: string;
  couponId?: string | null;
  requestedId?: string | null;
  requestTransactionId?: string | null;
  requestStatus?: CoupangCouponRequestStatus | null;
  operation?: OperationLogEntry;
}
