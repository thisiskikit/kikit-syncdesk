import type { RequestHandler } from "express";
import {
  NAVER_CLAIM_MAX_ITEMS,
  type NaverApproveCancelTarget,
  type NaverApproveReturnTarget,
  type NaverClaimActionResponse,
  type NaverClaimType,
  type NaverHoldExchangeTarget,
  type NaverHoldReturnTarget,
  type NaverRedeliverExchangeTarget,
  type NaverRejectExchangeTarget,
  type NaverRejectReturnTarget,
  type NaverReleaseExchangeHoldTarget,
  type NaverReleaseReturnHoldTarget,
} from "@shared/naver-claims";
import {
  approveCancel,
  approveReturn,
  holdExchange,
  holdReturn,
  listClaims,
  redeliverExchange,
  rejectExchange,
  rejectReturn,
  releaseExchangeHold,
  releaseReturnHold,
} from "../../services/naver-claim-service";
import {
  registerOperationRetryHandler,
  runTrackedOperation,
  summarizeResult,
} from "../../services/operations/service";
import { sendData, sendError } from "../../services/shared/api-response";
import { sendMessageBasedError } from "../responders/message-based-error";
import {
  buildOperationSummaryText,
  resolveTrackedOperationStatus,
} from "../responders/operation-summary";

const NAVER_CLAIMS_MENU_KEY = "naver.claims";
const CLAIM_INVALID_PATTERNS = ["required", "유효", "필요", "찾을 수 없습니다", "스토어"];

let retryHandlersRegistered = false;

function clampPositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.max(1, Math.floor(parsed));
  return typeof max === "number" ? Math.min(normalized, max) : normalized;
}

function parseBaseTarget(rawItem: unknown) {
  const item =
    rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};

  return {
    productOrderId:
      typeof item.productOrderId === "string"
        ? item.productOrderId
        : typeof item.productOrderId === "number"
          ? String(item.productOrderId)
          : "",
    claimId:
      typeof item.claimId === "string"
        ? item.claimId
        : typeof item.claimId === "number"
          ? String(item.claimId)
          : null,
    orderId:
      typeof item.orderId === "string"
        ? item.orderId
        : typeof item.orderId === "number"
          ? String(item.orderId)
          : null,
    productName: typeof item.productName === "string" ? item.productName : null,
  };
}

function getItems(body: unknown) {
  return Array.isArray((body as { items?: unknown[] } | null)?.items)
    ? ((body as { items: unknown[] }).items ?? [])
    : [];
}

function parseApproveCancelTargets(body: unknown): NaverApproveCancelTarget[] {
  return getItems(body).map((item) => parseBaseTarget(item));
}

function parseApproveReturnTargets(body: unknown): NaverApproveReturnTarget[] {
  return getItems(body).map((item) => parseBaseTarget(item));
}

function parseReleaseReturnHoldTargets(body: unknown): NaverReleaseReturnHoldTarget[] {
  return getItems(body).map((item) => parseBaseTarget(item));
}

function parseReleaseExchangeHoldTargets(body: unknown): NaverReleaseExchangeHoldTarget[] {
  return getItems(body).map((item) => parseBaseTarget(item));
}

function parseHoldReturnTargets(body: unknown): NaverHoldReturnTarget[] {
  return getItems(body).map((rawItem) => {
    const base = parseBaseTarget(rawItem);
    const item =
      rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};

    return {
      ...base,
      holdbackClassType:
        typeof item.holdbackClassType === "string" ? item.holdbackClassType : "",
      holdbackReason: typeof item.holdbackReason === "string" ? item.holdbackReason : "",
      holdbackReturnDetailReason:
        typeof item.holdbackReturnDetailReason === "string"
          ? item.holdbackReturnDetailReason
          : "",
      extraReturnFeeAmount: Number(item.extraReturnFeeAmount ?? 0),
    } satisfies NaverHoldReturnTarget;
  });
}

