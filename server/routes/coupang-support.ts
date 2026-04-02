import { Router } from "express";
import type {
  CoupangInquiryAnswerResponse,
  CoupangInquiryConfirmResponse,
  CreateCoupangOutboundCenterInput,
  CreateCoupangReturnCenterInput,
  UpdateCoupangOutboundCenterInput,
  UpdateCoupangReturnCenterInput,
} from "@shared/coupang-support";
import {
  answerCoupangCallCenterInquiry,
  answerCoupangProductInquiry,
  confirmCoupangCallCenterInquiry,
  createCoupangOutboundCenter,
  createCoupangReturnCenter,
  listCoupangCallCenterInquiries,
  listCoupangCategories,
  listCoupangOutboundCenters,
  listCoupangProductInquiries,
  listCoupangReturnCenters,
  listCoupangRocketGrowthInventory,
  listCoupangRocketGrowthOrders,
  listCoupangRocketGrowthProducts,
  updateCoupangOutboundCenter,
  updateCoupangReturnCenter,
} from "../services/coupang/support-service";
import {
  registerOperationRetryHandler,
  runTrackedOperation,
  summarizeResult,
} from "../services/operations/service";
import { sendData, sendError } from "../services/shared/api-response";

const router = Router();

const COUPANG_LOGISTICS_MENU_KEY = "coupang.logistics";
const COUPANG_INQUIRIES_MENU_KEY = "coupang.inquiries";
const COUPANG_ROCKET_GROWTH_MENU_KEY = "coupang.rocket-growth";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

function asOptionalString(value: unknown) {
  const normalized = asString(value).trim();
  return normalized || null;
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

function parsePositiveInteger(value: unknown, fallback: number, max = 100) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), max) : fallback;
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

function asItemList(value: unknown) {
  return Array.isArray(value) ? value : Array.isArray((value as { items?: unknown[] } | null)?.items)
    ? (((value as { items?: unknown[] }).items ?? []) as unknown[])
    : [];
}

function buildInquiryAnswerPayload(input: {
  storeId: string;
  inquiryId: string;
  content: string;
  replyBy: string;
}) {
  return {
    storeId: input.storeId,
    inquiryId: input.inquiryId,
    content: input.content,
    replyBy: input.replyBy,
  };
}

function buildCallCenterConfirmPayload(input: {
  storeId: string;
  inquiryId: string;
  confirmBy: string;
}) {
  return {
    storeId: input.storeId,
    inquiryId: input.inquiryId,
    confirmBy: input.confirmBy,
  };
}

function buildCallCenterAnswerPayload(input: {
  storeId: string;
  inquiryId: string;
  content: string;
  replyBy: string;
  parentAnswerId: string;
}) {
  return {
    storeId: input.storeId,
    inquiryId: input.inquiryId,
    content: input.content,
    replyBy: input.replyBy,
    parentAnswerId: input.parentAnswerId,
  };
}

function parseOutboundAddresses(value: unknown): CreateCoupangOutboundCenterInput["placeAddresses"] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      addressType: asString(item.addressType),
      countryCode: asString(item.countryCode),
      companyContactNumber: asString(item.companyContactNumber),
      phoneNumber2: asOptionalString(item.phoneNumber2),
      returnZipCode: asString(item.returnZipCode),
      returnAddress: asString(item.returnAddress),
      returnAddressDetail: asString(item.returnAddressDetail),
    };
  });
}

function parseOutboundRemoteInfos(value: unknown): CreateCoupangOutboundCenterInput["remoteInfos"] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      remoteInfoId: asOptionalString(item.remoteInfoId),
      deliveryCode: asString(item.deliveryCode),
      jeju: asNumber(item.jeju) ?? 0,
      notJeju: asNumber(item.notJeju) ?? 0,
      usable: asBoolean(item.usable),
    };
  });
}

function parseReturnAddresses(value: unknown): CreateCoupangReturnCenterInput["placeAddresses"] {
  return asItemList(value).map((rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? (rawItem as JsonRecord) : {};
    return {
      addressType: asString(item.addressType),
      countryCode: asString(item.countryCode),
      companyContactNumber: asString(item.companyContactNumber),
      phoneNumber2: asOptionalString(item.phoneNumber2),
      returnZipCode: asString(item.returnZipCode),
      returnAddress: asString(item.returnAddress),
      returnAddressDetail: asString(item.returnAddressDetail),
    };
  });
}

