import type { CoupangDataSource, CoupangStoreRef } from "@shared/coupang";
import type {
  ApplyCoupangCashbackInput,
  AttachCoupangDownloadCouponItemsInput,
  AttachCoupangInstantCouponItemsInput,
  CoupangCashbackRuleResponse,
  CoupangCashbackRuleRow,
  CoupangCouponBudgetListResponse,
  CoupangCouponBudgetRow,
  CoupangCouponContractListResponse,
  CoupangCouponContractRow,
  CoupangCouponRequestStatus,
  CoupangCouponRequestStatusResponse,
  CoupangDownloadCouponDetailResponse,
  CoupangDownloadCouponPolicyRow,
  CoupangDownloadCouponRow,
  CoupangInstantCouponDetailResponse,
  CoupangInstantCouponItemRow,
  CoupangInstantCouponItemsResponse,
  CoupangInstantCouponListResponse,
  CoupangInstantCouponRow,
  CoupangPromotionMutationResponse,
  CreateCoupangDownloadCouponInput,
  CreateCoupangInstantCouponInput,
  ExpireCoupangDownloadCouponInput,
  ExpireCoupangInstantCouponInput,
  RemoveCoupangCashbackInput,
} from "@shared/coupang-promo";
import type { CoupangPagination } from "@shared/coupang-support";
import { sleep } from "../shared/async-control";
import { CoupangApiError, requestCoupangJson } from "./api-client";
import { coupangSettingsStore } from "./settings-store";

type StoredCoupangStore = NonNullable<Awaited<ReturnType<typeof coupangSettingsStore.getStore>>>;
type LooseObject = Record<string, unknown>;

const REQUEST_STATUS_POLL_COUNT = 5;
const REQUEST_STATUS_POLL_INTERVAL_MS = 1_500;

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseObject)
    : null;
}

async function getStoreOrThrow(storeId: string) {
  const store = await coupangSettingsStore.getStore(storeId);
  if (!store) {
    throw new Error("Coupang store settings not found.");
  }

  return store as StoredCoupangStore;
}

