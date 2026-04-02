import type {
  NaverCustomerInquiryAnswerTarget,
  NaverInquiryActionResponse,
  NaverProductInquiryAnswerTarget,
} from "@shared/naver-inquiries";
import { Router } from "express";
import {
  listCustomerInquiries,
  listProductInquiries,
  listProductInquiryTemplates,
  registerCustomerInquiryAnswers,
  saveProductInquiryAnswers,
  updateCustomerInquiryAnswers,
} from "../services/naver-inquiry-service";
import {
  registerOperationRetryHandler,
  runTrackedOperation,
  summarizeResult,
} from "../services/operations/service";
import { sendData, sendError } from "../services/shared/api-response";

const router = Router();
const NAVER_INQUIRIES_MENU_KEY = "naver.inquiries";

function getErrorStatus(message: string) {
  return message.includes("required") ||
    message.includes("valid") ||
    message.includes("store") ||
    message.includes("Answer content")
    ? 400
    : 502;
}

function buildErrorCode(message: string) {
  return getErrorStatus(message) === 400 ? "INVALID_NAVER_INQUIRY_REQUEST" : "NAVER_INQUIRY_API_FAILED";
}

function clampPositiveInteger(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function parseAnswered(value: unknown) {
  if (value === "true" || value === true) {
    return true;
  }

  if (value === "false" || value === false) {
    return false;
  }

  return undefined;
}

function parseCustomerAnswerTargets(value: unknown): NaverCustomerInquiryAnswerTarget[] {
  const items = Array.isArray((value as { items?: unknown[] } | null)?.items)
    ? ((value as { items: unknown[] }).items ?? [])
    : [];

  return items.map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};
    return {
      inquiryNo:
        typeof item.inquiryNo === "string"
          ? item.inquiryNo
          : typeof item.inquiryNo === "number"
            ? String(item.inquiryNo)
            : "",
      answerComment: typeof item.answerComment === "string" ? item.answerComment : "",
      answerContentId:
        typeof item.answerContentId === "string"
          ? item.answerContentId
          : typeof item.answerContentId === "number"
            ? String(item.answerContentId)
            : null,
      answerTemplateId:
        typeof item.answerTemplateId === "string"
          ? item.answerTemplateId
          : typeof item.answerTemplateId === "number"
            ? String(item.answerTemplateId)
            : null,
      title: typeof item.title === "string" ? item.title : null,
      customerName: typeof item.customerName === "string" ? item.customerName : null,
    } satisfies NaverCustomerInquiryAnswerTarget;
  });
}

function parseProductAnswerTargets(value: unknown): NaverProductInquiryAnswerTarget[] {
  const items = Array.isArray((value as { items?: unknown[] } | null)?.items)
    ? ((value as { items: unknown[] }).items ?? [])
    : [];

  return items.map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};
    return {
      questionId:
        typeof item.questionId === "string"
          ? item.questionId
          : typeof item.questionId === "number"
            ? String(item.questionId)
            : "",
      commentContent: typeof item.commentContent === "string" ? item.commentContent : "",
      productName: typeof item.productName === "string" ? item.productName : null,
    } satisfies NaverProductInquiryAnswerTarget;
  });
}

function buildInquiryActionSummaryText(result: NaverInquiryActionResponse) {
  return `성공 ${result.summary.succeededCount}건 / 실패 ${result.summary.failedCount}건 / 건너뜀 ${result.summary.skippedCount}건`;
}

function resolveOperationStatus(result: NaverInquiryActionResponse) {
  return result.summary.failedCount > 0 || result.summary.skippedCount > 0
    ? "warning"
    : "success";
}

function buildOperationPayload(input: {
  storeId: string;
  kind: "customer" | "product";
  items: Array<{ inquiryNo?: string; questionId?: string }>;
}) {
  return {
    storeId: input.storeId,
    kind: input.kind,
    itemCount: input.items.length,
    targetIds: input.items.map((item) => item.inquiryNo ?? item.questionId ?? ""),
    items: input.items,
  };
}