function parseReturnGoodsflow(value: unknown): CreateCoupangReturnCenterInput["goodsflowInfo"] {
  const item = value && typeof value === "object" ? (value as JsonRecord) : {};
  return {
    deliverCode: asOptionalString(item.deliverCode),
    deliverName: asOptionalString(item.deliverName),
    contractNumber: asOptionalString(item.contractNumber),
    contractCustomerNumber: asOptionalString(item.contractCustomerNumber),
    vendorCreditFee02kg: asNumber(item.vendorCreditFee02kg),
    vendorCreditFee05kg: asNumber(item.vendorCreditFee05kg),
    vendorCreditFee10kg: asNumber(item.vendorCreditFee10kg),
    vendorCreditFee20kg: asNumber(item.vendorCreditFee20kg),
    vendorCashFee02kg: asNumber(item.vendorCashFee02kg),
    vendorCashFee05kg: asNumber(item.vendorCashFee05kg),
    vendorCashFee10kg: asNumber(item.vendorCashFee10kg),
    vendorCashFee20kg: asNumber(item.vendorCashFee20kg),
    consumerCashFee02kg: asNumber(item.consumerCashFee02kg),
    consumerCashFee05kg: asNumber(item.consumerCashFee05kg),
    consumerCashFee10kg: asNumber(item.consumerCashFee10kg),
    consumerCashFee20kg: asNumber(item.consumerCashFee20kg),
    returnFee02kg: asNumber(item.returnFee02kg),
    returnFee05kg: asNumber(item.returnFee05kg),
    returnFee10kg: asNumber(item.returnFee10kg),
    returnFee20kg: asNumber(item.returnFee20kg),
  };
}

registerOperationRetryHandler(
  {
    channel: "coupang",
    menuKey: COUPANG_INQUIRIES_MENU_KEY,
    actionKey: "answer-product-inquiry",
  },
  async ({ operation, requestPayload }) => {
    const request = (requestPayload ?? {}) as JsonRecord;
    const storeId = asString(request.storeId);
    const inquiryId = asString(request.inquiryId);
    const content = asString(request.content);
    const replyBy = asString(request.replyBy);

    if (!storeId || !inquiryId || !content || !replyBy) {
      throw new Error("storeId, inquiryId, content, replyBy are required for retry.");
    }

    return runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_INQUIRIES_MENU_KEY,
      actionKey: "answer-product-inquiry",
      mode: "retry",
      targetType: "selection",
      targetCount: 1,
      targetIds: [inquiryId],
      requestPayload: buildInquiryAnswerPayload({
        storeId,
        inquiryId,
        content,
        replyBy,
      }),
      normalizedPayload: buildInquiryAnswerPayload({
        storeId,
        inquiryId,
        content,
        replyBy,
      }),
      retryable: true,
      retryOfOperationId: operation.id,
      execute: async () => {
        const data = await answerCoupangProductInquiry({
          storeId,
          inquiryId,
          content,
          replyBy,
        });

        return {
          data,
          status: "success" as const,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: `상품 문의 ${inquiryId}`,
            preview: content,
          }),
        };
      },
    });
  },
);

router.get("/logistics/categories", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listCoupangCategories({
        storeId,
        registrationType: req.query.registrationType === "RFM" ? "RFM" : "ALL",
        query: typeof req.query.query === "string" ? req.query.query : undefined,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CATEGORY_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang categories.",
    });
  }
});

router.get("/logistics/outbound-centers", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(res, await listCoupangOutboundCenters({ storeId }));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_OUTBOUND_CENTER_READ_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang outbound centers.",
    });
  }
});

router.get("/logistics/return-centers", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(res, await listCoupangReturnCenters({ storeId }));
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_RETURN_CENTER_READ_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang return centers.",
    });
  }
});