function mapStoreRef(store: StoredCoupangStore): CoupangStoreRef {
  return {
    id: store.id,
    name: store.storeName,
    vendorId: store.vendorId,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function toPagination(payload: unknown): CoupangPagination {
  const data = asObject(asObject(payload)?.data);
  const pagination = asObject(data?.pagination) ?? asObject(asObject(payload)?.pagination);
  return {
    currentPage: asNumber(pagination?.currentPage),
    totalPages: asNumber(pagination?.totalPages),
    totalElements: asNumber(pagination?.totalElements),
    countPerPage: asNumber(pagination?.countPerPage),
  };
}

function toContent(payload: unknown) {
  const data = asObject(asObject(payload)?.data);
  const content = data?.content;
  return asArray(content);
}

function responseMeta<TStore extends StoredCoupangStore>(store: TStore) {
  return {
    store: mapStoreRef(store),
    fetchedAt: nowIso(),
    servedFromFallback: false,
    source: "live" as CoupangDataSource,
  };
}

function normalizeBudgetRow(row: LooseObject): CoupangCouponBudgetRow {
  return {
    contractId: asString(row.contractId) ?? "",
    targetMonth: asString(row.targetMonth),
    vendorShareRatio: asNumber(row.vendorShareRatio),
    totalBudgetAmount: asNumber(row.totalBudgetAmount),
    usedBudgetAmount: asNumber(row.usedBudgetAmount),
  };
}

function normalizeContractRow(row: LooseObject): CoupangCouponContractRow {
  return {
    contractId: asString(row.contractId) ?? "",
    vendorContractId: asString(row.vendorContractId),
    sellerId: asString(row.sellerId),
    sellerShareRatio: asNumber(row.sellerShareRatio),
    coupangShareRatio: asNumber(row.coupangShareRatio),
    gmvRatio: asNumber(row.gmvRatio),
    start: asString(row.start),
    end: asString(row.end),
    type: asString(row.type),
    useBudget: asBoolean(row.useBudget),
    modifiedAt: asString(row.modifiedAt),
    modifiedBy: asString(row.modifiedBy),
  };
}

function normalizeInstantCouponRow(row: LooseObject): CoupangInstantCouponRow {
  return {
    couponId: asString(row.couponId) ?? "",
    contractId: asString(row.contractId),
    vendorContractId: asString(row.vendorContractId),
    promotionName: asString(row.promotionName) ?? asString(row.name) ?? asString(row.title) ?? "",
    status: asString(row.status),
    type: asString(row.type),
    discount: asNumber(row.discount),
    maxDiscountPrice: asNumber(row.maxDiscountPrice),
    startAt: asString(row.startAt),
    endAt: asString(row.endAt),
    vendorItemCount: asNumber(row.vendorItemCount),
    couponItemCount: asNumber(row.couponItemCount),
    issuedCount: asNumber(row.issuedCount),
    downloadedCount: asNumber(row.downloadedCount),
    rawData: structuredClone(row),
  };
}

function normalizeInstantCouponItemRow(row: LooseObject, index: number): CoupangInstantCouponItemRow {
  return {
    id:
      asString(row.couponItemId) ??
      [asString(row.vendorItemId), asString(row.couponId), String(index)].filter(Boolean).join(":"),
    couponItemId: asString(row.couponItemId),
    vendorItemId: asString(row.vendorItemId),
    status: asString(row.status),
    startAt: asString(row.startAt),
    endAt: asString(row.endAt),
    rawData: structuredClone(row),
  };
}

function normalizeDownloadPolicyRow(row: LooseObject): CoupangDownloadCouponPolicyRow {
  return {
    title: asString(row.title) ?? "",
    typeOfDiscount: asString(row.typeOfDiscount),
    description: asString(row.description),
    minimumPrice: asNumber(row.minimumPrice),
    discount: asNumber(row.discount),
    maximumDiscountPrice: asNumber(row.maximumDiscountPrice),
    maximumPerDaily: asNumber(row.maximumPerDay) ?? asNumber(row.maximumPerDaily),
    manageCode: asString(row.manageCode) ?? asString(row.managedCode),
  };
}

function normalizeDownloadCouponRow(row: LooseObject): CoupangDownloadCouponRow {
  return {
    couponId: asString(row.couponId) ?? "",
    vendorId: asString(row.vendorId),
    title: asString(row.title) ?? "",
    couponType: asString(row.couponType),
    couponStatus: asString(row.couponStatus),
    publishedDate: asString(row.publishedDate),
    startDate: asString(row.startDate),
    endDate: asString(row.endDate),
    appliedOptionCount: asNumber(row.appliedOptionCount),
    usageAmount: asNumber(row.usageAmount),
    lastModifiedBy: asString(row.lastModifiedBy),
    lastModifiedDate: asString(row.lastModifiedDate),
    couponPolicies: asArray(row.couponPolicies)
      .map((item) => asObject(item))
      .filter((item): item is LooseObject => Boolean(item))
      .map((item) => normalizeDownloadPolicyRow(item)),
  };
}

function normalizeCouponRequestStatus(
  payload: unknown,
  kind: "instant" | "download",
): CoupangCouponRequestStatus | null {
  const root =
    kind === "instant"
      ? asObject(asObject(asObject(payload)?.data)?.content)
      : asObject(asObject(payload)?.transactionStatusResponse);

  if (!root) {
    return null;
  }

  const failedVendorItems =
    kind === "instant"
      ? asArray(root.failedVendorItems)
      : asArray(root.couponFailedVendorItemIdResponses);

  return {
    requestedId:
      asString(root.requestedId) ??
      asString(root.requestTransactionId) ??
      "",
    couponId: asString(root.couponId),
    type: asString(root.type),
    status: asString(root.status),
    total: asNumber(root.total),
    succeeded: asNumber(root.succeeded),
    failed: asNumber(root.failed),
    failedVendorItems: failedVendorItems
      .map((item) => asObject(item))
      .filter((item): item is LooseObject => Boolean(item))
      .map((item) => ({
        vendorItemId: asString(item.vendorItemId) ?? "",
        reason: asString(item.reason) ?? asString(item.failureReason) ?? "",
      })),
  };
}

async function requestCouponJson<T>(
  store: StoredCoupangStore,
  input: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    query?: URLSearchParams;
    body?: Record<string, unknown>;
  },
) {
  return requestCoupangJson<T>({
    credentials: {
      accessKey: store.credentials.accessKey,
      secretKey: store.credentials.secretKey,
      baseUrl: store.baseUrl,
    },
    method: input.method,
    path: input.path,
    query: input.query,
    body: input.body,
  });
}

async function pollRequestStatus(
  store: StoredCoupangStore,
  input: {
    kind: "instant" | "download";
    requestedId: string;
  },
) {
  let latest: CoupangCouponRequestStatus | null = null;

  for (let attempt = 0; attempt < REQUEST_STATUS_POLL_COUNT; attempt += 1) {
    const query =
      input.kind === "instant"
        ? undefined
        : new URLSearchParams({
            requestTransactionId: input.requestedId,
          });
    const payload = await requestCouponJson(store, {
      method: "GET",
      path:
        input.kind === "instant"
          ? `/v2/providers/fms/apis/api/v1/vendors/${encodeURIComponent(store.vendorId)}/requested/${encodeURIComponent(input.requestedId)}`
          : "/v2/providers/marketplace_openapi/apis/api/v1/coupons/transactionStatus",
      query,
    });

    latest = normalizeCouponRequestStatus(payload, input.kind);
    if (!latest) {
      break;
    }

    if (latest.status === "DONE" || latest.status === "FAIL") {
      return latest;
    }

    if (attempt < REQUEST_STATUS_POLL_COUNT - 1) {
      await sleep(REQUEST_STATUS_POLL_INTERVAL_MS);
    }
  }

  return latest;
}

export async function listCouponBudgets(input: {
  storeId: string;
  contractId?: string | null;
  targetMonth?: string | null;
}): Promise<CoupangCouponBudgetListResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const query = new URLSearchParams();

  if (input.contractId?.trim()) {
    query.set("contractId", input.contractId.trim());
  }
  if (input.targetMonth?.trim()) {
    query.set("targetMonth", input.targetMonth.trim());
  }

  const payload = await requestCouponJson(store, {
    method: "GET",
    path: `/v2/providers/fms/apis/api/v1/vendors/${encodeURIComponent(store.vendorId)}/budgets`,
    query,
  });

  return {
    ...responseMeta(store),
    items: toContent(payload)
      .map((item) => asObject(item))
      .filter((item): item is LooseObject => Boolean(item))
      .map((item) => normalizeBudgetRow(item)),
    pagination: toPagination(payload),
    message: null,
  };
}

