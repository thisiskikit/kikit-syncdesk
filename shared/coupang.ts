import type { ApiCacheState } from "./api";
import type { ConnectionTestResult } from "./channel-settings";
import type { OperationLogEntry } from "./operations";

export const COUPANG_DEFAULT_BASE_URL = "https://api-gateway.coupang.com";
export const COUPANG_PRODUCT_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const COUPANG_PRODUCT_EXPLORER_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const COUPANG_ORDER_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export interface CoupangStoreSummary {
  id: string;
  channel: "coupang";
  storeName: string;
  vendorId: string;
  shipmentPlatformKey: string | null;
  credentials: {
    accessKey: string;
    hasSecretKey: boolean;
    secretKeyMasked: string | null;
  };
  baseUrl: string;
  connectionTest:
    | ConnectionTestResult
    | {
        status: "idle";
        testedAt: null;
        message: null;
      };
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCoupangStoreInput {
  id?: string;
  storeName: string;
  vendorId: string;
  shipmentPlatformKey?: string | null;
  credentials: {
    accessKey: string;
    secretKey?: string;
  };
  baseUrl?: string;
}

export interface TestCoupangConnectionInput {
  storeId?: string;
  vendorId: string;
  credentials: {
    accessKey: string;
    secretKey?: string;
  };
  baseUrl?: string;
}

export interface CoupangStoreRef {
  id: string;
  name: string;
  vendorId: string;
}

export type CoupangDataSource = "live" | "fallback";
export type CoupangSaleStatus = "ONSALE" | "SUSPENDED" | "ENDED" | "UNKNOWN";
export const COUPANG_PRODUCT_VIOLATION_TYPES = ["NO_VA_V2", "MOTA_V2", "ATTR"] as const;
export type CoupangProductViolationType =
  (typeof COUPANG_PRODUCT_VIOLATION_TYPES)[number];
export type CoupangProductExposureState = "normal" | "restricted" | "low" | "unknown";
export type CoupangProductExplorerExposureCard =
  | "all"
  | "restricted"
  | "low"
  | "normal"
  | "unknown";
export type CoupangProductExplorerOperationCard =
  | "all"
  | "suspended"
  | "zeroInventory"
  | "bestPriceGuaranteed";
export type CoupangCancelType = "RETURN" | "CANCEL" | "ALL";
export type CoupangReturnExchangeDeliveryType = "RETURN" | "EXCHANGE";
export type CoupangExchangeRejectCode = "SOLDOUT" | "WITHDRAW";
export type CoupangActionItemStatus = "succeeded" | "failed" | "warning" | "skipped";
export type CoupangActionKey =
  | "updatePricesBulk"
  | "updateQuantitiesBulk"
  | "updateSaleStatusBulk"
  | "updatePartialProduct"
  | "updateFullProduct"
  | "markPreparing"
  | "uploadInvoice"
  | "updateInvoice"
  | "markShipmentStopped"
  | "markAlreadyShipped"
  | "cancelOrderItem"
  | "approveReturn"
  | "confirmReturnInbound"
  | "uploadReturnCollectionInvoice"
  | "confirmExchangeInbound"
  | "rejectExchange"
  | "uploadExchangeInvoice";

export interface CoupangProductVendorItem {
  vendorItemId: string;
  itemName: string;
  externalVendorSku: string | null;
  originalPrice: number | null;
  salePrice: number | null;
  inventoryCount: number | null;
  saleStatus: CoupangSaleStatus;
  adultOnly: string | null;
  lastModifiedAt: string | null;
  attributes: string[];
}

export interface CoupangProductListItem {
  sellerProductId: string;
  sellerProductName: string;
  vendorId: string;
  displayCategoryCode: string | null;
  displayCategoryName: string | null;
  brand: string | null;
  statusName: string | null;
  saleStartedAt: string | null;
  saleEndedAt: string | null;
  createdAt: string | null;
  lastModifiedAt: string | null;
  vendorItems: CoupangProductVendorItem[];
}

export interface CoupangProductListResponse {
  store: CoupangStoreRef;
  items: CoupangProductListItem[];
  nextToken: string | null;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export type CoupangProductSearchField =
  | "all"
  | "sellerProductName"
  | "sellerProductId"
  | "displayCategoryName"
  | "brand"
  | "statusName"
  | "vendorItemName"
  | "externalVendorSku";

export type CoupangProductExplorerSortField =
  | "sellerProductName"
  | "sellerProductId"
  | "displayCategoryName"
  | "brand"
  | "statusName"
  | "optionCount"
  | "minSalePrice"
  | "deliveryCharge"
  | "totalInventory"
  | "saleStartedAt"
  | "lastModifiedAt"
  | "createdAt";

export type CoupangSortDirection = "asc" | "desc";

export interface CoupangProductExplorerFilters {
  selectedStoreId: string;
  searchField: CoupangProductSearchField;
  searchQuery: string;
  status: string;
  exposureCard: CoupangProductExplorerExposureCard;
  operationCard: CoupangProductExplorerOperationCard;
  createdAtFrom: string;
  salePeriodFrom: string;
  salePeriodTo: string;
  sortField: CoupangProductExplorerSortField;
  sortDirection: CoupangSortDirection;
  page: number;
  pageSize: number;
  selectedSellerProductId: string;
}

export interface CoupangQuickEditOptionRow {
  vendorItemId: string;
  sellerProductItemId: string | null;
  itemId?: string | null;
  itemName: string;
  externalVendorSku: string | null;
  barcode?: string | null;
  originalPrice: number | null;
  supplyPrice: number | null;
  salePrice: number | null;
  saleAgentCommission: number | null;
  bestPriceGuaranteed3P: boolean | null;
  maximumBuyCount: number | null;
  inventoryCount: number | null;
  saleStatus: CoupangSaleStatus;
  lastModifiedAt: string | null;
  attributes: string[];
}

export interface CoupangProductExplorerRow {
  sellerProductId: string;
  productId?: string | null;
  sellerProductName: string;
  vendorId: string;
  displayCategoryCode: string | null;
  displayCategoryName: string | null;
  brand: string | null;
  status: string | null;
  statusName: string | null;
  violationTypes: CoupangProductViolationType[];
  exposureState: CoupangProductExposureState;
  saleStartedAt: string | null;
  saleEndedAt: string | null;
  createdAt: string | null;
  lastModifiedAt: string | null;
  deliveryCharge: number | null;
  deliveryChargeType: string | null;
  thumbnailUrl: string | null;
  previewHtml: string | null;
  optionCount: number;
  totalInventory: number | null;
  minSalePrice: number | null;
  maxSalePrice: number | null;
  onSaleOptionCount: number;
  suspendedOptionCount: number;
  zeroInventoryOptionCount: number;
  bestPriceGuaranteedOptionCount: number;
  vendorItems: CoupangQuickEditOptionRow[];
}

export interface CoupangProductExplorerFacets {
  exposure: Record<CoupangProductExplorerExposureCard, number>;
  operation: Record<CoupangProductExplorerOperationCard, number>;
}

export interface CoupangProductExplorerResponse {
  store: CoupangStoreRef;
  items: CoupangProductExplorerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  fetchedAt: string;
  servedFromCache: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  facets: CoupangProductExplorerFacets;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangProductImage {
  imageOrder: number;
  imageType: string | null;
  cdnPath: string | null;
  vendorPath: string | null;
  url: string | null;
}

export interface CoupangProductNotice {
  noticeCategoryName: string | null;
  noticeCategoryDetailName: string | null;
  content: string | null;
}

export interface CoupangProductAttribute {
  attributeTypeName: string | null;
  attributeValueName: string | null;
  exposed: string | null;
  editable: boolean | null;
}

export interface CoupangProductContentDetail {
  detailType: string | null;
  content: string | null;
}

export interface CoupangProductContentGroup {
  contentsType: string | null;
  contentDetails: CoupangProductContentDetail[];
}

export interface CoupangProductDeliveryInfo {
  deliveryMethod: string | null;
  deliveryCompanyCode: string | null;
  deliveryChargeType: string | null;
  deliveryCharge: number | null;
  freeShipOverAmount: number | null;
  deliveryChargeOnReturn: number | null;
  deliverySurcharge: number | null;
  remoteAreaDeliverable: string | null;
  unionDeliveryType: string | null;
  outboundShippingPlaceCode: string | null;
  outboundShippingTimeDay: number | null;
  pccNeeded: boolean | null;
  returnCenterCode: string | null;
  returnChargeName: string | null;
  companyContactNumber: string | null;
  returnZipCode: string | null;
  returnAddress: string | null;
  returnAddressDetail: string | null;
  returnCharge: number | null;
  extraInfoMessage: string | null;
}

export interface CoupangProductEditableItem {
  sellerProductItemId: string | null;
  vendorItemId: string | null;
  itemId: string | null;
  itemName: string;
  offerCondition: string | null;
  offerDescription: string | null;
  originalPrice: number | null;
  supplyPrice: number | null;
  salePrice: number | null;
  maximumBuyCount: number | null;
  maximumBuyForPerson: number | null;
  maximumBuyForPersonPeriod: number | null;
  outboundShippingTimeDay: number | null;
  unitCount: number | null;
  adultOnly: string | null;
  taxType: string | null;
  parallelImported: string | null;
  overseasPurchased: string | null;
  externalVendorSku: string | null;
  barcode: string | null;
  emptyBarcode: boolean | null;
  emptyBarcodeReason: string | null;
  modelNo: string | null;
  saleAgentCommission: number | null;
  bestPriceGuaranteed3P: boolean | null;
  pccNeeded: boolean | null;
  saleStatus: CoupangSaleStatus;
  inventoryCount: number | null;
  images: CoupangProductImage[];
  notices: CoupangProductNotice[];
  attributes: CoupangProductAttribute[];
  contents: CoupangProductContentGroup[];
  rawData: Record<string, unknown> | null;
}

export interface CoupangProductDetail {
  sellerProductId: string;
  sellerProductName: string;
  displayCategoryCode: string | null;
  displayCategoryName: string | null;
  categoryId: string | null;
  productId: string | null;
  vendorId: string | null;
  status: string | null;
  statusName: string | null;
  violationTypes: CoupangProductViolationType[];
  exposureState: CoupangProductExposureState;
  brand: string | null;
  manufacture: string | null;
  displayProductName: string | null;
  generalProductName: string | null;
  productGroup: string | null;
  saleStartedAt: string | null;
  saleEndedAt: string | null;
  createdAt: string | null;
  requested: boolean | null;
  vendorUserId: string | null;
  searchTags: string[];
  deliveryInfo: CoupangProductDeliveryInfo;
  images: CoupangProductImage[];
  notices: CoupangProductNotice[];
  contents: CoupangProductContentGroup[];
  items: CoupangProductEditableItem[];
  previewHtml: string | null;
  previewImages: string[];
  rawData: Record<string, unknown> | null;
  canEdit: boolean;
  editLocks: string[];
}

export interface CoupangProductDetailResponse {
  store: CoupangStoreRef;
  item: CoupangProductDetail | null;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangProductPriceUpdateTarget {
  sellerProductId?: string | null;
  vendorItemId: string;
  price: number;
  itemName?: string | null;
}

export interface CoupangProductQuantityUpdateTarget {
  sellerProductId?: string | null;
  vendorItemId: string;
  quantity: number;
  itemName?: string | null;
}

export interface CoupangProductSaleStatusUpdateTarget {
  sellerProductId?: string | null;
  vendorItemId: string;
  saleStatus: Extract<CoupangSaleStatus, "ONSALE" | "SUSPENDED">;
  itemName?: string | null;
}

export interface CoupangProductImageInput {
  imageOrder: number;
  imageType: string | null;
  cdnPath?: string | null;
  vendorPath?: string | null;
}

export interface CoupangProductNoticeInput {
  noticeCategoryName?: string | null;
  noticeCategoryDetailName?: string | null;
  content?: string | null;
}

export interface CoupangProductAttributeInput {
  attributeTypeName?: string | null;
  attributeValueName?: string | null;
  exposed?: string | null;
  editable?: boolean | null;
}

export interface CoupangProductContentDetailInput {
  detailType?: string | null;
  content?: string | null;
}

export interface CoupangProductContentGroupInput {
  contentsType?: string | null;
  contentDetails: CoupangProductContentDetailInput[];
}

export interface CoupangProductEditItemInput {
  sellerProductItemId?: string | null;
  vendorItemId?: string | null;
  itemId?: string | null;
  itemName: string;
  offerCondition?: string | null;
  offerDescription?: string | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  maximumBuyCount?: number | null;
  maximumBuyForPerson?: number | null;
  maximumBuyForPersonPeriod?: number | null;
  outboundShippingTimeDay?: number | null;
  unitCount?: number | null;
  adultOnly?: string | null;
  taxType?: string | null;
  parallelImported?: string | null;
  overseasPurchased?: string | null;
  externalVendorSku?: string | null;
  barcode?: string | null;
  emptyBarcode?: boolean | null;
  emptyBarcodeReason?: string | null;
  modelNo?: string | null;
  saleAgentCommission?: number | null;
  pccNeeded?: boolean | null;
  images: CoupangProductImageInput[];
  notices: CoupangProductNoticeInput[];
  attributes: CoupangProductAttributeInput[];
  contents: CoupangProductContentGroupInput[];
  rawData?: Record<string, unknown> | null;
}

export interface CoupangProductPartialEditPayload {
  storeId: string;
  sellerProductId: string;
  companyContactNumber?: string | null;
  deliveryCharge?: number | null;
  deliveryChargeOnReturn?: number | null;
  deliveryChargeType?: string | null;
  deliveryCompanyCode?: string | null;
  deliveryMethod?: string | null;
  extraInfoMessage?: string | null;
  freeShipOverAmount?: number | null;
  outboundShippingPlaceCode?: string | null;
  outboundShippingTimeDay?: number | null;
  pccNeeded?: boolean | null;
  remoteAreaDeliverable?: string | null;
  returnAddress?: string | null;
  returnAddressDetail?: string | null;
  returnCenterCode?: string | null;
  returnCharge?: number | null;
  returnChargeName?: string | null;
  returnZipCode?: string | null;
  unionDeliveryType?: string | null;
}

export interface CoupangProductFullEditPayload {
  storeId: string;
  sellerProductId: string;
  requestApproval: boolean;
  sellerProductName?: string | null;
  displayCategoryCode?: string | null;
  displayProductName?: string | null;
  brand?: string | null;
  generalProductName?: string | null;
  productGroup?: string | null;
  manufacture?: string | null;
  saleStartedAt?: string | null;
  saleEndedAt?: string | null;
  deliveryMethod?: string | null;
  deliveryCompanyCode?: string | null;
  deliveryChargeType?: string | null;
  deliveryCharge?: number | null;
  freeShipOverAmount?: number | null;
  deliveryChargeOnReturn?: number | null;
  deliverySurcharge?: number | null;
  remoteAreaDeliverable?: string | null;
  unionDeliveryType?: string | null;
  returnCenterCode?: string | null;
  returnChargeName?: string | null;
  companyContactNumber?: string | null;
  returnZipCode?: string | null;
  returnAddress?: string | null;
  returnAddressDetail?: string | null;
  returnCharge?: number | null;
  outboundShippingPlaceCode?: string | null;
  vendorUserId?: string | null;
  extraInfoMessage?: string | null;
  searchTags?: string[];
  images: CoupangProductImageInput[];
  notices: CoupangProductNoticeInput[];
  contents: CoupangProductContentGroupInput[];
  items: CoupangProductEditItemInput[];
  rawData?: Record<string, unknown> | null;
}

export type CoupangProductEditPayload =
  | ({ mode: "partial" } & CoupangProductPartialEditPayload)
  | ({ mode: "full" } & CoupangProductFullEditPayload);

export interface CoupangVendorItemActionResult {
  vendorItemId: string;
  sellerProductId: string | null;
  status: "succeeded" | "failed" | "warning";
  message: string;
  appliedAt: string;
}

export interface CoupangVendorItemActionResponse {
  item: CoupangVendorItemActionResult;
  operation?: OperationLogEntry;
}

export interface CoupangProductMutationResult {
  sellerProductId: string;
  status: "succeeded" | "failed" | "warning";
  message: string;
  appliedAt: string;
}

export interface CoupangProductMutationResponse {
  item: CoupangProductMutationResult;
  operation?: OperationLogEntry;
}

export type CoupangCustomerServiceIssueType =
  | "shipment_stop_requested"
  | "shipment_stop_handled"
  | "cancel"
  | "return"
  | "exchange";
export type CoupangCustomerServiceState = "unknown" | "ready" | "stale";

export interface CoupangCustomerServiceIssueBreakdownItem {
  type: CoupangCustomerServiceIssueType;
  count: number;
  label: string;
}

export interface CoupangCustomerServiceSummaryRequestItem {
  rowKey: string;
  orderId?: string | null;
  shipmentBoxId?: string | null;
  vendorItemId?: string | null;
  sellerProductId?: string | null;
}

export interface CoupangCustomerServiceSummaryItem {
  rowKey: string;
  customerServiceIssueCount: number;
  customerServiceIssueSummary: string | null;
  customerServiceIssueBreakdown: CoupangCustomerServiceIssueBreakdownItem[];
  customerServiceState: CoupangCustomerServiceState;
  customerServiceFetchedAt: string | null;
}

export interface CoupangCustomerServiceSummaryResponse {
  store: CoupangStoreRef;
  items: CoupangCustomerServiceSummaryItem[];
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangOrderRow {
  id: string;
  shipmentBoxId: string;
  orderId: string;
  orderedAt: string | null;
  paidAt: string | null;
  status: string;
  ordererName: string | null;
  receiverName: string | null;
  receiverSafeNumber: string | null;
  receiverAddress: string | null;
  receiverPostCode: string | null;
  productName: string;
  optionName: string | null;
  sellerProductId: string | null;
  sellerProductName: string | null;
  vendorItemId: string | null;
  externalVendorSku: string | null;
  quantity: number | null;
  salesPrice: number | null;
  orderPrice: number | null;
  discountPrice: number | null;
  cancelCount: number | null;
  holdCountForCancel: number | null;
  deliveryCompanyName: string | null;
  deliveryCompanyCode: string | null;
  invoiceNumber: string | null;
  invoiceNumberUploadDate: string | null;
  estimatedShippingDate: string | null;
  inTransitDateTime: string | null;
  deliveredDate: string | null;
  shipmentType: string | null;
  splitShipping: boolean | null;
  ableSplitShipping: boolean | null;
  customerServiceIssueCount: number;
  customerServiceIssueSummary: string | null;
  customerServiceIssueBreakdown: CoupangCustomerServiceIssueBreakdownItem[];
  customerServiceState: CoupangCustomerServiceState;
  customerServiceFetchedAt: string | null;
  availableActions: CoupangActionKey[];
}

export interface CoupangOrderListResponse {
  store: CoupangStoreRef;
  items: CoupangOrderRow[];
  nextToken: string | null;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangReturnRow {
  id: string;
  receiptId: string;
  orderId: string | null;
  status: string;
  cancelType: Exclude<CoupangCancelType, "ALL">;
  receiptType: string | null;
  returnDeliveryType: string | null;
  releaseStatus: string | null;
  releaseStatusName: string | null;
  productName: string;
  sellerProductId: string | null;
  sellerProductName: string | null;
  vendorItemId: string | null;
  vendorItemName: string | null;
  shipmentBoxId: string | null;
  purchaseCount: number | null;
  cancelCount: number | null;
  createdAt: string | null;
  modifiedAt: string | null;
  completeConfirmDate: string | null;
  completeConfirmType: string | null;
  reasonCode: string | null;
  reason: string | null;
  faultByType: string | null;
  preRefund: boolean | null;
  requesterName: string | null;
  requesterPhone: string | null;
  requesterMobile: string | null;
  requesterAddress: string | null;
  requesterPostCode: string | null;
  deliveryCompanyCode: string | null;
  deliveryInvoiceNo: string | null;
  retrievalChargeAmount: number | null;
  canMarkShipmentStopped: boolean;
  canMarkAlreadyShipped: boolean;
  canApproveReturn: boolean;
  canConfirmInbound: boolean;
  canUploadCollectionInvoice: boolean;
}

export interface CoupangReturnDeliveryRow {
  deliveryCompanyCode: string | null;
  deliveryInvoiceNo: string | null;
  returnDeliveryId: string | null;
  returnExchangeDeliveryType: string | null;
  regNumber: string | null;
}

export interface CoupangReturnItemDetailRow {
  vendorItemId: string | null;
  vendorItemName: string | null;
  sellerProductId: string | null;
  sellerProductName: string | null;
  shipmentBoxId: string | null;
  purchaseCount: number | null;
  cancelCount: number | null;
  releaseStatus: string | null;
  releaseStatusName: string | null;
}

export interface CoupangReturnDetail {
  receiptId: string;
  orderId: string | null;
  status: string;
  cancelType: Exclude<CoupangCancelType, "ALL">;
  receiptType: string | null;
  returnDeliveryType: string | null;
  completeConfirmDate: string | null;
  completeConfirmType: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  reasonCode: string | null;
  reason: string | null;
  faultByType: string | null;
  preRefund: boolean | null;
  requester: {
    name: string | null;
    phone: string | null;
    mobile: string | null;
    postCode: string | null;
    address: string | null;
    addressDetail: string | null;
  };
  returnCharge: {
    amount: number | null;
    rawText: string | null;
  };
  items: CoupangReturnItemDetailRow[];
  deliveries: CoupangReturnDeliveryRow[];
  summaryRow: CoupangReturnRow | null;
}

export interface CoupangReturnDetailResponse {
  store: CoupangStoreRef;
  item: CoupangReturnDetail | null;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangExchangeInvoiceRow {
  shipmentBoxId: string | null;
  orderId: string | null;
  orderType: string | null;
  shippingDeliveryType: string | null;
  invoiceNumber: string | null;
  estimatedDeliveryDate: string | null;
  deliveredDate: string | null;
  statusCode: string | null;
  deliverCode: string | null;
  invoiceNumberUploadDate: string | null;
  invoiceModifiable: boolean | null;
}

export interface CoupangExchangeItemRow {
  vendorItemId: string | null;
  vendorItemName: string | null;
  orderItemName: string | null;
  targetItemName: string | null;
  quantity: number | null;
  shipmentBoxId: string | null;
  releaseStatus: string | null;
  collectStatus: string | null;
}

export interface CoupangExchangeRow {
  exchangeId: string;
  orderId: string | null;
  status: string;
  orderDeliveryStatusCode: string | null;
  collectStatus: string | null;
  collectCompleteDate: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  reasonCode: string | null;
  reason: string | null;
  reasonDetail: string | null;
  productName: string;
  vendorItemId: string | null;
  vendorItemName: string | null;
  sellerProductId: string | null;
  sellerProductName: string | null;
  shipmentBoxId: string | null;
  originalShipmentBoxId: string | null;
  quantity: number | null;
  returnCustomerName: string | null;
  returnMobile: string | null;
  returnAddress: string | null;
  deliveryCustomerName: string | null;
  deliveryMobile: string | null;
  deliveryAddress: string | null;
  deliverCode: string | null;
  invoiceNumber: string | null;
  canConfirmInbound: boolean;
  canReject: boolean;
  canUploadExchangeInvoice: boolean;
}

export interface CoupangExchangeDetail {
  exchangeId: string;
  orderId: string | null;
  status: string;
  orderDeliveryStatusCode: string | null;
  collectStatus: string | null;
  collectCompleteDate: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  reasonCode: string | null;
  reason: string | null;
  reasonDetail: string | null;
  requester: {
    name: string | null;
    phone: string | null;
    mobile: string | null;
    postCode: string | null;
    address: string | null;
    addressDetail: string | null;
    memo: string | null;
  };
  recipient: {
    name: string | null;
    phone: string | null;
    mobile: string | null;
    postCode: string | null;
    address: string | null;
    addressDetail: string | null;
    memo: string | null;
  };
  items: CoupangExchangeItemRow[];
  invoices: CoupangExchangeInvoiceRow[];
  summaryRow: CoupangExchangeRow | null;
}

export interface CoupangExchangeDetailResponse {
  store: CoupangStoreRef;
  item: CoupangExchangeDetail | null;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangSettlementRow {
  settlementId: string;
  orderId: string | null;
  saleType: string | null;
  saleDate: string | null;
  recognitionDate: string | null;
  settlementDate: string | null;
  finalSettlementDate: string | null;
  productName: string;
  vendorItemName: string | null;
  vendorItemId: string | null;
  externalSellerSkuCode: string | null;
  quantity: number | null;
  salesAmount: number | null;
  saleAmount: number | null;
  settlementAmount: number | null;
  serviceFee: number | null;
  serviceFeeVat: number | null;
  serviceFeeRatio: number | null;
  sellerDiscountCoupon: number | null;
  downloadableCoupon: number | null;
  deliveryFeeAmount: number | null;
  deliveryFeeSettlementAmount: number | null;
  taxType: string | null;
  status: string;
  settledAt: string | null;
}

export interface CoupangSettlementHistoryRow {
  settlementType: string;
  settlementDate: string | null;
  revenueRecognitionYearMonth: string | null;
  revenueRecognitionDateFrom: string | null;
  revenueRecognitionDateTo: string | null;
  totalSale: number | null;
  serviceFee: number | null;
  settlementTargetAmount: number | null;
  settlementAmount: number | null;
  lastAmount: number | null;
  pendingReleasedAmount: number | null;
  sellerDiscountCoupon: number | null;
  downloadableCoupon: number | null;
  deductionAmount: number | null;
}

export interface CoupangSettlementSummary {
  rowCount: number;
  totalSalesAmount: number;
  totalSaleAmount: number;
  totalSettlementAmount: number;
  totalServiceFee: number;
  totalServiceFeeVat: number;
  totalDeliveryFeeAmount: number;
  totalDeliverySettlementAmount: number;
  totalSellerDiscountCoupon: number;
  totalDownloadableCoupon: number;
  historySettlementAmount: number;
  historyFinalizedAmount: number;
}

export interface CoupangSettlementListResponse {
  store: CoupangStoreRef;
  items: CoupangSettlementRow[];
  histories: CoupangSettlementHistoryRow[];
  summary: CoupangSettlementSummary;
  nextToken: string | null;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangSimpleListResponse<TItem> {
  store: CoupangStoreRef;
  items: TItem[];
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangOrderDetail {
  shipmentBoxId: string;
  orderId: string;
  orderedAt: string | null;
  paidAt: string | null;
  status: string;
  orderer: {
    name: string | null;
    email: string | null;
    safeNumber: string | null;
    ordererNumber: string | null;
  };
  receiver: {
    name: string | null;
    safeNumber: string | null;
    receiverNumber: string | null;
    addr1: string | null;
    addr2: string | null;
    postCode: string | null;
  };
  deliveryCompanyName: string | null;
  deliveryCompanyCode: string | null;
  invoiceNumber: string | null;
  inTransitDateTime: string | null;
  deliveredDate: string | null;
  parcelPrintMessage: string | null;
  shipmentType: string | null;
  splitShipping: boolean | null;
  ableSplitShipping: boolean | null;
  items: CoupangOrderRow[];
  relatedReturnRequests: CoupangReturnRow[];
  relatedExchangeRequests: CoupangExchangeRow[];
}

export interface CoupangOrderDetailResponse {
  store: CoupangStoreRef;
  item: CoupangOrderDetail | null;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export type CoupangShipmentWorksheetRawFieldValue = string | number | boolean | null;

export type CoupangShipmentWorksheetRawFields = Record<
  string,
  CoupangShipmentWorksheetRawFieldValue
>;

export type CoupangShipmentWorksheetRawFieldValueType =
  | "string"
  | "number"
  | "boolean"
  | "null";

export interface CoupangShipmentWorksheetRawFieldCatalogItem {
  key: string;
  label: string;
  group: string;
  sampleValueType: CoupangShipmentWorksheetRawFieldValueType;
}

export interface CoupangShipmentWorksheetRow {
  id: string;
  sourceKey: string;
  storeId: string;
  storeName: string;
  orderDateText: string;
  orderDateKey: string;
  quantity: number | null;
  productName: string;
  optionName: string | null;
  productOrderNumber: string;
  collectedPlatform: string;
  ordererName: string | null;
  contact: string | null;
  receiverName: string;
  receiverBaseName: string | null;
  personalClearanceCode: string | null;
  collectedAccountName: string;
  deliveryCompanyCode: string;
  selpickOrderNumber: string;
  invoiceNumber: string;
  coupangDeliveryCompanyCode: string | null;
  coupangInvoiceNumber: string | null;
  coupangInvoiceUploadedAt: string | null;
  salePrice: number | null;
  shippingFee: number;
  receiverAddress: string | null;
  deliveryRequest: string | null;
  buyerPhoneNumber: string | null;
  productNumber: string | null;
  exposedProductName: string;
  coupangDisplayProductName?: string | null;
  productOptionNumber: string | null;
  sellerProductCode: string | null;
  isOverseas: boolean;
  shipmentBoxId: string;
  orderId: string;
  sellerProductId: string | null;
  vendorItemId: string | null;
  availableActions: CoupangActionKey[];
  orderStatus: string | null;
  customerServiceIssueCount: number;
  customerServiceIssueSummary: string | null;
  customerServiceIssueBreakdown: CoupangCustomerServiceIssueBreakdownItem[];
  customerServiceState: CoupangCustomerServiceState;
  customerServiceFetchedAt: string | null;
  orderedAtRaw: string | null;
  lastOrderHydratedAt: string | null;
  lastProductHydratedAt: string | null;
  estimatedShippingDate: string | null;
  splitShipping: boolean | null;
  invoiceTransmissionStatus: CoupangShipmentInvoiceTransmissionStatus | null;
  invoiceTransmissionMessage: string | null;
  invoiceTransmissionAt: string | null;
  exportedAt: string | null;
  invoiceAppliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rawFields?: CoupangShipmentWorksheetRawFields;
}

export type CoupangShipmentInvoiceTransmissionStatus = "pending" | "succeeded" | "failed";

export const COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE =
  "\uC774\uBBF8 \uC804\uC1A1\uB41C \uC1A1\uC7A5\uC785\uB2C8\uB2E4.";

const COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE_PATTERNS = [
  /이미.*(송장|운송장|전송|반영|등록)/i,
  /(송장|운송장).*(이미|중복)/i,
  /already.*(invoice|shipment|registered|applied|processed)/i,
  /(invoice|shipment).*(already|duplicate)/i,
  /duplicate/i,
] as const;

const COUPANG_INVOICE_ALREADY_PROCESSED_CODE_PATTERNS = [
  /ALREADY/i,
  /DUP/i,
  /EXIST/i,
] as const;

export function isCoupangInvoiceAlreadyProcessedResult(input: {
  resultCode?: string | null;
  message?: string | null;
}) {
  const message = input.message?.trim() ?? "";
  const normalizedMessage = message.toLowerCase();
  if (
    normalizedMessage.includes("\uC774\uBBF8") &&
    ["\uC1A1\uC7A5", "\uC6B4\uC1A1\uC7A5", "\uC804\uC1A1", "\uBC18\uC601", "\uB4F1\uB85D"].some(
      (keyword) => message.includes(keyword),
    )
  ) {
    return true;
  }

  if (
    normalizedMessage.includes("already") &&
    ["invoice", "shipment", "registered", "applied", "processed"].some((keyword) =>
      normalizedMessage.includes(keyword),
    )
  ) {
    return true;
  }

  if (normalizedMessage.includes("duplicate")) {
    return true;
  }

  if (
    message &&
    COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return true;
  }

  const resultCode = input.resultCode?.trim() ?? "";
  if (
    resultCode &&
    COUPANG_INVOICE_ALREADY_PROCESSED_CODE_PATTERNS.some((pattern) => pattern.test(resultCode))
  ) {
    return true;
  }

  return false;
}

export type CoupangShipmentSyncMode = "new_only" | "incremental" | "full";

export const coupangShipmentWorksheetSyncPhases = [
  "worksheet_collect",
  "order_detail_hydration",
  "product_detail_hydration",
  "customer_service_refresh",
] as const;
export type CoupangShipmentWorksheetSyncPhase =
  (typeof coupangShipmentWorksheetSyncPhases)[number];

export const coupangShipmentWorksheetRefreshScopes = [
  "pending_after_collect",
  "shipment_boxes",
  "customer_service",
] as const;
export type CoupangShipmentWorksheetRefreshScope =
  (typeof coupangShipmentWorksheetRefreshScopes)[number];

export interface CoupangShipmentWorksheetSyncSummary {
  mode: CoupangShipmentSyncMode;
  fetchedCount: number;
  insertedCount: number;
  insertedSourceKeys: string[];
  updatedCount: number;
  skippedHydrationCount: number;
  autoExpanded: boolean;
  fetchCreatedAtFrom: string | null;
  fetchCreatedAtTo: string | null;
  statusFilter: string | null;
  completedPhases: CoupangShipmentWorksheetSyncPhase[];
  pendingPhases: CoupangShipmentWorksheetSyncPhase[];
  warningPhases: CoupangShipmentWorksheetSyncPhase[];
  degraded?: boolean;
  failedStatuses?: string[];
  autoAuditRecommended?: boolean;
  checkpointCount?: number;
  checkpointPersistedCount?: number;
  lastCheckpointAt?: string | null;
}

export interface CoupangShipmentWorksheetResponse {
  store: CoupangStoreRef;
  items: CoupangShipmentWorksheetRow[];
  rawFieldCatalog: CoupangShipmentWorksheetRawFieldCatalogItem[];
  fetchedAt: string;
  collectedAt: string | null;
  message: string | null;
  source: CoupangDataSource;
  syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  operation?: OperationLogEntry;
}

export type CoupangShipmentWorksheetViewScope =
  | "dispatch_active"
  | "post_dispatch"
  | "claims"
  | "all";

export type CoupangShipmentWorksheetInvoiceStatusCard =
  | "all"
  | "idle"
  | "ready"
  | "pending"
  | "failed"
  | "applied";

export type CoupangShipmentWorksheetOrderStatusCard =
  | "all"
  | "ACCEPT"
  | "INSTRUCT"
  | "DEPARTURE"
  | "DELIVERING"
  | "FINAL_DELIVERY"
  | "NONE_TRACKING"
  | "SHIPMENT_STOP_REQUESTED"
  | "SHIPMENT_STOP_HANDLED"
  | "CANCEL"
  | "RETURN"
  | "EXCHANGE";

export type CoupangShipmentWorksheetOutputStatusCard = "all" | "notExported" | "exported";

export type CoupangShipmentWorksheetColumnSourceKey =
  | "blank"
  | "orderDateText"
  | "quantity"
  | "productName"
  | "optionName"
  | "productOrderNumber"
  | "collectedPlatform"
  | "ordererName"
  | "contact"
  | "receiverName"
  | "collectedAccountName"
  | "deliveryCompanyCode"
  | "selpickOrderNumber"
  | "invoiceNumber"
  | "salePrice"
  | "shippingFee"
  | "receiverAddress"
  | "deliveryRequest"
  | "buyerPhoneNumber"
  | "productNumber"
  | "exposedProductName"
  | "coupangDisplayProductName"
  | "productOptionNumber"
  | "sellerProductCode";

export type CoupangShipmentWorksheetColumnSource =
  | {
      kind: "builtin";
      key: CoupangShipmentWorksheetColumnSourceKey;
    }
  | {
      kind: "raw";
      key: string;
    };

export type CoupangShipmentWorksheetRawSortField = `raw:${string}`;

export type CoupangShipmentWorksheetSortField =
  | "__exportStatus"
  | "__orderStatus"
  | "__invoiceTransmissionStatus"
  | Exclude<CoupangShipmentWorksheetColumnSourceKey, "blank">
  | CoupangShipmentWorksheetRawSortField;

export type CoupangShipmentWorksheetSortDirection = "asc" | "desc";

export interface CoupangShipmentWorksheetViewQuery {
  storeId: string;
  scope?: CoupangShipmentWorksheetViewScope;
  page?: number;
  pageSize?: number;
  query?: string;
  invoiceStatusCard?: CoupangShipmentWorksheetInvoiceStatusCard;
  orderStatusCard?: CoupangShipmentWorksheetOrderStatusCard;
  outputStatusCard?: CoupangShipmentWorksheetOutputStatusCard;
  sortField?: CoupangShipmentWorksheetSortField | null;
  sortDirection?: CoupangShipmentWorksheetSortDirection | null;
}

export interface CoupangShipmentWorksheetViewResponse {
  store: CoupangStoreRef;
  items: CoupangShipmentWorksheetRow[];
  rawFieldCatalog: CoupangShipmentWorksheetRawFieldCatalogItem[];
  fetchedAt: string;
  collectedAt: string | null;
  message: string | null;
  source: CoupangDataSource;
  syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  scope: CoupangShipmentWorksheetViewScope;
  page: number;
  pageSize: number;
  totalPages: number;
  totalRowCount: number;
  scopeRowCount: number;
  filteredRowCount: number;
  invoiceReadyCount: number;
  scopeCounts: Record<CoupangShipmentWorksheetViewScope, number>;
  invoiceCounts: Record<CoupangShipmentWorksheetInvoiceStatusCard, number>;
  orderCounts: Record<CoupangShipmentWorksheetOrderStatusCard, number>;
  outputCounts: Record<CoupangShipmentWorksheetOutputStatusCard, number>;
}

export interface CoupangShipmentArchiveRow extends CoupangShipmentWorksheetRow {
  archivedAt: string;
}

export interface CoupangShipmentArchiveViewQuery {
  storeId: string;
  page?: number;
  pageSize?: number;
  query?: string;
}

export interface CoupangShipmentArchiveViewResponse {
  store: CoupangStoreRef;
  items: CoupangShipmentArchiveRow[];
  rawFieldCatalog: CoupangShipmentWorksheetRawFieldCatalogItem[];
  fetchedAt: string;
  message: string | null;
  page: number;
  pageSize: number;
  totalPages: number;
  totalRowCount: number;
  filteredRowCount: number;
}

export type CoupangShipmentWorksheetAuditStatus = "INSTRUCT" | "ACCEPT";
export type CoupangShipmentWorksheetAuditHiddenReason = "out_of_scope" | "filtered_out";

export interface AuditCoupangShipmentWorksheetMissingInput {
  storeId: string;
  createdAtFrom: string;
  createdAtTo: string;
  viewQuery?: Omit<
    CoupangShipmentWorksheetViewQuery,
    "storeId" | "page" | "pageSize" | "sortField" | "sortDirection"
  >;
}

export interface CoupangShipmentWorksheetAuditMissingItem {
  sourceKey: string;
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string | null;
  sellerProductId: string | null;
  status: string | null;
  productName: string;
  orderedAt: string | null;
}

export interface CoupangShipmentWorksheetAuditHiddenItem {
  sourceKey: string;
  rowId: string;
  status: string | null;
  productName: string;
  hiddenReason: CoupangShipmentWorksheetAuditHiddenReason;
}

export interface CoupangShipmentWorksheetAuditMissingResponse {
  auditedStatuses: CoupangShipmentWorksheetAuditStatus[];
  liveCount: number;
  worksheetMatchedCount: number;
  missingCount: number;
  hiddenCount: number;
  missingItems: CoupangShipmentWorksheetAuditMissingItem[];
  hiddenItems: CoupangShipmentWorksheetAuditHiddenItem[];
  message: string | null;
}

export type CoupangShipmentWorksheetBulkResolveMode =
  | "invoice_ready"
  | "not_exported_download"
  | "prepare_ready";

export interface CoupangShipmentWorksheetBulkResolveRequest {
  storeId: string;
  viewQuery?: Omit<CoupangShipmentWorksheetViewQuery, "storeId">;
  mode: CoupangShipmentWorksheetBulkResolveMode;
}

export interface CoupangShipmentWorksheetBulkResolveResponse {
  store: CoupangStoreRef;
  mode: CoupangShipmentWorksheetBulkResolveMode;
  items: CoupangShipmentWorksheetRow[];
  blockedItems: CoupangShipmentWorksheetRow[];
  fetchedAt: string;
  message: string | null;
  source: CoupangDataSource;
  matchedCount: number;
  resolvedCount: number;
}

export interface CoupangShipmentWorksheetDetail {
  orderDetail: CoupangOrderDetail | null;
  returns: CoupangReturnRow[];
  returnDetails: CoupangReturnDetail[];
  exchanges: CoupangExchangeRow[];
  exchangeDetails: CoupangExchangeDetail[];
  customerServiceIssueCount: number;
  customerServiceIssueSummary: string | null;
  customerServiceIssueBreakdown: CoupangCustomerServiceIssueBreakdownItem[];
  customerServiceState: CoupangCustomerServiceState;
  claimLookupCreatedAtFrom: string | null;
  claimLookupCreatedAtTo: string | null;
}

export interface CoupangShipmentWorksheetDetailResponse {
  store: CoupangStoreRef;
  item: CoupangShipmentWorksheetDetail;
  fetchedAt: string;
  message: string | null;
  source: CoupangDataSource;
}

export interface CollectCoupangShipmentInput {
  storeId: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  status?: string;
  maxPerPage?: number;
  syncMode?: CoupangShipmentSyncMode;
}

export interface RefreshCoupangShipmentWorksheetInput {
  storeId: string;
  scope: CoupangShipmentWorksheetRefreshScope;
  shipmentBoxIds?: string[];
}

export interface CoupangShipmentWorksheetRefreshResponse {
  store: CoupangStoreRef;
  scope: CoupangShipmentWorksheetRefreshScope;
  items: CoupangShipmentWorksheetRow[];
  fetchedAt: string;
  message: string | null;
  source: CoupangDataSource;
  syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  refreshedCount: number;
  updatedCount: number;
  completedPhases: CoupangShipmentWorksheetSyncPhase[];
  pendingPhases: CoupangShipmentWorksheetSyncPhase[];
  warningPhases: CoupangShipmentWorksheetSyncPhase[];
  operation?: OperationLogEntry;
}

export interface PatchCoupangShipmentWorksheetItemInput {
  sourceKey?: string;
  selpickOrderNumber?: string;
  receiverName?: string | null;
  receiverBaseName?: string | null;
  personalClearanceCode?: string | null;
  deliveryCompanyCode?: string | null;
  invoiceNumber?: string | null;
  deliveryRequest?: string | null;
  invoiceTransmissionStatus?: CoupangShipmentInvoiceTransmissionStatus | null;
  invoiceTransmissionMessage?: string | null;
  invoiceTransmissionAt?: string | null;
  exportedAt?: string | null;
  invoiceAppliedAt?: string | null;
  orderStatus?: string | null;
  availableActions?: CoupangActionKey[] | null;
}

export interface PatchCoupangShipmentWorksheetInput {
  storeId: string;
  items: PatchCoupangShipmentWorksheetItemInput[];
}

export interface CoupangShipmentWorksheetInvoiceInputApplyRow {
  selpickOrderNumber: string;
  deliveryCompanyCode: string;
  invoiceNumber: string;
}

export interface ApplyCoupangShipmentWorksheetInvoiceInput {
  storeId: string;
  rows: CoupangShipmentWorksheetInvoiceInputApplyRow[];
}

export interface CoupangShipmentWorksheetInvoiceInputApplyResponse {
  matchedCount: number;
  updatedCount: number;
  ignoredCount: number;
  issues: string[];
  touchedRowIds: string[];
  message: string | null;
}

export interface RunCoupangShipmentArchiveInput {
  storeId?: string;
  dryRun?: boolean;
}

export interface RunCoupangShipmentArchiveStoreResult {
  storeId: string;
  storeName: string;
  eligibleRowCount: number;
  archivedRowCount: number;
  skippedRowCount: number;
  dryRun: boolean;
  message: string | null;
}

export interface RunCoupangShipmentArchiveResponse {
  processedStoreCount: number;
  archivedRowCount: number;
  skippedRowCount: number;
  dryRun: boolean;
  stores: RunCoupangShipmentArchiveStoreResult[];
  message: string | null;
}

export interface CoupangPrepareTarget {
  shipmentBoxId: string;
  orderId?: string | null;
  productName?: string | null;
}

export interface CoupangInvoiceTarget {
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  deliveryCompanyCode: string;
  invoiceNumber: string;
  splitShipping?: boolean;
  preSplitShipped?: boolean;
  estimatedShippingDate?: string;
  productName?: string | null;
}

export interface CoupangReturnActionTarget {
  receiptId: string;
  cancelCount?: number | null;
  deliveryCompanyCode?: string | null;
  invoiceNumber?: string | null;
  orderId?: string | null;
  shipmentBoxId?: string | null;
  vendorItemId?: string | null;
  productName?: string | null;
}

export interface CoupangReturnCollectionInvoiceTarget {
  receiptId: string;
  returnExchangeDeliveryType: CoupangReturnExchangeDeliveryType;
  deliveryCompanyCode: string;
  invoiceNumber: string;
  regNumber?: string | null;
  orderId?: string | null;
  shipmentBoxId?: string | null;
  vendorItemId?: string | null;
  productName?: string | null;
}

export interface CoupangExchangeConfirmTarget {
  exchangeId: string;
  orderId?: string | null;
  shipmentBoxId?: string | null;
  vendorItemId?: string | null;
  productName?: string | null;
}

export interface CoupangExchangeRejectTarget {
  exchangeId: string;
  exchangeRejectCode: CoupangExchangeRejectCode;
  orderId?: string | null;
  shipmentBoxId?: string | null;
  vendorItemId?: string | null;
  productName?: string | null;
}

export interface CoupangExchangeInvoiceTarget {
  exchangeId: string;
  shipmentBoxId: string;
  goodsDeliveryCode: string;
  invoiceNumber: string;
  orderId?: string | null;
  vendorItemId?: string | null;
  productName?: string | null;
}

export interface CoupangCancelOrderTarget {
  orderId: string;
  vendorItemId: string;
  receiptCount: number;
  userId: string;
  middleCancelCode: "CCTTER" | "CCPNER" | "CCPRER";
  productName?: string | null;
  shipmentBoxId?: string | null;
}

export interface CoupangActionItemResult {
  targetId: string;
  action: CoupangActionKey;
  shipmentBoxId: string | null;
  orderId: string | null;
  receiptId: string | null;
  vendorItemId: string | null;
  status: CoupangActionItemStatus;
  resultCode: string | null;
  retryRequired: boolean;
  message: string;
  appliedAt: string | null;
}

export interface CoupangActionSummary {
  total: number;
  succeededCount: number;
  failedCount: number;
  warningCount: number;
  skippedCount: number;
}

export interface CoupangBatchActionResponse {
  items: CoupangActionItemResult[];
  summary: CoupangActionSummary;
  completedAt: string;
  operation?: OperationLogEntry;
}
