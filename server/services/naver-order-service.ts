import {
  NAVER_ORDER_MAX_ITEMS,
  type NaverDispatchDeliveryMethod,
  type NaverOrderActionItemResult,
  type NaverOrderActionResponse,
  type NaverOrderConfirmTarget,
  type NaverOrderDelayTarget,
  type NaverOrderDetailResponse,
  type NaverOrderDispatchTarget,
  type NaverOrderListResponse,
  type NaverOrderRow,
} from "@shared/naver-orders";
import { channelSettingsStore } from "./channel-settings-store";
import { recordExternalRequestEvent } from "./logs/service";
import { issueNaverAccessToken } from "./naver-auth";
import {
  toNaverClaimStatusLabel,
  toNaverClaimTypeLabel,
  toNaverProductOrderStatusLabel,
} from "./naver-order-labels";
import { createStaleResponseCache } from "./shared/stale-response-cache";

const NAVER_API_BASE_URL =
  process.env.NAVER_COMMERCE_API_BASE_URL || "https://api.commerce.naver.com/external";
const NAVER_CHANGED_STATUS_LIMIT = 300;
const NAVER_ORDER_DETAIL_LIMIT = 300;
const NAVER_ORDER_ACTION_CONCURRENCY = 4;
const NAVER_ORDER_LIST_CACHE_TTL_MS = 60_000;

const PRODUCT_ORDER_STATUS_LABELS: Record<string, string> = {
  PAYED: "결제 완료",
  DELIVERING: "배송 중",
  DELIVERED: "배송 완료",
  PURCHASE_DECIDED: "구매 확정",
  EXCHANGED: "교환",
  RETURNED: "반품",
  CANCELED: "취소",
  CANCELED_BY_NOPAYMENT: "미입금 취소",
  PLACE_ORDER: "주문 접수",
  PREPARE: "상품 준비 중",
};

type StoredNaverStore = NonNullable<Awaited<ReturnType<typeof channelSettingsStore.getStore>>>;

type NaverRequestContext = {
  store: StoredNaverStore;
  authorization: string;
};

type ChangedStatusRecord = {
  productOrderId: string;
  orderId: string | null;
  lastChangedType: string | null;
  lastChangedAt: string | null;
  productOrderStatus: string | null;
  productName: string | null;
};

type ChangedStatusPage = {
  items: ChangedStatusRecord[];
  moreFrom: string | null;
  moreSequence: string | null;
};