export async function listCouponContracts(input: {
  storeId: string;
}): Promise<CoupangCouponContractListResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "GET",
    path: `/v2/providers/fms/apis/api/v2/vendors/${encodeURIComponent(store.vendorId)}/contract/list`,
  });

  return {
    ...responseMeta(store),
    items: toContent(payload)
      .map((item) => asObject(item))
      .filter((item): item is LooseObject => Boolean(item))
      .map((item) => normalizeContractRow(item)),
    pagination: toPagination(payload),
    message: null,
  };
}

export async function listInstantCoupons(input: {
  storeId: string;
  status: string;
  page?: number;
  size?: number;
  sort?: "asc" | "desc";
}): Promise<CoupangInstantCouponListResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const query = new URLSearchParams({
    status: input.status,
    page: String(Math.max(1, input.page ?? 1)),
    size: String(Math.max(1, Math.min(input.size ?? 20, 100))),
    sort: input.sort ?? "desc",
  });
  const payload = await requestCouponJson(store, {
    method: "GET",
    path: `/v2/providers/fms/apis/api/v2/vendors/${encodeURIComponent(store.vendorId)}/coupons`,
    query,
  });

  return {
    ...responseMeta(store),
    items: toContent(payload)
      .map((item) => asObject(item))
      .filter((item): item is LooseObject => Boolean(item))
      .map((item) => normalizeInstantCouponRow(item)),
    pagination: toPagination(payload),
    message: null,
  };
}