function parseRejectReturnTargets(body: unknown): NaverRejectReturnTarget[] {
  return getItems(body).map((rawItem) => {
    const base = parseBaseTarget(rawItem);
    const item =
      rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};

    return {
      ...base,
      rejectReturnReason:
        typeof item.rejectReturnReason === "string" ? item.rejectReturnReason : "",
    } satisfies NaverRejectReturnTarget;
  });
}

function parseHoldExchangeTargets(body: unknown): NaverHoldExchangeTarget[] {
  return getItems(body).map((rawItem) => {
    const base = parseBaseTarget(rawItem);
    const item =
      rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};

    return {
      ...base,
      holdbackClassType:
        typeof item.holdbackClassType === "string" ? item.holdbackClassType : "",
      holdbackReason: typeof item.holdbackReason === "string" ? item.holdbackReason : "",
      holdbackExchangeDetailReason:
        typeof item.holdbackExchangeDetailReason === "string"
          ? item.holdbackExchangeDetailReason
          : "",
      extraExchangeFeeAmount: Number(item.extraExchangeFeeAmount ?? 0),
    } satisfies NaverHoldExchangeTarget;
  });
}

function parseRejectExchangeTargets(body: unknown): NaverRejectExchangeTarget[] {
  return getItems(body).map((rawItem) => {
    const base = parseBaseTarget(rawItem);
    const item =
      rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};

    return {
      ...base,
      rejectExchangeReason:
        typeof item.rejectExchangeReason === "string" ? item.rejectExchangeReason : "",
    } satisfies NaverRejectExchangeTarget;
  });
}

function parseRedeliverExchangeTargets(body: unknown): NaverRedeliverExchangeTarget[] {
  return getItems(body).map((rawItem) => {
    const base = parseBaseTarget(rawItem);
    const item =
      rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};

    return {
      ...base,
      reDeliveryMethod:
        typeof item.reDeliveryMethod === "string" ? item.reDeliveryMethod : "",
      reDeliveryCompany:
        typeof item.reDeliveryCompany === "string" ? item.reDeliveryCompany : null,
      reDeliveryTrackingNumber:
        typeof item.reDeliveryTrackingNumber === "string"
          ? item.reDeliveryTrackingNumber
          : null,
    } satisfies NaverRedeliverExchangeTarget;
  });
}

function buildOperationPayload<TItem extends { productOrderId: string }>(input: {
  storeId: string;
  claimType: NaverClaimType;
  items: TItem[];
}) {
  return {
    storeId: input.storeId,
    claimType: input.claimType,
    itemCount: input.items.length,
    targetIds: input.items.map((item) => item.productOrderId),
    items: input.items,
  };
}

async function runTrackedClaimAction<
  TItem extends { productOrderId: string },
  TResult extends NaverClaimActionResponse,
