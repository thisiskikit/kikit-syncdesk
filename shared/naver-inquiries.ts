import type { ApiCacheState } from "./api";
import type { OperationLogEntry } from "./operations";

export const NAVER_INQUIRY_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export type NaverInquiryKind = "customer" | "product";
export type NaverInquiryActionStatus = "succeeded" | "failed" | "skipped";

export interface NaverInquiryStoreRef {
  id: string;
  name: string;
}

export interface NaverCustomerInquiryRow {
  id: string;
  kind: "customer";
  inquiryNo: string;
  category: string | null;
  title: string;
  inquiryContent: string;
  inquiryRegistrationDateTime: string | null;
  answered: boolean;
  answerContentId: string | null;
  answerContent: string | null;
  answerTemplateId: string | null;
  answerRegistrationDateTime: string | null;
  orderId: string | null;
  productNo: string | null;
  productOrderIdList: string[];
  productName: string | null;
  productOrderOption: string | null;
  customerId: string | null;
  customerName: string | null;
}

export interface NaverProductInquiryRow {
  id: string;
  kind: "product";
  questionId: string;
  productId: string | null;
  productName: string | null;
  question: string;
  answer: string | null;
  answered: boolean;
  maskedWriterId: string | null;
  createDate: string | null;
}

export type NaverInquiryRow = NaverCustomerInquiryRow | NaverProductInquiryRow;

export interface NaverInquiryListResponse {
  store: NaverInquiryStoreRef;
  kind: NaverInquiryKind;
  items: NaverInquiryRow[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
}

export interface NaverProductInquiryTemplate {
  id: string;
  questionType: string;
  subject: string;
  content: string;
}

export interface NaverProductInquiryTemplateListResponse {
  items: NaverProductInquiryTemplate[];
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
}

export interface NaverCustomerInquiryAnswerTarget {
  inquiryNo: string;
  answerComment: string;
  answerContentId?: string | null;
  answerTemplateId?: string | null;
  title?: string | null;
  customerName?: string | null;
}

export interface NaverProductInquiryAnswerTarget {
  questionId: string;
  commentContent: string;
  productName?: string | null;
}

export interface NaverInquiryActionItemResult {
  inquiryId: string;
  kind: NaverInquiryKind;
  action: "registerAnswer" | "updateAnswer" | "saveAnswer";
  status: NaverInquiryActionStatus;
  message: string;
  appliedAt: string | null;
}

export interface NaverInquiryActionResponse {
  items: NaverInquiryActionItemResult[];
  summary: {
    total: number;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
  };
  completedAt: string;
  operation?: OperationLogEntry;
}
