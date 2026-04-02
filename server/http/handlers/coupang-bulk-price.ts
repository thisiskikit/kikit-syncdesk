import type { RequestHandler } from "express";
import type {
  BulkPriceCreateRunInput,
  BulkPricePreviewQueryInput,
  BulkPricePreviewSort,
  BulkPriceRulePresetInput,
  BulkPriceRuleSet,
  BulkPriceRunLiveQueryInput,
  BulkPriceSourceConfig,
  BulkPriceSourcePresetInput,
} from "@shared/coupang-bulk-price";
import { coupangBulkPriceService } from "../../services/coupang/bulk-price-service";
import {
  sendCreated,
  sendData,
  sendNormalizedError,
} from "../../services/shared/api-response";

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

function getRouteId(req: Parameters<RequestHandler>[0]) {
  return typeof req.params.id === "string" ? req.params.id : "";
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

function parseSourceConfig(body: unknown): BulkPriceSourceConfig {
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
    coupangMatchField:
      sourceConfig.coupangMatchField === "barcode" ||
      sourceConfig.coupangMatchField === "vendorItemId" ||
      sourceConfig.coupangMatchField === "sellerProductId"
        ? sourceConfig.coupangMatchField
        : "externalVendorSku",
  };
}

function parseRuleSet(body: unknown): BulkPriceRuleSet {
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

function parsePreviewSort(body: unknown): BulkPricePreviewSort | null {
  const sort =
    body && typeof body === "object" && "sort" in body
      ? (body as { sort?: Record<string, unknown> }).sort ?? {}
      : {};

  const field =
    sort.field === "product" ||
    sort.field === "matchedCode" ||
    sort.field === "status" ||
    sort.field === "price" ||
    sort.field === "manualOverride" ||
    sort.field === "lastApplied"
      ? sort.field
      : null;

  return {
    field,
    direction: sort.direction === "desc" ? "desc" : "asc",
  };
}

function parsePreviewQueryInput(body: unknown): BulkPricePreviewQueryInput {
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

function parseCreateRunInput(body: unknown): BulkPriceCreateRunInput {
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
        .map(([vendorItemId, value]) => [
          asString(vendorItemId),
          value === null || value === undefined ? null : asNumber(value, 0),
        ])
        .filter(([vendorItemId]) => asString(vendorItemId).trim().length > 0),
    ),
    items: rawItems.map((item) => {
      const record =
        item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        vendorItemId: asString(record.vendorItemId),
        manualOverridePrice:
          record.manualOverridePrice === null || record.manualOverridePrice === undefined
            ? null
            : asNumber(record.manualOverridePrice, 0),
      };
    }),
  };
}

function parseRunLiveQueryInput(body: unknown): BulkPriceRunLiveQueryInput {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawVendorItemIds = Array.isArray(payload.vendorItemIds)
    ? payload.vendorItemIds
    : [];

  return {
    vendorItemIds: rawVendorItemIds
      .map(asString)
      .filter((value) => value.trim().length > 0),
    logLimit: Math.max(1, asInteger(payload.logLimit, 20)),
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

function parseSourcePresetInput(body: unknown): BulkPriceSourcePresetInput {
  const meta = parsePresetMeta(body);

  return {
    name: meta.name,
    memo: meta.memo,
    sourceConfig: parseSourceConfig(body),
  };
}

function parseRulePresetInput(body: unknown): BulkPriceRulePresetInput {
  const meta = parsePresetMeta(body);

  return {
    name: meta.name,
    memo: meta.memo,
    rules: parseRuleSet(body),
  };
}

export const getSourceMetadataHandler: RequestHandler = async (req, res) => {
  try {
    const data = await coupangBulkPriceService.getSourceMetadata({
      schema: typeof req.query.schema === "string" ? req.query.schema : null,
      table: typeof req.query.table === "string" ? req.query.table : null,
    });
    sendData(res, data);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_METADATA_FAILED",
      fallbackMessage: "Failed to load bulk price source metadata.",
      fallbackStatus: 400,
    });
  }
};

export const listSourcePresetsHandler: RequestHandler = async (_req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.listSourcePresets());
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_SOURCE_PRESETS_READ_FAILED",
      fallbackMessage: "Failed to load bulk price source presets.",
      fallbackStatus: 500,
    });
  }
};

export const createSourcePresetHandler: RequestHandler = async (req, res) => {
  try {
    sendCreated(res, await coupangBulkPriceService.createSourcePreset(parseSourcePresetInput(req.body)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_SOURCE_PRESET_CREATE_FAILED",
      fallbackMessage: "Failed to create bulk price source preset.",
      fallbackStatus: 400,
    });
  }
};