router.post("/logistics/outbound-centers", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const userId = asString(req.body?.userId).trim();
    const shippingPlaceName = asString(req.body?.shippingPlaceName).trim();
    const placeAddresses = parseOutboundAddresses(req.body?.placeAddresses);
    const remoteInfos = parseOutboundRemoteInfos(req.body?.remoteInfos);

    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!userId || !shippingPlaceName || !placeAddresses.length) {
      sendError(res, 400, {
        code: "INVALID_OUTBOUND_CENTER_INPUT",
        message: "userId, shippingPlaceName, placeAddresses are required.",
      });
      return;
    }

    const requestPayload = {
      storeId,
      userId,
      shippingPlaceName,
      placeAddresses,
      remoteInfos,
      usable: asBoolean(req.body?.usable),
      global: asBoolean(req.body?.global),
    } satisfies CreateCoupangOutboundCenterInput;

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_LOGISTICS_MENU_KEY,
      actionKey: "create-outbound-center",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [shippingPlaceName],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await createCoupangOutboundCenter(requestPayload);
        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: shippingPlaceName,
            preview: data.centerCode,
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
      code: "COUPANG_OUTBOUND_CENTER_CREATE_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to create Coupang outbound center.",
    });
  }
});

router.put("/logistics/outbound-centers/:outboundShippingPlaceCode", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const userId = asString(req.body?.userId).trim();
    const shippingPlaceName = asString(req.body?.shippingPlaceName).trim();
    const outboundShippingPlaceCode = asString(req.params.outboundShippingPlaceCode).trim();
    const placeAddresses = parseOutboundAddresses(req.body?.placeAddresses);
    const remoteInfos = parseOutboundRemoteInfos(req.body?.remoteInfos);

    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!outboundShippingPlaceCode || !userId || !shippingPlaceName || !placeAddresses.length) {
      sendError(res, 400, {
        code: "INVALID_OUTBOUND_CENTER_UPDATE_INPUT",
        message:
          "outboundShippingPlaceCode, userId, shippingPlaceName, placeAddresses are required.",
      });
      return;
    }

    const requestPayload = {
      storeId,
      outboundShippingPlaceCode,
      userId,
      shippingPlaceName,
      placeAddresses,
      remoteInfos,
      usable: asBoolean(req.body?.usable),
      global: asBoolean(req.body?.global),
    } satisfies UpdateCoupangOutboundCenterInput;

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_LOGISTICS_MENU_KEY,
      actionKey: "update-outbound-center",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [outboundShippingPlaceCode],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await updateCoupangOutboundCenter(requestPayload);
        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: outboundShippingPlaceCode,
            preview: shippingPlaceName,
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
      code: "COUPANG_OUTBOUND_CENTER_UPDATE_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to update Coupang outbound center.",
    });
  }
});

router.post("/logistics/return-centers", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const userId = asString(req.body?.userId).trim();
    const shippingPlaceName = asString(req.body?.shippingPlaceName).trim();
    const placeAddresses = parseReturnAddresses(req.body?.placeAddresses);
    const goodsflowInfo = parseReturnGoodsflow(req.body?.goodsflowInfo);

    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!userId || !shippingPlaceName || !placeAddresses.length) {
      sendError(res, 400, {
        code: "INVALID_RETURN_CENTER_INPUT",
        message: "userId, shippingPlaceName, placeAddresses are required.",
      });
      return;
    }

    const requestPayload = {
      storeId,
      userId,
      shippingPlaceName,
      placeAddresses,
      goodsflowInfo,
    } satisfies CreateCoupangReturnCenterInput;

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_LOGISTICS_MENU_KEY,
      actionKey: "create-return-center",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [shippingPlaceName],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await createCoupangReturnCenter(requestPayload);
        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: shippingPlaceName,
            preview: data.centerCode,
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
      code: "COUPANG_RETURN_CENTER_CREATE_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to create Coupang return center.",
    });
  }
});