export async function getInstantCouponDetail(input: {
  storeId: string;
  couponId: string;
}): Promise<CoupangInstantCouponDetailResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "GET",
    path: `/v2/providers/fms/apis/api/v2/vendors/${encodeURIComponent(store.vendorId)}/coupon`,
    query: new URLSearchParams({
      couponId: input.couponId,
    }),
  });
  const content = asObject(asObject(asObject(payload)?.data)?.content);
  const item = content ? normalizeInstantCouponRow(content) : null;

  return {
    ...responseMeta(store),
    item,
    message: item ? null : "즉시할인 쿠폰 상세를 찾지 못했습니다.",
  };
}

export async function listInstantCouponItems(input: {
  storeId: string;
  couponId: string;
  status: string;
  page?: number;
  size?: number;
  sort?: "asc" | "desc";
}): Promise<CoupangInstantCouponItemsResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "GET",
    path:
      `/v2/providers/fms/apis/api/v1/vendors/${encodeURIComponent(store.vendorId)}` +
      `/coupons/${encodeURIComponent(input.couponId)}/items`,
    query: new URLSearchParams({
      status: input.status,
      page: String(Math.max(0, input.page ?? 0)),
      size: String(Math.max(1, Math.min(input.size ?? 20, 100))),
      sort: input.sort ?? "desc",
    }),
  });

  return {
    ...responseMeta(store),
    items: toContent(payload)
      .map((item) => asObject(item))
      .filter((item): item is LooseObject => Boolean(item))
      .map((item, index) => normalizeInstantCouponItemRow(item, index)),
    pagination: toPagination(payload),
    message: null,
  };
}

export async function getDownloadCouponDetail(input: {
  storeId: string;
  couponId: string;
}): Promise<CoupangDownloadCouponDetailResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "GET",
    path: `/v2/providers/marketplace_openapi/apis/api/v1/coupons/${encodeURIComponent(input.couponId)}`,
  });

  return {
    ...responseMeta(store),
    item: normalizeDownloadCouponRow(asObject(payload) ?? {}),
    message: null,
  };
}

export async function getCouponRequestStatus(input: {
  storeId: string;
  kind: "instant" | "download";
  requestedId: string;
}): Promise<CoupangCouponRequestStatusResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const item = await pollRequestStatus(store, {
    kind: input.kind,
    requestedId: input.requestedId,
  });

  return {
    ...responseMeta(store),
    item,
    message: item ? null : "요청 상태를 찾지 못했습니다.",
  };
}

export async function createInstantCoupon(
  input: CreateCoupangInstantCouponInput,
): Promise<CoupangPromotionMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "POST",
    path: `/v2/providers/fms/apis/api/v2/vendors/${encodeURIComponent(store.vendorId)}/coupon`,
    body: {
      contractId: Number(input.contractId),
      name: input.name,
      maxDiscountPrice: input.maxDiscountPrice,
      discount: input.discount,
      startAt: input.startAt,
      endAt: input.endAt,
      type: input.type,
      wowExclusive: input.wowExclusive ?? false,
    },
  });
  const requestedId = asString(asObject(asObject(asObject(payload)?.data)?.content)?.requestedId);
  const requestStatus =
    requestedId
      ? await pollRequestStatus(store, {
          kind: "instant",
          requestedId,
        })
      : null;

  return {
    appliedAt: nowIso(),
    message: requestStatus?.status === "DONE"
      ? "즉시할인 쿠폰 생성이 완료되었습니다."
      : requestStatus?.status === "FAIL"
        ? "즉시할인 쿠폰 생성 요청이 실패했습니다."
        : "즉시할인 쿠폰 생성 요청이 접수되었습니다.",
    couponId: requestStatus?.couponId ?? null,
    requestedId: requestedId ?? null,
    requestStatus,
  };
}

