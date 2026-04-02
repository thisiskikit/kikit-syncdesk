import type { ApiCacheState } from "./api";
import type { OperationLogEntry } from "./operations";

export const NAVER_ORDER_MAX_ITEMS = 180;
export const NAVER_ORDER_PAGE_SIZE_OPTIONS = [30, 60, 120, 180] as const;

export type NaverOrderQuerySource = "live";
export type NaverOrderActionStatus = "succeeded" | "failed" | "skipped";
export type NaverDispatchDeliveryMethod = "DELIVERY" | "DIRECT_DELIVERY" | "NOTHING";

export interface NaverOrderStoreRef {
  id: string;
  name: string;
}

export interface NaverOrderRow {
  id: string;
  storeId: string;
  storeName: string;
  orderId: string;
  productOrderId: string;
  productName: string;
  optionName: string | null;
  sellerProductCode: string | null;
  productId: string | null;
  quantity: number | null;
  remainQuantity: number | null;
  paymentAmount: number | null;
  productOrderStatus: string | null;
  productOrderStatusLabel: string;
  lastChangedType: string | null;
  lastChangedAt: string | null;
  orderedAt: string | null;
  paidAt: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  receiverPostCode: string | null;
  deliveryMethod: string | null;
  courierCode: string | null;
  courierName: string | null;
  trackingNumber: string | null;
  deliveryMemo: string | null;
  dispatchDueDate: string | null;
  claimType: string | null;
  claimTypeLabel: string | null;
  claimStatus: string | null;
  claimStatusLabel: string | null;
  claimReason: string | null;
  claimDetailReason: string | null;
  deliveryAttributeType: string | null;
  isExecutable: boolean;
}

export interface NaverOrderListResponse {
  store: NaverOrderStoreRef;
  items: NaverOrderRow[];
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  source: NaverOrderQuerySource;
  totalCount: number;
  limitedByMaxItems: boolean;
}

export interface NaverOrderDetailResponse {
  item: NaverOrderRow | null;
}

export interface NaverOrderConfirmTarget {
  productOrderId: string;
  orderId?: string | null;
  productName?: string | null;
}

export interface NaverOrderDispatchTarget extends NaverOrderConfirmTarget {
  deliveryMethod: NaverDispatchDeliveryMethod | string;
  courierCode?: string | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  dispatchDate?: string | null;
}

export interface NaverOrderDelayTarget extends NaverOrderConfirmTarget {
  dispatchDueDate: string;
  delayedDispatchReason: string;
  dispatchDelayedDetailedReason: string;
}

export interface NaverOrderActionItemResult {
  productOrderId: string;
  orderId: string | null;
  productName: string | null;
  action: "confirm" | "dispatch" | "delayDispatch";
  status: NaverOrderActionStatus;
  message: string;
  appliedAt: string | null;
}

export interface NaverOrderActionResponse {
  items: NaverOrderActionItemResult[];
  summary: {
    total: number;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
  };
  completedAt: string;
  operation?: OperationLogEntry;
}
