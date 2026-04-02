import { Router } from "express";
import {
  isLogChannel,
  isLogKind,
  isLogLevel,
  isOperationStatus,
  type LogListQuery,
} from "@shared/logs";
import { logStore } from "../services/logs/store";
import { sendData, sendNormalizedError } from "../services/shared/api-response";

const router = Router();

function parseBoolean(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  return value === "1" || value.toLowerCase() === "true";
}

function buildListQuery(query: Record<string, unknown>): LogListQuery {
  const kind = typeof query.kind === "string" && isLogKind(query.kind) ? query.kind : undefined;
  const channel =
    typeof query.channel === "string" && isLogChannel(query.channel) ? query.channel : undefined;
  const status =
    typeof query.status === "string" && isOperationStatus(query.status)
      ? query.status
      : undefined;
  const level =
    typeof query.level === "string" && isLogLevel(query.level) ? query.level : undefined;

  return {
    kind,
    channel,
    status,
    level,
    slowOnly: parseBoolean(query.slowOnly),
    q: typeof query.q === "string" ? query.q : "",
    limit:
      typeof query.limit === "string" && Number.isFinite(Number(query.limit))
        ? Number(query.limit)
        : undefined,
    cursor: typeof query.cursor === "string" ? query.cursor : null,
  };
}

router.get("/", async (req, res) => {
  try {
    const data = await logStore.listRecentLogs(buildListQuery(req.query as Record<string, unknown>));
    sendData(res, data);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "LOG_LIST_FAILED",
      fallbackMessage: "Failed to load logs.",
      fallbackStatus: 500,
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const item = await logStore.getLogById(req.params.id);
    sendData(res, { item });
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "LOG_DETAIL_FAILED",
      fallbackMessage: "Failed to load log entry.",
      fallbackStatus: 500,
    });
  }
});

export default router;