const naverOrderListCache = createStaleResponseCache<NaverOrderListResponse>(
  NAVER_ORDER_LIST_CACHE_TTL_MS,
);

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

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getNestedValue(input: Record<string, unknown> | null, path: string[]) {
  let current: unknown = input;

  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function firstString(input: Record<string, unknown> | null, paths: string[][]) {
  for (const path of paths) {
    const value = asString(getNestedValue(input, path));
    if (value) {
      return value;
    }
  }

  return null;
}

function firstNumber(input: Record<string, unknown> | null, paths: string[][]) {
  for (const path of paths) {
    const value = asNumber(getNestedValue(input, path));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function normalizeText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function joinTextParts(values: Array<string | null | undefined>) {
  const parts = values.map((value) => normalizeText(value)).filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function buildAddressText(address: Record<string, unknown> | null) {
  return joinTextParts([
    firstString(address, [["baseAddress"], ["address1"], ["address"]]),
    firstString(address, [["detailedAddress"], ["addressDetail"], ["address2"]]),
  ]);
}

function isHtmlPayload(text: string, contentType: string | null) {
  const normalized = text.trim().toLowerCase();

  return (
    (contentType || "").toLowerCase().includes("text/html") ||
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.startsWith("<body")
  );
}

function extractErrorMessage(payload: unknown, fallbackStatus: number) {
  if (!payload || typeof payload !== "object") {
    return `NAVER order API request failed (${fallbackStatus}).`;
  }

  const message =
    ("message" in payload && typeof payload.message === "string" && payload.message) ||
    ("error_description" in payload &&
      typeof payload.error_description === "string" &&
      payload.error_description) ||
    ("error" in payload && typeof payload.error === "string" && payload.error) ||
    ("code" in payload && typeof payload.code === "string" && payload.code) ||
    null;

  return message || `NAVER order API request failed (${fallbackStatus}).`;
}

function clampMaxItems(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return NAVER_ORDER_MAX_ITEMS;
  }

  return Math.max(1, Math.min(Math.floor(value), NAVER_ORDER_MAX_ITEMS));
}

function normalizeOffsetDateTime(value: string, mode: "start" | "end" | "exact") {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/[+-]\d{2}:\d{2}$/.test(trimmed) || trimmed.endsWith("Z")) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const time = mode === "end" ? "23:59:59" : "00:00:00";
    return `${trimmed}T${time}+09:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00+09:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}+09:00`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const offsetMinutes = parsed.getTimezoneOffset() * -1;
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absoluteMinutes = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
    const minutes = String(absoluteMinutes % 60).padStart(2, "0");
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const hour = String(parsed.getHours()).padStart(2, "0");
    const minute = String(parsed.getMinutes()).padStart(2, "0");
    const second = String(parsed.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${hours}:${minutes}`;
  }

  throw new Error("유효한 날짜 형식이 아닙니다.");
}

function toStatusLabel(status: string | null) {
  if (!status) {
    return "-";
  }

  return toNaverProductOrderStatusLabel(status);
}

function buildOrderRow(input: {
  store: StoredNaverStore;
  detail: Record<string, unknown> | null;
  changedStatus?: ChangedStatusRecord | null;
}): NaverOrderRow | null {
  const container = input.detail;
  const productOrder = asObject(container?.productOrder) ?? container;
  const order = asObject(container?.order);
  const shippingAddress =
    asObject(container?.shippingAddress) ??
    asObject(container?.deliveryAddress) ??
    asObject(productOrder?.shippingAddress) ??
    asObject(productOrder?.deliveryAddress);
  const delivery = asObject(container?.delivery) ?? asObject(productOrder?.delivery);

  const productOrderId =
    firstString(productOrder, [["productOrderId"]]) ??
    firstString(order, [["productOrderId"]]) ??
    input.changedStatus?.productOrderId ??
    null;

  if (!productOrderId) {
    return null;
  }

  const orderId =
    firstString(order, [["orderId"]]) ??
    firstString(productOrder, [["orderId"]]) ??
    input.changedStatus?.orderId ??
    productOrderId;
  const productOrderStatus =
    firstString(productOrder, [["productOrderStatus"]]) ??
    firstString(container, [["productOrderStatus"]]) ??
    input.changedStatus?.productOrderStatus ??
    input.changedStatus?.lastChangedType ??
    null;
  const deliveryMethod =
    firstString(productOrder, [["deliveryMethod"]]) ??
    firstString(delivery, [["deliveryMethod"]]) ??
    firstString(container, [["deliveryMethod"]]);
  const buyerPhone =
    firstString(order, [
      ["ordererTel"],
      ["ordererPhoneNumber"],
      ["ordererContactNumber"],
      ["buyerPhone"],
      ["buyerTel"],
    ]) ??
    firstString(container, [["buyerPhone"], ["buyerTel"], ["ordererTel"]]);
  const receiverAddress =
    buildAddressText(shippingAddress) ??
    joinTextParts([
      firstString(container, [["receiverAddress"], ["address"]]),
      firstString(container, [["receiverAddressDetail"], ["addressDetail"]]),
    ]);
  const receiverPostCode =
    firstString(shippingAddress, [["zipCode"], ["zipcode"], ["postCode"], ["postalCode"], ["zip"]]) ??
    firstString(container, [["receiverPostCode"], ["postCode"], ["zipCode"]]);
  const deliveryMemo =
    firstString(productOrder, [
      ["deliveryMemo"],
      ["deliveryMessage"],
      ["shippingMemo"],
      ["shippingMemoContent"],
    ]) ??
    firstString(shippingAddress, [["deliveryMemo"], ["deliveryMessage"], ["message"]]) ??
    firstString(container, [
      ["deliveryMemo"],
      ["deliveryMessage"],
      ["shippingMemo"],
      ["shippingMemoContent"],
      ["deliveryRequest"],
    ]);
  const claimType =
    firstString(productOrder, [["claimType"]]) ?? firstString(container, [["claimType"]]);
  const claimStatus =
    firstString(productOrder, [["claimStatus"]]) ?? firstString(container, [["claimStatus"]]);
  const claimReason =
    firstString(productOrder, [
      ["claimReason"],
      ["claimRequestReason"],
      ["claimReasonCode"],
      ["returnReason"],
    ]) ??
    firstString(container, [
      ["claimReason"],
      ["claimRequestReason"],
      ["claimReasonCode"],
      ["returnReason"],
    ]);
  const claimDetailReason =
    firstString(productOrder, [
      ["claimDetailReason"],
      ["claimDetailedReason"],
      ["claimRequestDetail"],
      ["claimReasonDetail"],
      ["returnDetailReason"],
    ]) ??
    firstString(container, [
      ["claimDetailReason"],
      ["claimDetailedReason"],
      ["claimRequestDetail"],
      ["claimReasonDetail"],
      ["returnDetailReason"],
    ]);

  return {
    id: `naver-order:${productOrderId}`,
    storeId: input.store.id,
    storeName: input.store.storeName,
    orderId,
    productOrderId,
    productName:
      firstString(productOrder, [["productName"], ["originalProductName"], ["name"]]) ??
      firstString(container, [["productName"], ["name"]]) ??
      input.changedStatus?.productName ??
      `상품 주문 ${productOrderId}`,
    optionName:
      firstString(productOrder, [["optionName"], ["selectedOptionName"], ["optionManageCode"]]) ??
      firstString(container, [["optionName"]]),
    sellerProductCode:
      firstString(productOrder, [["sellerProductCode"], ["sellerManagementCode"]]) ??
      firstString(container, [["sellerProductCode"]]),
    productId:
      firstString(productOrder, [["productId"], ["originProductNo"]]) ??
      firstString(container, [["productId"]]),
    quantity:
      firstNumber(productOrder, [["quantity"], ["productCount"], ["orderQuantity"]]) ??
      firstNumber(container, [["quantity"]]),
    remainQuantity:
      firstNumber(productOrder, [["remainQuantity"], ["claimQuantity"]]) ??
      firstNumber(container, [["remainQuantity"]]),
    paymentAmount:
      firstNumber(productOrder, [["paymentAmount"], ["totalPaymentAmount"], ["totalPayAmount"]]) ??
      firstNumber(container, [["paymentAmount"], ["totalPaymentAmount"]]),
    productOrderStatus,
    productOrderStatusLabel: toStatusLabel(productOrderStatus),
    lastChangedType: input.changedStatus?.lastChangedType ?? null,
    lastChangedAt:
      input.changedStatus?.lastChangedAt ??
      firstString(productOrder, [["lastChangedDate"], ["lastChangedAt"], ["modifiedDate"]]),
    orderedAt:
      firstString(order, [["orderDate"], ["orderedAt"], ["createdDate"]]) ??
      firstString(productOrder, [["orderDate"]]),
    paidAt:
      firstString(order, [["paymentDate"], ["paidAt"]]) ??
      firstString(productOrder, [["paymentDate"], ["paidAt"]]),
    buyerName:
      firstString(order, [["ordererName"], ["buyerName"]]) ??
      firstString(container, [["ordererName"], ["buyerName"]]),
    buyerPhone,
    receiverName:
      firstString(shippingAddress, [["name"], ["receiverName"]]) ??
      firstString(container, [["receiverName"]]),
    receiverPhone:
      firstString(shippingAddress, [["tel1"], ["tel2"], ["phoneNumber"], ["receiverPhone"]]) ??
      firstString(container, [["receiverPhone"]]),
    receiverAddress,
    receiverPostCode,
    deliveryMethod,
    courierCode:
      firstString(productOrder, [["deliveryCompanyCode"], ["deliveryCompany"]]) ??
      firstString(delivery, [["deliveryCompanyCode"], ["deliveryCompany"]]) ??
      firstString(container, [["deliveryCompanyCode"]]),
    courierName:
      firstString(productOrder, [["deliveryCompanyName"]]) ??
      firstString(delivery, [["deliveryCompanyName"]]) ??
      firstString(container, [["deliveryCompanyName"]]),
    trackingNumber:
      firstString(productOrder, [["trackingNumber"], ["deliveryTrackingNumber"]]) ??
      firstString(delivery, [["trackingNumber"]]) ??
      firstString(container, [["trackingNumber"]]),
    deliveryMemo,
    dispatchDueDate:
      firstString(productOrder, [["dispatchDueDate"], ["shippingDueDate"]]) ??
      firstString(container, [["dispatchDueDate"]]),
    claimType,
    claimTypeLabel: toNaverClaimTypeLabel(claimType),
    claimStatus,
    claimStatusLabel: toNaverClaimStatusLabel(claimStatus),
    claimReason,
    claimDetailReason,
    deliveryAttributeType:
      firstString(productOrder, [["deliveryAttributeType"]]) ??
      firstString(container, [["deliveryAttributeType"]]),
    isExecutable: !["CANCELED", "CANCELLED", "PURCHASE_DECIDED"].includes(productOrderStatus ?? ""),
  };
}

function buildFallbackOrderRow(input: {
  store: StoredNaverStore;
  changedStatus: ChangedStatusRecord;
}) {
  return {
    id: `naver-order:${input.changedStatus.productOrderId}`,
    storeId: input.store.id,
    storeName: input.store.storeName,
    orderId: input.changedStatus.orderId ?? input.changedStatus.productOrderId,
    productOrderId: input.changedStatus.productOrderId,
    productName: input.changedStatus.productName ?? `상품 주문 ${input.changedStatus.productOrderId}`,
    optionName: null,
    sellerProductCode: null,
    productId: null,
    quantity: null,
    remainQuantity: null,
    paymentAmount: null,
    productOrderStatus: input.changedStatus.productOrderStatus ?? input.changedStatus.lastChangedType,
    productOrderStatusLabel: toStatusLabel(
      input.changedStatus.productOrderStatus ?? input.changedStatus.lastChangedType,
    ),
    lastChangedType: input.changedStatus.lastChangedType,
    lastChangedAt: input.changedStatus.lastChangedAt,
    orderedAt: null,
    paidAt: null,
    buyerName: null,
    buyerPhone: null,
    receiverName: null,
    receiverPhone: null,
    receiverAddress: null,
    receiverPostCode: null,
    deliveryMethod: null,
    courierCode: null,
    courierName: null,
    trackingNumber: null,
    deliveryMemo: null,
    dispatchDueDate: null,
    claimType: null,
    claimTypeLabel: null,
    claimStatus: null,
    claimStatusLabel: null,
    claimReason: null,
    claimDetailReason: null,
    deliveryAttributeType: null,
    isExecutable: true,
  } satisfies NaverOrderRow;
}

function getActionResultMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  iteratee: (item: TItem, index: number) => Promise<TResult>,
) {
  if (!items.length) {
    return [];
  }

  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

async function getNaverStoreOrThrow(storeId: string) {
  const store = await channelSettingsStore.getStore(storeId);

  if (!store) {
    throw new Error("NAVER 스토어 설정을 찾을 수 없습니다.");
  }

  if (store.channel !== "naver") {
    throw new Error("선택한 스토어가 NAVER 채널이 아닙니다.");
  }

  return store as StoredNaverStore;
}

async function createNaverRequestContext(storeId: string): Promise<NaverRequestContext> {
  const store = await getNaverStoreOrThrow(storeId);
  const token = await issueNaverAccessToken({
    clientId: store.credentials.clientId,
    clientSecret: store.credentials.clientSecret,
  });

  return {
    store,
    authorization: `${token.tokenType} ${token.accessToken}`,
  };
}

async function requestNaverJsonWithContext<T>(input: {
  context: NaverRequestContext;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}) {
  const startedAt = Date.now();
  let response: Response | null = null;

  try {
    response = await fetch(`${NAVER_API_BASE_URL}${input.path}`, {
      method: input.method,
      headers: {
        Accept: "application/json",
        Authorization: input.context.authorization,
        ...(input.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      if (isHtmlPayload(text, response.headers.get("content-type"))) {
        throw new Error(
          `Expected JSON from NAVER Commerce API ${input.path}, but received HTML. Check NAVER_COMMERCE_API_BASE_URL and NAVER credentials.`,
        );
      }

      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, response.status));
    }

    void recordExternalRequestEvent({
      provider: "naver",
      method: input.method,
      path: input.path,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      storeId: input.context.store.id,
    });

    return {
      store: input.context.store,
      payload: (payload ?? null) as T,
    };
  } catch (error) {
    void recordExternalRequestEvent({
      provider: "naver",
      method: input.method,
      path: input.path,
      statusCode: response?.status ?? null,
      durationMs: Date.now() - startedAt,
      storeId: input.context.store.id,
      error,
    });
    throw error;
  }
}

function normalizeChangedStatusPage(payload: unknown): ChangedStatusPage {
  const root = asObject(payload);
  const data = asObject(root?.data) ?? root;
  const rawItems = Array.isArray(data?.lastChangeStatuses)
    ? data.lastChangeStatuses
    : Array.isArray(root?.lastChangeStatuses)
      ? root.lastChangeStatuses
      : [];
  const items = rawItems
    .map((rawItem) => {
      const item = asObject(rawItem);
      const productOrderId = firstString(item, [["productOrderId"]]);

      if (!productOrderId) {
        return null;
      }

      return {
        productOrderId,
        orderId: firstString(item, [["orderId"]]),
        lastChangedType: firstString(item, [["lastChangedType"]]),
        lastChangedAt: firstString(item, [["lastChangedDate"], ["lastChangedAt"]]),
        productOrderStatus: firstString(item, [["productOrderStatus"]]),
        productName: firstString(item, [["productName"]]),
      } satisfies ChangedStatusRecord;
    })
    .filter((item): item is ChangedStatusRecord => Boolean(item));

  const more = asObject(data?.more) ?? asObject(root?.more);

  return {
    items,
    moreFrom: firstString(more, [["moreFrom"]]),
    moreSequence: firstString(more, [["moreSequence"]]),
  };
}

async function fetchChangedStatusPage(input: {
  context: NaverRequestContext;
  lastChangedFrom: string;
  lastChangedTo?: string;
  moreSequence?: string | null;
  limitCount: number;
}) {
  const params = new URLSearchParams({
    lastChangedFrom: input.lastChangedFrom,
    limitCount: String(Math.max(1, Math.min(input.limitCount, NAVER_CHANGED_STATUS_LIMIT))),
  });

  if (input.lastChangedTo) {
    params.set("lastChangedTo", input.lastChangedTo);
  }

  if (input.moreSequence) {
    params.set("moreSequence", input.moreSequence);
  }

  const { payload } = await requestNaverJsonWithContext<unknown>({
    context: input.context,
    method: "GET",
    path: `/v1/pay-order/seller/product-orders/last-changed-statuses?${params.toString()}`,
  });

  return normalizeChangedStatusPage(payload);
}

async function fetchOrderDetailsByIds(input: {
  context: NaverRequestContext;
  productOrderIds: string[];
}) {
  if (!input.productOrderIds.length) {
    return [];
  }

  const { payload } = await requestNaverJsonWithContext<unknown>({
    context: input.context,
    method: "POST",
    path: "/v1/pay-order/seller/product-orders/query",
    body: {
      productOrderIds: input.productOrderIds,
      quantityClaimCompatibility: true,
    },
  });

  const root = asObject(payload);
  const data = root?.data;

  if (Array.isArray(data)) {
    return data.map((item) => asObject(item)).filter((item): item is Record<string, unknown> => Boolean(item));
  }

  if (Array.isArray(payload)) {
    return payload
      .map((item) => asObject(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }

  if (Array.isArray(root?.productOrders)) {
    return root.productOrders
      .map((item) => asObject(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }

  return [];
}

function sortOrderRows(items: NaverOrderRow[]) {
  return items.slice().sort((left, right) => {
    const rightTime = right.lastChangedAt ? new Date(right.lastChangedAt).getTime() : 0;
    const leftTime = left.lastChangedAt ? new Date(left.lastChangedAt).getTime() : 0;

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return right.productOrderId.localeCompare(left.productOrderId);
  });
}

function filterOrderRows(
  items: NaverOrderRow[],
  input: {
    status?: string;
    query?: string;
  },
) {
  const normalizedStatus = input.status?.trim().toUpperCase() || "";
  const normalizedQuery = input.query?.trim().toLowerCase() || "";

  return items.filter((item) => {
    if (normalizedStatus && (item.productOrderStatus ?? "").toUpperCase() !== normalizedStatus) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      item.orderId,
      item.productOrderId,
      item.productName,
      item.optionName,
      item.sellerProductCode,
      item.buyerName,
      item.receiverName,
      item.trackingNumber,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

function summarizeActionItems(items: NaverOrderActionItemResult[]) {
  return {
    total: items.length,
    succeededCount: items.filter((item) => item.status === "succeeded").length,
    failedCount: items.filter((item) => item.status === "failed").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
  };
}

function buildActionResponse(items: NaverOrderActionItemResult[]): NaverOrderActionResponse {
  return {
    items,
    summary: summarizeActionItems(items),
    completedAt: new Date().toISOString(),
  };
}

function createActionItemResult(input: {
  target: NaverOrderConfirmTarget;
  action: NaverOrderActionItemResult["action"];
  status: NaverOrderActionItemResult["status"];
  message: string;
  appliedAt?: string | null;
}) {
  return {
    productOrderId: input.target.productOrderId,
    orderId: input.target.orderId ?? null,
    productName: input.target.productName ?? null,
    action: input.action,
    status: input.status,
    message: input.message,
    appliedAt: input.appliedAt ?? null,
  } satisfies NaverOrderActionItemResult;
}

function validateConfirmTarget(target: NaverOrderConfirmTarget) {
  if (!target.productOrderId || !target.productOrderId.trim()) {
    return "상품 주문 번호가 필요합니다.";
  }

  return null;
}

function normalizeDeliveryMethod(value: string | null | undefined): NaverDispatchDeliveryMethod | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (normalized === "DIRECT_DELIVERY" || normalized === "NOTHING" || normalized === "DELIVERY") {
    return normalized;
  }

  return normalized as NaverDispatchDeliveryMethod;
}

function validateDispatchTarget(target: NaverOrderDispatchTarget) {
  if (!target.productOrderId || !target.productOrderId.trim()) {
    return "상품 주문 번호가 필요합니다.";
  }

  const deliveryMethod = normalizeDeliveryMethod(target.deliveryMethod);
  if (!deliveryMethod) {
    return "배송 방식을 선택해 주세요.";
  }

  if (!target.dispatchDate || !target.dispatchDate.trim()) {
    return "발송 일시가 필요합니다.";
  }

  if (deliveryMethod !== "NOTHING" && deliveryMethod !== "DIRECT_DELIVERY") {
    if (!target.courierCode || !target.courierCode.trim()) {
      return "택배사 코드를 입력해 주세요.";
    }

    if (!target.trackingNumber || !target.trackingNumber.trim()) {
      return "송장 번호를 입력해 주세요.";
    }
  }

  return null;
}

function validateDelayTarget(target: NaverOrderDelayTarget) {
  if (!target.productOrderId || !target.productOrderId.trim()) {
    return "상품 주문 번호가 필요합니다.";
  }

  if (!target.dispatchDueDate || !target.dispatchDueDate.trim()) {
    return "지연 예정 발송일이 필요합니다.";
  }

  if (!target.delayedDispatchReason || !target.delayedDispatchReason.trim()) {
    return "발송 지연 사유를 선택해 주세요.";
  }

  if (!target.dispatchDelayedDetailedReason || !target.dispatchDelayedDetailedReason.trim()) {
    return "발송 지연 상세 사유를 입력해 주세요.";
  }

  return null;
}

async function requestConfirmProductOrder(context: NaverRequestContext, productOrderId: string) {
  const attempts: unknown[] = [
    { productOrderIds: [productOrderId] },
    { productOrderIds: [productOrderId], quantityClaimCompatibility: true },
  ];

  let lastError: unknown = null;

  for (const body of attempts) {
    try {
      await requestNaverJsonWithContext({
        context,
        method: "POST",
        path: "/v1/pay-order/seller/product-orders/confirm",
        body,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("발주 확인 처리에 실패했습니다.");
}

async function requestDispatchProductOrder(
  context: NaverRequestContext,
  target: NaverOrderDispatchTarget,
) {
  const deliveryMethod = normalizeDeliveryMethod(target.deliveryMethod) ?? "DELIVERY";
  const dispatchProductOrder: Record<string, unknown> = {
    productOrderId: target.productOrderId,
    deliveryMethod,
    dispatchDate: normalizeOffsetDateTime(target.dispatchDate ?? "", "exact"),
  };

  if (deliveryMethod !== "NOTHING" && deliveryMethod !== "DIRECT_DELIVERY") {
    dispatchProductOrder.deliveryCompanyCode = target.courierCode?.trim() ?? "";
    dispatchProductOrder.trackingNumber = target.trackingNumber?.trim() ?? "";
  }

  await requestNaverJsonWithContext({
    context,
    method: "POST",
    path: "/v1/pay-order/seller/product-orders/dispatch",
    body: {
      dispatchProductOrders: [dispatchProductOrder],
    },
  });
}

async function requestDelayDispatchProductOrder(
  context: NaverRequestContext,
  target: NaverOrderDelayTarget,
) {
  await requestNaverJsonWithContext({
    context,
    method: "POST",
    path: `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/delay`,
    body: {
      dispatchDueDate: normalizeOffsetDateTime(target.dispatchDueDate, "end"),
      delayedDispatchReason: target.delayedDispatchReason.trim(),
      dispatchDelayedDetailedReason: target.dispatchDelayedDetailedReason.trim(),
    },
  });
}

export async function listOrders(input: {
  storeId: string;
  lastChangedFrom: string;
  lastChangedTo?: string;
  status?: string;
  query?: string;
  maxItems?: number;
  refresh?: boolean;
}) {
  const cacheKey = JSON.stringify({
    storeId: input.storeId,
    lastChangedFrom: input.lastChangedFrom,
    lastChangedTo: input.lastChangedTo ?? null,
    status: input.status ?? null,
    query: input.query ?? null,
    maxItems: clampMaxItems(input.maxItems),
  });

  return naverOrderListCache.getOrLoad(cacheKey, {
    refresh: input.refresh,
    load: async () => {
      const context = await createNaverRequestContext(input.storeId);
      const maxItems = clampMaxItems(input.maxItems);
      const changedItems: ChangedStatusRecord[] = [];
      let moreFrom = normalizeOffsetDateTime(input.lastChangedFrom, "start");
      let moreSequence: string | null = null;
      const lastChangedTo = input.lastChangedTo
        ? normalizeOffsetDateTime(input.lastChangedTo, "end")
        : undefined;

      while (changedItems.length < maxItems) {
        const page = await fetchChangedStatusPage({
          context,
          lastChangedFrom: moreFrom,
          lastChangedTo,
          moreSequence,
          limitCount: Math.min(NAVER_CHANGED_STATUS_LIMIT, maxItems - changedItems.length),
        });

        if (!page.items.length) {
          break;
        }

        changedItems.push(...page.items);

        if (!page.moreFrom || !page.moreSequence) {
          break;
        }

        moreFrom = page.moreFrom;
        moreSequence = page.moreSequence;
      }

      const uniqueProductOrderIds = Array.from(
        new Set(changedItems.map((item) => item.productOrderId).filter(Boolean)),
      );

      const detailRows: Record<string, unknown>[] = [];

      for (let index = 0; index < uniqueProductOrderIds.length; index += NAVER_ORDER_DETAIL_LIMIT) {
        const chunk = uniqueProductOrderIds.slice(index, index + NAVER_ORDER_DETAIL_LIMIT);
        const rows = await fetchOrderDetailsByIds({
          context,
          productOrderIds: chunk,
        });
        detailRows.push(...rows);
      }

      const changedStatusById = new Map(
        changedItems.map((item) => [item.productOrderId, item] as const),
      );
      const orderRows = detailRows
        .map((detail) =>
          buildOrderRow({
            store: context.store,
            detail,
            changedStatus:
              changedStatusById.get(
                firstString(
                  asObject(asObject(detail)?.productOrder) ?? asObject(detail),
                  [["productOrderId"]],
                ) ?? "",
              ) ?? null,
          }),
        )
        .filter((item): item is NaverOrderRow => Boolean(item));

      const existingIds = new Set(orderRows.map((item) => item.productOrderId));
      const fallbackRows = changedItems
        .filter((item) => !existingIds.has(item.productOrderId))
        .map((item) =>
          buildFallbackOrderRow({
            store: context.store,
            changedStatus: item,
          }),
        );

      const merged = sortOrderRows(filterOrderRows([...orderRows, ...fallbackRows], input));

      return {
        store: {
          id: context.store.id,
          name: context.store.storeName,
        },
        items: merged,
        fetchedAt: new Date().toISOString(),
        source: "live",
        totalCount: merged.length,
        limitedByMaxItems: changedItems.length >= maxItems,
      } satisfies NaverOrderListResponse;
    },
  });
}

export async function getOrderDetail(input: { storeId: string; productOrderId: string }) {
  const context = await createNaverRequestContext(input.storeId);
  const details = await fetchOrderDetailsByIds({
    context,
    productOrderIds: [input.productOrderId],
  });
  const item =
    buildOrderRow({
      store: context.store,
      detail: details[0] ?? null,
      changedStatus: null,
    }) ?? null;

  return {
    item,
  } satisfies NaverOrderDetailResponse;
}

export async function confirmOrders(input: {
  storeId: string;
  items: NaverOrderConfirmTarget[];
}) {
  const context = await createNaverRequestContext(input.storeId);
  const items = await mapWithConcurrency(
    input.items,
    NAVER_ORDER_ACTION_CONCURRENCY,
    async (target) => {
      const validationMessage = validateConfirmTarget(target);
      if (validationMessage) {
        return createActionItemResult({
          target,
          action: "confirm",
          status: "skipped",
          message: validationMessage,
        });
      }

      try {
        await requestConfirmProductOrder(context, target.productOrderId);
        return createActionItemResult({
          target,
          action: "confirm",
          status: "succeeded",
          message: "발주 확인 처리가 완료되었습니다.",
          appliedAt: new Date().toISOString(),
        });
      } catch (error) {
        return createActionItemResult({
          target,
          action: "confirm",
          status: "failed",
          message: getActionResultMessage(error, "발주 확인 처리에 실패했습니다."),
        });
      }
    },
  );

  return buildActionResponse(items);
}

export async function dispatchOrders(input: {
  storeId: string;
  items: NaverOrderDispatchTarget[];
}) {
  const context = await createNaverRequestContext(input.storeId);
  const items = await mapWithConcurrency(
    input.items,
    NAVER_ORDER_ACTION_CONCURRENCY,
    async (target) => {
      const validationMessage = validateDispatchTarget(target);
      if (validationMessage) {
        return createActionItemResult({
          target,
          action: "dispatch",
          status: "skipped",
          message: validationMessage,
        });
      }

      try {
        await requestDispatchProductOrder(context, target);
        return createActionItemResult({
          target,
          action: "dispatch",
          status: "succeeded",
          message: "발송 처리가 완료되었습니다.",
          appliedAt: new Date().toISOString(),
        });
      } catch (error) {
        return createActionItemResult({
          target,
          action: "dispatch",
          status: "failed",
          message: getActionResultMessage(error, "발송 처리에 실패했습니다."),
        });
      }
    },
  );

  return buildActionResponse(items);
}

export async function delayDispatch(input: {
  storeId: string;
  items: NaverOrderDelayTarget[];
}) {
  const context = await createNaverRequestContext(input.storeId);
  const items = await mapWithConcurrency(
    input.items,
    NAVER_ORDER_ACTION_CONCURRENCY,
    async (target) => {
      const validationMessage = validateDelayTarget(target);
      if (validationMessage) {
        return createActionItemResult({
          target,
          action: "delayDispatch",
          status: "skipped",
          message: validationMessage,
        });
      }

      try {
        await requestDelayDispatchProductOrder(context, target);
        return createActionItemResult({
          target,
          action: "delayDispatch",
          status: "succeeded",
          message: "발송 지연 처리가 완료되었습니다.",
          appliedAt: new Date().toISOString(),
        });
      } catch (error) {
        return createActionItemResult({
          target,
          action: "delayDispatch",
          status: "failed",
          message: getActionResultMessage(error, "발송 지연 처리에 실패했습니다."),
        });
      }
    },
  );

  return buildActionResponse(items);
}
