import type {
  NaverCustomerInquiryAnswerTarget,
  NaverCustomerInquiryRow,
  NaverInquiryActionItemResult,
  NaverInquiryActionResponse,
  NaverInquiryKind,
  NaverInquiryListResponse,
  NaverProductInquiryAnswerTarget,
  NaverProductInquiryRow,
  NaverProductInquiryTemplate,
  NaverProductInquiryTemplateListResponse,
} from "@shared/naver-inquiries";
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asString,
  createNaverRequestContext,
  normalizeDateOnly,
  requestNaverJson,
  requestNaverJsonWithContext,
  toSeoulDateTime,
} from "./naver-api-client";
import { createStaleResponseCache } from "./shared/stale-response-cache";

const CUSTOMER_PAGE_SIZE_MAX = 200;
const PRODUCT_PAGE_SIZE_MAX = 100;
const ACTION_CONCURRENCY = 4;
const NAVER_INQUIRY_LIST_CACHE_TTL_MS = 60_000;

const naverCustomerInquiryCache = createStaleResponseCache<NaverInquiryListResponse>(
  NAVER_INQUIRY_LIST_CACHE_TTL_MS,
);
const naverProductInquiryCache = createStaleResponseCache<NaverInquiryListResponse>(
  NAVER_INQUIRY_LIST_CACHE_TTL_MS,
);
const naverProductInquiryTemplateCache = createStaleResponseCache<NaverProductInquiryTemplateListResponse>(
  5 * 60_000,
);

function clampPageSize(value: number | null | undefined, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return max;
  }

  return Math.max(1, Math.min(Math.floor(value), max));
}

function getActionMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function matchesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query.trim()) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const haystack = values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
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

function summarizeActionItems(items: NaverInquiryActionItemResult[]) {
  return {
    total: items.length,
    succeededCount: items.filter((item) => item.status === "succeeded").length,
    failedCount: items.filter((item) => item.status === "failed").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
  };
}

function buildActionResponse(items: NaverInquiryActionItemResult[]): NaverInquiryActionResponse {
  return {
    items,
    summary: summarizeActionItems(items),
    completedAt: new Date().toISOString(),
  };
}

function createActionItem(input: {
  inquiryId: string;
  kind: NaverInquiryKind;
  action: NaverInquiryActionItemResult["action"];
  status: NaverInquiryActionItemResult["status"];
  message: string;
  appliedAt?: string | null;
}) {
  return {
    inquiryId: input.inquiryId,
    kind: input.kind,
    action: input.action,
    status: input.status,
    message: input.message,
    appliedAt: input.appliedAt ?? null,
  } satisfies NaverInquiryActionItemResult;
}

function normalizeCustomerInquiryRow(raw: unknown): NaverCustomerInquiryRow | null {
  const item = asObject(raw);
  const inquiryNo = asString(item?.inquiryNo);

  if (!inquiryNo) {
    return null;
  }

  const productOrderIdList = asString(item?.productOrderIdList)
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

  return {
    id: `customer:${inquiryNo}`,
    kind: "customer",
    inquiryNo,
    category: asString(item?.category),
    title: asString(item?.title) ?? `문의 ${inquiryNo}`,
    inquiryContent: asString(item?.inquiryContent) ?? "",
    inquiryRegistrationDateTime: asString(item?.inquiryRegistrationDateTime),
    answered: asBoolean(item?.answered) ?? false,
    answerContentId: asString(item?.answerContentId),
    answerContent: asString(item?.answerContent),
    answerTemplateId: asString(item?.answerTemplateNo),
    answerRegistrationDateTime: asString(item?.answerRegistrationDateTime),
    orderId: asString(item?.orderId),
    productNo: asString(item?.productNo),
    productOrderIdList,
    productName: asString(item?.productName),
    productOrderOption: asString(item?.productOrderOption),
    customerId: asString(item?.customerId),
    customerName: asString(item?.customerName),
  };
}

