import type { ApiCacheState } from "./api";
import type { OperationLogEntry } from "./operations";

export const NAVER_CLAIM_MAX_ITEMS = 120;
export const NAVER_CLAIM_PAGE_SIZE_OPTIONS = [30, 60, 90, 120] as const;

export type NaverClaimType = "cancel" | "return" | "exchange";
export type NaverClaimSource = "current" | "completed";
export type NaverClaimActionStatus = "succeeded" | "failed" | "skipped";
export type NaverClaimActionKey =
  | "approveCancel"
  | "approveReturn"
  | "holdReturn"
  | "releaseReturnHold"
  | "rejectReturn"
  | "holdExchange"
  | "releaseExchangeHold"
  | "rejectExchange"
  | "redeliverExchange";

export interface NaverClaimStoreRef {
  id: string;
  name: string;
}

export interface NaverClaimRow {
  id: string;
  storeId: string;
  storeName: string;
  claimType: NaverClaimType;
  claimSource: NaverClaimSource;
  claimId: string | null;
  orderId: string;
  productOrderId: string;
  productName: string;
  optionName: string | null;
  quantity: number | null;
  paymentAmount: number | null;
  buyerName: string | null;
  receiverName: string | null;
  productOrderStatus: string | null;
  productOrderStatusLabel: string;
  claimStatus: string | null;
  claimStatusLabel: string;
  claimReason: string | null;
  claimDetailReason: string | null;
  claimRequestDate: string | null;
  lastChangedAt: string | null;
  collectStatus: string | null;
  collectDeliveryMethod: string | null;
  collectDeliveryCompany: string | null;
  collectTrackingNumber: string | null;
  reDeliveryStatus: string | null;
  claimDeliveryFeeDemandAmount: number | null;
  isExecutable: boolean;
  availableActions: NaverClaimActionKey[];
}

export interface NaverClaimListResponse {
  store: NaverClaimStoreRef;
  items: NaverClaimRow[];
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  totalCount: number;
  limitedByMaxItems: boolean;
  source: "live";
}

export interface NaverClaimActionItemResult {
  claimType: NaverClaimType;
  claimId: string | null;
  orderId: string | null;
  productOrderId: string;
  productName: string | null;
  action: NaverClaimActionKey;
  status: NaverClaimActionStatus;
  message: string;
  appliedAt: string | null;
}

export interface NaverClaimActionResponse {
  items: NaverClaimActionItemResult[];
  summary: {
    total: number;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
  };
  completedAt: string;
  operation?: OperationLogEntry;
}

export interface NaverApproveCancelTarget {
  productOrderId: string;
  claimId?: string | null;
  orderId?: string | null;
  productName?: string | null;
}

export interface NaverApproveReturnTarget extends NaverApproveCancelTarget {}

export interface NaverHoldReturnTarget extends NaverApproveCancelTarget {
  holdbackClassType: string;
  holdbackReason: string;
  holdbackReturnDetailReason: string;
  extraReturnFeeAmount?: number | null;
}

export interface NaverReleaseReturnHoldTarget extends NaverApproveCancelTarget {}

export interface NaverRejectReturnTarget extends NaverApproveCancelTarget {
  rejectReturnReason: string;
}

export interface NaverHoldExchangeTarget extends NaverApproveCancelTarget {
  holdbackClassType: string;
  holdbackReason: string;
  holdbackExchangeDetailReason: string;
  extraExchangeFeeAmount?: number | null;
}

export interface NaverReleaseExchangeHoldTarget extends NaverApproveCancelTarget {}

export interface NaverRejectExchangeTarget extends NaverApproveCancelTarget {
  rejectExchangeReason: string;
}

export interface NaverRedeliverExchangeTarget extends NaverApproveCancelTarget {
  reDeliveryMethod: string;
  reDeliveryCompany?: string | null;
  reDeliveryTrackingNumber?: string | null;
}
