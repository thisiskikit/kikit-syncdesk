import { Router } from "express";
import type {
  ApplyCoupangCashbackInput,
  AttachCoupangDownloadCouponItemsInput,
  AttachCoupangInstantCouponItemsInput,
  CreateCoupangDownloadCouponInput,
  CreateCoupangInstantCouponInput,
  ExpireCoupangDownloadCouponInput,
  ExpireCoupangInstantCouponInput,
  RemoveCoupangCashbackInput,
} from "@shared/coupang-promo";
import {
  applyCashback,
  attachDownloadCouponItems,
  attachInstantCouponItems,
  createDownloadCoupon,
  createInstantCoupon,
  expireDownloadCoupon,
  expireInstantCoupon,
  getCashbackRule,
  getCouponRequestStatus,
  getDownloadCouponDetail,
  getInstantCouponDetail,
  listCouponBudgets,
  listCouponContracts,
  listInstantCouponItems,
  listInstantCoupons,
  removeCashback,
} from "../services/coupang/coupon-service";
import { runTrackedOperation, summarizeResult } from "../services/operations/service";
import { sendData, sendError } from "../services/shared/api-response";

const router = Router();
const COUPANG_COUPONS_MENU_KEY = "coupang.coupons";

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function asStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function ensureStoreId(res: Parameters<typeof sendData>[0], storeId: string) {
  if (storeId) {
    return true;
  }

  sendError(res, 400, {
    code: "MISSING_STORE_ID",
    message: "storeId is required.",
  });
  return false;
}

router.get("/promotions/contracts", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(res, await listCouponContracts({ storeId }));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CONTRACTS_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang contracts.",
    });
  }
});

router.get("/promotions/budgets", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listCouponBudgets({
        storeId,
        contractId: typeof req.query.contractId === "string" ? req.query.contractId : null,
        targetMonth: typeof req.query.targetMonth === "string" ? req.query.targetMonth : null,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_BUDGETS_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang coupon budgets.",
    });
  }
});

router.get("/promotions/instant-coupons", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listInstantCoupons({
        storeId,
        status: typeof req.query.status === "string" ? req.query.status : "APPLIED",
        page: asNumber(req.query.page) ?? 1,
        size: asNumber(req.query.size) ?? 20,
        sort: req.query.sort === "asc" ? "asc" : "desc",
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_INSTANT_COUPONS_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang instant coupons.",
    });
  }
});

router.get("/promotions/instant-coupons/:couponId", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const couponId = asString(req.params.couponId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(res, await getInstantCouponDetail({ storeId, couponId }));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_INSTANT_COUPON_DETAIL_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang instant coupon detail.",
    });
  }
});

router.get("/promotions/instant-coupons/:couponId/items", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const couponId = asString(req.params.couponId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listInstantCouponItems({
        storeId,
        couponId,
        status: typeof req.query.status === "string" ? req.query.status : "APPLIED",
        page: asNumber(req.query.page) ?? 0,
        size: asNumber(req.query.size) ?? 20,
        sort: req.query.sort === "asc" ? "asc" : "desc",
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_INSTANT_COUPON_ITEMS_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang instant coupon items.",
    });
  }
});

router.get("/promotions/download-coupons/:couponId", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const couponId = asString(req.params.couponId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(res, await getDownloadCouponDetail({ storeId, couponId }));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_DOWNLOAD_COUPON_DETAIL_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang download coupon detail.",
    });
  }
});

router.get("/promotions/request-status", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const kind = req.query.kind === "download" ? "download" : "instant";
    const requestedId = typeof req.query.requestedId === "string" ? req.query.requestedId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!requestedId) {
      sendError(res, 400, {
        code: "MISSING_REQUEST_ID",
        message: "requestedId is required.",
      });
      return;
    }

    sendData(res, await getCouponRequestStatus({ storeId, kind, requestedId }));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_REQUEST_STATUS_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang request status.",
    });
  }
});

router.get("/promotions/cashback", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const ruleId = typeof req.query.ruleId === "string" ? req.query.ruleId : "";
    const vendorItemId = typeof req.query.vendorItemId === "string" ? req.query.vendorItemId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!ruleId || !vendorItemId) {
      sendError(res, 400, {
        code: "INVALID_CASHBACK_QUERY",
        message: "ruleId and vendorItemId are required.",
      });
      return;
    }

    sendData(res, await getCashbackRule({ storeId, ruleId, vendorItemId }));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CASHBACK_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang cashback rule.",
    });
  }
});