function normalizeProductInquiryRow(raw: unknown): NaverProductInquiryRow | null {
  const item = asObject(raw);
  const questionId = asString(item?.questionId);

  if (!questionId) {
    return null;
  }

  return {
    id: `product:${questionId}`,
    kind: "product",
    questionId,
    productId: asString(item?.productId),
    productName: asString(item?.productName),
    question: asString(item?.question) ?? "",
    answer: asString(item?.answer),
    answered: asBoolean(item?.answered) ?? false,
    maskedWriterId: asString(item?.maskedWriterId),
    createDate: asString(item?.createDate),
  };
}

function normalizeCustomerListPayload(input: {
  payload: unknown;
  page: number;
  size: number;
}) {
  const root = asObject(input.payload);
  const data = asObject(root?.data) ?? root;
  const pageable = asObject(data?.pageable);
  const content = asArray(data?.content)
    .map(normalizeCustomerInquiryRow)
    .filter((item): item is NaverCustomerInquiryRow => Boolean(item));

  return {
    items: content,
    page: (asNumber(data?.number) ?? asNumber(pageable?.pageNumber) ?? input.page - 1) + 1,
    size: asNumber(data?.size) ?? asNumber(pageable?.pageSize) ?? input.size,
    totalCount: asNumber(data?.totalElements) ?? content.length,
    totalPages: asNumber(data?.totalPages) ?? 1,
  };
}

function normalizeProductListPayload(input: {
  payload: unknown;
  page: number;
  size: number;
}) {
  const root = asObject(input.payload);
  const data = asObject(root?.data) ?? root;
  const contents = asArray(data?.contents)
    .map(normalizeProductInquiryRow)
    .filter((item): item is NaverProductInquiryRow => Boolean(item));

  return {
    items: contents,
    page: asNumber(data?.page) ?? input.page,
    size: asNumber(data?.size) ?? input.size,
    totalCount: asNumber(data?.totalElements) ?? contents.length,
    totalPages: asNumber(data?.totalPages) ?? 1,
  };
}

function filterCustomerItems(items: NaverCustomerInquiryRow[], query: string) {
  return items.filter((item) =>
    matchesQuery(
      [
        item.inquiryNo,
        item.title,
        item.inquiryContent,
        item.orderId,
        item.productName,
        item.customerName,
        item.customerId,
        item.answerContent,
      ],
      query,
    ),
  );
}

function filterProductItems(items: NaverProductInquiryRow[], query: string) {
  return items.filter((item) =>
    matchesQuery(
      [item.questionId, item.productName, item.question, item.answer, item.maskedWriterId],
      query,
    ),
  );
}

export async function listCustomerInquiries(input: {
  storeId: string;
  startDate: string;
  endDate: string;
  answered?: boolean | null;
  query?: string;
  page?: number;
  size?: number;
  refresh?: boolean;
}) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const size = clampPageSize(input.size, CUSTOMER_PAGE_SIZE_MAX);
  const cacheKey = JSON.stringify({
    storeId: input.storeId,
    startDate: normalizeDateOnly(input.startDate),
    endDate: normalizeDateOnly(input.endDate),
    answered: typeof input.answered === "boolean" ? input.answered : null,
    query: input.query ?? null,
    page,
    size,
  });

  return naverCustomerInquiryCache.getOrLoad(cacheKey, {
    refresh: input.refresh,
    load: async () => {
      const params = new URLSearchParams({
        page: String(page),
        size: String(size),
        startSearchDate: normalizeDateOnly(input.startDate),
        endSearchDate: normalizeDateOnly(input.endDate),
      });

      if (typeof input.answered === "boolean") {
        params.set("answered", String(input.answered));
      }

      const { store, payload } = await requestNaverJson<unknown>({
        storeId: input.storeId,
        method: "GET",
        path: `/v1/pay-user/inquiries?${params.toString()}`,
      });

      const normalized = normalizeCustomerListPayload({ payload, page, size });
      const items = filterCustomerItems(normalized.items, input.query ?? "");

      return {
        store: {
          id: store.id,
          name: store.storeName,
        },
        kind: "customer",
        items,
        page: normalized.page,
        size: normalized.size,
        totalCount: items.length,
        totalPages: normalized.totalPages,
        fetchedAt: new Date().toISOString(),
      } satisfies NaverInquiryListResponse;
    },
  });
}

