import type { RequestHandler } from "express";
import type { NaverBulkPriceTarget } from "@shared/naver-products";
import {
  NAVER_PRODUCT_LIST_DEFAULT_PAGE,
  NAVER_PRODUCT_LIST_DEFAULT_SIZE,
  NAVER_PRODUCT_LIST_MAX_ITEMS_LIMIT,
  NAVER_PRODUCT_LIST_PAGE_SIZE_MAX,
} from "@shared/naver-products";
import {
  bulkUpdateNaverProductSalePrices,
  fetchNaverProductPricePreview,
  fetchNaverProducts,
  previewNaverProductSalePrices,
  updateNaverProductSalePrice,
} from "../../services/naver-product-service";
import {
  createNaverProductStatusDraft,
  updateNaverProductMemo,
} from "../../services/naver-product-action-service";
import {
  registerOperationRetryHandler,
  runTrackedOperation,
  summarizeResult,
} from "../../services/operations/service";
import { scheduleAutoPlatformFieldSyncRuns } from "../../services/platform-field-sync-service";
import { sendData, sendError } from "../../services/shared/api-response";
import { sendMessageBasedError } from "../responders/message-based-error";
import {
  buildOperationSummaryText,
  resolveTrackedOperationStatus,
} from "../responders/operation-summary";

const NAVER_PRODUCTS_MENU_KEY = "naver.products";
const NAVER_BULK_UPDATE_ACTION_KEY = "bulk-price-update";
const INVALID_ERROR_PATTERNS = [
  "required",
  "selected",
  "Current price",
  "greater than 0",
  "same as",
  "invalid",
  "not found",
  "not a NAVER",
];

let retryHandlersRegistered = false;

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.max(1, Math.floor(parsed));
  return typeof max === "number" ? Math.min(normalized, max) : normalized;
}

function parseBulkTargets(body: unknown): NaverBulkPriceTarget[] {
  const rawItems = Array.isArray((body as { items?: unknown[] } | null)?.items)
    ? ((body as { items: unknown[] }).items ?? [])
    : [];

  return rawItems.map((rawItem, index) => {
    const item =
      rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};
    const rawPrice = item.newPrice;
    const parsedPrice =
      typeof rawPrice === "number"
        ? rawPrice
        : typeof rawPrice === "string" && rawPrice.trim() !== ""
          ? Number(rawPrice)
          : null;

    return {
      rowId:
        typeof item.rowId === "string" && item.rowId.trim() !== ""
          ? item.rowId
          : `row-${index + 1}`,
      originProductNo: typeof item.originProductNo === "string" ? item.originProductNo : "",
      channelProductNo:
        typeof item.channelProductNo === "string" ? item.channelProductNo : null,
      newPrice: parsedPrice !== null && Number.isFinite(parsedPrice) ? parsedPrice : null,
    } satisfies NaverBulkPriceTarget;
  });
}

function buildBulkUpdatePayload(storeId: string, items: NaverBulkPriceTarget[]) {
  return {
    storeId,
    itemCount: items.length,
    targetIds: items.map((item) => item.originProductNo),
    items: items.map((item) => ({
      rowId: item.rowId,
      originProductNo: item.originProductNo,
      channelProductNo: item.channelProductNo,
      newPrice: item.newPrice,
    })),
  };
}

async function runTrackedBulkUpdate(input: {
  mode: "foreground" | "retry";
  storeId: string;
  items: NaverBulkPriceTarget[];
  retryOfOperationId?: string;
}) {
  return runTrackedOperation({
    channel: "naver",
    menuKey: NAVER_PRODUCTS_MENU_KEY,
    actionKey: NAVER_BULK_UPDATE_ACTION_KEY,
    mode: input.mode,
    targetType: "selection",
    targetCount: input.items.length,
    targetIds: input.items.map((item) => item.originProductNo),
    requestPayload: {
      storeId: input.storeId,
      items: input.items,
    },
    normalizedPayload: buildBulkUpdatePayload(input.storeId, input.items),
    retryable: true,
    retryOfOperationId: input.retryOfOperationId ?? null,
    execute: async () => {
      const data = await bulkUpdateNaverProductSalePrices({
        storeId: input.storeId,
        items: input.items,
      });

      return {
        data,
        status: resolveTrackedOperationStatus(data.summary),
        normalizedPayload: buildBulkUpdatePayload(input.storeId, input.items),
        resultSummary: summarizeResult({
          headline: buildOperationSummaryText(data.summary),
          detail: `NAVER 상품 ${input.items.length}건 가격 반영`,
          stats: data.summary,
          preview: buildOperationSummaryText(data.summary),
        }),
      };
    },
  });
}

function ensureStoreId(res: Parameters<typeof sendError>[0], storeId: string) {
  if (storeId) {
    return true;
  }

  sendError(res, 400, {
    code: "MISSING_STORE_ID",
    message: "storeId is required.",
  });
  return false;
}

export function registerNaverProductRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerOperationRetryHandler(
    {
      channel: "naver",
      menuKey: NAVER_PRODUCTS_MENU_KEY,
      actionKey: NAVER_BULK_UPDATE_ACTION_KEY,
    },
    async ({ operation, requestPayload }) => {
      const request = (requestPayload ?? {}) as Record<string, unknown>;
      const items = parseBulkTargets({
        items: Array.isArray(request.items) ? request.items : [],
      });
      const storeId = typeof request.storeId === "string" ? request.storeId : "";

      return runTrackedBulkUpdate({
        mode: "retry",
        storeId,
        items,
        retryOfOperationId: operation.id,
      });
    },
  );
}