router.post("/promotions/instant-coupons", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const requestPayload = {
      storeId,
      contractId: asString(req.body?.contractId).trim(),
      name: asString(req.body?.name).trim(),
      type:
        req.body?.type === "RATE" || req.body?.type === "PRICE"
          ? req.body.type
          : "FIXED_WITH_QUANTITY",
      discount: asNumber(req.body?.discount) ?? 0,
      maxDiscountPrice: asNumber(req.body?.maxDiscountPrice) ?? 0,
      startAt: asString(req.body?.startAt).trim(),
      endAt: asString(req.body?.endAt).trim(),
      wowExclusive: asBoolean(req.body?.wowExclusive),
    } satisfies CreateCoupangInstantCouponInput;

    if (!requestPayload.contractId || !requestPayload.name || !requestPayload.startAt || !requestPayload.endAt) {
      sendError(res, 400, {
        code: "INVALID_INSTANT_COUPON_INPUT",
        message: "contractId, name, startAt, endAt are required.",
      });
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_COUPONS_MENU_KEY,
      actionKey: "create-instant-coupon",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [requestPayload.name],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await createInstantCoupon(requestPayload);
        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: requestPayload.name,
            preview: data.couponId ?? data.requestedId ?? null,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_INSTANT_COUPON_CREATE_FAILED",
      message: error instanceof Error ? error.message : "Failed to create Coupang instant coupon.",
    });
  }
});

router.post("/promotions/instant-coupons/:couponId/items", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const couponId = asString(req.params.couponId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const requestPayload = {
      storeId,
      couponId,
      vendorItemIds: asStringList(req.body?.vendorItemIds),
    } satisfies AttachCoupangInstantCouponItemsInput;

    if (!couponId || !requestPayload.vendorItemIds.length) {
      sendError(res, 400, {
        code: "INVALID_INSTANT_COUPON_ITEMS_INPUT",
        message: "couponId and vendorItemIds are required.",
      });
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_COUPONS_MENU_KEY,
      actionKey: "attach-instant-coupon-items",
      mode: "foreground",
      targetType: "selection",
      targetCount: requestPayload.vendorItemIds.length,
      targetIds: requestPayload.vendorItemIds,
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await attachInstantCouponItems(requestPayload);
        return {
          data,
          status:
            data.requestStatus?.status === "FAIL"
              ? "warning"
              : ("success" as const),
          resultSummary: summarizeResult({
            headline: data.message,
            detail: `coupon ${couponId}`,
            preview: data.requestedId ?? null,
            stats: data.requestStatus ? { ...data.requestStatus } : null,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_INSTANT_COUPON_ITEMS_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to attach Coupang instant coupon items.",
    });
  }
});

router.delete("/promotions/instant-coupons/:couponId", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const couponId = asString(req.params.couponId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const requestPayload = {
      storeId,
      couponId,
    } satisfies ExpireCoupangInstantCouponInput;

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_COUPONS_MENU_KEY,
      actionKey: "expire-instant-coupon",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [couponId],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await expireInstantCoupon(requestPayload);
        return {
          data,
          status:
            data.requestStatus?.status === "FAIL"
              ? "warning"
              : ("success" as const),
          resultSummary: summarizeResult({
            headline: data.message,
            detail: couponId,
            preview: data.requestedId ?? null,
            stats: data.requestStatus ? { ...data.requestStatus } : null,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_INSTANT_COUPON_EXPIRE_FAILED",
      message: error instanceof Error ? error.message : "Failed to expire Coupang instant coupon.",
    });
  }
});

router.post("/promotions/download-coupons", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const requestPayload = {
      storeId,
      contractId: asString(req.body?.contractId).trim(),
      title: asString(req.body?.title).trim(),
      userId: asString(req.body?.userId).trim(),
      startDate: asString(req.body?.startDate).trim(),
      endDate: asString(req.body?.endDate).trim(),
      couponPolicies: Array.isArray(req.body?.couponPolicies) ? req.body.couponPolicies : [],
    } satisfies CreateCoupangDownloadCouponInput;

    if (
      !requestPayload.contractId ||
      !requestPayload.title ||
      !requestPayload.userId ||
      !requestPayload.startDate ||
      !requestPayload.endDate ||
      !requestPayload.couponPolicies.length
    ) {
      sendError(res, 400, {
        code: "INVALID_DOWNLOAD_COUPON_INPUT",
        message:
          "contractId, title, userId, startDate, endDate, couponPolicies are required.",
      });
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_COUPONS_MENU_KEY,
      actionKey: "create-download-coupon",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [requestPayload.title],
      requestPayload: requestPayload as unknown as Record<string, unknown>,
      normalizedPayload: requestPayload as unknown as Record<string, unknown>,
      retryable: false,
      execute: async () => {
        const data = await createDownloadCoupon(requestPayload);
        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: requestPayload.title,
            preview: data.couponId ?? null,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_DOWNLOAD_COUPON_CREATE_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to create Coupang downloadable coupon.",
    });
  }
});

