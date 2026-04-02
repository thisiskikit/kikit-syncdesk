import { Router } from "express";
import type {
  NaverBulkPriceCreateRunInput,
  NaverBulkPricePreviewQueryInput,
  NaverBulkPricePreviewSort,
  NaverBulkPriceRulePresetInput,
  NaverBulkPriceRuleSet,
  NaverBulkPriceSourceConfig,
  NaverBulkPriceSourcePresetInput,
} from "@shared/naver-bulk-price";
import { naverBulkPriceService } from "../services/naver/bulk-price-service";
import {
  sendCreated,
  sendData,
  sendNormalizedError,
} from "../services/shared/api-response";

const router = Router();

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return "";
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asInteger(value: unknown, fallback: number) {
  const normalized = asNumber(value, fallback);
  return Number.isInteger(normalized) ? normalized : Math.trunc(normalized);
}

function parseBooleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "0" || normalized === "false" || normalized === "no") {
      return false;
    }
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
      return true;
    }
  }

  return fallback;
}

function parseSourceConfig(body: unknown): NaverBulkPriceSourceConfig {
  const sourceConfig =
    body && typeof body === "object" && "sourceConfig" in body
      ? (body as { sourceConfig?: Record<string, unknown> }).sourceConfig ?? {}
      : {};

  return {
    storeId: asString(sourceConfig.storeId),
    schema: asString(sourceConfig.schema),
    table: asString(sourceConfig.table),
    basePriceColumn: asString(sourceConfig.basePriceColumn),
    sourceMatchColumn: asString(sourceConfig.sourceMatchColumn),
    soldOutColumn: asString(sourceConfig.soldOutColumn),
    workDateColumn: asString(sourceConfig.workDateColumn),
    workDateFrom: asString(sourceConfig.workDateFrom),
    workDateTo: asString(sourceConfig.workDateTo),
    naverMatchField:
      sourceConfig.naverMatchField === "sellerBarcode" ||
      sourceConfig.naverMatchField === "originProductNo" ||
      sourceConfig.naverMatchField === "channelProductNo"
        ? sourceConfig.naverMatchField
        : "sellerManagementCode",
  };
}

function parseRuleSet(body: unknown): NaverBulkPriceRuleSet {
  const rules =
    body && typeof body === "object" && "rules" in body
      ? (body as { rules?: Record<string, unknown> }).rules ?? {}
      : {};

  return {
    fixedAdjustment: asNumber(rules.fixedAdjustment, 0),
    feeRate: asNumber(rules.feeRate, 0),
    marginRate: asNumber(rules.marginRate, 0),
    inboundShippingCost: asNumber(rules.inboundShippingCost, 0),
    discountRate: asNumber(rules.discountRate, 0),
    roundingUnit:
      rules.roundingUnit === 1 || rules.roundingUnit === 100
        ? rules.roundingUnit
        : 10,
    roundingMode:
      rules.roundingMode === "floor" || rules.roundingMode === "round"
        ? rules.roundingMode
        : "ceil",
  };
}

function parsePreviewSort(body: unknown): NaverBulkPricePreviewSort | null {
  const sort =
    body && typeof body === "object" && "sort" in body
      ? (body as { sort?: Record<string, unknown> }).sort ?? {}
      : {};

  const field =
    sort.field === "product" ||
    sort.field === "matchedCode" ||
    sort.field === "status" ||
    sort.field === "targetPrice" ||
    sort.field === "basePrice" ||
    sort.field === "manualOverride" ||
    sort.field === "option" ||
    sort.field === "lastApplied" ||
    sort.field === "messages"
      ? sort.field
      : null;

  return {
    field,
    direction: sort.direction === "desc" ? "desc" : "asc",
  };
}

function parsePreviewQueryInput(body: unknown): NaverBulkPricePreviewQueryInput {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  return {
    sourceConfig: "sourceConfig" in payload ? parseSourceConfig(body) : undefined,
    rules: "rules" in payload ? parseRuleSet(body) : undefined,
    previewId:
      payload.previewId === null || payload.previewId === undefined
        ? null
        : asString(payload.previewId),
    page: Math.max(1, asInteger(payload.page, 1)),
    pageSize: Math.max(1, asInteger(payload.pageSize, 100)),
    matchedOnly: parseBooleanValue(payload.matchedOnly, false),
    sort: parsePreviewSort(body),
  };
}