export async function listProductInquiries(input: {
  storeId: string;
  startDate: string;
  endDate: string;
  answered?: boolean | null;
  query?: string;
  page?: number;
  size?: number;
  refresh?: boolean;
}) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const size = clampPageSize(input.size, PRODUCT_PAGE_SIZE_MAX);
  const cacheKey = JSON.stringify({
    storeId: input.storeId,
    startDate: input.startDate,
    endDate: input.endDate,
    answered: typeof input.answered === "boolean" ? input.answered : null,
    query: input.query ?? null,
    page,
    size,
  });

  return naverProductInquiryCache.getOrLoad(cacheKey, {
    refresh: input.refresh,
    load: async () => {
      const params = new URLSearchParams({
        page: String(page),
        size: String(size),
        fromDate: toSeoulDateTime(input.startDate, "start"),
        toDate: toSeoulDateTime(input.endDate, "end"),
      });

      if (typeof input.answered === "boolean") {
        params.set("answered", String(input.answered));
      }

      const { store, payload } = await requestNaverJson<unknown>({
        storeId: input.storeId,
        method: "GET",
        path: `/v1/contents/qnas?${params.toString()}`,
      });

      const normalized = normalizeProductListPayload({ payload, page, size });
      const items = filterProductItems(normalized.items, input.query ?? "");

      return {
        store: {
          id: store.id,
          name: store.storeName,
        },
        kind: "product",
        items,
        page: normalized.page,
        size: normalized.size,
        totalCount: items.length,
        totalPages: normalized.totalPages,
        fetchedAt: new Date().toISOString(),
      } satisfies NaverInquiryListResponse;
    },
  });
}

export async function listProductInquiryTemplates(input: { storeId: string; refresh?: boolean }) {
  return naverProductInquiryTemplateCache.getOrLoad(input.storeId, {
    refresh: input.refresh,
    load: async () => {
      const { payload } = await requestNaverJson<unknown>({
        storeId: input.storeId,
        method: "GET",
        path: "/v1/contents/qnas/templates",
      });

      const root = asObject(payload);
      const rawItems = Array.isArray(root?.data)
        ? root.data
        : Array.isArray(payload)
          ? payload
          : [];

      const items = rawItems
        .map((rawItem) => {
          const item = asObject(rawItem);
          const content = asString(item?.content);
          if (!content) {
            return null;
          }

          const subject = asString(item?.subject) ?? content.slice(0, 24);
          const questionType = asString(item?.questionType) ?? "ETC";
          return {
            id: `${questionType}:${subject}`,
            questionType,
            subject,
            content,
          } satisfies NaverProductInquiryTemplate;
        })
        .filter((item): item is NaverProductInquiryTemplate => Boolean(item));

      return {
        items,
        fetchedAt: new Date().toISOString(),
      } satisfies NaverProductInquiryTemplateListResponse;
    },
  });
}

function validateCustomerAnswerTarget(input: {
  target: NaverCustomerInquiryAnswerTarget;
  requireAnswerContentId: boolean;
}) {
  if (!input.target.inquiryNo.trim()) {
    return "inquiryNo is required.";
  }

  if (!input.target.answerComment.trim()) {
    return "Answer content is required.";
  }

  if (input.requireAnswerContentId && !input.target.answerContentId?.trim()) {
    return "answerContentId is required for answer update.";
  }

  return null;
}

function validateProductAnswerTarget(target: NaverProductInquiryAnswerTarget) {
  if (!target.questionId.trim()) {
    return "questionId is required.";
  }

  if (!target.commentContent.trim()) {
    return "Answer content is required.";
  }

  return null;
}

