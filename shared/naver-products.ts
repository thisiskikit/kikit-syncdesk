import type { ApiCacheState } from "./api";
import type { OperationLogEntry } from "./operations";

export const NAVER_PRODUCT_LIST_DEFAULT_PAGE = 1;
export const NAVER_PRODUCT_LIST_DEFAULT_SIZE = 100;
export const NAVER_PRODUCT_LIST_DEFAULT_MAX_ITEMS = 500;
export const NAVER_PRODUCT_LIST_MAX_ITEMS_LIMIT = 5_000;
export const NAVER_PRODUCT_LIST_PAGE_SIZE_MAX = 500;
export const NAVER_PRODUCT_LIST_PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const;

export interface NaverProductStoreRef {
  id: string;
  name: string;
}

export interface NaverProductListItem {
  id: string;
  storeId: string;
  storeName: string;
  originProductNo: string;
  channelProductNo: string | null;
  channelServiceType: string | null;
  categoryId: string | null;
  productName: string;
  sellerManagementCode: string | null;
  sellerBarcode: string | null;
  saleStatusCode: string | null;
  saleStatusLabel: string;
  displayStatusCode: string | null;
  displayStatusLabel: string | null;
  salePrice: number | null;
  discountedPrice: number | null;
  deliveryFee: number | null;
  stockQuantity: number | null;
  hasOptions: boolean | null;
  memo: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  saleStartDate: string | null;
  saleEndDate: string | null;
}

export interface NaverProductListResponse {
  store: NaverProductStoreRef;
  items: NaverProductListItem[];
  page: number;
  size: number;
  totalElements: number;
  availableTotalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  loadedCount: number;
  isTruncated: boolean;
  appliedMaxItems: number | null;
  limitedByMaxItems: boolean;
  fetchedAt: string;
  servedFromCache: boolean;
  cacheState?: ApiCacheState;
}

export type NaverProductOptionType =
  | "none"
  | "combination"
  | "standard"
  | "simple"
  | "custom"
  | "unknown";

export interface NaverProductOptionRow {
  key: string;
  optionType: NaverProductOptionType;
  label: string;
  attributeSummary: string | null;
  sellerManagementCode: string | null;
  stockQuantity: number | null;
  price: number | null;
  usable: boolean | null;
}

export interface NaverPriceUpdatePreview {
  storeId: string;
  storeName: string;
  originProductNo: string;
  channelProductNo: string | null;
  productName: string;
  currentPrice: number | null;
  stockQuantity: number | null;
  saleStatusCode: string | null;
  saleStatusLabel: string;
  hasOptions: boolean;
  optionType: NaverProductOptionType;
  optionCount: number;
  optionHandlingMessage: string;
  optionRows: NaverProductOptionRow[];
  modifiedAt: string | null;
}

export interface NaverPriceUpdateResult {
  before: NaverPriceUpdatePreview;
  requestedPrice: number;
  updatePath: "bulk_origin_sale_price";
  appliedAt: string;
  message: string;
}

export interface NaverBulkPriceTarget {
  rowId: string;
  originProductNo: string;
  channelProductNo: string | null;
  newPrice: number | null;
}

export type NaverBulkPricePreviewItemStatus = "ready" | "invalid" | "error";

export interface NaverBulkPricePreviewItem {
  rowId: string;
  originProductNo: string;
  channelProductNo: string | null;
  productName: string;
  currentPrice: number | null;
  stockQuantity: number | null;
  newPrice: number | null;
  saleStatusCode: string | null;
  saleStatusLabel: string;
  hasOptions: boolean;
  optionType: NaverProductOptionType;
  optionCount: number;
  optionHandlingMessage: string;
  modifiedAt: string | null;
  status: NaverBulkPricePreviewItemStatus;
  validationMessage: string | null;
  comparisonText: string | null;
}

export interface NaverBulkPricePreviewResponse {
  items: NaverBulkPricePreviewItem[];
  summary: {
    total: number;
    readyCount: number;
    invalidCount: number;
    errorCount: number;
  };
  previewedAt: string;
}

export type NaverBulkPriceUpdateItemStatus = "succeeded" | "failed" | "skipped";

export interface NaverBulkPriceUpdateItemResult {
  rowId: string;
  originProductNo: string;
  channelProductNo: string | null;
  productName: string;
  currentPrice: number | null;
  requestedPrice: number | null;
  saleStatusCode: string | null;
  saleStatusLabel: string;
  hasOptions: boolean;
  optionType: NaverProductOptionType;
  optionCount: number;
  optionHandlingMessage: string;
  status: NaverBulkPriceUpdateItemStatus;
  message: string;
  appliedAt: string | null;
}

export interface NaverBulkPriceUpdateResponse {
  items: NaverBulkPriceUpdateItemResult[];
  summary: {
    total: number;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
  };
  completedAt: string;
  operation?: OperationLogEntry;
}

export interface NaverProductStatusDraftResponse {
  draftId: string;
  matchedItemCount: number;
}

export interface NaverProductMemoUpdateResponse {
  storeId: string;
  originProductNo: string;
  memo: string | null;
  updatedAt: string;
}