function parseCreateRunInput(body: unknown): NaverBulkPriceCreateRunInput {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const rawExcludedRowKeys = Array.isArray(payload.excludedRowKeys)
    ? payload.excludedRowKeys
    : [];
  const rawSelectedRowKeys = Array.isArray(payload.selectedRowKeys)
    ? payload.selectedRowKeys
    : [];
  const rawManualOverrides =
    payload.manualOverrides && typeof payload.manualOverrides === "object"
      ? (payload.manualOverrides as Record<string, unknown>)
      : {};

  return {
    sourceConfig: "sourceConfig" in payload ? parseSourceConfig(body) : undefined,
    rules: "rules" in payload ? parseRuleSet(body) : undefined,
    previewId:
      payload.previewId === null || payload.previewId === undefined
        ? null
        : asString(payload.previewId),
    selectionMode:
      payload.selectionMode === "explicit"
        ? "explicit"
        : payload.selectionMode === "all_ready"
          ? "all_ready"
          : "all_selectable",
    excludedRowKeys: rawExcludedRowKeys
      .map(asString)
      .filter((value) => value.trim().length > 0),
    selectedRowKeys: rawSelectedRowKeys
      .map(asString)
      .filter((value) => value.trim().length > 0),
    manualOverrides: Object.fromEntries(
      Object.entries(rawManualOverrides)
        .map(([rowKey, value]) => [
          asString(rowKey),
          value === null || value === undefined ? null : asNumber(value, 0),
        ])
        .filter(([rowKey]) => asString(rowKey).trim().length > 0),
    ),
    items: rawItems.map((item) => {
      const record =
        item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        rowKey: asString(record.rowKey),
        manualOverridePrice:
          record.manualOverridePrice === null || record.manualOverridePrice === undefined
            ? null
            : asNumber(record.manualOverridePrice, 0),
      };
    }),
  };
}

function parsePresetMeta(body: unknown) {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  return {
    name: asString(payload.name),
    memo: asString(payload.memo),
  };
}

function parseRowKeysQuery(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(asString).filter((entry) => entry.trim().length > 0);
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

function parseSourcePresetInput(body: unknown): NaverBulkPriceSourcePresetInput {
  const meta = parsePresetMeta(body);
  return {
    name: meta.name,
    memo: meta.memo,
    sourceConfig: parseSourceConfig(body),
  };
}

function parseRulePresetInput(body: unknown): NaverBulkPriceRulePresetInput {
  const meta = parsePresetMeta(body);
  return {
    name: meta.name,
    memo: meta.memo,
    rules: parseRuleSet(body),
  };
}

router.get("/bulk-price/source/metadata", async (req, res) => {
  try {
    const data = await naverBulkPriceService.getSourceMetadata({
      schema: typeof req.query.schema === "string" ? req.query.schema : null,
      table: typeof req.query.table === "string" ? req.query.table : null,
    });
    sendData(res, data);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_METADATA_FAILED",
      fallbackMessage: "Failed to load NAVER bulk price source metadata.",
      fallbackStatus: 400,
    });
  }
});

router.get("/bulk-price/source-presets", async (_req, res) => {
  try {
    sendData(res, await naverBulkPriceService.listSourcePresets());
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_SOURCE_PRESETS_READ_FAILED",
      fallbackMessage: "Failed to load NAVER bulk price source presets.",
      fallbackStatus: 500,
    });
  }
});

router.post("/bulk-price/source-presets", async (req, res) => {
  try {
    sendCreated(
      res,
      await naverBulkPriceService.createSourcePreset(parseSourcePresetInput(req.body)),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_SOURCE_PRESET_CREATE_FAILED",
      fallbackMessage: "Failed to create NAVER bulk price source preset.",
      fallbackStatus: 400,
    });
  }
});

router.put("/bulk-price/source-presets/:id", async (req, res) => {
  try {
    sendData(
      res,
      await naverBulkPriceService.updateSourcePreset(
        req.params.id,
        parseSourcePresetInput(req.body),
      ),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_SOURCE_PRESET_UPDATE_FAILED",
      fallbackMessage: "Failed to update NAVER bulk price source preset.",
      fallbackStatus: 400,
    });
  }
});

router.delete("/bulk-price/source-presets/:id", async (req, res) => {
  try {
    sendData(
      res,
      await naverBulkPriceService.deleteSourcePreset(req.params.id),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_SOURCE_PRESET_DELETE_FAILED",
      fallbackMessage: "Failed to delete NAVER bulk price source preset.",
      fallbackStatus: 400,
    });
  }
});

