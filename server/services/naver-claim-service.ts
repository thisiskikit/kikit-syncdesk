import {
  NAVER_CLAIM_MAX_ITEMS,
  type NaverApproveCancelTarget,
  type NaverApproveReturnTarget,
  type NaverClaimActionItemResult,
  type NaverClaimActionKey,
  type NaverClaimActionResponse,
  type NaverClaimListResponse,
  type NaverClaimRow,
  type NaverClaimType,
  type NaverHoldExchangeTarget,
  type NaverHoldReturnTarget,
  type NaverRedeliverExchangeTarget,
  type NaverRejectExchangeTarget,
  type NaverRejectReturnTarget,
  type NaverReleaseExchangeHoldTarget,
  type NaverReleaseReturnHoldTarget,
} from "@shared/naver-claims";
import { channelSettingsStore } from "./channel-settings-store";
import { recordExternalRequestEvent } from "./logs/service";
import { issueNaverAccessToken } from "./naver-auth";
import {
  NAVER_CLAIM_STATUS_LABELS as SHARED_NAVER_CLAIM_STATUS_LABELS,
  NAVER_PRODUCT_ORDER_STATUS_LABELS as SHARED_NAVER_PRODUCT_ORDER_STATUS_LABELS,
} from "./naver-order-labels";
import { createStaleResponseCache } from "./shared/stale-response-cache";

const NAVER_API_BASE_URL =
  process.env.NAVER_COMMERCE_API_BASE_URL || "https://api.commerce.naver.com/external";
const NAVER_CHANGED_STATUS_LIMIT = 300;
const NAVER_CLAIM_DETAIL_LIMIT = 300;
const NAVER_CLAIM_ACTION_CONCURRENCY = 4;
const NAVER_CLAIM_LIST_CACHE_TTL_MS = 60_000;

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

const CLAIM_STATUS_LABELS: Record<string, string> = {
  CANCEL_REQUEST: "취소 요청",
  CANCELING: "취소 처리 중",
  CANCELED: "취소 완료",
  RETURN_REQUEST: "반품 요청",
  RETURN_REJECT: "반품 거부",
  RETURN_HOLDBACK: "반품 보류",
  COLLECTING: "수거 중",
  RETURNED: "반품 완료",
  EXCHANGE_REQUEST: "교환 요청",
  EXCHANGE_HOLDBACK: "교환 보류",
  EXCHANGE_REJECT: "교환 거부",
  EXCHANGE_REDELIVERING: "교환 재배송 중",
  EXCHANGED: "교환 완료",
};

type StoredNaverStore = NonNullable<Awaited<ReturnType<typeof channelSettingsStore.getStore>>>;

type NaverRequestContext = {
  store: StoredNaverStore;
  authorization: string;
};

type ChangedStatusRecord = {
  productOrderId: string;
  orderId: string | null;
  lastChangedAt: string | null;
};

type ClaimBaseTarget = {
  productOrderId: string;
  claimId?: string | null;
  orderId?: string | null;
  productName?: string | null;
};

const naverClaimListCache = createStaleResponseCache<NaverClaimListResponse>(
  NAVER_CLAIM_LIST_CACHE_TTL_MS,
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
    return `NAVER claim API request failed (${fallbackStatus}).`;
  }

  const message =
    ("message" in payload && typeof payload.message === "string" && payload.message) ||
    ("error_description" in payload &&
      typeof payload.error_description === "string" &&
      payload.error_description) ||
    ("error" in payload && typeof payload.error === "string" && payload.error) ||
    ("code" in payload && typeof payload.code === "string" && payload.code) ||
    null;

  return message || `NAVER claim API request failed (${fallbackStatus}).`;
}

function clampMaxItems(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return NAVER_CLAIM_MAX_ITEMS;
  }

  return Math.max(1, Math.min(Math.floor(value), NAVER_CLAIM_MAX_ITEMS));
}

