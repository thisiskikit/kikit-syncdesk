import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  BulkPriceLatestAppliedRecord,
  BulkPriceRulePreset,
  BulkPriceRulePresetInput,
  BulkPriceRuleSet,
  BulkPriceRun,
  BulkPriceRunDetail,
  BulkPriceRunItem,
  BulkPriceSourceConfig,
  BulkPriceSourcePreset,
  BulkPriceSourcePresetInput,
} from "@shared/coupang-bulk-price";
import {
  coupangBulkPriceLatestRecords,
  coupangBulkPriceRulePresets,
  coupangBulkPriceRunItems,
  coupangBulkPriceRuns,
  coupangBulkPriceSourcePresets,
} from "@shared/schema";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../shared/work-data-db";

type PersistedBulkPriceStore = {
  version: 1;
  profiles: BulkPriceSourcePreset[];
  rulePresets: BulkPriceRulePreset[];
  runs: BulkPriceRun[];
  runItems: BulkPriceRunItem[];
  latestRecords: BulkPriceLatestAppliedRecord[];
};

type BulkPriceRunPatch = Partial<
  Pick<BulkPriceRun, "status" | "summary" | "updatedAt" | "startedAt" | "finishedAt">
>;

type BulkPriceRunItemPatch = Partial<
  Pick<
    BulkPriceRunItem,
    | "status"
    | "messages"
    | "updatedAt"
    | "manualOverridePrice"
    | "effectiveTargetPrice"
    | "lastAppliedAt"
    | "lastAppliedPrice"
  >
>;

type RunItemState = Pick<BulkPriceRunItem, "id" | "status">;

type RunItemSelectRow = Pick<
  typeof coupangBulkPriceRunItems.$inferSelect,
  | "id"
  | "runId"
  | "vendorItemId"
  | "sellerProductId"
  | "sellerProductName"
  | "itemName"
  | "externalVendorSku"
  | "barcode"
  | "matchedCode"
  | "status"
  | "messagesJson"
  | "currentPrice"
  | "currentInventoryCount"
  | "sourceSoldOut"
  | "currentSaleStatus"
  | "targetInventoryCount"
  | "targetSaleStatus"
  | "basePrice"
  | "discountedBaseCost"
  | "effectiveCost"
  | "rawTargetPrice"
  | "adjustedTargetPrice"
  | "roundedTargetPrice"
  | "computedPrice"
  | "manualOverridePrice"
  | "effectiveTargetPrice"
  | "lastAppliedAt"
  | "lastAppliedPrice"
  | "createdAt"
  | "updatedAt"
>;

const defaultData: PersistedBulkPriceStore = {
  version: 1,
  profiles: [],
  rulePresets: [],
  runs: [],
  runItems: [],
  latestRecords: [],
};

const clone = <T,>(value: T) => structuredClone(value);
const sortRuns = (items: BulkPriceRun[]) =>
  items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const sortRunItems = (items: BulkPriceRunItem[]) =>
  items.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const sortSourcePresets = (items: BulkPriceSourcePreset[]) =>
  items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const sortRulePresets = (items: BulkPriceRulePreset[]) =>
  items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const RUN_ITEM_INSERT_BATCH_SIZE = 500;

const runItemSelectFields = {
  id: coupangBulkPriceRunItems.id,
  runId: coupangBulkPriceRunItems.runId,
  vendorItemId: coupangBulkPriceRunItems.vendorItemId,
  sellerProductId: coupangBulkPriceRunItems.sellerProductId,
  sellerProductName: coupangBulkPriceRunItems.sellerProductName,
  itemName: coupangBulkPriceRunItems.itemName,
  externalVendorSku: coupangBulkPriceRunItems.externalVendorSku,
  barcode: coupangBulkPriceRunItems.barcode,
  matchedCode: coupangBulkPriceRunItems.matchedCode,
  status: coupangBulkPriceRunItems.status,
  messagesJson: coupangBulkPriceRunItems.messagesJson,
  currentPrice: coupangBulkPriceRunItems.currentPrice,
  currentInventoryCount: coupangBulkPriceRunItems.currentInventoryCount,
  sourceSoldOut: coupangBulkPriceRunItems.sourceSoldOut,
  currentSaleStatus: coupangBulkPriceRunItems.currentSaleStatus,
  targetInventoryCount: coupangBulkPriceRunItems.targetInventoryCount,
  targetSaleStatus: coupangBulkPriceRunItems.targetSaleStatus,
  basePrice: coupangBulkPriceRunItems.basePrice,
  discountedBaseCost: coupangBulkPriceRunItems.discountedBaseCost,
  effectiveCost: coupangBulkPriceRunItems.effectiveCost,
  rawTargetPrice: coupangBulkPriceRunItems.rawTargetPrice,
  adjustedTargetPrice: coupangBulkPriceRunItems.adjustedTargetPrice,
  roundedTargetPrice: coupangBulkPriceRunItems.roundedTargetPrice,
  computedPrice: coupangBulkPriceRunItems.computedPrice,
  manualOverridePrice: coupangBulkPriceRunItems.manualOverridePrice,
  effectiveTargetPrice: coupangBulkPriceRunItems.effectiveTargetPrice,
  lastAppliedAt: coupangBulkPriceRunItems.lastAppliedAt,
  lastAppliedPrice: coupangBulkPriceRunItems.lastAppliedPrice,
  createdAt: coupangBulkPriceRunItems.createdAt,
  updatedAt: coupangBulkPriceRunItems.updatedAt,
};