export async function registerCustomerInquiryAnswers(input: {
  storeId: string;
  items: NaverCustomerInquiryAnswerTarget[];
}) {
  const context = await createNaverRequestContext(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (target) => {
    const validationMessage = validateCustomerAnswerTarget({
      target,
      requireAnswerContentId: false,
    });

    if (validationMessage) {
      return createActionItem({
        inquiryId: target.inquiryNo,
        kind: "customer",
        action: "registerAnswer",
        status: "skipped",
        message: validationMessage,
      });
    }

    try {
      await requestNaverJsonWithContext({
        context,
        method: "POST",
        path: `/v1/pay-merchant/inquiries/${encodeURIComponent(target.inquiryNo)}/answer`,
        body: {
          answerComment: target.answerComment.trim(),
          ...(target.answerTemplateId?.trim()
            ? { answerTemplateId: target.answerTemplateId.trim() }
            : {}),
        },
      });

      return createActionItem({
        inquiryId: target.inquiryNo,
        kind: "customer",
        action: "registerAnswer",
        status: "succeeded",
        message: "고객 문의 답변이 등록되었습니다.",
        appliedAt: new Date().toISOString(),
      });
    } catch (error) {
      return createActionItem({
        inquiryId: target.inquiryNo,
        kind: "customer",
        action: "registerAnswer",
        status: "failed",
        message: getActionMessage(error, "고객 문의 답변 등록에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function updateCustomerInquiryAnswers(input: {
  storeId: string;
  items: NaverCustomerInquiryAnswerTarget[];
}) {
  const context = await createNaverRequestContext(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (target) => {
    const validationMessage = validateCustomerAnswerTarget({
      target,
      requireAnswerContentId: true,
    });

    if (validationMessage) {
      return createActionItem({
        inquiryId: target.inquiryNo,
        kind: "customer",
        action: "updateAnswer",
        status: "skipped",
        message: validationMessage,
      });
    }

    try {
      await requestNaverJsonWithContext({
        context,
        method: "PUT",
        path: `/v1/pay-merchant/inquiries/${encodeURIComponent(target.inquiryNo)}/answer/${encodeURIComponent(target.answerContentId!.trim())}`,
        body: {
          answerComment: target.answerComment.trim(),
          ...(target.answerTemplateId?.trim()
            ? { answerTemplateId: target.answerTemplateId.trim() }
            : {}),
        },
      });

      return createActionItem({
        inquiryId: target.inquiryNo,
        kind: "customer",
        action: "updateAnswer",
        status: "succeeded",
        message: "고객 문의 답변이 수정되었습니다.",
        appliedAt: new Date().toISOString(),
      });
    } catch (error) {
      return createActionItem({
        inquiryId: target.inquiryNo,
        kind: "customer",
        action: "updateAnswer",
        status: "failed",
        message: getActionMessage(error, "고객 문의 답변 수정에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}

export async function saveProductInquiryAnswers(input: {
  storeId: string;
  items: NaverProductInquiryAnswerTarget[];
}) {
  const context = await createNaverRequestContext(input.storeId);
  const items = await mapWithConcurrency(input.items, ACTION_CONCURRENCY, async (target) => {
    const validationMessage = validateProductAnswerTarget(target);

    if (validationMessage) {
      return createActionItem({
        inquiryId: target.questionId,
        kind: "product",
        action: "saveAnswer",
        status: "skipped",
        message: validationMessage,
      });
    }

    try {
      await requestNaverJsonWithContext({
        context,
        method: "PUT",
        path: `/v1/contents/qnas/${encodeURIComponent(target.questionId)}`,
        body: {
          commentContent: target.commentContent.trim(),
        },
      });

      return createActionItem({
        inquiryId: target.questionId,
        kind: "product",
        action: "saveAnswer",
        status: "succeeded",
        message: "상품 문의 답변이 저장되었습니다.",
        appliedAt: new Date().toISOString(),
      });
    } catch (error) {
      return createActionItem({
        inquiryId: target.questionId,
        kind: "product",
        action: "saveAnswer",
        status: "failed",
        message: getActionMessage(error, "상품 문의 답변 저장에 실패했습니다."),
      });
    }
  });

  return buildActionResponse(items);
}