>(input: {
  actionKey: string;
  claimType: NaverClaimType;
  detailLabel: string;
  mode: "foreground" | "retry";
  storeId: string;
  items: TItem[];
  retryOfOperationId?: string;
  execute: (params: { storeId: string; items: TItem[] }) => Promise<TResult>;
}) {
  return runTrackedOperation({
    channel: "naver",
    menuKey: NAVER_CLAIMS_MENU_KEY,
    actionKey: input.actionKey,
    mode: input.mode,
    targetType: "order",
    targetCount: input.items.length,
    targetIds: input.items.map((item) => item.productOrderId),
    requestPayload: {
      storeId: input.storeId,
      items: input.items,
    },
    normalizedPayload: buildOperationPayload({
      storeId: input.storeId,
      claimType: input.claimType,
      items: input.items,
    }),
    retryable: true,
    retryOfOperationId: input.retryOfOperationId ?? null,
    execute: async () => {
      const data = await input.execute({
        storeId: input.storeId,
        items: input.items,
      });

      return {
        data,
        status: resolveTrackedOperationStatus(data.summary),
        normalizedPayload: buildOperationPayload({
          storeId: input.storeId,
          claimType: input.claimType,
          items: input.items,
        }),
        resultSummary: summarizeResult({
          headline: buildOperationSummaryText(data.summary),
          detail: `${input.detailLabel} ${input.items.length}건`,
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

type ClaimActionConfig<TItem extends { productOrderId: string }> = {
  actionKey: string;
  claimType: NaverClaimType;
  detailLabel: string;
  parseItems: (body: unknown) => TItem[];
  execute: (params: {
    storeId: string;
    items: TItem[];
  }) => Promise<NaverClaimActionResponse>;
};

const approveCancelConfig: ClaimActionConfig<NaverApproveCancelTarget> = {
  actionKey: "approve-cancel",
  claimType: "cancel",
  detailLabel: "NAVER 취소 승인",
  parseItems: parseApproveCancelTargets,
  execute: approveCancel,
};

const approveReturnConfig: ClaimActionConfig<NaverApproveReturnTarget> = {
  actionKey: "approve-return",
  claimType: "return",
  detailLabel: "NAVER 반품 승인",
  parseItems: parseApproveReturnTargets,
  execute: approveReturn,
};

const holdReturnConfig: ClaimActionConfig<NaverHoldReturnTarget> = {
  actionKey: "hold-return",
  claimType: "return",
  detailLabel: "NAVER 반품 보류",
  parseItems: parseHoldReturnTargets,
  execute: holdReturn,
};

const releaseReturnHoldConfig: ClaimActionConfig<NaverReleaseReturnHoldTarget> = {
  actionKey: "release-return-hold",
  claimType: "return",
  detailLabel: "NAVER 반품 보류 해제",
  parseItems: parseReleaseReturnHoldTargets,
  execute: releaseReturnHold,
};

const rejectReturnConfig: ClaimActionConfig<NaverRejectReturnTarget> = {
  actionKey: "reject-return",
  claimType: "return",
  detailLabel: "NAVER 반품 거부",
  parseItems: parseRejectReturnTargets,
  execute: rejectReturn,
};

const holdExchangeConfig: ClaimActionConfig<NaverHoldExchangeTarget> = {
  actionKey: "hold-exchange",
  claimType: "exchange",
  detailLabel: "NAVER 교환 보류",
  parseItems: parseHoldExchangeTargets,
  execute: holdExchange,
};

const releaseExchangeHoldConfig: ClaimActionConfig<NaverReleaseExchangeHoldTarget> = {
  actionKey: "release-exchange-hold",
  claimType: "exchange",
  detailLabel: "NAVER 교환 보류 해제",
  parseItems: parseReleaseExchangeHoldTargets,
  execute: releaseExchangeHold,
};

const rejectExchangeConfig: ClaimActionConfig<NaverRejectExchangeTarget> = {
  actionKey: "reject-exchange",
  claimType: "exchange",
  detailLabel: "NAVER 교환 거부",
  parseItems: parseRejectExchangeTargets,
  execute: rejectExchange,
};

const redeliverExchangeConfig: ClaimActionConfig<NaverRedeliverExchangeTarget> = {
  actionKey: "redeliver-exchange",
  claimType: "exchange",
  detailLabel: "NAVER 교환 재발송",
  parseItems: parseRedeliverExchangeTargets,
  execute: redeliverExchange,
};

async function handleTrackedClaimRoute<TItem extends { productOrderId: string }>(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  config: ClaimActionConfig<TItem>,
) {
  const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "";
  const items = config.parseItems(req.body);

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!items.length) {
    sendError(res, 400, {
      code: "MISSING_TARGETS",
      message: "At least one claim must be selected.",
    });
    return;
  }

  try {
    const tracked = await runTrackedClaimAction({
      actionKey: config.actionKey,
      claimType: config.claimType,
      detailLabel: config.detailLabel,
      mode: "foreground",
      storeId,
      items,
      execute: config.execute,
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: CLAIM_INVALID_PATTERNS,
      invalidCode: "INVALID_NAVER_CLAIM_REQUEST",
      apiFailedCode: "NAVER_CLAIM_API_FAILED",
      fallbackMessage: "Failed to execute NAVER claim action.",
    });
  }
}

function registerClaimRetryHandler<TItem extends { productOrderId: string }>(
  config: ClaimActionConfig<TItem>,
) {
  registerOperationRetryHandler(
    {
      channel: "naver",
      menuKey: NAVER_CLAIMS_MENU_KEY,
      actionKey: config.actionKey,
    },
    async ({ operation, requestPayload }) => {
      const request = (requestPayload ?? {}) as Record<string, unknown>;
      const storeId = typeof request.storeId === "string" ? request.storeId : "";
      const items = config.parseItems({
        items: Array.isArray(request.items) ? request.items : [],
      });

      return runTrackedClaimAction({
        actionKey: config.actionKey,
        claimType: config.claimType,
        detailLabel: config.detailLabel,
        mode: "retry",
        storeId,
        items,
        retryOfOperationId: operation.id,
        execute: config.execute,
      });
    },
  );
}

export function registerNaverClaimRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerClaimRetryHandler(approveCancelConfig);
  registerClaimRetryHandler(approveReturnConfig);
  registerClaimRetryHandler(holdReturnConfig);
  registerClaimRetryHandler(releaseReturnHoldConfig);
  registerClaimRetryHandler(rejectReturnConfig);
  registerClaimRetryHandler(holdExchangeConfig);
  registerClaimRetryHandler(releaseExchangeHoldConfig);
  registerClaimRetryHandler(rejectExchangeConfig);
  registerClaimRetryHandler(redeliverExchangeConfig);
}

export const listClaimsHandler: RequestHandler = async (req, res) => {
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
  const lastChangedFrom =
    typeof req.query.lastChangedFrom === "string" ? req.query.lastChangedFrom : "";

  if (!ensureStoreId(res, storeId)) {
    return;
  }

  if (!lastChangedFrom) {
    sendError(res, 400, {
      code: "MISSING_LAST_CHANGED_FROM",
      message: "lastChangedFrom is required.",
    });
    return;
  }

  try {
    sendData(
      res,
      await listClaims({
        storeId,
        lastChangedFrom,
        lastChangedTo:
          typeof req.query.lastChangedTo === "string" ? req.query.lastChangedTo : undefined,
        claimType:
          req.query.claimType === "cancel" ||
          req.query.claimType === "return" ||
          req.query.claimType === "exchange"
            ? req.query.claimType
            : "all",
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        query: typeof req.query.query === "string" ? req.query.query : undefined,
        maxItems: clampPositiveInteger(req.query.maxItems, 60, NAVER_CLAIM_MAX_ITEMS),
        refresh: req.query.refresh === "1",
      }),
    );
  } catch (error) {
    sendMessageBasedError(res, error, {
      invalidPatterns: CLAIM_INVALID_PATTERNS,
      invalidCode: "INVALID_NAVER_CLAIM_REQUEST",
      apiFailedCode: "NAVER_CLAIM_API_FAILED",
      fallbackMessage: "Failed to load NAVER claims.",
    });
  }
};

export const approveCancelClaimHandler: RequestHandler = async (req, res) => {
  await handleTrackedClaimRoute(req, res, approveCancelConfig);
};

export const approveReturnClaimHandler: RequestHandler = async (req, res) => {
  await handleTrackedClaimRoute(req, res, approveReturnConfig);
};

export const holdReturnClaimHandler: RequestHandler = async (req, res) => {
  await handleTrackedClaimRoute(req, res, holdReturnConfig);
};

export const releaseReturnHoldClaimHandler: RequestHandler = async (req, res) => {
  await handleTrackedClaimRoute(req, res, releaseReturnHoldConfig);
};

export const rejectReturnClaimHandler: RequestHandler = async (req, res) => {
  await handleTrackedClaimRoute(req, res, rejectReturnConfig);
};

export const holdExchangeClaimHandler: RequestHandler = async (req, res) => {
  await handleTrackedClaimRoute(req, res, holdExchangeConfig);
};

export const releaseExchangeHoldClaimHandler: RequestHandler = async (req, res) => {
  await handleTrackedClaimRoute(req, res, releaseExchangeHoldConfig);
};

export const rejectExchangeClaimHandler: RequestHandler = async (req, res) => {
  await handleTrackedClaimRoute(req, res, rejectExchangeConfig);
};

export const redeliverExchangeClaimHandler: RequestHandler = async (req, res) => {
  await handleTrackedClaimRoute(req, res, redeliverExchangeConfig);
};
