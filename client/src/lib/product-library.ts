import type {
  ProductLibraryListResponse,
  ProductLibraryRecord,
  ProductLibraryRef,
  ProductLibraryStatus,
} from "@shared/product-library";
import { PRODUCT_LIBRARY_MAX_ATTACHMENT_BYTES, PRODUCT_LIBRARY_STATUS_LABELS } from "@shared/product-library";

export function buildProductLibraryRecordUrl(reference: ProductLibraryRef) {
  const params = new URLSearchParams({
    channel: reference.channel,
    storeId: reference.storeId,
    channelProductId: reference.channelProductId,
    storeName: reference.storeName,
    productName: reference.productName,
  });

  if (reference.secondaryChannelProductId) {
    params.set("secondaryChannelProductId", reference.secondaryChannelProductId);
  }

  if (reference.sellerProductCode) {
    params.set("sellerProductCode", reference.sellerProductCode);
  }

  return `/api/product-library/record?${params.toString()}`;
}

export function buildProductLibraryRecordsUrl(input: {
  channel: string;
  storeId: string;
  status: string;
  search: string;
  tag: string;
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });

  if (input.channel) {
    params.set("channel", input.channel);
  }

  if (input.storeId) {
    params.set("storeId", input.storeId);
  }

  if (input.status) {
    params.set("status", input.status);
  }

  if (input.search.trim()) {
    params.set("search", input.search.trim());
  }

  if (input.tag.trim()) {
    params.set("tag", input.tag.trim());
  }

  return `/api/product-library/records?${params.toString()}`;
}

export function formatProductLibraryStatusLabel(status: ProductLibraryStatus) {
  return PRODUCT_LIBRARY_STATUS_LABELS[status] ?? status;
}

export function formatProductLibraryBytes(byteSize: number) {
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    return "0 B";
  }

  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(byteSize >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (byteSize >= 1024) {
    return `${Math.round(byteSize / 1024)} KB`;
  }

  return `${byteSize} B`;
}

export function parseTagInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

export function stringifyTags(tags: string[]) {
  return tags.join(", ");
}

export function getProductLibraryRemainingBytes(record: ProductLibraryRecord | null) {
  return Math.max(
    0,
    PRODUCT_LIBRARY_MAX_ATTACHMENT_BYTES - (record?.attachmentBytes ?? 0),
  );
}

export function buildProductLibraryRecordQueryKey(reference: ProductLibraryRef) {
  return [
    "/api/product-library/record",
    reference.channel,
    reference.storeId,
    reference.channelProductId,
  ] as const;
}

export function buildProductLibraryRecordsQueryKey(input: {
  channel: string;
  storeId: string;
  status: string;
  search: string;
  tag: string;
  page: number;
  pageSize: number;
}) {
  return [
    "/api/product-library/records",
    input.channel,
    input.storeId,
    input.status,
    input.search,
    input.tag,
    input.page,
    input.pageSize,
  ] as const;
}

export type ProductLibraryRecordQueryData = ProductLibraryRecord;
export type ProductLibraryListQueryData = ProductLibraryListResponse;
