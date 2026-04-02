import type { OperationLogEntry } from "./operations";
import type { CoupangDataSource, CoupangStoreRef } from "./coupang";

export interface CoupangPagination {
  currentPage: number | null;
  totalPages: number | null;
  totalElements: number | null;
  countPerPage: number | null;
}

export interface CoupangCategoryRow {
  id: string;
  code: string;
  name: string;
  status: string;
  depth: number;
  path: string;
  parentCode: string | null;
  leaf: boolean;
  childCount: number;
}

export interface CoupangCategoryListResponse {
  store: CoupangStoreRef;
  items: CoupangCategoryRow[];
  registrationType: "ALL" | "RFM";
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangOutboundCenterAddress {
  addressType: string | null;
  countryCode: string | null;
  companyContactNumber: string | null;
  phoneNumber2: string | null;
  returnZipCode: string | null;
  returnAddress: string | null;
  returnAddressDetail: string | null;
}

export interface CoupangOutboundCenterRemoteInfo {
  remoteInfoId: string | null;
  deliveryCode: string | null;
  jeju: number | null;
  notJeju: number | null;
  usable: boolean | null;
}

export interface CoupangOutboundCenterRow {
  id: string;
  vendorId: string | null;
  outboundShippingPlaceCode: string;
  shippingPlaceName: string;
  createDate: string | null;
  global: boolean | null;
  usable: boolean | null;
  addressType: string | null;
  countryCode: string | null;
  companyContactNumber: string | null;
  phoneNumber2: string | null;
  zipCode: string | null;
  address: string | null;
  addressDetail: string | null;
  note: string | null;
  placeAddresses: CoupangOutboundCenterAddress[];
  remoteInfos: CoupangOutboundCenterRemoteInfo[];
}

export interface CoupangReturnCenterAddress {
  addressType: string | null;
  countryCode: string | null;
  companyContactNumber: string | null;
  phoneNumber2: string | null;
  returnZipCode: string | null;
  returnAddress: string | null;
  returnAddressDetail: string | null;
}

export interface CoupangReturnCenterRow {
  id: string;
  vendorId: string | null;
  returnCenterCode: string;
  shippingPlaceName: string;
  deliverCode: string | null;
  deliverName: string | null;
  goodsflowStatus: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  usable: boolean | null;
  companyContactNumber: string | null;
  phoneNumber2: string | null;
  zipCode: string | null;
  address: string | null;
  addressDetail: string | null;
  addressType: string | null;
  countryCode: string | null;
  vendorCreditFee02kg: number | null;
  vendorCreditFee05kg: number | null;
  vendorCreditFee10kg: number | null;
  vendorCreditFee20kg: number | null;
  vendorCashFee02kg: number | null;
  vendorCashFee05kg: number | null;
  vendorCashFee10kg: number | null;
  vendorCashFee20kg: number | null;
  consumerCashFee02kg: number | null;
  consumerCashFee05kg: number | null;
  consumerCashFee10kg: number | null;
  consumerCashFee20kg: number | null;
  returnFee02kg: number | null;
  returnFee05kg: number | null;
  returnFee10kg: number | null;
  returnFee20kg: number | null;
  placeAddresses: CoupangReturnCenterAddress[];
}

export interface CoupangLogisticsCenterListResponse<TItem> {
  store: CoupangStoreRef;
  items: TItem[];
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangInquiryReply {
  replyId: string;
  answerId: string | null;
  parentAnswerId: string | null;
  authorType: "vendor" | "csAgent" | "system" | "unknown";
  receptionistName: string | null;
  receptionistCode: string | null;
  content: string;
  repliedAt: string | null;
  needAnswer: boolean | null;
  partnerTransferStatus: string | null;
  partnerTransferCompleteReason: string | null;
}

export interface CoupangProductInquiryRow {
  id: string;
  inquiryId: string;
  inquiryType: "product";
  sellerProductId: string | null;
  vendorItemId: string | null;
  productId: string | null;
  productName: string;
  content: string;
  inquiryAt: string | null;
  orderIds: string[];
  answered: boolean;
  needsAnswer: boolean;
  lastAnsweredAt: string | null;
  replies: CoupangInquiryReply[];
}

export interface CoupangCallCenterInquiryRow {
  id: string;
  inquiryId: string;
  inquiryType: "callCenter";
  inquiryStatus: string;
  counselingStatus: string;
  needsAnswer: boolean;
  productName: string;
  vendorItemIds: string[];
  orderId: string | null;
  buyerPhone: string | null;
  receiptCategory: string | null;
  content: string;
  inquiryAt: string | null;
  answeredAt: string | null;
  replies: CoupangInquiryReply[];
}

export interface CoupangInquiryListResponse<TItem> {
  store: CoupangStoreRef;
  items: TItem[];
  pagination: CoupangPagination;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface AnswerCoupangProductInquiryInput {
  storeId: string;
  inquiryId: string;
  content: string;
  replyBy: string;
}

export interface AnswerCoupangCallCenterInquiryInput {
  storeId: string;
  inquiryId: string;
  content: string;
  replyBy: string;
  parentAnswerId: string;
}

export interface ConfirmCoupangCallCenterInquiryInput {
  storeId: string;
  inquiryId: string;
  confirmBy: string;
}

export interface CoupangInquiryAnswerResponse {
  inquiryId: string;
  appliedAt: string;
  message: string;
  operation?: OperationLogEntry;
}

export interface CoupangInquiryConfirmResponse {
  inquiryId: string;
  appliedAt: string;
  message: string;
  operation?: OperationLogEntry;
}

export interface CoupangOutboundCenterAddressInput {
  addressType: string;
  countryCode: string;
  companyContactNumber: string;
  phoneNumber2?: string | null;
  returnZipCode: string;
  returnAddress: string;
  returnAddressDetail: string;
}

export interface CoupangOutboundCenterRemoteInfoInput {
  remoteInfoId?: string | null;
  deliveryCode: string;
  jeju: number;
  notJeju: number;
  usable?: boolean | null;
}

export interface CreateCoupangOutboundCenterInput {
  storeId: string;
  userId: string;
  shippingPlaceName: string;
  usable?: boolean | null;
  global?: boolean | null;
  placeAddresses: CoupangOutboundCenterAddressInput[];
  remoteInfos?: CoupangOutboundCenterRemoteInfoInput[];
}

export interface UpdateCoupangOutboundCenterInput extends CreateCoupangOutboundCenterInput {
  outboundShippingPlaceCode: string;
}

export interface CoupangReturnCenterAddressInput {
  addressType: string;
  countryCode: string;
  companyContactNumber: string;
  phoneNumber2?: string | null;
  returnZipCode: string;
  returnAddress: string;
  returnAddressDetail: string;
}

export interface CoupangReturnGoodsflowInfoInput {
  deliverCode?: string | null;
  deliverName?: string | null;
  contractNumber?: string | null;
  contractCustomerNumber?: string | null;
  vendorCreditFee02kg?: number | null;
  vendorCreditFee05kg?: number | null;
  vendorCreditFee10kg?: number | null;
  vendorCreditFee20kg?: number | null;
  vendorCashFee02kg?: number | null;
  vendorCashFee05kg?: number | null;
  vendorCashFee10kg?: number | null;
  vendorCashFee20kg?: number | null;
  consumerCashFee02kg?: number | null;
  consumerCashFee05kg?: number | null;
  consumerCashFee10kg?: number | null;
  consumerCashFee20kg?: number | null;
  returnFee02kg?: number | null;
  returnFee05kg?: number | null;
  returnFee10kg?: number | null;
  returnFee20kg?: number | null;
}

export interface CreateCoupangReturnCenterInput {
  storeId: string;
  userId: string;
  shippingPlaceName: string;
  placeAddresses: CoupangReturnCenterAddressInput[];
  goodsflowInfo: CoupangReturnGoodsflowInfoInput;
}

export interface UpdateCoupangReturnCenterInput {
  storeId: string;
  returnCenterCode: string;
  userId: string;
  shippingPlaceName?: string | null;
  usable?: boolean | null;
  placeAddresses: CoupangReturnCenterAddressInput[];
  goodsflowInfo: CoupangReturnGoodsflowInfoInput;
}

export interface CoupangLogisticsMutationResponse {
  centerCode: string;
  appliedAt: string;
  message: string;
  operation?: OperationLogEntry;
}

export interface CoupangRocketGrowthProductRow {
  sellerProductId: string;
  sellerProductName: string;
  displayCategoryCode: string | null;
  displayCategoryName: string | null;
  statusName: string | null;
  vendorId: string;
  productType: "RFM" | "CGF" | "UNKNOWN";
  vendorItemIds: string[];
  lastModifiedAt: string | null;
}

export interface CoupangRocketGrowthInventoryRow {
  id: string;
  vendorItemId: string;
  externalSkuId: string | null;
  totalOrderableQuantity: number | null;
  salesCountLastThirtyDays: number | null;
  nextToken: string | null;
}

export interface CoupangRocketGrowthOrderItemRow {
  id: string;
  vendorItemId: string;
  productName: string;
  salesQuantity: number | null;
  unitSalesPrice: number | null;
  currency: string | null;
}

export interface CoupangRocketGrowthOrderRow {
  id: string;
  orderId: string;
  vendorId: string | null;
  paidAt: string | null;
  orderItems: CoupangRocketGrowthOrderItemRow[];
  totalSalesQuantity: number;
  totalSalesAmount: number;
  currency: string | null;
}

export interface CoupangRocketGrowthProductListResponse {
  store: CoupangStoreRef;
  items: CoupangRocketGrowthProductRow[];
  nextToken: string | null;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangRocketGrowthInventoryListResponse {
  store: CoupangStoreRef;
  items: CoupangRocketGrowthInventoryRow[];
  nextToken: string | null;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}

export interface CoupangRocketGrowthOrderListResponse {
  store: CoupangStoreRef;
  items: CoupangRocketGrowthOrderRow[];
  nextToken: string | null;
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
}