const runItemStateSelectFields = {
  id: coupangBulkPriceRunItems.id,
  status: coupangBulkPriceRunItems.status,
};

function asString(value: unknown) {
  return typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "bigint"
      ? String(value)
      : "";
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeSourceConfig(value: unknown): BulkPriceSourceConfig {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    storeId: asString(record.storeId),
    schema: asString(record.schema),
    table: asString(record.table),
    basePriceColumn: asString(record.basePriceColumn),
    sourceMatchColumn: asString(record.sourceMatchColumn),
    soldOutColumn: asString(record.soldOutColumn),
    workDateColumn: asString(record.workDateColumn),
    workDateFrom: asString(record.workDateFrom),
    workDateTo: asString(record.workDateTo),
    coupangMatchField:
      record.coupangMatchField === "barcode" ||
      record.coupangMatchField === "vendorItemId" ||
      record.coupangMatchField === "sellerProductId"
        ? record.coupangMatchField
        : "externalVendorSku",
  };
}

function normalizeRuleSet(value: unknown): BulkPriceRuleSet {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    fixedAdjustment: asNumber(record.fixedAdjustment, 0),
    feeRate: asNumber(record.feeRate, 0),
    marginRate: asNumber(record.marginRate, 0),
    inboundShippingCost: asNumber(record.inboundShippingCost, 0),
    discountRate: asNumber(record.discountRate, 0),
    roundingUnit: record.roundingUnit === 1 || record.roundingUnit === 100 ? record.roundingUnit : 10,
    roundingMode:
      record.roundingMode === "floor" || record.roundingMode === "round"
        ? record.roundingMode
        : "ceil",
  };
}

function normalizeSourcePreset(value: unknown): BulkPriceSourcePreset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id).trim();
  const name = asString(record.name).trim();
  if (!id || !name) return null;
  const createdAt = asString(record.createdAt).trim() || new Date().toISOString();
  const updatedAt = asString(record.updatedAt).trim() || createdAt;
  return {
    id,
    name,
    memo: asString(record.memo).trim(),
    sourceConfig: normalizeSourceConfig(record.sourceConfig),
    createdAt,
    updatedAt,
  };
}

function normalizeRulePreset(value: unknown): BulkPriceRulePreset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id).trim();
  const name = asString(record.name).trim();
  if (!id || !name) return null;
  const createdAt = asString(record.createdAt).trim() || new Date().toISOString();
  const updatedAt = asString(record.updatedAt).trim() || createdAt;
  return {
    id,
    name,
    memo: asString(record.memo).trim(),
    rules: normalizeRuleSet(record.rules),
    createdAt,
    updatedAt,
  };
}

function normalizePersistedStore(value: PersistedBulkPriceStore | null): PersistedBulkPriceStore {
  return {
    version: 1,
    profiles: Array.isArray(value?.profiles)
      ? value.profiles
          .map((item) => normalizeSourcePreset(item))
          .filter((item): item is BulkPriceSourcePreset => Boolean(item))
      : [],
    rulePresets: Array.isArray(value?.rulePresets)
      ? value.rulePresets
          .map((item) => normalizeRulePreset(item))
          .filter((item): item is BulkPriceRulePreset => Boolean(item))
      : [],
    runs: Array.isArray(value?.runs) ? value.runs : [],
    runItems: Array.isArray(value?.runItems) ? value.runItems : [],
    latestRecords: Array.isArray(value?.latestRecords) ? value.latestRecords : [],
  };
}