function normalizeOffsetDateTime(value: string, mode: "start" | "end") {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/[+-]\d{2}:\d{2}$/.test(trimmed) || trimmed.endsWith("Z")) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T${mode === "end" ? "23:59:59" : "00:00:00"}+09:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00+09:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}+09:00`;
  }

  throw new Error("유효한 날짜 형식이 아닙니다.");
}

function normalizeClaimType(value: string | null): NaverClaimType | null {
  const normalized = value?.trim().toUpperCase() ?? "";

  if (normalized === "CANCEL") return "cancel";
  if (normalized === "RETURN") return "return";
  if (normalized === "EXCHANGE") return "exchange";
  return null;
}

function toStatusLabel(status: string | null, type: "productOrder" | "claim") {
  if (!status) {
    return "-";
  }

  const map =
    type === "claim"
      ? SHARED_NAVER_CLAIM_STATUS_LABELS
      : SHARED_NAVER_PRODUCT_ORDER_STATUS_LABELS;
  return map[status] ?? status;
}

function normalizeClaimStatus(status: string | null) {
  return status?.trim().toUpperCase() ?? "";
}

function hasCompletedClaimStatus(status: string) {
  return [
    "CANCELED",
    "RETURNED",
    "EXCHANGED",
    "PURCHASE_DECIDED",
    "WITHDRAWN",
    "CANCEL_DONE",
  ].includes(status);
}

function deriveAvailableActions(input: {
  claimType: NaverClaimType;
  claimStatus: string | null;
  claimSource: "current" | "completed";
  reDeliveryStatus: string | null;
}): NaverClaimRow["availableActions"] {
  if (input.claimSource !== "current") {
    return [];
  }

  const status = normalizeClaimStatus(input.claimStatus);
  if (!status || hasCompletedClaimStatus(status)) {
    return [];
  }

  if (input.claimType === "cancel") {
    return status.includes("REQUEST") ? ["approveCancel"] : [];
  }

  if (input.claimType === "return") {
    if (status.includes("HOLDBACK")) {
      return ["releaseReturnHold", "rejectReturn"];
    }

    if (status.includes("REQUEST")) {
      return ["approveReturn", "holdReturn", "rejectReturn"];
    }

    return [];
  }

  if (status.includes("HOLDBACK")) {
    return ["releaseExchangeHold", "rejectExchange"];
  }

  const actions: NaverClaimRow["availableActions"] = [];
  if (status.includes("REQUEST") || status.includes("COLLECT")) {
    actions.push("holdExchange", "rejectExchange");
  }

  const reDeliveryStatus = normalizeClaimStatus(input.reDeliveryStatus);
  if (
    reDeliveryStatus &&
    !["EXCHANGE_REDELIVERING", "EXCHANGED", "DELIVERED"].includes(reDeliveryStatus)
  ) {
    actions.push("redeliverExchange");
  }

  return Array.from(new Set(actions));
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

  const root = asObject(payload);
  const data = asObject(root?.data) ?? root;
  const rawItems = Array.isArray(data?.lastChangeStatuses)
    ? data.lastChangeStatuses
    : Array.isArray(root?.lastChangeStatuses)
      ? root.lastChangeStatuses
      : [];

  return {
    items: rawItems
      .map((rawItem) => {
        const item = asObject(rawItem);
        const productOrderId = firstString(item, [["productOrderId"]]);
        if (!productOrderId) {
          return null;
        }

        return {
          productOrderId,
          orderId: firstString(item, [["orderId"]]),
          lastChangedAt: firstString(item, [["lastChangedDate"], ["lastChangedAt"]]),
        } satisfies ChangedStatusRecord;
      })
      .filter((item): item is ChangedStatusRecord => Boolean(item)),
    moreFrom: firstString(asObject(data?.more) ?? asObject(root?.more), [["moreFrom"]]),
    moreSequence: firstString(asObject(data?.more) ?? asObject(root?.more), [["moreSequence"]]),
  };
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
    return data
      .map((item) => asObject(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));
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

function buildClaimRow(input: {
  store: StoredNaverStore;
  detail: Record<string, unknown>;
  changedStatus: ChangedStatusRecord | null;
  claimType: NaverClaimType;
  claimSource: "current" | "completed";
  claim: Record<string, unknown>;
}) {
  const container = input.detail;
  const productOrder = asObject(container.productOrder) ?? container;
  const order = asObject(container.order);
  const claim = input.claim;

  const orderId =
    firstString(order, [["orderId"]]) ??
    firstString(productOrder, [["orderId"]]) ??
    input.changedStatus?.orderId ??
    "";
  const productOrderId =
    firstString(productOrder, [["productOrderId"]]) ?? input.changedStatus?.productOrderId ?? "";

  if (!productOrderId) {
    return null;
  }

  const claimStatus =
    firstString(claim, [["claimStatus"]]) ?? firstString(productOrder, [["claimStatus"]]);
  const reDeliveryStatus =
    input.claimType === "exchange"
      ? firstString(claim, [["reDeliveryStatus"]]) ?? null
      : null;
  const availableActions = deriveAvailableActions({
    claimType: input.claimType,
    claimStatus,
    claimSource: input.claimSource,
    reDeliveryStatus,
  });

  const collectAddress = asObject(claim.collectAddress);

  return {
    id: [
      input.claimType,
      input.claimSource,
      firstString(claim, [["claimId"]]) ?? "none",
      productOrderId,
    ].join(":"),
    storeId: input.store.id,
    storeName: input.store.storeName,
    claimType: input.claimType,
    claimSource: input.claimSource,
    claimId: firstString(claim, [["claimId"]]),
    orderId,
    productOrderId,
    productName:
      firstString(productOrder, [["productName"], ["originalProductName"], ["name"]]) ??
      `상품 주문 ${productOrderId}`,
    optionName:
      firstString(productOrder, [["optionName"], ["selectedOptionName"], ["optionManageCode"]]) ??
      null,
    quantity:
      firstNumber(productOrder, [["quantity"], ["productCount"], ["orderQuantity"]]) ?? null,
    paymentAmount:
      firstNumber(productOrder, [["paymentAmount"], ["totalPaymentAmount"], ["totalPayAmount"]]) ??
      null,
    buyerName:
      firstString(order, [["ordererName"], ["buyerName"]]) ??
      firstString(container, [["ordererName"], ["buyerName"]]),
    receiverName:
      firstString(asObject(container.shippingAddress), [["name"], ["receiverName"]]) ??
      firstString(container, [["receiverName"]]),
    productOrderStatus: firstString(productOrder, [["productOrderStatus"], ["status"]]),
    productOrderStatusLabel: toStatusLabel(
      firstString(productOrder, [["productOrderStatus"], ["status"]]),
      "productOrder",
    ),
    claimStatus,
    claimStatusLabel: toStatusLabel(claimStatus, "claim"),
    claimReason:
      firstString(claim, [
        ["cancelReason"],
        ["returnReason"],
        ["exchangeReason"],
        ["claimRequestReason"],
      ]) ?? null,
    claimDetailReason:
      firstString(claim, [
        ["cancelDetailedReason"],
        ["returnDetailedReason"],
        ["exchangeDetailedReason"],
        ["claimRequestDetailContent"],
      ]) ?? null,
    claimRequestDate:
      firstString(claim, [["claimRequestDate"]]) ??
      firstString(claim, [["claimRequestAdmissionDate"]]) ??
      null,
    lastChangedAt:
      input.changedStatus?.lastChangedAt ??
      firstString(productOrder, [["lastChangedDate"], ["modifiedDate"]]) ??
      null,
    collectStatus: firstString(collectAddress, [["collectStatus"]]),
    collectDeliveryMethod: firstString(collectAddress, [["collectDeliveryMethod"]]),
    collectDeliveryCompany: firstString(collectAddress, [["collectDeliveryCompany"]]),
    collectTrackingNumber: firstString(collectAddress, [["collectTrackingNumber"]]),
    reDeliveryStatus,
    claimDeliveryFeeDemandAmount:
      firstNumber(claim, [["claimDeliveryFeeDemandAmount"]]) ??
      firstNumber(claim, [["claimDeliveryFeeSupportAmount"]]) ??
      null,
    isExecutable: input.claimSource === "current" && availableActions.length > 0,
    availableActions,
  } satisfies NaverClaimRow;
}

function buildClaimRows(input: {
  store: StoredNaverStore;
  detail: Record<string, unknown>;
  changedStatus: ChangedStatusRecord | null;
}) {
  const rows: NaverClaimRow[] = [];
  const detail = input.detail;
  const productOrder = asObject(detail.productOrder) ?? detail;
  const currentClaim = asObject(productOrder.currentClaim) ?? asObject(detail.currentClaim);
  const completedClaims = asArray(productOrder.completedClaims ?? detail.completedClaims);
  const seen = new Set<string>();

  const pushCurrent = (claimType: NaverClaimType) => {
    const current = asObject(currentClaim?.[claimType]);
    if (!current) {
      return;
    }

    const row = buildClaimRow({
      store: input.store,
      detail,
      changedStatus: input.changedStatus,
      claimType,
      claimSource: "current",
      claim: current,
    });

    if (row) {
      seen.add(`${row.claimType}:${row.claimId ?? "none"}`);
      rows.push(row);
    }
  };

  pushCurrent("cancel");
  pushCurrent("return");
  pushCurrent("exchange");

  for (const rawClaim of completedClaims) {
    const claim = asObject(rawClaim);
    const claimType = normalizeClaimType(firstString(claim, [["claimType"]]));
    if (!claim || !claimType) {
      continue;
    }

    const claimKey = `${claimType}:${firstString(claim, [["claimId"]]) ?? "none"}`;
    if (seen.has(claimKey)) {
      continue;
    }

    const row = buildClaimRow({
      store: input.store,
      detail,
      changedStatus: input.changedStatus,
      claimType,
      claimSource: "completed",
      claim,
    });

    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

function filterClaimRows(
  items: NaverClaimRow[],
  input: {
    claimType?: NaverClaimType | "all";
    status?: string;
    query?: string;
  },
) {
  const claimType = input.claimType && input.claimType !== "all" ? input.claimType : null;
  const normalizedStatus = input.status?.trim().toUpperCase() || "";
  const normalizedQuery = input.query?.trim().toLowerCase() || "";

  return items.filter((item) => {
    if (claimType && item.claimType !== claimType) {
      return false;
    }

    if (normalizedStatus && (item.claimStatus ?? "").toUpperCase() !== normalizedStatus) {
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
      item.claimReason,
      item.claimDetailReason,
      item.buyerName,
      item.receiverName,
      item.claimId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

function sortClaimRows(items: NaverClaimRow[]) {
  return items.slice().sort((left, right) => {
    const rightTime = new Date(right.claimRequestDate ?? right.lastChangedAt ?? 0).getTime();
    const leftTime = new Date(left.claimRequestDate ?? left.lastChangedAt ?? 0).getTime();
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return right.productOrderId.localeCompare(left.productOrderId);
  });
}

function summarizeActionItems(items: NaverClaimActionItemResult[]) {
  return {
    total: items.length,
    succeededCount: items.filter((item) => item.status === "succeeded").length,
    failedCount: items.filter((item) => item.status === "failed").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
  };
}

function buildActionResponse(items: NaverClaimActionItemResult[]): NaverClaimActionResponse {
  return {
    items,
    summary: summarizeActionItems(items),
    completedAt: new Date().toISOString(),
  };
}

function createActionItemResult(input: {
  target: ClaimBaseTarget;
  claimType: NaverClaimType;
  action: NaverClaimActionKey;
  status: NaverClaimActionItemResult["status"];
  message: string;
  appliedAt?: string | null;
}) {
  return {
    claimType: input.claimType,
    claimId: input.target.claimId ?? null,
    orderId: input.target.orderId ?? null,
    productOrderId: input.target.productOrderId,
    productName: input.target.productName ?? null,
    action: input.action,
    status: input.status,
    message: input.message,
    appliedAt: input.appliedAt ?? null,
  } satisfies NaverClaimActionItemResult;
}

function getActionResultMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalizeCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function validateBaseTarget(target: ClaimBaseTarget) {
  if (!target.productOrderId || !target.productOrderId.trim()) {
    return "상품 주문 번호가 필요합니다.";
  }

  return null;
}

function validateHoldReturnTarget(target: NaverHoldReturnTarget) {
  const baseError = validateBaseTarget(target);
  if (baseError) return baseError;
  if (!target.holdbackClassType?.trim()) return "보류 유형을 선택해 주세요.";
  if (!target.holdbackReason?.trim()) return "보류 사유를 선택해 주세요.";
  if (!target.holdbackReturnDetailReason?.trim()) return "반품 보류 상세 사유를 입력해 주세요.";
  return null;
}

function validateRejectReturnTarget(target: NaverRejectReturnTarget) {
  const baseError = validateBaseTarget(target);
  if (baseError) return baseError;
  if (!target.rejectReturnReason?.trim()) return "반품 거부 사유를 입력해 주세요.";
  return null;
}

function validateHoldExchangeTarget(target: NaverHoldExchangeTarget) {
  const baseError = validateBaseTarget(target);
  if (baseError) return baseError;
  if (!target.holdbackClassType?.trim()) return "보류 유형을 선택해 주세요.";
  if (!target.holdbackReason?.trim()) return "보류 사유를 선택해 주세요.";
  if (!target.holdbackExchangeDetailReason?.trim()) return "교환 보류 상세 사유를 입력해 주세요.";
  return null;
}

function validateRejectExchangeTarget(target: NaverRejectExchangeTarget) {
  const baseError = validateBaseTarget(target);
  if (baseError) return baseError;
  if (!target.rejectExchangeReason?.trim()) return "교환 거부 사유를 입력해 주세요.";
  return null;
}

function validateRedeliverExchangeTarget(target: NaverRedeliverExchangeTarget) {
  const baseError = validateBaseTarget(target);
  if (baseError) return baseError;
  if (!target.reDeliveryMethod?.trim()) return "재배송 방식을 선택해 주세요.";

  const method = target.reDeliveryMethod.trim().toUpperCase();
  const requiresTracking = ["DELIVERY", "RETURN_DESIGNATED", "RETURN_DELIVERY"].includes(method);

  if (requiresTracking) {
    if (!target.reDeliveryCompany?.trim()) {
      return "재배송 택배사 코드를 입력해 주세요.";
    }
    if (!target.reDeliveryTrackingNumber?.trim()) {
      return "재배송 송장 번호를 입력해 주세요.";
    }
  }

  return null;
}

async function processTargets<TTarget extends ClaimBaseTarget>(input: {
  storeId: string;
  claimType: NaverClaimType;
  action: NaverClaimActionKey;
  items: TTarget[];
  validate: (target: TTarget) => string | null;
  execute: (context: NaverRequestContext, target: TTarget) => Promise<void>;
  successMessage: string;
  failureMessage: string;
}) {
  const context = await createNaverRequestContext(input.storeId);

  const items = await mapWithConcurrency(
    input.items,
    NAVER_CLAIM_ACTION_CONCURRENCY,
    async (target) => {
      const validationMessage = input.validate(target);
      if (validationMessage) {
        return createActionItemResult({
          target,
          claimType: input.claimType,
          action: input.action,
          status: "skipped",
          message: validationMessage,
        });
      }

      try {
        await input.execute(context, target);
        return createActionItemResult({
          target,
          claimType: input.claimType,
          action: input.action,
          status: "succeeded",
          message: input.successMessage,
          appliedAt: new Date().toISOString(),
        });
      } catch (error) {
        return createActionItemResult({
          target,
          claimType: input.claimType,
          action: input.action,
          status: "failed",
          message: getActionResultMessage(error, input.failureMessage),
        });
      }
    },
  );

  return buildActionResponse(items);
}

async function requestPathAction(context: NaverRequestContext, path: string, body?: unknown) {
  await requestNaverJsonWithContext({
    context,
    method: "POST",
    path,
    body,
  });
}

export async function listClaims(input: {
  storeId: string;
  lastChangedFrom: string;
  lastChangedTo?: string;
  claimType?: NaverClaimType | "all";
  status?: string;
  query?: string;
  maxItems?: number;
  refresh?: boolean;
}) {
  const cacheKey = JSON.stringify({
    storeId: input.storeId,
    lastChangedFrom: input.lastChangedFrom,
    lastChangedTo: input.lastChangedTo ?? null,
    claimType: input.claimType ?? null,
    status: input.status ?? null,
    query: input.query ?? null,
    maxItems: clampMaxItems(input.maxItems),
  });

  return naverClaimListCache.getOrLoad(cacheKey, {
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
      for (let index = 0; index < uniqueProductOrderIds.length; index += NAVER_CLAIM_DETAIL_LIMIT) {
        const chunk = uniqueProductOrderIds.slice(index, index + NAVER_CLAIM_DETAIL_LIMIT);
        const rows = await fetchOrderDetailsByIds({
          context,
          productOrderIds: chunk,
        });
        detailRows.push(...rows);
      }

      const changedStatusById = new Map(
        changedItems.map((item) => [item.productOrderId, item] as const),
      );

      const rows = sortClaimRows(
        filterClaimRows(
          detailRows.flatMap((detail) => {
            const productOrderId =
              firstString(asObject(asObject(detail)?.productOrder) ?? asObject(detail), [
                ["productOrderId"],
              ]) ?? "";

            return buildClaimRows({
              store: context.store,
              detail,
              changedStatus: changedStatusById.get(productOrderId) ?? null,
            });
          }),
          {
            claimType: input.claimType,
            status: input.status,
            query: input.query,
          },
        ),
      );

      return {
        store: {
          id: context.store.id,
          name: context.store.storeName,
        },
        items: rows,
        fetchedAt: new Date().toISOString(),
        totalCount: rows.length,
        limitedByMaxItems: changedItems.length >= maxItems,
        source: "live",
      } satisfies NaverClaimListResponse;
    },
  });
}

export async function approveCancel(input: {
  storeId: string;
  items: NaverApproveCancelTarget[];
}) {
  return processTargets({
    storeId: input.storeId,
    claimType: "cancel",
    action: "approveCancel",
    items: input.items,
    validate: validateBaseTarget,
    execute: async (context, target) => {
      await requestPathAction(
        context,
        `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/claim/cancel/approve`,
      );
    },
    successMessage: "취소 승인 처리가 완료되었습니다.",
    failureMessage: "취소 승인 처리에 실패했습니다.",
  });
}

export async function approveReturn(input: {
  storeId: string;
  items: NaverApproveReturnTarget[];
}) {
  return processTargets({
    storeId: input.storeId,
    claimType: "return",
    action: "approveReturn",
    items: input.items,
    validate: validateBaseTarget,
    execute: async (context, target) => {
      await requestPathAction(
        context,
        `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/claim/return/approve`,
      );
    },
    successMessage: "반품 승인 처리가 완료되었습니다.",
    failureMessage: "반품 승인 처리에 실패했습니다.",
  });
}

export async function holdReturn(input: {
  storeId: string;
  items: NaverHoldReturnTarget[];
}) {
  return processTargets({
    storeId: input.storeId,
    claimType: "return",
    action: "holdReturn",
    items: input.items,
    validate: validateHoldReturnTarget,
    execute: async (context, target) => {
      await requestPathAction(
        context,
        `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/claim/return/holdback`,
        {
          holdbackClassType: target.holdbackClassType.trim(),
          holdbackReason: target.holdbackReason.trim(),
          holdbackReturnDetailReason: target.holdbackReturnDetailReason.trim(),
          extraReturnFeeAmount: normalizeCurrency(target.extraReturnFeeAmount),
        },
      );
    },
    successMessage: "반품 보류 처리가 완료되었습니다.",
    failureMessage: "반품 보류 처리에 실패했습니다.",
  });
}

export async function releaseReturnHold(input: {
  storeId: string;
  items: NaverReleaseReturnHoldTarget[];
}) {
  return processTargets({
    storeId: input.storeId,
    claimType: "return",
    action: "releaseReturnHold",
    items: input.items,
    validate: validateBaseTarget,
    execute: async (context, target) => {
      await requestPathAction(
        context,
        `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/claim/return/holdback/release`,
      );
    },
    successMessage: "반품 보류 해제가 완료되었습니다.",
    failureMessage: "반품 보류 해제에 실패했습니다.",
  });
}

export async function rejectReturn(input: {
  storeId: string;
  items: NaverRejectReturnTarget[];
}) {
  return processTargets({
    storeId: input.storeId,
    claimType: "return",
    action: "rejectReturn",
    items: input.items,
    validate: validateRejectReturnTarget,
    execute: async (context, target) => {
      await requestPathAction(
        context,
        `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/claim/return/reject`,
        {
          rejectReturnReason: target.rejectReturnReason.trim(),
        },
      );
    },
    successMessage: "반품 거부 처리가 완료되었습니다.",
    failureMessage: "반품 거부 처리에 실패했습니다.",
  });
}

export async function holdExchange(input: {
  storeId: string;
  items: NaverHoldExchangeTarget[];
}) {
  return processTargets({
    storeId: input.storeId,
    claimType: "exchange",
    action: "holdExchange",
    items: input.items,
    validate: validateHoldExchangeTarget,
    execute: async (context, target) => {
      await requestPathAction(
        context,
        `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/claim/exchange/holdback`,
        {
          holdbackClassType: target.holdbackClassType.trim(),
          holdbackReason: target.holdbackReason.trim(),
          holdbackExchangeDetailReason: target.holdbackExchangeDetailReason.trim(),
          extraExchangeFeeAmount: normalizeCurrency(target.extraExchangeFeeAmount),
        },
      );
    },
    successMessage: "교환 보류 처리가 완료되었습니다.",
    failureMessage: "교환 보류 처리에 실패했습니다.",
  });
}

export async function releaseExchangeHold(input: {
  storeId: string;
  items: NaverReleaseExchangeHoldTarget[];
}) {
  return processTargets({
    storeId: input.storeId,
    claimType: "exchange",
    action: "releaseExchangeHold",
    items: input.items,
    validate: validateBaseTarget,
    execute: async (context, target) => {
      await requestPathAction(
        context,
        `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/claim/exchange/holdback/release`,
      );
    },
    successMessage: "교환 보류 해제가 완료되었습니다.",
    failureMessage: "교환 보류 해제에 실패했습니다.",
  });
}

export async function rejectExchange(input: {
  storeId: string;
  items: NaverRejectExchangeTarget[];
}) {
  return processTargets({
    storeId: input.storeId,
    claimType: "exchange",
    action: "rejectExchange",
    items: input.items,
    validate: validateRejectExchangeTarget,
    execute: async (context, target) => {
      await requestPathAction(
        context,
        `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/claim/exchange/reject`,
        {
          rejectExchangeReason: target.rejectExchangeReason.trim(),
        },
      );
    },
    successMessage: "교환 거부 처리가 완료되었습니다.",
    failureMessage: "교환 거부 처리에 실패했습니다.",
  });
}

export async function redeliverExchange(input: {
  storeId: string;
  items: NaverRedeliverExchangeTarget[];
}) {
  return processTargets({
    storeId: input.storeId,
    claimType: "exchange",
    action: "redeliverExchange",
    items: input.items,
    validate: validateRedeliverExchangeTarget,
    execute: async (context, target) => {
      const method = target.reDeliveryMethod.trim().toUpperCase();
      const body: Record<string, unknown> = {
        reDeliveryMethod: method,
      };

      if (target.reDeliveryCompany?.trim()) {
        body.reDeliveryCompany = target.reDeliveryCompany.trim();
      }

      if (target.reDeliveryTrackingNumber?.trim()) {
        body.reDeliveryTrackingNumber = target.reDeliveryTrackingNumber.trim();
      }

      await requestPathAction(
        context,
        `/v1/pay-order/seller/product-orders/${encodeURIComponent(target.productOrderId)}/claim/exchange/dispatch`,
        body,
      );
    },
    successMessage: "교환 재배송 처리가 완료되었습니다.",
    failureMessage: "교환 재배송 처리에 실패했습니다.",
  });
}