export async function attachInstantCouponItems(
  input: AttachCoupangInstantCouponItemsInput,
): Promise<CoupangPromotionMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "POST",
    path:
      `/v2/providers/fms/apis/api/v1/vendors/${encodeURIComponent(store.vendorId)}` +
      `/coupons/${encodeURIComponent(input.couponId)}/items`,
    body: {
      vendorItems: input.vendorItemIds.map((item) => Number(item)),
    },
  });
  const requestedId = asString(asObject(asObject(asObject(payload)?.data)?.content)?.requestedId);
  const requestStatus =
    requestedId
      ? await pollRequestStatus(store, {
          kind: "instant",
          requestedId,
        })
      : null;

  return {
    appliedAt: nowIso(),
    message: requestStatus?.status === "DONE"
      ? "즉시할인 쿠폰 상품 적용이 완료되었습니다."
      : requestStatus?.status === "FAIL"
        ? "즉시할인 쿠폰 상품 적용 요청이 실패했습니다."
        : "즉시할인 쿠폰 상품 적용 요청이 접수되었습니다.",
    couponId: input.couponId,
    requestedId: requestedId ?? null,
    requestStatus,
  };
}

export async function expireInstantCoupon(
  input: ExpireCoupangInstantCouponInput,
): Promise<CoupangPromotionMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "DELETE",
    path:
      `/v2/providers/fms/apis/api/v1/vendors/${encodeURIComponent(store.vendorId)}` +
      `/coupons/${encodeURIComponent(input.couponId)}`,
  });
  const requestedId = asString(asObject(asObject(asObject(payload)?.data)?.content)?.requestedId);
  const requestStatus =
    requestedId
      ? await pollRequestStatus(store, {
          kind: "instant",
          requestedId,
        })
      : null;

  return {
    appliedAt: nowIso(),
    message: requestStatus?.status === "DONE"
      ? "즉시할인 쿠폰 종료가 완료되었습니다."
      : requestStatus?.status === "FAIL"
        ? "즉시할인 쿠폰 종료 요청이 실패했습니다."
        : "즉시할인 쿠폰 종료 요청이 접수되었습니다.",
    couponId: input.couponId,
    requestedId: requestedId ?? null,
    requestStatus,
  };
}

export async function createDownloadCoupon(
  input: CreateCoupangDownloadCouponInput,
): Promise<CoupangPromotionMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "POST",
    path: "/v2/providers/marketplace_openapi/apis/api/v1/coupons",
    body: {
      title: input.title,
      contractId: Number(input.contractId),
      couponType: "DOWNLOAD",
      startDate: input.startDate,
      endDate: input.endDate,
      userId: input.userId,
      policies: input.couponPolicies.map((policy) => ({
        title: policy.title,
        typeOfDiscount: policy.typeOfDiscount,
        description: policy.description ?? "",
        minimumPrice: policy.minimumPrice,
        discount: policy.discount,
        maximumDiscountPrice: policy.maximumDiscountPrice,
        maximumPerDaily: policy.maximumPerDaily,
      })),
    },
  });
  const couponId = asString(asObject(payload)?.couponId);

  return {
    appliedAt: nowIso(),
    message: couponId
      ? `다운로드 쿠폰이 생성되었습니다. 쿠폰 ID: ${couponId}`
      : "다운로드 쿠폰이 생성되었습니다.",
    couponId,
  };
}

export async function attachDownloadCouponItems(
  input: AttachCoupangDownloadCouponItemsInput,
): Promise<CoupangPromotionMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "PUT",
    path: "/v2/providers/marketplace_openapi/apis/api/v1/coupon-items",
    body: {
      couponItems: [
        {
          couponId: Number(input.couponId),
          userId: input.userId,
          vendorItemIds: input.vendorItemIds.map((item) => Number(item)),
        },
      ],
    },
  });
  const root = Array.isArray(payload) ? asObject(payload[0]) : asObject(payload);

  return {
    appliedAt: nowIso(),
    message:
      asString(root?.requestResultStatus) === "SUCCESS"
        ? "다운로드 쿠폰 상품 적용이 완료되었습니다."
        : asString(root?.errorMessage) ?? "다운로드 쿠폰 상품 적용 요청이 처리되었습니다.",
    couponId: input.couponId,
  };
}