function mapSourcePresetRow(row: typeof coupangBulkPriceSourcePresets.$inferSelect): BulkPriceSourcePreset {
  return {
    id: row.id,
    name: row.name,
    memo: row.memo,
    sourceConfig: normalizeSourceConfig(row.sourceConfigJson),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

function mapRulePresetRow(row: typeof coupangBulkPriceRulePresets.$inferSelect): BulkPriceRulePreset {
  return {
    id: row.id,
    name: row.name,
    memo: row.memo,
    rules: normalizeRuleSet(row.rulesJson),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

function mapRunRow(row: typeof coupangBulkPriceRuns.$inferSelect): BulkPriceRun {
  return {
    id: row.id,
    storeId: row.storeId,
    sourceConfig: normalizeSourceConfig(row.sourceConfigJson),
    rules: normalizeRuleSet(row.rulesJson),
    status: row.status as BulkPriceRun["status"],
    summary: row.summaryJson as BulkPriceRun["summary"],
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
    startedAt: toIsoString(row.startedAt),
    finishedAt: toIsoString(row.finishedAt),
  };
}

function mapRunItemRow(row: RunItemSelectRow): BulkPriceRunItem {
  return {
    id: row.id,
    runId: row.runId,
    vendorItemId: row.vendorItemId,
    sellerProductId: row.sellerProductId,
    sellerProductName: row.sellerProductName,
    itemName: row.itemName,
    externalVendorSku: row.externalVendorSku,
    barcode: row.barcode,
    matchedCode: row.matchedCode,
    status: row.status as BulkPriceRunItem["status"],
    messages: Array.isArray(row.messagesJson)
      ? row.messagesJson.filter((value): value is string => typeof value === "string")
      : [],
    currentPrice: row.currentPrice,
    currentInventoryCount: row.currentInventoryCount,
    sourceSoldOut: row.sourceSoldOut,
    currentSaleStatus: row.currentSaleStatus as BulkPriceRunItem["currentSaleStatus"],
    targetInventoryCount: row.targetInventoryCount,
    targetSaleStatus: row.targetSaleStatus as BulkPriceRunItem["targetSaleStatus"],
    basePrice: row.basePrice,
    discountedBaseCost: row.discountedBaseCost as number | null,
    effectiveCost: row.effectiveCost as number | null,
    rawTargetPrice: row.rawTargetPrice as number | null,
    adjustedTargetPrice: row.adjustedTargetPrice as number | null,
    roundedTargetPrice: row.roundedTargetPrice,
    computedPrice: row.computedPrice,
    manualOverridePrice: row.manualOverridePrice,
    effectiveTargetPrice: row.effectiveTargetPrice,
    lastAppliedAt: toIsoString(row.lastAppliedAt),
    lastAppliedPrice: row.lastAppliedPrice,
    sourceRow: null,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

function stripRunItemSourceRow(item: BulkPriceRunItem): BulkPriceRunItem {
  if (item.sourceRow === null) {
    return item;
  }

  return {
    ...item,
    sourceRow: null,
  };
}

function mapLatestRecordRow(
  row: typeof coupangBulkPriceLatestRecords.$inferSelect,
): BulkPriceLatestAppliedRecord {
  return {
    vendorItemId: row.vendorItemId,
    sellerProductId: row.sellerProductId,
    matchedCode: row.matchedCode,
    beforePrice: row.beforePrice,
    appliedPrice: row.appliedPrice,
    appliedAt: toIsoString(row.appliedAt) ?? new Date().toISOString(),
    runId: row.runId,
    storeId: row.storeId,
  };
}

export class CoupangBulkPriceStore {
  private readonly filePath: string;
  private readonly legacyMode: boolean;
  private cache: PersistedBulkPriceStore | null = null;
  private writePromise = Promise.resolve();
  private mutationQueue = Promise.resolve();
  private initializePromise: Promise<void> | null = null;

  constructor(filePath?: string) {
    this.filePath = path.resolve(
      process.cwd(),
      filePath ?? process.env.COUPANG_BULK_PRICE_FILE ?? "data/coupang-bulk-price.json",
    );
    this.legacyMode = typeof filePath === "string";
  }

  private async loadLegacy() {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.cache = normalizePersistedStore(JSON.parse(raw) as PersistedBulkPriceStore);
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: string }).code)
          : null;
      if (code !== "ENOENT") throw error;
      this.cache = clone(defaultData);
    }
    return this.cache;
  }

  private async persistLegacy(nextData: PersistedBulkPriceStore) {
    this.cache = nextData;
    const payload = JSON.stringify(nextData, null, 2);
    this.writePromise = this.writePromise.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf-8");
    });
    await this.writePromise;
  }

  private async mutateLegacy<T>(callback: (data: PersistedBulkPriceStore) => Promise<T> | T) {
    let result: T | undefined;
    const operation = this.mutationQueue.then(async () => {
      const data = clone(await this.loadLegacy());
      result = await callback(data);
    });
    this.mutationQueue = operation.then(() => undefined, () => undefined);
    await operation;
    return clone(result as T);
  }

  private async ensureInitialized() {
    if (this.legacyMode) return;
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "coupang-bulk-price.json",
          async () => {
            const parsed = normalizePersistedStore(
              await readJsonFileIfExists<PersistedBulkPriceStore>(this.filePath),
            );
            const database = assertWorkDataDatabaseEnabled();
            for (const preset of parsed.profiles) {
              await database.insert(coupangBulkPriceSourcePresets).values({
                id: preset.id,
                name: preset.name,
                memo: preset.memo,
                sourceConfigJson: preset.sourceConfig,
                createdAt: toDateOrNull(preset.createdAt) ?? new Date(),
                updatedAt: toDateOrNull(preset.updatedAt) ?? new Date(),
              }).onConflictDoUpdate({
                target: coupangBulkPriceSourcePresets.id,
                set: { name: preset.name, memo: preset.memo, sourceConfigJson: preset.sourceConfig, updatedAt: toDateOrNull(preset.updatedAt) ?? new Date() },
              });
            }
            for (const preset of parsed.rulePresets) {
              await database.insert(coupangBulkPriceRulePresets).values({
                id: preset.id,
                name: preset.name,
                memo: preset.memo,
                rulesJson: preset.rules,
                createdAt: toDateOrNull(preset.createdAt) ?? new Date(),
                updatedAt: toDateOrNull(preset.updatedAt) ?? new Date(),
              }).onConflictDoUpdate({
                target: coupangBulkPriceRulePresets.id,
                set: { name: preset.name, memo: preset.memo, rulesJson: preset.rules, updatedAt: toDateOrNull(preset.updatedAt) ?? new Date() },
              });
            }
            for (const run of parsed.runs) {
              await database.insert(coupangBulkPriceRuns).values({
                id: run.id,
                storeId: run.storeId,
                sourceConfigJson: run.sourceConfig,
                rulesJson: run.rules,
                status: run.status,
                summaryJson: run.summary,
                createdAt: toDateOrNull(run.createdAt) ?? new Date(),
                updatedAt: toDateOrNull(run.updatedAt) ?? new Date(),
                startedAt: toDateOrNull(run.startedAt),
                finishedAt: toDateOrNull(run.finishedAt),
              }).onConflictDoUpdate({
                target: coupangBulkPriceRuns.id,
                set: { storeId: run.storeId, sourceConfigJson: run.sourceConfig, rulesJson: run.rules, status: run.status, summaryJson: run.summary, updatedAt: toDateOrNull(run.updatedAt) ?? new Date(), startedAt: toDateOrNull(run.startedAt), finishedAt: toDateOrNull(run.finishedAt) },
              });
            }
            for (const item of parsed.runItems) {
              await database.insert(coupangBulkPriceRunItems).values({
                id: item.id,
                runId: item.runId,
                vendorItemId: item.vendorItemId,
                sellerProductId: item.sellerProductId,
                sellerProductName: item.sellerProductName,
                itemName: item.itemName,
                externalVendorSku: item.externalVendorSku,
                barcode: item.barcode,
                matchedCode: item.matchedCode,
                status: item.status,
                messagesJson: item.messages,
                currentPrice: item.currentPrice,
                currentInventoryCount: item.currentInventoryCount,
                sourceSoldOut: item.sourceSoldOut,
                currentSaleStatus: item.currentSaleStatus,
                targetInventoryCount: item.targetInventoryCount,
                targetSaleStatus: item.targetSaleStatus,
                basePrice: item.basePrice,
                discountedBaseCost: item.discountedBaseCost as number | null,
                effectiveCost: item.effectiveCost as number | null,
                rawTargetPrice: item.rawTargetPrice as number | null,
                adjustedTargetPrice: item.adjustedTargetPrice as number | null,
                roundedTargetPrice: item.roundedTargetPrice,
                computedPrice: item.computedPrice,
                manualOverridePrice: item.manualOverridePrice,
                effectiveTargetPrice: item.effectiveTargetPrice,
                lastAppliedAt: toDateOrNull(item.lastAppliedAt),
                lastAppliedPrice: item.lastAppliedPrice,
                sourceRowJson: item.sourceRow,
                createdAt: toDateOrNull(item.createdAt) ?? new Date(),
                updatedAt: toDateOrNull(item.updatedAt) ?? new Date(),
              }).onConflictDoUpdate({
                target: coupangBulkPriceRunItems.id,
                set: { runId: item.runId, vendorItemId: item.vendorItemId, sellerProductId: item.sellerProductId, sellerProductName: item.sellerProductName, itemName: item.itemName, externalVendorSku: item.externalVendorSku, barcode: item.barcode, matchedCode: item.matchedCode, status: item.status, messagesJson: item.messages, currentPrice: item.currentPrice, currentInventoryCount: item.currentInventoryCount, sourceSoldOut: item.sourceSoldOut, currentSaleStatus: item.currentSaleStatus, targetInventoryCount: item.targetInventoryCount, targetSaleStatus: item.targetSaleStatus, basePrice: item.basePrice, discountedBaseCost: item.discountedBaseCost as number | null, effectiveCost: item.effectiveCost as number | null, rawTargetPrice: item.rawTargetPrice as number | null, adjustedTargetPrice: item.adjustedTargetPrice as number | null, roundedTargetPrice: item.roundedTargetPrice, computedPrice: item.computedPrice, manualOverridePrice: item.manualOverridePrice, effectiveTargetPrice: item.effectiveTargetPrice, lastAppliedAt: toDateOrNull(item.lastAppliedAt), lastAppliedPrice: item.lastAppliedPrice, sourceRowJson: item.sourceRow, updatedAt: toDateOrNull(item.updatedAt) ?? new Date() },
              });
            }
            for (const record of parsed.latestRecords) {
              await database.insert(coupangBulkPriceLatestRecords).values({
                vendorItemId: record.vendorItemId,
                sellerProductId: record.sellerProductId,
                matchedCode: record.matchedCode,
                beforePrice: record.beforePrice,
                appliedPrice: record.appliedPrice,
                appliedAt: toDateOrNull(record.appliedAt) ?? new Date(),
                runId: record.runId,
                storeId: record.storeId,
              }).onConflictDoUpdate({
                target: coupangBulkPriceLatestRecords.vendorItemId,
                set: { sellerProductId: record.sellerProductId, matchedCode: record.matchedCode, beforePrice: record.beforePrice, appliedPrice: record.appliedPrice, appliedAt: toDateOrNull(record.appliedAt) ?? new Date(), runId: record.runId, storeId: record.storeId },
              });
            }
            return { imported: true };
          },
        );
      })().catch((error) => {
        this.initializePromise = null;
        throw error;
      });
    }
    await this.initializePromise;
  }

  async listSourcePresets() {
    if (this.legacyMode) return clone(sortSourcePresets((await this.loadLegacy()).profiles));
    await this.ensureInitialized();
    return (await assertWorkDataDatabaseEnabled().select().from(coupangBulkPriceSourcePresets).orderBy(desc(coupangBulkPriceSourcePresets.updatedAt))).map(mapSourcePresetRow);
  }

  async createSourcePreset(input: BulkPriceSourcePresetInput) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const timestamp = new Date().toISOString();
        const preset: BulkPriceSourcePreset = { id: randomUUID(), name: input.name, memo: input.memo, sourceConfig: input.sourceConfig, createdAt: timestamp, updatedAt: timestamp };
        await this.persistLegacy({ ...data, profiles: sortSourcePresets([preset, ...data.profiles]) });
        return preset;
      });
    }
    await this.ensureInitialized();
    const timestamp = new Date();
    const preset: BulkPriceSourcePreset = { id: randomUUID(), name: input.name, memo: input.memo, sourceConfig: input.sourceConfig, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() };
    await assertWorkDataDatabaseEnabled().insert(coupangBulkPriceSourcePresets).values({ id: preset.id, name: preset.name, memo: preset.memo, sourceConfigJson: preset.sourceConfig, createdAt: timestamp, updatedAt: timestamp });
    return preset;
  }

  async updateSourcePreset(id: string, input: BulkPriceSourcePresetInput) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.profiles.find((item) => item.id === id);
        if (!current) return null;
        const next: BulkPriceSourcePreset = { ...current, name: input.name, memo: input.memo, sourceConfig: input.sourceConfig, updatedAt: new Date().toISOString() };
        await this.persistLegacy({ ...data, profiles: sortSourcePresets(data.profiles.map((item) => (item.id === id ? next : item))) });
        return next;
      });
    }
    const current = (await this.listSourcePresets()).find((item) => item.id === id);
    if (!current) return null;
    const next: BulkPriceSourcePreset = { ...current, name: input.name, memo: input.memo, sourceConfig: input.sourceConfig, updatedAt: new Date().toISOString() };
    await assertWorkDataDatabaseEnabled().update(coupangBulkPriceSourcePresets).set({ name: next.name, memo: next.memo, sourceConfigJson: next.sourceConfig, updatedAt: toDateOrNull(next.updatedAt) ?? new Date() }).where(eq(coupangBulkPriceSourcePresets.id, id));
    return next;
  }

  async deleteSourcePreset(id: string) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.profiles.find((item) => item.id === id);
        if (!current) return null;
        await this.persistLegacy({ ...data, profiles: data.profiles.filter((item) => item.id !== id) });
        return current;
      });
    }
    const current = (await this.listSourcePresets()).find((item) => item.id === id);
    if (!current) return null;
    await assertWorkDataDatabaseEnabled().delete(coupangBulkPriceSourcePresets).where(eq(coupangBulkPriceSourcePresets.id, id));
    return current;
  }

  async listRulePresets() {
    if (this.legacyMode) return clone(sortRulePresets((await this.loadLegacy()).rulePresets));
    await this.ensureInitialized();
    return (await assertWorkDataDatabaseEnabled().select().from(coupangBulkPriceRulePresets).orderBy(desc(coupangBulkPriceRulePresets.updatedAt))).map(mapRulePresetRow);
  }

  async createRulePreset(input: BulkPriceRulePresetInput) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const timestamp = new Date().toISOString();
        const preset: BulkPriceRulePreset = { id: randomUUID(), name: input.name, memo: input.memo, rules: input.rules, createdAt: timestamp, updatedAt: timestamp };
        await this.persistLegacy({ ...data, rulePresets: sortRulePresets([preset, ...data.rulePresets]) });
        return preset;
      });
    }
    await this.ensureInitialized();
    const timestamp = new Date();
    const preset: BulkPriceRulePreset = { id: randomUUID(), name: input.name, memo: input.memo, rules: input.rules, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() };
    await assertWorkDataDatabaseEnabled().insert(coupangBulkPriceRulePresets).values({ id: preset.id, name: preset.name, memo: preset.memo, rulesJson: preset.rules, createdAt: timestamp, updatedAt: timestamp });
    return preset;
  }

  async updateRulePreset(id: string, input: BulkPriceRulePresetInput) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.rulePresets.find((item) => item.id === id);
        if (!current) return null;
        const next: BulkPriceRulePreset = { ...current, name: input.name, memo: input.memo, rules: input.rules, updatedAt: new Date().toISOString() };
        await this.persistLegacy({ ...data, rulePresets: sortRulePresets(data.rulePresets.map((item) => (item.id === id ? next : item))) });
        return next;
      });
    }
    const current = (await this.listRulePresets()).find((item) => item.id === id);
    if (!current) return null;
    const next: BulkPriceRulePreset = { ...current, name: input.name, memo: input.memo, rules: input.rules, updatedAt: new Date().toISOString() };
    await assertWorkDataDatabaseEnabled().update(coupangBulkPriceRulePresets).set({ name: next.name, memo: next.memo, rulesJson: next.rules, updatedAt: toDateOrNull(next.updatedAt) ?? new Date() }).where(eq(coupangBulkPriceRulePresets.id, id));
    return next;
  }

  async deleteRulePreset(id: string) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.rulePresets.find((item) => item.id === id);
        if (!current) return null;
        await this.persistLegacy({ ...data, rulePresets: data.rulePresets.filter((item) => item.id !== id) });
        return current;
      });
    }
    const current = (await this.listRulePresets()).find((item) => item.id === id);
    if (!current) return null;
    await assertWorkDataDatabaseEnabled().delete(coupangBulkPriceRulePresets).where(eq(coupangBulkPriceRulePresets.id, id));
    return current;
  }

  async createRun(input: Omit<BulkPriceRun, "id" | "createdAt" | "updatedAt">) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const timestamp = new Date().toISOString();
        const run: BulkPriceRun = { id: randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp };
        await this.persistLegacy({ ...data, runs: sortRuns([run, ...data.runs]) });
        return run;
      });
    }
    await this.ensureInitialized();
    const timestamp = new Date();
    const run: BulkPriceRun = { id: randomUUID(), ...input, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() };
    await assertWorkDataDatabaseEnabled().insert(coupangBulkPriceRuns).values({ id: run.id, storeId: run.storeId, sourceConfigJson: run.sourceConfig, rulesJson: run.rules, status: run.status, summaryJson: run.summary, createdAt: timestamp, updatedAt: timestamp, startedAt: toDateOrNull(run.startedAt), finishedAt: toDateOrNull(run.finishedAt) });
    return run;
  }

  async updateRun(runId: string, patch: BulkPriceRunPatch) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.runs.find((item) => item.id === runId);
        if (!current) return null;
        const next: BulkPriceRun = { ...current, ...patch, updatedAt: new Date().toISOString() };
        await this.persistLegacy({ ...data, runs: sortRuns(data.runs.map((item) => (item.id === runId ? next : item))) });
        return next;
      });
    }
    const current = await this.getRun(runId);
    if (!current) return null;
    const next: BulkPriceRun = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await assertWorkDataDatabaseEnabled().update(coupangBulkPriceRuns).set({ status: next.status, summaryJson: next.summary, updatedAt: toDateOrNull(next.updatedAt) ?? new Date(), startedAt: toDateOrNull(next.startedAt), finishedAt: toDateOrNull(next.finishedAt) }).where(eq(coupangBulkPriceRuns.id, runId));
    return next;
  }

  async getRun(runId: string) {
    if (this.legacyMode) {
      const run = (await this.loadLegacy()).runs.find((item) => item.id === runId);
      return run ? clone(run) : null;
    }
    await this.ensureInitialized();
    const rows = await assertWorkDataDatabaseEnabled().select().from(coupangBulkPriceRuns).where(eq(coupangBulkPriceRuns.id, runId)).limit(1);
    return rows[0] ? mapRunRow(rows[0]) : null;
  }

  async listRuns() {
    if (this.legacyMode) return clone(sortRuns((await this.loadLegacy()).runs));
    await this.ensureInitialized();
    return (await assertWorkDataDatabaseEnabled().select().from(coupangBulkPriceRuns).orderBy(desc(coupangBulkPriceRuns.updatedAt))).map(mapRunRow);
  }

  async deleteRun(runId: string) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const exists = data.runs.some((item) => item.id === runId);
        if (!exists) {
          return false;
        }

        await this.persistLegacy({
          ...data,
          runs: data.runs.filter((item) => item.id !== runId),
          runItems: data.runItems.filter((item) => item.runId !== runId),
        });
        return true;
      });
    }

    await this.ensureInitialized();
    const run = await this.getRun(runId);
    if (!run) {
      return false;
    }

    const database = assertWorkDataDatabaseEnabled();
    await database.transaction(async (tx) => {
      await tx
        .delete(coupangBulkPriceRunItems)
        .where(eq(coupangBulkPriceRunItems.runId, runId));
      await tx
        .delete(coupangBulkPriceRuns)
        .where(eq(coupangBulkPriceRuns.id, runId));
    });
    return true;
  }

  async createRunItems(runId: string, items: Omit<BulkPriceRunItem, "id" | "runId" | "createdAt" | "updatedAt">[]) {
    if (this.legacyMode) {
      await this.mutateLegacy(async (data) => {
        const timestamp = new Date().toISOString();
        const created = items.map<BulkPriceRunItem>((item) => ({ id: randomUUID(), runId, ...item, createdAt: timestamp, updatedAt: timestamp }));
        await this.persistLegacy({ ...data, runItems: [...data.runItems, ...created] });
      });
      return;
    }
    await this.ensureInitialized();
    const timestamp = new Date();
    if (items.length) {
      const database = assertWorkDataDatabaseEnabled();
      await database.transaction(async (tx) => {
        for (let offset = 0; offset < items.length; offset += RUN_ITEM_INSERT_BATCH_SIZE) {
          const rows = items.slice(offset, offset + RUN_ITEM_INSERT_BATCH_SIZE).map((item) => ({
            id: randomUUID(), runId, vendorItemId: item.vendorItemId, sellerProductId: item.sellerProductId, sellerProductName: item.sellerProductName, itemName: item.itemName, externalVendorSku: item.externalVendorSku, barcode: item.barcode, matchedCode: item.matchedCode, status: item.status, messagesJson: item.messages, currentPrice: item.currentPrice, currentInventoryCount: item.currentInventoryCount, sourceSoldOut: item.sourceSoldOut, currentSaleStatus: item.currentSaleStatus, targetInventoryCount: item.targetInventoryCount, targetSaleStatus: item.targetSaleStatus, basePrice: item.basePrice, discountedBaseCost: item.discountedBaseCost as number | null, effectiveCost: item.effectiveCost as number | null, rawTargetPrice: item.rawTargetPrice as number | null, adjustedTargetPrice: item.adjustedTargetPrice as number | null, roundedTargetPrice: item.roundedTargetPrice, computedPrice: item.computedPrice, manualOverridePrice: item.manualOverridePrice, effectiveTargetPrice: item.effectiveTargetPrice, lastAppliedAt: toDateOrNull(item.lastAppliedAt), lastAppliedPrice: item.lastAppliedPrice, sourceRowJson: item.sourceRow, createdAt: timestamp, updatedAt: timestamp,
          }));
          await tx
            .insert(coupangBulkPriceRunItems)
            .values(rows);
        }
      });
    }
  }

  async listRunItems(runId: string) {
    if (this.legacyMode) {
      return clone(
        sortRunItems((await this.loadLegacy()).runItems.filter((item) => item.runId === runId))
          .map(stripRunItemSourceRow),
      );
    }
    await this.ensureInitialized();
    return (
      await assertWorkDataDatabaseEnabled()
        .select(runItemSelectFields)
        .from(coupangBulkPriceRunItems)
        .where(eq(coupangBulkPriceRunItems.runId, runId))
        .orderBy(coupangBulkPriceRunItems.createdAt)
    ).map(mapRunItemRow);
  }

  async listRunItemsByIds(itemIds: string[]) {
    if (!itemIds.length) {
      return [];
    }

    if (this.legacyMode) {
      const wanted = new Set(itemIds);
      const items = (await this.loadLegacy()).runItems.filter((item) => wanted.has(item.id));
      const mapped = new Map(items.map((item) => [item.id, stripRunItemSourceRow(item)] as const));
      return clone(itemIds.map((itemId) => mapped.get(itemId)).filter((item): item is BulkPriceRunItem => Boolean(item)));
    }

    await this.ensureInitialized();
    const rows = await assertWorkDataDatabaseEnabled()
      .select(runItemSelectFields)
      .from(coupangBulkPriceRunItems)
      .where(inArray(coupangBulkPriceRunItems.id, itemIds));
    const mapped = new Map(rows.map((row) => [row.id, mapRunItemRow(row)] as const));
    return itemIds
      .map((itemId) => mapped.get(itemId))
      .filter((item): item is BulkPriceRunItem => Boolean(item));
  }

  async listRunItemsByVendorItemIds(runId: string, vendorItemIds: string[]) {
    if (!vendorItemIds.length) {
      return [];
    }

    if (this.legacyMode) {
      const wanted = new Set(vendorItemIds);
      const items = (await this.loadLegacy()).runItems.filter(
        (item) => item.runId === runId && wanted.has(item.vendorItemId),
      );
      const mapped = new Map(
        items.map((item) => [item.vendorItemId, stripRunItemSourceRow(item)] as const),
      );
      return clone(
        vendorItemIds
          .map((vendorItemId) => mapped.get(vendorItemId))
          .filter((item): item is BulkPriceRunItem => Boolean(item)),
      );
    }

    await this.ensureInitialized();
    const rows = await assertWorkDataDatabaseEnabled()
      .select(runItemSelectFields)
      .from(coupangBulkPriceRunItems)
      .where(
        and(
          eq(coupangBulkPriceRunItems.runId, runId),
          inArray(coupangBulkPriceRunItems.vendorItemId, vendorItemIds),
        ),
      );
    const mapped = new Map(
      rows.map((row) => [row.vendorItemId, mapRunItemRow(row)] as const),
    );
    return vendorItemIds
      .map((vendorItemId) => mapped.get(vendorItemId))
      .filter((item): item is BulkPriceRunItem => Boolean(item));
  }

  async listRecentlyUpdatedRunItems(runId: string, limit: number) {
    const normalizedLimit = Math.max(1, Math.min(200, Math.trunc(limit)));

    if (this.legacyMode) {
      return clone(
        (await this.loadLegacy()).runItems
          .filter((item) => item.runId === runId)
          .slice()
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, normalizedLimit),
      ).map(stripRunItemSourceRow);
    }

    await this.ensureInitialized();
    return (
      await assertWorkDataDatabaseEnabled()
        .select(runItemSelectFields)
        .from(coupangBulkPriceRunItems)
        .where(eq(coupangBulkPriceRunItems.runId, runId))
        .orderBy(desc(coupangBulkPriceRunItems.updatedAt))
        .limit(normalizedLimit)
    ).map(mapRunItemRow);
  }

  async getRunItem(itemId: string) {
    if (this.legacyMode) {
      const item = (await this.loadLegacy()).runItems.find((entry) => entry.id === itemId);
      return item ? clone(stripRunItemSourceRow(item)) : null;
    }
    await this.ensureInitialized();
    const rows = await assertWorkDataDatabaseEnabled()
      .select(runItemSelectFields)
      .from(coupangBulkPriceRunItems)
      .where(eq(coupangBulkPriceRunItems.id, itemId))
      .limit(1);
    return rows[0] ? mapRunItemRow(rows[0]) : null;
  }

  async listRunItemStates(runId: string): Promise<RunItemState[]> {
    if (this.legacyMode) {
      return clone(
        sortRunItems((await this.loadLegacy()).runItems.filter((item) => item.runId === runId)).map(
          (item) => ({
            id: item.id,
            status: item.status,
          }),
        ),
      );
    }

    await this.ensureInitialized();
    return (
      await assertWorkDataDatabaseEnabled()
        .select(runItemStateSelectFields)
        .from(coupangBulkPriceRunItems)
        .where(eq(coupangBulkPriceRunItems.runId, runId))
        .orderBy(coupangBulkPriceRunItems.createdAt)
    ).map((row) => ({
      id: row.id,
      status: row.status as BulkPriceRunItem["status"],
    }));
  }

  async updateRunItem(itemId: string, patch: BulkPriceRunItemPatch) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.runItems.find((item) => item.id === itemId);
        if (!current) return null;
        const next: BulkPriceRunItem = { ...current, ...patch, updatedAt: new Date().toISOString() };
        await this.persistLegacy({ ...data, runItems: data.runItems.map((item) => (item.id === itemId ? next : item)) });
        return next;
      });
    }
    const current = await this.getRunItem(itemId);
    if (!current) return null;
    const next: BulkPriceRunItem = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await assertWorkDataDatabaseEnabled().update(coupangBulkPriceRunItems).set({ status: next.status, messagesJson: next.messages, manualOverridePrice: next.manualOverridePrice, effectiveTargetPrice: next.effectiveTargetPrice, lastAppliedAt: toDateOrNull(next.lastAppliedAt), lastAppliedPrice: next.lastAppliedPrice, updatedAt: toDateOrNull(next.updatedAt) ?? new Date() }).where(eq(coupangBulkPriceRunItems.id, itemId));
    return next;
  }

  async updateRunItems(runId: string, iteratee: (item: BulkPriceRunItem) => BulkPriceRunItem) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const nextItems = data.runItems.map((item) =>
          item.runId === runId
            ? { ...iteratee(stripRunItemSourceRow(clone(item))), updatedAt: new Date().toISOString() }
            : item,
        );
        await this.persistLegacy({ ...data, runItems: nextItems });
        return sortRunItems(nextItems.filter((item) => item.runId === runId)).map(
          stripRunItemSourceRow,
        );
      });
    }
    const nextItems = (await this.listRunItems(runId)).map((item) => ({ ...iteratee(clone(item)), updatedAt: new Date().toISOString() }));
    for (const item of nextItems) {
      await assertWorkDataDatabaseEnabled().update(coupangBulkPriceRunItems).set({ status: item.status, messagesJson: item.messages, currentPrice: item.currentPrice, currentInventoryCount: item.currentInventoryCount, sourceSoldOut: item.sourceSoldOut, currentSaleStatus: item.currentSaleStatus, targetInventoryCount: item.targetInventoryCount, targetSaleStatus: item.targetSaleStatus, basePrice: item.basePrice, discountedBaseCost: item.discountedBaseCost as number | null, effectiveCost: item.effectiveCost as number | null, rawTargetPrice: item.rawTargetPrice as number | null, adjustedTargetPrice: item.adjustedTargetPrice as number | null, roundedTargetPrice: item.roundedTargetPrice, computedPrice: item.computedPrice, manualOverridePrice: item.manualOverridePrice, effectiveTargetPrice: item.effectiveTargetPrice, lastAppliedAt: toDateOrNull(item.lastAppliedAt), lastAppliedPrice: item.lastAppliedPrice, sourceRowJson: item.sourceRow, updatedAt: toDateOrNull(item.updatedAt) ?? new Date() }).where(eq(coupangBulkPriceRunItems.id, item.id));
    }
    return sortRunItems(nextItems);
  }

  async upsertLatestRecord(input: BulkPriceLatestAppliedRecord) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const next = data.latestRecords.filter((item) => item.vendorItemId !== input.vendorItemId);
        next.unshift(input);
        await this.persistLegacy({ ...data, latestRecords: next });
        return input;
      });
    }
    await this.ensureInitialized();
    await assertWorkDataDatabaseEnabled().insert(coupangBulkPriceLatestRecords).values({ vendorItemId: input.vendorItemId, sellerProductId: input.sellerProductId, matchedCode: input.matchedCode, beforePrice: input.beforePrice, appliedPrice: input.appliedPrice, appliedAt: toDateOrNull(input.appliedAt) ?? new Date(), runId: input.runId, storeId: input.storeId }).onConflictDoUpdate({ target: coupangBulkPriceLatestRecords.vendorItemId, set: { sellerProductId: input.sellerProductId, matchedCode: input.matchedCode, beforePrice: input.beforePrice, appliedPrice: input.appliedPrice, appliedAt: toDateOrNull(input.appliedAt) ?? new Date(), runId: input.runId, storeId: input.storeId } });
    return clone(input);
  }

  async listLatestRecordsByVendorItemIds(vendorItemIds: string[]) {
    if (!vendorItemIds.length) return [];
    if (this.legacyMode) {
      const wanted = new Set(vendorItemIds);
      return clone((await this.loadLegacy()).latestRecords.filter((item) => wanted.has(item.vendorItemId)));
    }
    await this.ensureInitialized();
    return (await assertWorkDataDatabaseEnabled().select().from(coupangBulkPriceLatestRecords).where(inArray(coupangBulkPriceLatestRecords.vendorItemId, vendorItemIds))).map(mapLatestRecordRow);
  }

  async getRunDetail(runId: string): Promise<BulkPriceRunDetail | null> {
    const run = await this.getRun(runId);
    if (!run) return null;
    const items = await this.listRunItems(runId);
    const latestRecords = await this.listLatestRecordsByVendorItemIds(items.map((item) => item.vendorItemId));
    return { run, items, latestRecords };
  }

  /**
   * Bulk-transition item statuses in a single UPDATE query.
   * Use for simple status transitions (e.g., queued→paused, queued→stopped)
   * where only status and messages need to change — avoids loading all items into memory.
   */
  async bulkTransitionRunItemStatus(
    runId: string,
    fromStatus: string,
    toStatus: string,
    appendMessage: string,
  ) {
    if (this.legacyMode) {
      // Fall back to updateRunItems for legacy mode
      await this.updateRunItems(runId, (item) =>
        item.status === fromStatus
          ? { ...item, status: toStatus as BulkPriceRunItem["status"], messages: [...item.messages, appendMessage] }
          : item,
      );
      return;
    }
    await this.ensureInitialized();
    await assertWorkDataDatabaseEnabled()
      .update(coupangBulkPriceRunItems)
      .set({
        status: toStatus,
        messagesJson: sql`COALESCE(${coupangBulkPriceRunItems.messagesJson}, '[]'::jsonb) || ${JSON.stringify([appendMessage])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coupangBulkPriceRunItems.runId, runId),
          eq(coupangBulkPriceRunItems.status, fromStatus),
        ),
      );
  }
}

export const coupangBulkPriceStore = new CoupangBulkPriceStore();
