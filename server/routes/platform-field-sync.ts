import { Router } from "express";
import {
  platformFieldSyncModes,
  platformFieldSyncRuleInputSchema,
} from "@shared/platform-field-sync";
import {
  deletePlatformFieldSyncRule,
  getPlatformFieldSyncTargetMetadata,
  listPlatformFieldSyncRules,
  listPlatformFieldSyncRuns,
  previewPlatformFieldSyncRule,
  runEnabledPlatformFieldSyncRules,
  runPlatformFieldSyncRule,
  savePlatformFieldSyncRule,
} from "../services/platform-field-sync-service";
import { sendCreated, sendData, sendNormalizedError } from "../services/shared/api-response";

const router = Router();

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.max(1, Math.floor(parsed));
  return typeof max === "number" ? Math.min(normalized, max) : normalized;
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return fallback;
}

router.get("/rules", async (_req, res) => {
  try {
    sendData(res, { items: await listPlatformFieldSyncRules() });
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "FIELD_SYNC_RULES_READ_FAILED",
      fallbackMessage: "Failed to load field sync rules.",
    });
  }
});

router.post("/rules", async (req, res) => {
  try {
    const rule = await savePlatformFieldSyncRule({
      rule: platformFieldSyncRuleInputSchema.parse(req.body ?? {}),
    });
    sendCreated(res, rule);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "FIELD_SYNC_RULE_SAVE_FAILED",
      fallbackMessage: "Failed to save field sync rule.",
      fallbackStatus: 400,
    });
  }
});

router.put("/rules/:ruleId", async (req, res) => {
  try {
    const rule = await savePlatformFieldSyncRule({
      id: req.params.ruleId,
      rule: platformFieldSyncRuleInputSchema.parse(req.body ?? {}),
    });
    sendData(res, rule);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "FIELD_SYNC_RULE_UPDATE_FAILED",
      fallbackMessage: "Failed to update field sync rule.",
      fallbackStatus: 400,
    });
  }
});

router.delete("/rules/:ruleId", async (req, res) => {
  try {
    sendData(res, await deletePlatformFieldSyncRule(req.params.ruleId));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "FIELD_SYNC_RULE_DELETE_FAILED",
      fallbackMessage: "Failed to delete field sync rule.",
      fallbackStatus: 400,
    });
  }
});

router.get("/runs", async (req, res) => {
  try {
    sendData(
      res,
      {
        items: await listPlatformFieldSyncRuns({
          ruleId: typeof req.query.ruleId === "string" ? req.query.ruleId : null,
          limit: parsePositiveInteger(req.query.limit, 20, 100),
        }),
      },
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "FIELD_SYNC_RUNS_READ_FAILED",
      fallbackMessage: "Failed to load field sync runs.",
    });
  }
});

router.get("/target-metadata", async (req, res) => {
  try {
    const syncMode =
      typeof req.query.syncMode === "string" &&
      (platformFieldSyncModes as readonly string[]).includes(req.query.syncMode)
        ? (req.query.syncMode as (typeof platformFieldSyncModes)[number])
        : null;

    sendData(
      res,
      await getPlatformFieldSyncTargetMetadata({
        schema: typeof req.query.schema === "string" ? req.query.schema : null,
        table: typeof req.query.table === "string" ? req.query.table : null,
        syncMode,
        targetColumn:
          typeof req.query.targetColumn === "string" ? req.query.targetColumn : null,
        targetMatchColumn:
          typeof req.query.targetMatchColumn === "string"
            ? req.query.targetMatchColumn
            : null,
      }),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "FIELD_SYNC_TARGET_METADATA_FAILED",
      fallbackMessage: "Failed to load target table metadata.",
    });
  }
});

router.post("/preview", async (req, res) => {
  try {
    const preview = await previewPlatformFieldSyncRule(
      platformFieldSyncRuleInputSchema.parse(req.body ?? {}),
    );
    sendData(res, preview);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "FIELD_SYNC_PREVIEW_FAILED",
      fallbackMessage: "Failed to preview field sync values.",
      fallbackStatus: 400,
    });
  }
});

router.post("/rules/:ruleId/run", async (req, res) => {
  try {
    const run = await runPlatformFieldSyncRule({
      ruleId: req.params.ruleId,
      triggerMode: "manual",
      refreshSource: parseBoolean(req.body?.refreshSource, true),
    });
    sendData(res, run);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "FIELD_SYNC_RUN_FAILED",
      fallbackMessage: "Failed to run field sync.",
      fallbackStatus: 400,
    });
  }
});

router.post("/run-enabled", async (req, res) => {
  try {
    sendData(
      res,
      {
        items: await runEnabledPlatformFieldSyncRules({
          channel:
            req.body?.channel === "naver" || req.body?.channel === "coupang"
              ? req.body.channel
              : undefined,
          storeId: typeof req.body?.storeId === "string" ? req.body.storeId : undefined,
          triggerMode: "manual",
          refreshSource: parseBoolean(req.body?.refreshSource, true),
        }),
      },
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "FIELD_SYNC_RUN_ENABLED_FAILED",
      fallbackMessage: "Failed to run enabled field sync rules.",
      fallbackStatus: 400,
    });
  }
});

export default router;