function registerRetryHandler<TItem extends { inquiryNo?: string; questionId?: string }>(input: {
  actionKey: string;
  kind: "customer" | "product";
  parseItems: (value: unknown) => TItem[];
  execute: (params: { storeId: string; items: TItem[] }) => Promise<NaverInquiryActionResponse>;
  detailLabel: string;
}) {
  registerOperationRetryHandler(
    {
      channel: "naver",
      menuKey: NAVER_INQUIRIES_MENU_KEY,
      actionKey: input.actionKey,
    },
    async ({ operation, requestPayload }) => {
      const request = (requestPayload ?? {}) as Record<string, unknown>;
      const storeId = typeof request.storeId === "string" ? request.storeId : "";
      const items = input.parseItems({ items: Array.isArray(request.items) ? request.items : [] });

      return runTrackedOperation({
        channel: "naver",
        menuKey: NAVER_INQUIRIES_MENU_KEY,
        actionKey: input.actionKey,
        mode: "retry",
        targetType: "selection",
        targetCount: items.length,
        targetIds: items.map((item) => item.inquiryNo ?? item.questionId ?? ""),
        requestPayload: {
          storeId,
          items,
        },
        normalizedPayload: buildOperationPayload({ storeId, kind: input.kind, items }),
        retryable: true,
        retryOfOperationId: operation.id,
        execute: async () => {
          const data = await input.execute({ storeId, items });
          return {
            data,
            status: resolveOperationStatus(data),
            normalizedPayload: buildOperationPayload({ storeId, kind: input.kind, items }),
            resultSummary: summarizeResult({
              headline: buildInquiryActionSummaryText(data),
              detail: `${input.detailLabel} ${items.length}건`,
              stats: data.summary,
              preview: buildInquiryActionSummaryText(data),
            }),
          };
        },
      });
    },
  );
}

registerRetryHandler({
  actionKey: "answer-customer-inquiry",
  kind: "customer",
  parseItems: parseCustomerAnswerTargets,
  execute: registerCustomerInquiryAnswers,
  detailLabel: "고객 문의 답변 등록",
});

registerRetryHandler({
  actionKey: "update-customer-inquiry-answer",
  kind: "customer",
  parseItems: parseCustomerAnswerTargets,
  execute: updateCustomerInquiryAnswers,
  detailLabel: "고객 문의 답변 수정",
});

registerRetryHandler({
  actionKey: "answer-product-inquiry",
  kind: "product",
  parseItems: parseProductAnswerTargets,
  execute: saveProductInquiryAnswers,
  detailLabel: "상품 문의 답변 저장",
});