export const updateSourcePresetHandler: RequestHandler = async (req, res) => {
  try {
    sendData(
      res,
      await coupangBulkPriceService.updateSourcePreset(
        getRouteId(req),
        parseSourcePresetInput(req.body),
      ),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_SOURCE_PRESET_UPDATE_FAILED",
      fallbackMessage: "Failed to update bulk price source preset.",
      fallbackStatus: 400,
    });
  }
};

export const deleteSourcePresetHandler: RequestHandler = async (req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.deleteSourcePreset(getRouteId(req)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_SOURCE_PRESET_DELETE_FAILED",
      fallbackMessage: "Failed to delete bulk price source preset.",
      fallbackStatus: 400,
    });
  }
};

export const listRulePresetsHandler: RequestHandler = async (_req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.listRulePresets());
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RULE_PRESETS_READ_FAILED",
      fallbackMessage: "Failed to load bulk price rule presets.",
      fallbackStatus: 500,
    });
  }
};

export const createRulePresetHandler: RequestHandler = async (req, res) => {
  try {
    sendCreated(res, await coupangBulkPriceService.createRulePreset(parseRulePresetInput(req.body)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RULE_PRESET_CREATE_FAILED",
      fallbackMessage: "Failed to create bulk price rule preset.",
      fallbackStatus: 400,
    });
  }
};

export const updateRulePresetHandler: RequestHandler = async (req, res) => {
  try {
    sendData(
      res,
      await coupangBulkPriceService.updateRulePreset(getRouteId(req), parseRulePresetInput(req.body)),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RULE_PRESET_UPDATE_FAILED",
      fallbackMessage: "Failed to update bulk price rule preset.",
      fallbackStatus: 400,
    });
  }
};

export const deleteRulePresetHandler: RequestHandler = async (req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.deleteRulePreset(getRouteId(req)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RULE_PRESET_DELETE_FAILED",
      fallbackMessage: "Failed to delete bulk price rule preset.",
      fallbackStatus: 400,
    });
  }
};

export const previewBulkPriceHandler: RequestHandler = async (req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.preview(parsePreviewQueryInput(req.body)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_PREVIEW_FAILED",
      fallbackMessage: "Failed to build bulk price preview.",
      fallbackStatus: 400,
    });
  }
};

export const createBulkPriceRunHandler: RequestHandler = async (req, res) => {
  try {
    sendCreated(res, await coupangBulkPriceService.createRun(parseCreateRunInput(req.body)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RUN_CREATE_FAILED",
      fallbackMessage: "Failed to create bulk price run.",
      fallbackStatus: 400,
    });
  }
};

export const listBulkPriceRunsHandler: RequestHandler = async (_req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.listRuns());
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RUN_LIST_FAILED",
      fallbackMessage: "Failed to load bulk price runs.",
      fallbackStatus: 500,
    });
  }
};

export const getBulkPriceRunHandler: RequestHandler = async (req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.getRunDetail(getRouteId(req)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RUN_READ_FAILED",
      fallbackMessage: "Failed to load bulk price run.",
      fallbackStatus: 404,
    });
  }
};

export const getBulkPriceRunLiveHandler: RequestHandler = async (req, res) => {
  try {
    sendData(
      res,
      await coupangBulkPriceService.getRunLiveData(
        getRouteId(req),
        parseRunLiveQueryInput(req.body),
      ),
    );
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RUN_LIVE_READ_FAILED",
      fallbackMessage: "Failed to load bulk price live run state.",
      fallbackStatus: 404,
    });
  }
};

export const deleteBulkPriceRunHandler: RequestHandler = async (req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.deleteRun(getRouteId(req)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RUN_DELETE_FAILED",
      fallbackMessage: "Failed to delete bulk price run.",
      fallbackStatus: 400,
    });
  }
};

export const pauseBulkPriceRunHandler: RequestHandler = async (req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.pauseRun(getRouteId(req)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RUN_PAUSE_FAILED",
      fallbackMessage: "Failed to pause bulk price run.",
      fallbackStatus: 400,
    });
  }
};

export const resumeBulkPriceRunHandler: RequestHandler = async (req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.resumeRun(getRouteId(req)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RUN_RESUME_FAILED",
      fallbackMessage: "Failed to resume bulk price run.",
      fallbackStatus: 400,
    });
  }
};

export const stopBulkPriceRunHandler: RequestHandler = async (req, res) => {
  try {
    sendData(res, await coupangBulkPriceService.stopRun(getRouteId(req)));
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "COUPANG_BULK_PRICE_RUN_STOP_FAILED",
      fallbackMessage: "Failed to stop bulk price run.",
      fallbackStatus: 400,
    });
  }
};
