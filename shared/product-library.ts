export const productLibraryChannels = ["naver", "coupang"] as const;
export type ProductLibraryChannel = (typeof productLibraryChannels)[number];

export const productLibraryStatuses = [
  "review_required",
  "approval_delay",
  "appeal_needed",
  "on_hold",
  "done",
] as const;

export type ProductLibraryStatus = (typeof productLibraryStatuses)[number];

export const PRODUCT_LIBRARY_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export const PRODUCT_LIBRARY_STATUS_LABELS: Record<ProductLibraryStatus, string> = {
  review_required: "검토 필요",
  approval_delay: "심사 지연",
  appeal_needed: "소명 필요",
  on_hold: "보류",
  done: "완료",
};

export interface ProductLibraryRef {
  channel: ProductLibraryChannel;
  storeId: string;
  channelProductId: string;
  secondaryChannelProductId: string | null;
  storeName: string;
  productName: string;
  sellerProductCode: string | null;
}

export interface ProductLibraryAttachment {
  id: string;
  recordId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  downloadUrl: string;
}

export interface ProductLibraryRecord extends ProductLibraryRef {
  id: string | null;
  exists: boolean;
  status: ProductLibraryStatus;
  tags: string[];
  memo: string;
  attachmentCount: number;
  attachmentBytes: number;
  attachments: ProductLibraryAttachment[];
  lastActivityAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProductLibrarySummary extends ProductLibraryRef {
  id: string;
  status: ProductLibraryStatus;
  tags: string[];
  memoPreview: string | null;
  attachmentCount: number;
  attachmentBytes: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductLibraryListResponse {
  items: ProductLibrarySummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UpsertProductLibraryRecordInput extends ProductLibraryRef {
  status: ProductLibraryStatus;
  tags: string[];
  memo: string;
}
