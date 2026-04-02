import { Router, type Response } from "express";
import {
  operationChannels,
  operationModes,
  operationStatuses,
  operationTargetTypes,
  type OperationResultSummary,
} from "@shared/operations";
import {
  createManualOperation,
  listRecentOperations,
  retryOperation,
  subscribeToOperationUpdates,
  summarizeResult,
  updateManualOperation,
} from "../services/operations/service";
import {
  sendCreated,
  sendData,
  sendError,
  sendNormalizedError,
} from "../services/shared/api-response";

const router = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toActionKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3]+/g, "-")
    .replace(/^-+|-+$/g, "") || "manual-action";
}

function parseResultSummary(body: Record<string, unknown>) {
  if (isRecord(body.resultSummary)) {
    return {
      headline: typeof body.resultSummary.headline === "string" ? body.resultSummary.headline : null,
      detail: typeof body.resultSummary.detail === "string" ? body.resultSummary.detail : null,
      stats:
        isRecord(body.resultSummary.stats) ? body.resultSummary.stats : null,
      preview: typeof body.resultSummary.preview === "string" ? body.resultSummary.preview : null,
    } satisfies OperationResultSummary;
  }

  const legacySummary = typeof body.summary === "string" ? body.summary : null;
  const legacyStats = isRecord(body.summaryJson) ? body.summaryJson : null;

  if (!legacySummary && !legacyStats) {
    return null;
  }

  return summarizeResult({
    headline: legacySummary,
    stats: legacyStats,
    preview: legacySummary,
  });
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function writeEvent<T>(res: Response, event: string, data: T) {
  res.write(`event: ${event}\n`);
  res.write(
    `data: ${JSON.stringify({
      success: true,
      data,
      error: null,
      meta: {
        transport: "sse",
      },
    })}\n\n`,
  );
}

router.get("/", async (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  const items = await listRecentOperations(limit);
  sendData(res, { items });
});

router.get("/stream", async (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const writeSnapshot = async () => {
    const items = await listRecentOperations(40);
    writeEvent(res, "snapshot", { items });
  };

  await writeSnapshot();

  const unsubscribe = subscribeToOperationUpdates((entry) => {
    writeEvent(res, "operation", entry);
  });

  const heartbeat = setInterval(() => {
    res.write("event: heartbeat\n");
    res.write(`data: ${Date.now()}\n\n`);
  }, 20_000);

  res.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.post("/", async (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const channel = typeof body.channel === "string" ? body.channel : "shared";
  const menuKey = typeof body.menuKey === "string" ? body.menuKey : `${channel}.manual`;
  const actionKey =
    typeof body.actionKey === "string"
      ? body.actionKey
      : typeof body.actionName === "string"
        ? toActionKey(body.actionName)
        : "";
  const targetCount = Number(body.targetCount ?? 0);

  if (!operationChannels.includes(channel as (typeof operationChannels)[number])) {
    sendError(res, 400, {
      code: "INVALID_CHANNEL",
      message: "Invalid channel.",
    });
    return;
  }

  if (!actionKey.trim()) {
    sendError(res, 400, {
      code: "INVALID_ACTION_KEY",
      message: "actionKey is required.",
    });
    return;
  }

  const operation = await createManualOperation({
    channel: channel as (typeof operationChannels)[number],
    menuKey,
    actionKey,
    targetCount: Number.isFinite(targetCount) ? Math.max(0, Math.floor(targetCount)) : 0,
    status:
      typeof body.status === "string" &&
      operationStatuses.includes(body.status as (typeof operationStatuses)[number])
        ? (body.status as (typeof operationStatuses)[number])
        : "queued",
    mode:
      typeof body.mode === "string" &&
      operationModes.includes(body.mode as (typeof operationModes)[number])
        ? (body.mode as (typeof operationModes)[number])
        : "background",
    targetType:
      typeof body.targetType === "string" &&
      operationTargetTypes.includes(body.targetType as (typeof operationTargetTypes)[number])
        ? (body.targetType as (typeof operationTargetTypes)[number])
        : "unknown",
    targetIds: parseStringArray(body.targetIds),
    requestPayload: isRecord(body.requestPayload)
      ? body.requestPayload
      : isRecord(body.retryInputJson)
        ? body.retryInputJson
        : null,
    normalizedPayload: isRecord(body.normalizedPayload) ? body.normalizedPayload : null,
    resultSummary: parseResultSummary(body),
    errorCode: typeof body.errorCode === "string" ? body.errorCode : null,
    errorMessage:
      typeof body.errorMessage === "string" ? body.errorMessage : null,
    retryable: Boolean(body.retryable),
    retryOfOperationId:
      typeof body.retryOfOperationId === "string" ? body.retryOfOperationId : null,
  });

  sendCreated(res, { operation });
});

router.patch("/:id", async (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const operation = await updateManualOperation(req.params.id, {
    status:
      typeof body.status === "string" &&
      operationStatuses.includes(body.status as (typeof operationStatuses)[number])
        ? (body.status as (typeof operationStatuses)[number])
        : undefined,
    finishedAt: typeof body.finishedAt === "string" ? body.finishedAt : undefined,
    normalizedPayload: isRecord(body.normalizedPayload) ? body.normalizedPayload : undefined,
    resultSummary: parseResultSummary(body) ?? undefined,
    errorCode: typeof body.errorCode === "string" ? body.errorCode : undefined,
    errorMessage:
      typeof body.errorMessage === "string" ? body.errorMessage : undefined,
    retryable: typeof body.retryable === "boolean" ? body.retryable : undefined,
  });

  if (!operation) {
    sendError(res, 404, {
      code: "OPERATION_NOT_FOUND",
      message: "Operation not found.",
    });
    return;
  }

  sendData(res, { operation });
});

router.post("/:id/retry", async (req, res) => {
  try {
    const result = await retryOperation(req.params.id);
    sendData(res, result);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "RETRY_FAILED",
      fallbackMessage: "Failed to retry operation.",
      fallbackStatus: 400,
    });
  }
});

export default router;