export const previewBulkPriceHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const items = parseBulkTargets(req.body);

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!items.length) {
    sendError(res, 400, {
      code: "MISSING_TARGETS",
      message: "At least one product must be selected.",
    });
    return;
  }

  try {
    sendData(res, await previewNaverProductSalePrices({ storeId, items }));
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: INVALID_ERROR_PATTERNS,
      invalidCode: "INVALID_NAVER_REQUEST",
      apiFailedCode: "NAVER_API_FAILED",
      fallbackMessage: "Failed to load NAVER bulk price preview.",
    });
  }
};

export const applyBulkPricesHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const items = parseBulkTargets(req.body);

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!items.length) {
    sendError(res, 400, {
      code: "MISSING_TARGETS",
      message: "At least one product must be selected.",
    });
    return;
  }

  try {
    const tracked = await runTrackedBulkUpdate({
      mode: "foreground",
      storeId,
      items,
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: INVALID_ERROR_PATTERNS,
      invalidCode: "INVALID_NAVER_REQUEST",
      apiFailedCode: "NAVER_API_FAILED",
      fallbackMessage: "Failed to update NAVER sale prices.",
    });
  }
};

export const getPricePreviewHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
  const originProductNo =
    typeof req.query.originProductNo === "string" ? req.query.originProductNo : null;
  const channelProductNo =
    typeof req.query.channelProductNo === "string" ? req.query.channelProductNo : null;

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  try {
    sendData(
      res,
      await fetchNaverProductPricePreview({
        storeId,
        originProductNo,
        channelProductNo,
      }),
    );
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: INVALID_ERROR_PATTERNS,
      invalidCode: "INVALID_NAVER_REQUEST",
      apiFailedCode: "NAVER_API_FAILED",
      fallbackMessage: "Failed to load NAVER price preview.",
    });
  }
};

export const updatePriceHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const originProductNo =
    typeof req.body?.originProductNo === "string" ? req.body.originProductNo : "";
  const channelProductNo =
    typeof req.body?.channelProductNo === "string" ? req.body.channelProductNo : null;
  const newPrice = Number(req.body?.newPrice);

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!originProductNo) {
    sendError(res, 400, {
      code: "MISSING_ORIGIN_PRODUCT_NO",
      message: "originProductNo is required.",
    });
    return;
  }

  try {
    sendData(
      res,
      await updateNaverProductSalePrice({
        storeId,
        originProductNo,
        channelProductNo,
        newPrice,
      }),
    );
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: INVALID_ERROR_PATTERNS,
      invalidCode: "INVALID_NAVER_REQUEST",
      apiFailedCode: "NAVER_API_FAILED",
      fallbackMessage: "Failed to update NAVER sale price.",
    });
  }
};

export const createStatusDraftHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const originProductNo =
    typeof req.body?.originProductNo === "string" ? req.body.originProductNo : "";
  const channelProductNo =
    typeof req.body?.channelProductNo === "string" ? req.body.channelProductNo : null;
  const productName = typeof req.body?.productName === "string" ? req.body.productName : "";

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!originProductNo) {
    sendError(res, 400, {
      code: "MISSING_ORIGIN_PRODUCT_NO",
      message: "originProductNo is required.",
    });
    return;
  }

  try {
    sendData(
      res,
      await createNaverProductStatusDraft({
        storeId,
        originProductNo,
        channelProductNo,
        productName,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "NAVER_DRAFT_CREATE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Failed to create NAVER sale status draft.",
    });
  }
};

export const updateMemoHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const originProductNo =
    typeof req.body?.originProductNo === "string" ? req.body.originProductNo : "";
  const productName =
    typeof req.body?.productName === "string" ? req.body.productName : null;
  const memo = typeof req.body?.memo === "string" ? req.body.memo : "";

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!originProductNo) {
    sendError(res, 400, {
      code: "MISSING_ORIGIN_PRODUCT_NO",
      message: "originProductNo is required.",
    });
    return;
  }

  try {
    sendData(
      res,
      await updateNaverProductMemo({
        storeId,
        originProductNo,
        productName,
        memo,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "NAVER_MEMO_SAVE_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to save NAVER product memo.",
    });
  }
};

export const listProductsHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
  const allQuery = Array.isArray(req.query.all) ? req.query.all[0] : req.query.all;
  const all = allQuery === "true" || allQuery === "1";
  const refreshQuery = Array.isArray(req.query.refresh)
    ? req.query.refresh[0]
    : req.query.refresh;
  const refresh = refreshQuery === "true" || refreshQuery === "1";

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  const page = parsePositiveInteger(req.query.page, NAVER_PRODUCT_LIST_DEFAULT_PAGE);
  const size = parsePositiveInteger(
    req.query.size,
    NAVER_PRODUCT_LIST_DEFAULT_SIZE,
    NAVER_PRODUCT_LIST_PAGE_SIZE_MAX,
  );
  const hasMaxItems = req.query.maxItems !== undefined;
  const maxItems = hasMaxItems
    ? parsePositiveInteger(req.query.maxItems, size, NAVER_PRODUCT_LIST_MAX_ITEMS_LIMIT)
    : null;

  try {
    const result = await fetchNaverProducts({
      storeId,
      page,
      size,
      maxItems,
      all,
      refresh,
      includeSellerBarcodes: true,
    });
    sendData(res, result);

    if (refresh) {
      void scheduleAutoPlatformFieldSyncRuns({
        channel: "naver",
        storeId,
        refreshSource: true,
      });
    }
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: INVALID_ERROR_PATTERNS,
      invalidCode: "INVALID_NAVER_REQUEST",
      apiFailedCode: "NAVER_API_FAILED",
      fallbackMessage: "Failed to load NAVER product list.",
    });
  }
};