export async function expireDownloadCoupon(
  input: ExpireCoupangDownloadCouponInput,
): Promise<CoupangPromotionMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "POST",
    path: "/v2/providers/marketplace_openapi/apis/api/v1/coupons/expire",
    body: {
      expireCouponList: [
        {
          couponId: Number(input.couponId),
          reason: "expired",
          userId: input.userId,
        },
      ],
    },
  });
  const root = Array.isArray(payload) ? asObject(payload[0]) : asObject(payload);
  const requestTransactionId = asString(asObject(root?.body)?.requestTransactionId);
  const requestStatus =
    requestTransactionId
      ? await pollRequestStatus(store, {
          kind: "download",
          requestedId: requestTransactionId,
        })
      : null;

  return {
    appliedAt: nowIso(),
    message: requestStatus?.status === "DONE"
      ? "다운로드 쿠폰 종료가 완료되었습니다."
      : requestStatus?.status === "FAIL"
        ? "다운로드 쿠폰 종료 요청이 실패했습니다."
        : "다운로드 쿠폰 종료 요청이 접수되었습니다.",
    couponId: input.couponId,
    requestTransactionId: requestTransactionId ?? null,
    requestStatus,
  };
}

export async function getCashbackRule(input: {
  storeId: string;
  ruleId: string;
  vendorItemId: string;
}): Promise<CoupangCashbackRuleResponse> {
  const store = await getStoreOrThrow(input.storeId);

  try {
    const payload = await requestCouponJson(store, {
      method: "GET",
      path: `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}/products/items/cashback`,
      query: new URLSearchParams({
        ruleId: input.ruleId,
        vendorItemId: input.vendorItemId,
      }),
    });

    const data = asObject(asObject(payload)?.data);
    const item: CoupangCashbackRuleRow | null = data
      ? {
          vendorItemId: asString(data.vendorItemId) ?? input.vendorItemId,
          ruleId: asString(data.ruleId) ?? input.ruleId,
          valueType: asString(data.valueType),
          value: asNumber(data.value),
          maxAmount: asNumber(data.maxAmount),
          startAt: asString(data.startAt),
          endAt: asString(data.endAt),
          disabled: asBoolean(data.disabled),
          disabledAt: asString(data.disabledAt),
        }
      : null;

    return {
      ...responseMeta(store),
      item,
      message: item ? null : "캐시백 정보를 찾지 못했습니다.",
    };
  } catch (error) {
    if (error instanceof CoupangApiError && error.status === 404) {
      return {
        ...responseMeta(store),
        item: null,
        message: "해당 옵션에는 캐시백이 적용되어 있지 않습니다.",
      };
    }
    throw error;
  }
}

export async function applyCashback(
  input: ApplyCoupangCashbackInput,
): Promise<CoupangPromotionMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "POST",
    path: `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}/products/items/cashback`,
    body: {
      ruleId: Number(input.ruleId),
      valueType: input.valueType,
      value: input.value,
      maxAmount: input.maxAmount ?? 0,
      vendorItemIds: input.vendorItemIds.map((item) => Number(item)),
      startAt: input.startAt,
      endAt: input.endAt,
    },
  });

  return {
    appliedAt: nowIso(),
    message: asString(asObject(payload)?.message) ?? "도서 캐시백 적용이 완료되었습니다.",
  };
}

export async function removeCashback(
  input: RemoveCoupangCashbackInput,
): Promise<CoupangPromotionMutationResponse> {
  const store = await getStoreOrThrow(input.storeId);
  const payload = await requestCouponJson(store, {
    method: "DELETE",
    path: `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(store.vendorId)}/products/items/cashback`,
    query: new URLSearchParams({
      ruleId: input.ruleId,
      vendorItemId: input.vendorItemId,
    }),
  });

  return {
    appliedAt: nowIso(),
    message: asString(asObject(payload)?.message) ?? "도서 캐시백 삭제가 완료되었습니다.",
  };
}