router.get("/inquiries", async (req, res) => {
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
  const kind = req.query.kind === "product" ? "product" : "customer";
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : "";
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : "";

  if (!storeId) {
    sendError(res, 400, { code: "MISSING_STORE_ID", message: "storeId is required." });
    return;
  }

  if (!startDate || !endDate) {
    sendError(res, 400, { code: "MISSING_DATE_RANGE", message: "startDate and endDate are required." });
    return;
  }

  try {
    const answered = parseAnswered(req.query.answered);
    const result =
      kind === "product"
        ? await listProductInquiries({
            storeId,
            startDate,
            endDate,
            answered,
            query: typeof req.query.query === "string" ? req.query.query : undefined,
            page: clampPositiveInteger(req.query.page, 1, 1000),
            size: clampPositiveInteger(req.query.size, 100, 100),
            refresh: req.query.refresh === "1",
          })
        : await listCustomerInquiries({
            storeId,
            startDate,
            endDate,
            answered,
            query: typeof req.query.query === "string" ? req.query.query : undefined,
            page: clampPositiveInteger(req.query.page, 1, 1000),
            size: clampPositiveInteger(req.query.size, 100, 200),
            refresh: req.query.refresh === "1",
          });

    sendData(res, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load NAVER inquiries.";
    sendError(res, getErrorStatus(message), {
      code: buildErrorCode(message),
      message,
    });
  }
});

router.get("/inquiries/product-templates", async (req, res) => {
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";

  if (!storeId) {
    sendError(res, 400, { code: "MISSING_STORE_ID", message: "storeId is required." });
    return;
  }

  try {
    sendData(
      res,
      await listProductInquiryTemplates({
        storeId,
        refresh: req.query.refresh === "1",
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load NAVER inquiry templates.";
    sendError(res, getErrorStatus(message), {
      code: buildErrorCode(message),
      message,
    });
  }
});

async function handleTrackedInquiryAction<TItem extends { inquiryNo?: string; questionId?: string }>(input: {
  storeId: string;
  items: TItem[];
  kind: "customer" | "product";
  actionKey: string;
  detailLabel: string;
  execute: (params: { storeId: string; items: TItem[] }) => Promise<NaverInquiryActionResponse>;
  res: Parameters<typeof sendData>[0];
}) {
  const tracked = await runTrackedOperation({
    channel: "naver",
    menuKey: NAVER_INQUIRIES_MENU_KEY,
    actionKey: input.actionKey,
    mode: "foreground",
    targetType: "selection",
    targetCount: input.items.length,
    targetIds: input.items.map((item) => item.inquiryNo ?? item.questionId ?? ""),
    requestPayload: {
      storeId: input.storeId,
      items: input.items,
    },
    normalizedPayload: buildOperationPayload({
      storeId: input.storeId,
      kind: input.kind,
      items: input.items,
    }),
    retryable: true,
    execute: async () => {
      const data = await input.execute({
        storeId: input.storeId,
        items: input.items,
      });

      return {
        data,
        status: resolveOperationStatus(data),
        normalizedPayload: buildOperationPayload({
          storeId: input.storeId,
          kind: input.kind,
          items: input.items,
        }),
        resultSummary: summarizeResult({
          headline: buildInquiryActionSummaryText(data),
          detail: `${input.detailLabel} ${input.items.length}건`,
          stats: data.summary,
          preview: buildInquiryActionSummaryText(data),
        }),
      };
    },
  });

  sendData(input.res, {
    ...tracked.data,
    operation: tracked.operation,
  });
}

router.post("/inquiries/customer/answer", async (req, res) => {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const items = parseCustomerAnswerTargets(req.body);

  if (!storeId) {
    sendError(res, 400, { code: "MISSING_STORE_ID", message: "storeId is required." });
    return;
  }

  if (!items.length) {
    sendError(res, 400, { code: "MISSING_TARGETS", message: "At least one inquiry must be selected." });
    return;
  }

  try {
    await handleTrackedInquiryAction({
      storeId,
      items,
      kind: "customer",
      actionKey: "answer-customer-inquiry",
      detailLabel: "고객 문의 답변 등록",
      execute: registerCustomerInquiryAnswers,
      res,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to register NAVER customer inquiry answer.";
    sendError(res, getErrorStatus(message), {
      code: buildErrorCode(message),
      message,
    });
  }
});

router.put("/inquiries/customer/answer", async (req, res) => {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const items = parseCustomerAnswerTargets(req.body);

  if (!storeId) {
    sendError(res, 400, { code: "MISSING_STORE_ID", message: "storeId is required." });
    return;
  }

  if (!items.length) {
    sendError(res, 400, { code: "MISSING_TARGETS", message: "At least one inquiry must be selected." });
    return;
  }

  try {
    await handleTrackedInquiryAction({
      storeId,
      items,
      kind: "customer",
      actionKey: "update-customer-inquiry-answer",
      detailLabel: "고객 문의 답변 수정",
      execute: updateCustomerInquiryAnswers,
      res,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update NAVER customer inquiry answer.";
    sendError(res, getErrorStatus(message), {
      code: buildErrorCode(message),
      message,
    });
  }
});

router.put("/inquiries/product/answer", async (req, res) => {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const items = parseProductAnswerTargets(req.body);

  if (!storeId) {
    sendError(res, 400, { code: "MISSING_STORE_ID", message: "storeId is required." });
    return;
  }

  if (!items.length) {
    sendError(res, 400, { code: "MISSING_TARGETS", message: "At least one inquiry must be selected." });
    return;
  }

  try {
    await handleTrackedInquiryAction({
      storeId,
      items,
      kind: "product",
      actionKey: "answer-product-inquiry",
      detailLabel: "상품 문의 답변 저장",
      execute: saveProductInquiryAnswers,
      res,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save NAVER product inquiry answer.";
    sendError(res, getErrorStatus(message), {
      code: buildErrorCode(message),
      message,
    });
  }
});

export default router;