router.get("/bulk-price/rule-presets", async (_req, res) => {
  try {
    sendData(res, await naverBulkPriceService.listRulePresets());
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RULE_PRESETS_READ_FAILED",
      fallbackMessage: "Failed to load NAVER bulk price rule presets.",
      fallbackStatus: 500,
    });
  }
});

router.post("/bulk-price/rule-presets", async (req, res) => {
  try {
    sendCreated(
      res,
      await naverBulkPriceService.createRulePreset(parseRulePresetInput(req.body)),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RULE_PRESET_CREATE_FAILED",
      fallbackMessage: "Failed to create NAVER bulk price rule preset.",
      fallbackStatus: 400,
    });
  }
});

router.put("/bulk-price/rule-presets/:id", async (req, res) => {
  try {
    sendData(
      res,
      await naverBulkPriceService.updateRulePreset(
        req.params.id,
        parseRulePresetInput(req.body),
      ),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RULE_PRESET_UPDATE_FAILED",
      fallbackMessage: "Failed to update NAVER bulk price rule preset.",
      fallbackStatus: 400,
    });
  }
});

router.delete("/bulk-price/rule-presets/:id", async (req, res) => {
  try {
    sendData(res, await naverBulkPriceService.deleteRulePreset(req.params.id));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RULE_PRESET_DELETE_FAILED",
      fallbackMessage: "Failed to delete NAVER bulk price rule preset.",
      fallbackStatus: 400,
    });
  }
});

router.post("/bulk-price/preview", async (req, res) => {
  try {
    sendData(res, await naverBulkPriceService.preview(parsePreviewQueryInput(req.body)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_PREVIEW_FAILED",
      fallbackMessage: "Failed to build NAVER bulk price preview.",
      fallbackStatus: 400,
    });
  }
});

router.post("/bulk-price/runs", async (req, res) => {
  try {
    sendCreated(res, await naverBulkPriceService.createRun(parseCreateRunInput(req.body)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RUN_CREATE_FAILED",
      fallbackMessage: "Failed to create NAVER bulk price run.",
      fallbackStatus: 400,
    });
  }
});

router.get("/bulk-price/runs", async (_req, res) => {
  try {
    sendData(res, await naverBulkPriceService.listRuns());
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RUN_LIST_FAILED",
      fallbackMessage: "Failed to load NAVER bulk price runs.",
      fallbackStatus: 500,
    });
  }
});

router.get("/bulk-price/runs/:id/summary", async (req, res) => {
  try {
    sendData(res, await naverBulkPriceService.getRunSummary(req.params.id));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RUN_SUMMARY_READ_FAILED",
      fallbackMessage: "Failed to load NAVER bulk price run summary.",
      fallbackStatus: 404,
    });
  }
});

router.get("/bulk-price/runs/:id", async (req, res) => {
  try {
    sendData(
      res,
      await naverBulkPriceService.getRunDetailWithOptions({
        runId: req.params.id,
        rowKeys: parseRowKeysQuery(req.query.rowKey),
        includeItems: parseBooleanValue(req.query.includeItems, true),
        includeLatestRecords: parseBooleanValue(req.query.includeLatestRecords, true),
      }),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RUN_READ_FAILED",
      fallbackMessage: "Failed to load NAVER bulk price run.",
      fallbackStatus: 404,
    });
  }
});

router.delete("/bulk-price/runs/:id", async (req, res) => {
  try {
    sendData(res, await naverBulkPriceService.deleteRun(req.params.id));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RUN_DELETE_FAILED",
      fallbackMessage: "Failed to delete NAVER bulk price run.",
      fallbackStatus: 400,
    });
  }
});

router.post("/bulk-price/runs/:id/pause", async (req, res) => {
  try {
    sendData(res, await naverBulkPriceService.pauseRun(req.params.id));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RUN_PAUSE_FAILED",
      fallbackMessage: "Failed to pause NAVER bulk price run.",
      fallbackStatus: 400,
    });
  }
});

router.post("/bulk-price/runs/:id/resume", async (req, res) => {
  try {
    sendData(res, await naverBulkPriceService.resumeRun(req.params.id));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RUN_RESUME_FAILED",
      fallbackMessage: "Failed to resume NAVER bulk price run.",
      fallbackStatus: 400,
    });
  }
});

router.post("/bulk-price/runs/:id/stop", async (req, res) => {
  try {
    sendData(res, await naverBulkPriceService.stopRun(req.params.id));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "NAVER_BULK_PRICE_RUN_STOP_FAILED",
      fallbackMessage: "Failed to stop NAVER bulk price run.",
      fallbackStatus: 400,
    });
  }
});

export default router;