router.put("/logistics/return-centers/:returnCenterCode", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const userId = asString(req.body?.userId).trim();
    const returnCenterCode = asString(req.params.returnCenterCode).trim();
    const shippingPlaceName = asOptionalString(req.body?.shippingPlaceName);
    const placeAddresses = parseReturnAddresses(req.body?.placeAddresses);
    const goodsflowInfo = parseReturnGoodsflow(req.body?.goodsflowInfo);

    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!returnCenterCode || !userId || !placeAddresses.length) {
      sendError(res, 400, {
        code: "INVALID_RETURN_CENTER_UPDATE_INPUT",
        message: "returnCenterCode, userId, placeAddresses are required.",
      });
      return;
    }

    const requestPayload = {
      storeId,
      returnCenterCode,
      userId,
      shippingPlaceName,
      usable: asBoolean(req.body?.usable),
      placeAddresses,
      goodsflowInfo,
    } satisfies UpdateCoupangReturnCenterInput;

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_LOGISTICS_MENU_KEY,
      actionKey: "update-return-center",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [returnCenterCode],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await updateCoupangReturnCenter(requestPayload);
        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: returnCenterCode,
            preview: shippingPlaceName,
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
      code: "COUPANG_RETURN_CENTER_UPDATE_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to update Coupang return center.",
    });
  }
});

router.get("/inquiries/product", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listCoupangProductInquiries({
        storeId,
        answeredType:
          req.query.answeredType === "ANSWERED" || req.query.answeredType === "NOANSWER"
            ? req.query.answeredType
            : "ALL",
        inquiryStartAt:
          typeof req.query.inquiryStartAt === "string"
            ? req.query.inquiryStartAt
            : new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        inquiryEndAt:
          typeof req.query.inquiryEndAt === "string"
            ? req.query.inquiryEndAt
            : new Date().toISOString().slice(0, 10),
        pageSize: parsePositiveInteger(req.query.pageSize, 20, 50),
        pageNum: parsePositiveInteger(req.query.pageNum, 1, 100),
        query: typeof req.query.query === "string" ? req.query.query : undefined,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_PRODUCT_INQUIRIES_READ_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang product inquiries.",
    });
  }
});

router.get("/inquiries/call-center", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listCoupangCallCenterInquiries({
        storeId,
        partnerCounselingStatus:
          req.query.partnerCounselingStatus === "ANSWER" ||
          req.query.partnerCounselingStatus === "NO_ANSWER" ||
          req.query.partnerCounselingStatus === "TRANSFER"
            ? req.query.partnerCounselingStatus
            : "NONE",
        inquiryStartAt:
          typeof req.query.inquiryStartAt === "string" ? req.query.inquiryStartAt : undefined,
        inquiryEndAt:
          typeof req.query.inquiryEndAt === "string" ? req.query.inquiryEndAt : undefined,
        vendorItemId: typeof req.query.vendorItemId === "string" ? req.query.vendorItemId : undefined,
        orderId: typeof req.query.orderId === "string" ? req.query.orderId : undefined,
        pageSize: parsePositiveInteger(req.query.pageSize, 20, 30),
        pageNum: parsePositiveInteger(req.query.pageNum, 1, 100),
        query: typeof req.query.query === "string" ? req.query.query : undefined,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CALL_CENTER_INQUIRIES_READ_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang call center inquiries.",
    });
  }
});

router.post("/inquiries/product/answer", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const inquiryId = asString(req.body?.inquiryId).trim();
    const content = asString(req.body?.content).trim();
    const replyBy = asString(req.body?.replyBy).trim();

    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!inquiryId) {
      sendError(res, 400, {
        code: "MISSING_INQUIRY_ID",
        message: "inquiryId is required.",
      });
      return;
    }
    if (!content) {
      sendError(res, 400, {
        code: "MISSING_ANSWER_CONTENT",
        message: "content is required.",
      });
      return;
    }
    if (!replyBy) {
      sendError(res, 400, {
        code: "MISSING_REPLY_BY",
        message: "replyBy is required.",
      });
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_INQUIRIES_MENU_KEY,
      actionKey: "answer-product-inquiry",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [inquiryId],
      requestPayload: buildInquiryAnswerPayload({
        storeId,
        inquiryId,
        content,
        replyBy,
      }),
      normalizedPayload: buildInquiryAnswerPayload({
        storeId,
        inquiryId,
        content,
        replyBy,
      }),
      retryable: true,
      execute: async () => {
        const data = await answerCoupangProductInquiry({
          storeId,
          inquiryId,
          content,
          replyBy,
        });

        return {
          data,
          status: "success" as const,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: `상품 문의 ${inquiryId}`,
            preview: content,
          }),
        };
      },
    });

    sendData(res, {
      ...(tracked.data as CoupangInquiryAnswerResponse),
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_INQUIRY_ANSWER_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to answer Coupang product inquiry.",
    });
  }
});