router.put("/promotions/download-coupons/:couponId/items", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const couponId = asString(req.params.couponId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const requestPayload = {
      storeId,
      couponId,
      userId: asString(req.body?.userId).trim(),
      vendorItemIds: asStringList(req.body?.vendorItemIds),
    } satisfies AttachCoupangDownloadCouponItemsInput;

    if (!requestPayload.userId || !requestPayload.vendorItemIds.length) {
      sendError(res, 400, {
        code: "INVALID_DOWNLOAD_COUPON_ITEMS_INPUT",
        message: "userId and vendorItemIds are required.",
      });
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_COUPONS_MENU_KEY,
      actionKey: "attach-download-coupon-items",
      mode: "foreground",
      targetType: "selection",
      targetCount: requestPayload.vendorItemIds.length,
      targetIds: requestPayload.vendorItemIds,
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await attachDownloadCouponItems(requestPayload);
        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: couponId,
            preview: requestPayload.vendorItemIds.slice(0, 5).join(", "),
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_DOWNLOAD_COUPON_ITEMS_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Failed to attach Coupang downloadable coupon items.",
    });
  }
});

router.post("/promotions/download-coupons/:couponId/expire", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const couponId = asString(req.params.couponId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const requestPayload = {
      storeId,
      couponId,
      userId: asString(req.body?.userId).trim(),
    } satisfies ExpireCoupangDownloadCouponInput;

    if (!requestPayload.userId) {
      sendError(res, 400, {
        code: "INVALID_DOWNLOAD_COUPON_EXPIRE_INPUT",
        message: "userId is required.",
      });
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_COUPONS_MENU_KEY,
      actionKey: "expire-download-coupon",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [couponId],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await expireDownloadCoupon(requestPayload);
        return {
          data,
          status:
            data.requestStatus?.status === "FAIL"
              ? "warning"
              : ("success" as const),
          resultSummary: summarizeResult({
            headline: data.message,
            detail: couponId,
            preview: data.requestTransactionId ?? null,
            stats: data.requestStatus ? { ...data.requestStatus } : null,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_DOWNLOAD_COUPON_EXPIRE_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to expire Coupang downloadable coupon.",
    });
  }
});

router.post("/promotions/cashback", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const requestPayload = {
      storeId,
      ruleId: asString(req.body?.ruleId).trim(),
      valueType: req.body?.valueType === "FIXED" ? "FIXED" : "FIXED_WITH_QUANTITY",
      value: asNumber(req.body?.value) ?? 0,
      maxAmount: asNumber(req.body?.maxAmount),
      vendorItemIds: asStringList(req.body?.vendorItemIds),
      startAt: asString(req.body?.startAt).trim(),
      endAt: asString(req.body?.endAt).trim(),
    } satisfies ApplyCoupangCashbackInput;

    if (!requestPayload.ruleId || !requestPayload.vendorItemIds.length || !requestPayload.startAt || !requestPayload.endAt) {
      sendError(res, 400, {
        code: "INVALID_CASHBACK_APPLY_INPUT",
        message: "ruleId, vendorItemIds, startAt, endAt are required.",
      });
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_COUPONS_MENU_KEY,
      actionKey: "apply-cashback",
      mode: "foreground",
      targetType: "selection",
      targetCount: requestPayload.vendorItemIds.length,
      targetIds: requestPayload.vendorItemIds,
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await applyCashback(requestPayload);
        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: requestPayload.ruleId,
            preview: requestPayload.vendorItemIds.slice(0, 5).join(", "),
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CASHBACK_APPLY_FAILED",
      message: error instanceof Error ? error.message : "Failed to apply Coupang cashback.",
    });
  }
});

router.delete("/promotions/cashback", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const ruleId = typeof req.query.ruleId === "string" ? req.query.ruleId : "";
    const vendorItemId = typeof req.query.vendorItemId === "string" ? req.query.vendorItemId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!ruleId || !vendorItemId) {
      sendError(res, 400, {
        code: "INVALID_CASHBACK_REMOVE_INPUT",
        message: "ruleId and vendorItemId are required.",
      });
      return;
    }

    const requestPayload = {
      storeId,
      ruleId,
      vendorItemId,
    } satisfies RemoveCoupangCashbackInput;

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_COUPONS_MENU_KEY,
      actionKey: "remove-cashback",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [vendorItemId],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await removeCashback(requestPayload);
        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: ruleId,
            preview: vendorItemId,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CASHBACK_REMOVE_FAILED",
      message: error instanceof Error ? error.message : "Failed to remove Coupang cashback.",
    });
  }
});

export default router;