router.post("/inquiries/call-center/confirm", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const inquiryId = asString(req.body?.inquiryId).trim();
    const confirmBy = asString(req.body?.confirmBy).trim();

    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!inquiryId || !confirmBy) {
      sendError(res, 400, {
        code: "INVALID_CALL_CENTER_CONFIRM_INPUT",
        message: "inquiryId and confirmBy are required.",
      });
      return;
    }

    const requestPayload = buildCallCenterConfirmPayload({
      storeId,
      inquiryId,
      confirmBy,
    });

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_INQUIRIES_MENU_KEY,
      actionKey: "confirm-call-center-inquiry",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [inquiryId],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await confirmCoupangCallCenterInquiry(requestPayload);

        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: `콜센터 문의 ${inquiryId}`,
            preview: confirmBy,
          }),
        };
      },
    });

    sendData(res, {
      ...(tracked.data satisfies CoupangInquiryConfirmResponse),
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CALL_CENTER_CONFIRM_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to confirm Coupang call center inquiry.",
    });
  }
});

router.post("/inquiries/call-center/answer", async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId).trim();
    const inquiryId = asString(req.body?.inquiryId).trim();
    const content = asString(req.body?.content).trim();
    const replyBy = asString(req.body?.replyBy).trim();
    const parentAnswerId = asString(req.body?.parentAnswerId).trim();

    if (!ensureStoreId(res, storeId)) {
      return;
    }
    if (!inquiryId || !content || !replyBy || !parentAnswerId) {
      sendError(res, 400, {
        code: "INVALID_CALL_CENTER_ANSWER_INPUT",
        message: "inquiryId, content, replyBy, parentAnswerId are required.",
      });
      return;
    }

    const requestPayload = buildCallCenterAnswerPayload({
      storeId,
      inquiryId,
      content,
      replyBy,
      parentAnswerId,
    });

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_INQUIRIES_MENU_KEY,
      actionKey: "answer-call-center-inquiry",
      mode: "foreground",
      targetType: "selection",
      targetCount: 1,
      targetIds: [inquiryId],
      requestPayload,
      normalizedPayload: requestPayload,
      retryable: false,
      execute: async () => {
        const data = await answerCoupangCallCenterInquiry(requestPayload);

        return {
          data,
          resultSummary: summarizeResult({
            headline: data.message,
            detail: `콜센터 문의 ${inquiryId}`,
            preview: content.slice(0, 120),
          }),
        };
      },
    });

    sendData(res, {
      ...(tracked.data satisfies CoupangInquiryAnswerResponse),
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CALL_CENTER_ANSWER_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to answer Coupang call center inquiry.",
    });
  }
});

router.get("/rocket-growth/products", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listCoupangRocketGrowthProducts({
        storeId,
        sellerProductName:
          typeof req.query.sellerProductName === "string" ? req.query.sellerProductName : undefined,
        nextToken: typeof req.query.nextToken === "string" ? req.query.nextToken : null,
        maxPerPage: parsePositiveInteger(req.query.maxPerPage, 20, 100),
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_ROCKET_GROWTH_PRODUCTS_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang Rocket Growth products.",
    });
  }
});

router.get("/rocket-growth/inventory", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listCoupangRocketGrowthInventory({
        storeId,
        vendorItemId:
          typeof req.query.vendorItemId === "string" ? req.query.vendorItemId : undefined,
        nextToken: typeof req.query.nextToken === "string" ? req.query.nextToken : null,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_ROCKET_GROWTH_INVENTORY_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang Rocket Growth inventory.",
    });
  }
});

router.get("/rocket-growth/orders", async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listCoupangRocketGrowthOrders({
        storeId,
        paidDateFrom:
          typeof req.query.paidDateFrom === "string"
            ? req.query.paidDateFrom
            : new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        paidDateTo:
          typeof req.query.paidDateTo === "string"
            ? req.query.paidDateTo
            : new Date().toISOString().slice(0, 10),
        nextToken: typeof req.query.nextToken === "string" ? req.query.nextToken : null,
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_ROCKET_GROWTH_ORDERS_FAILED",
      message:
        error instanceof Error ? error.message : "Failed to load Coupang Rocket Growth orders.",
    });
  }
});

export default router;
