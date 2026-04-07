import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  NaverBulkPriceLatestAppliedRecord,
  NaverBulkPriceRulePreset,
  NaverBulkPriceRulePresetInput,
  NaverBulkPriceRuleSet,
  NaverBulkPriceRun,
  NaverBulkPriceRunDetail,
  NaverBulkPriceRunItem,
  NaverBulkPriceSourceConfig,
  NaverBulkPriceSourcePreset,
  NaverBulkPriceSourcePresetInput,
} from "@shared/naver-bulk-price";
import {
  naverBulkPriceLatestRecords,
  naverBulkPriceRulePresets,
  naverBulkPriceRunItems,
  naverBulkPriceRuns,
  naverBulkPriceSourcePresets,
} from "@shared/schema";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../shared/work-data-db";
import { db } from "../../storage";

type PersistedNaverBulkPriceStore = {
  version: 1;
  sourcePresets: NaverBulkPriceSourcePreset[];
  rulePresets: NaverBulkPriceRulePreset[];
  runs: NaverBulkPriceRun[];
  runItems: NaverBulkPriceRunItem[];
  latestRecords: NaverBulkPriceLatestAppliedRecord[];
};

type NaverBulkPriceRunPatch = Partial<
  Pick<NaverBulkPriceRun, "status" | "summary" | "updatedAt" | "startedAt" | "finishedAt">
>;

type NaverBulkPriceRunItemPatch = Partial<
  Pick<
    NaverBulkPriceRunItem,
    | "status"
    | "messages"
    | "updatedAt"
    | "manualOverridePrice"
    | "effectiveTargetPrice"
    | "lastAppliedAt"
    | "lastAppliedPrice"
  >
>;

const defaultData: PersistedNaverBulkPriceStore = {
  version: 1,
  sourcePresets: [],
  rulePresets: [],
  runs: [],
  runItems: [],
  latestRecords: [],
};

const clone = <T,>(value: T) => structuredClone(value);
const sortRuns = (items: NaverBulkPriceRun[]) => items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const sortRunItems = (items: NaverBulkPriceRunItem[]) => items.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const sortSourcePresets = (items: NaverBulkPriceSourcePreset[]) => items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const sortRulePresets = (items: NaverBulkPriceRulePreset[]) => items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const sortRecentRunItems = (items: NaverBulkPriceRunItem[]) =>
  items
    .slice()
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.rowKey.localeCompare(b.rowKey),
    );
const RUN_ITEM_INSERT_BATCH_SIZE = 500;

function isRecentRunItem(item: NaverBulkPriceRunItem) {
  return (
    item.status !== "queued" ||
    item.messages.length > 0 ||
    item.lastAppliedAt !== null ||
    item.updatedAt !== item.createdAt
  );
}

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

function normalizeSourceConfig(value: unknown): NaverBulkPriceSourceConfig {
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
    naverMatchField:
      record.naverMatchField === "sellerBarcode" ||
      record.naverMatchField === "originProductNo" ||
      record.naverMatchField === "channelProductNo"
        ? record.naverMatchField
        : "sellerManagementCode",
  };
}

function normalizeRuleSet(value: unknown): NaverBulkPriceRuleSet {
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

function normalizeSourcePreset(value: unknown): NaverBulkPriceSourcePreset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id).trim();
  const name = asString(record.name).trim();
  if (!id || !name) return null;
  const createdAt = asString(record.createdAt).trim() || new Date().toISOString();
  const updatedAt = asString(record.updatedAt).trim() || createdAt;
  return { id, name, memo: asString(record.memo).trim(), sourceConfig: normalizeSourceConfig(record.sourceConfig), createdAt, updatedAt };
}

function normalizeRulePreset(value: unknown): NaverBulkPriceRulePreset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id).trim();
  const name = asString(record.name).trim();
  if (!id || !name) return null;
  const createdAt = asString(record.createdAt).trim() || new Date().toISOString();
  const updatedAt = asString(record.updatedAt).trim() || createdAt;
  return { id, name, memo: asString(record.memo).trim(), rules: normalizeRuleSet(record.rules), createdAt, updatedAt };
}

function normalizePersistedStore(value: PersistedNaverBulkPriceStore | null): PersistedNaverBulkPriceStore {
  return {
    version: 1,
    sourcePresets: Array.isArray(value?.sourcePresets) ? value.sourcePresets.map((item) => normalizeSourcePreset(item)).filter((item): item is NaverBulkPriceSourcePreset => Boolean(item)) : [],
    rulePresets: Array.isArray(value?.rulePresets) ? value.rulePresets.map((item) => normalizeRulePreset(item)).filter((item): item is NaverBulkPriceRulePreset => Boolean(item)) : [],
    runs: Array.isArray(value?.runs) ? value.runs : [],
    runItems: Array.isArray(value?.runItems) ? value.runItems : [],
    latestRecords: Array.isArray(value?.latestRecords) ? value.latestRecords : [],
  };
}

function mapSourcePresetRow(row: typeof naverBulkPriceSourcePresets.$inferSelect): NaverBulkPriceSourcePreset {
  return { id: row.id, name: row.name, memo: row.memo, sourceConfig: normalizeSourceConfig(row.sourceConfigJson), createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(), updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString() };
}

function mapRulePresetRow(row: typeof naverBulkPriceRulePresets.$inferSelect): NaverBulkPriceRulePreset {
  return { id: row.id, name: row.name, memo: row.memo, rules: normalizeRuleSet(row.rulesJson), createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(), updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString() };
}

function mapRunRow(row: typeof naverBulkPriceRuns.$inferSelect): NaverBulkPriceRun {
  return { id: row.id, storeId: row.storeId, sourceConfig: normalizeSourceConfig(row.sourceConfigJson), rules: normalizeRuleSet(row.rulesJson), status: row.status as NaverBulkPriceRun["status"], summary: row.summaryJson as NaverBulkPriceRun["summary"], createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(), updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(), startedAt: toIsoString(row.startedAt), finishedAt: toIsoString(row.finishedAt) };
}

function mapRunItemRow(row: typeof naverBulkPriceRunItems.$inferSelect): NaverBulkPriceRunItem {
  return {
    id: row.id,
    runId: row.runId,
    rowKey: row.rowKey,
    originProductNo: row.originProductNo,
    channelProductNo: row.channelProductNo,
    sellerManagementCode: row.sellerManagementCode,
    sellerBarcode: row.sellerBarcode,
    productName: row.productName,
    matchedCode: row.matchedCode,
    status: row.status as NaverBulkPriceRunItem["status"],
    messages: Array.isArray(row.messagesJson) ? row.messagesJson.filter((value): value is string => typeof value === "string") : [],
    currentPrice: row.currentPrice,
    currentStockQuantity: row.currentStockQuantity,
    sourceSoldOut: row.sourceSoldOut,
    currentSaleStatus: row.currentSaleStatus as NaverBulkPriceRunItem["currentSaleStatus"],
    currentDisplayStatus: row.currentDisplayStatus as NaverBulkPriceRunItem["currentDisplayStatus"],
    targetStockQuantity: row.targetStockQuantity,
    targetSaleStatus: row.targetSaleStatus as NaverBulkPriceRunItem["targetSaleStatus"],
    targetDisplayStatus: row.targetDisplayStatus as NaverBulkPriceRunItem["targetDisplayStatus"],
    saleStatusCode: row.saleStatusCode,
    saleStatusLabel: row.saleStatusLabel ?? "",
    hasOptions: row.hasOptions,
    optionType: row.optionType as NaverBulkPriceRunItem["optionType"],
    optionCount: row.optionCount,
    optionHandlingMessage: row.optionHandlingMessage,
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
    modifiedAt: toIsoString(row.modifiedAt),
    sourceRow: row.sourceRowJson && typeof row.sourceRowJson === "object" && !Array.isArray(row.sourceRowJson) ? (row.sourceRowJson as NaverBulkPriceRunItem["sourceRow"]) : null,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

function mapLatestRecordRow(row: typeof naverBulkPriceLatestRecords.$inferSelect): NaverBulkPriceLatestAppliedRecord {
  return { rowKey: row.rowKey, originProductNo: row.originProductNo, channelProductNo: row.channelProductNo, sellerManagementCode: row.sellerManagementCode, sellerBarcode: row.sellerBarcode, matchedCode: row.matchedCode, beforePrice: row.beforePrice, appliedPrice: row.appliedPrice, appliedAt: toIsoString(row.appliedAt) ?? new Date().toISOString(), runId: row.runId, storeId: row.storeId };
}

export class NaverBulkPriceStore {
  private readonly filePath: string;
  private readonly legacyMode: boolean;
  private cache: PersistedNaverBulkPriceStore | null = null;
  private writePromise = Promise.resolve();
  private mutationQueue = Promise.resolve();
  private initializePromise: Promise<void> | null = null;

  constructor(filePath?: string) {
    this.filePath = path.resolve(process.cwd(), filePath ?? process.env.NAVER_BULK_PRICE_FILE ?? "data/naver-bulk-price.json");
    this.legacyMode = typeof filePath === "string" || !db;
  }

  private async loadLegacy() {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.cache = normalizePersistedStore(JSON.parse(raw) as PersistedNaverBulkPriceStore);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : null;
      if (code !== "ENOENT") throw error;
      this.cache = clone(defaultData);
    }
    return this.cache;
  }

  private async persistLegacy(nextData: PersistedNaverBulkPriceStore) {
    this.cache = nextData;
    const payload = JSON.stringify(nextData, null, 2);
    this.writePromise = this.writePromise.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf-8");
    });
    await this.writePromise;
  }

  private async syncPresetSnapshotToFile(patch: {
    sourcePresets?: NaverBulkPriceSourcePreset[];
    rulePresets?: NaverBulkPriceRulePreset[];
  }) {
    const current = clone(await this.loadLegacy());
    await this.persistLegacy({
      ...current,
      sourcePresets: patch.sourcePresets ? sortSourcePresets(patch.sourcePresets) : current.sourcePresets,
      rulePresets: patch.rulePresets ? sortRulePresets(patch.rulePresets) : current.rulePresets,
    });
  }

  private async mutateLegacy<T>(callback: (data: PersistedNaverBulkPriceStore) => Promise<T> | T) {
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
        await runWorkDataImportOnce("naver-bulk-price.json", async () => {
          const parsed = normalizePersistedStore(await readJsonFileIfExists<PersistedNaverBulkPriceStore>(this.filePath));
          const database = assertWorkDataDatabaseEnabled();
          for (const preset of parsed.sourcePresets) {
            await database.insert(naverBulkPriceSourcePresets).values({ id: preset.id, name: preset.name, memo: preset.memo, sourceConfigJson: preset.sourceConfig, createdAt: toDateOrNull(preset.createdAt) ?? new Date(), updatedAt: toDateOrNull(preset.updatedAt) ?? new Date() }).onConflictDoUpdate({ target: naverBulkPriceSourcePresets.id, set: { name: preset.name, memo: preset.memo, sourceConfigJson: preset.sourceConfig, updatedAt: toDateOrNull(preset.updatedAt) ?? new Date() } });
          }
          for (const preset of parsed.rulePresets) {
            await database.insert(naverBulkPriceRulePresets).values({ id: preset.id, name: preset.name, memo: preset.memo, rulesJson: preset.rules, createdAt: toDateOrNull(preset.createdAt) ?? new Date(), updatedAt: toDateOrNull(preset.updatedAt) ?? new Date() }).onConflictDoUpdate({ target: naverBulkPriceRulePresets.id, set: { name: preset.name, memo: preset.memo, rulesJson: preset.rules, updatedAt: toDateOrNull(preset.updatedAt) ?? new Date() } });
          }
          for (const run of parsed.runs) {
            await database.insert(naverBulkPriceRuns).values({ id: run.id, storeId: run.storeId, sourceConfigJson: run.sourceConfig, rulesJson: run.rules, status: run.status, summaryJson: run.summary, createdAt: toDateOrNull(run.createdAt) ?? new Date(), updatedAt: toDateOrNull(run.updatedAt) ?? new Date(), startedAt: toDateOrNull(run.startedAt), finishedAt: toDateOrNull(run.finishedAt) }).onConflictDoUpdate({ target: naverBulkPriceRuns.id, set: { storeId: run.storeId, sourceConfigJson: run.sourceConfig, rulesJson: run.rules, status: run.status, summaryJson: run.summary, updatedAt: toDateOrNull(run.updatedAt) ?? new Date(), startedAt: toDateOrNull(run.startedAt), finishedAt: toDateOrNull(run.finishedAt) } });
          }
          for (const item of parsed.runItems) {
            await database.insert(naverBulkPriceRunItems).values({ id: item.id, runId: item.runId, rowKey: item.rowKey, originProductNo: item.originProductNo, channelProductNo: item.channelProductNo, sellerManagementCode: item.sellerManagementCode, sellerBarcode: item.sellerBarcode, productName: item.productName, matchedCode: item.matchedCode, status: item.status, messagesJson: item.messages, currentPrice: item.currentPrice, currentStockQuantity: item.currentStockQuantity, sourceSoldOut: item.sourceSoldOut, currentSaleStatus: item.currentSaleStatus, currentDisplayStatus: item.currentDisplayStatus, targetStockQuantity: item.targetStockQuantity, targetSaleStatus: item.targetSaleStatus, targetDisplayStatus: item.targetDisplayStatus, saleStatusCode: item.saleStatusCode, saleStatusLabel: item.saleStatusLabel, hasOptions: item.hasOptions, optionType: item.optionType, optionCount: item.optionCount, optionHandlingMessage: item.optionHandlingMessage, basePrice: item.basePrice, discountedBaseCost: item.discountedBaseCost as number | null, effectiveCost: item.effectiveCost as number | null, rawTargetPrice: item.rawTargetPrice as number | null, adjustedTargetPrice: item.adjustedTargetPrice as number | null, roundedTargetPrice: item.roundedTargetPrice, computedPrice: item.computedPrice, manualOverridePrice: item.manualOverridePrice, effectiveTargetPrice: item.effectiveTargetPrice, lastAppliedAt: toDateOrNull(item.lastAppliedAt), lastAppliedPrice: item.lastAppliedPrice, modifiedAt: toDateOrNull(item.modifiedAt), sourceRowJson: item.sourceRow, createdAt: toDateOrNull(item.createdAt) ?? new Date(), updatedAt: toDateOrNull(item.updatedAt) ?? new Date() }).onConflictDoUpdate({ target: naverBulkPriceRunItems.id, set: { runId: item.runId, rowKey: item.rowKey, originProductNo: item.originProductNo, channelProductNo: item.channelProductNo, sellerManagementCode: item.sellerManagementCode, sellerBarcode: item.sellerBarcode, productName: item.productName, matchedCode: item.matchedCode, status: item.status, messagesJson: item.messages, currentPrice: item.currentPrice, currentStockQuantity: item.currentStockQuantity, sourceSoldOut: item.sourceSoldOut, currentSaleStatus: item.currentSaleStatus, currentDisplayStatus: item.currentDisplayStatus, targetStockQuantity: item.targetStockQuantity, targetSaleStatus: item.targetSaleStatus, targetDisplayStatus: item.targetDisplayStatus, saleStatusCode: item.saleStatusCode, saleStatusLabel: item.saleStatusLabel, hasOptions: item.hasOptions, optionType: item.optionType, optionCount: item.optionCount, optionHandlingMessage: item.optionHandlingMessage, basePrice: item.basePrice, discountedBaseCost: item.discountedBaseCost as number | null, effectiveCost: item.effectiveCost as number | null, rawTargetPrice: item.rawTargetPrice as number | null, adjustedTargetPrice: item.adjustedTargetPrice as number | null, roundedTargetPrice: item.roundedTargetPrice, computedPrice: item.computedPrice, manualOverridePrice: item.manualOverridePrice, effectiveTargetPrice: item.effectiveTargetPrice, lastAppliedAt: toDateOrNull(item.lastAppliedAt), lastAppliedPrice: item.lastAppliedPrice, modifiedAt: toDateOrNull(item.modifiedAt), sourceRowJson: item.sourceRow, updatedAt: toDateOrNull(item.updatedAt) ?? new Date() } });
          }
          for (const record of parsed.latestRecords) {
            await database.insert(naverBulkPriceLatestRecords).values({ rowKey: record.rowKey, originProductNo: record.originProductNo, channelProductNo: record.channelProductNo, sellerManagementCode: record.sellerManagementCode, sellerBarcode: record.sellerBarcode, matchedCode: record.matchedCode, beforePrice: record.beforePrice, appliedPrice: record.appliedPrice, appliedAt: toDateOrNull(record.appliedAt) ?? new Date(), runId: record.runId, storeId: record.storeId }).onConflictDoUpdate({ target: naverBulkPriceLatestRecords.rowKey, set: { originProductNo: record.originProductNo, channelProductNo: record.channelProductNo, sellerManagementCode: record.sellerManagementCode, sellerBarcode: record.sellerBarcode, matchedCode: record.matchedCode, beforePrice: record.beforePrice, appliedPrice: record.appliedPrice, appliedAt: toDateOrNull(record.appliedAt) ?? new Date(), runId: record.runId, storeId: record.storeId } });
          }
          return { imported: true };
        });
      })().catch((error) => {
        this.initializePromise = null;
        throw error;
      });
    }
    await this.initializePromise;
  }

  async listSourcePresets() {
    if (this.legacyMode) return clone(sortSourcePresets((await this.loadLegacy()).sourcePresets));
    await this.ensureInitialized();
    return (await assertWorkDataDatabaseEnabled().select().from(naverBulkPriceSourcePresets).orderBy(desc(naverBulkPriceSourcePresets.updatedAt))).map(mapSourcePresetRow);
  }

  async createSourcePreset(input: NaverBulkPriceSourcePresetInput) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const timestamp = new Date().toISOString();
        const preset: NaverBulkPriceSourcePreset = { id: randomUUID(), name: input.name, memo: input.memo, sourceConfig: input.sourceConfig, createdAt: timestamp, updatedAt: timestamp };
        await this.persistLegacy({ ...data, sourcePresets: sortSourcePresets([preset, ...data.sourcePresets]) });
        return preset;
      });
    }
    await this.ensureInitialized();
    const timestamp = new Date();
    const preset: NaverBulkPriceSourcePreset = { id: randomUUID(), name: input.name, memo: input.memo, sourceConfig: input.sourceConfig, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() };
    await assertWorkDataDatabaseEnabled().insert(naverBulkPriceSourcePresets).values({ id: preset.id, name: preset.name, memo: preset.memo, sourceConfigJson: preset.sourceConfig, createdAt: timestamp, updatedAt: timestamp });
    await this.syncPresetSnapshotToFile({
      sourcePresets: await this.listSourcePresets(),
    });
    return preset;
  }

  async updateSourcePreset(id: string, input: NaverBulkPriceSourcePresetInput) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.sourcePresets.find((item) => item.id === id);
        if (!current) return null;
        const next: NaverBulkPriceSourcePreset = { ...current, name: input.name, memo: input.memo, sourceConfig: input.sourceConfig, updatedAt: new Date().toISOString() };
        await this.persistLegacy({ ...data, sourcePresets: sortSourcePresets(data.sourcePresets.map((item) => (item.id === id ? next : item))) });
        return next;
      });
    }
    const current = (await this.listSourcePresets()).find((item) => item.id === id);
    if (!current) return null;
    const next: NaverBulkPriceSourcePreset = { ...current, name: input.name, memo: input.memo, sourceConfig: input.sourceConfig, updatedAt: new Date().toISOString() };
    await assertWorkDataDatabaseEnabled().update(naverBulkPriceSourcePresets).set({ name: next.name, memo: next.memo, sourceConfigJson: next.sourceConfig, updatedAt: toDateOrNull(next.updatedAt) ?? new Date() }).where(eq(naverBulkPriceSourcePresets.id, id));
    await this.syncPresetSnapshotToFile({
      sourcePresets: await this.listSourcePresets(),
    });
    return next;
  }

  async deleteSourcePreset(id: string) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.sourcePresets.find((item) => item.id === id);
        if (!current) return null;
        await this.persistLegacy({ ...data, sourcePresets: data.sourcePresets.filter((item) => item.id !== id) });
        return current;
      });
    }
    const current = (await this.listSourcePresets()).find((item) => item.id === id);
    if (!current) return null;
    await assertWorkDataDatabaseEnabled().delete(naverBulkPriceSourcePresets).where(eq(naverBulkPriceSourcePresets.id, id));
    await this.syncPresetSnapshotToFile({
      sourcePresets: (await this.listSourcePresets()).filter((item) => item.id !== id),
    });
    return current;
  }

  async listRulePresets() {
    if (this.legacyMode) return clone(sortRulePresets((await this.loadLegacy()).rulePresets));
    await this.ensureInitialized();
    return (await assertWorkDataDatabaseEnabled().select().from(naverBulkPriceRulePresets).orderBy(desc(naverBulkPriceRulePresets.updatedAt))).map(mapRulePresetRow);
  }

  async createRulePreset(input: NaverBulkPriceRulePresetInput) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const timestamp = new Date().toISOString();
        const preset: NaverBulkPriceRulePreset = { id: randomUUID(), name: input.name, memo: input.memo, rules: input.rules, createdAt: timestamp, updatedAt: timestamp };
        await this.persistLegacy({ ...data, rulePresets: sortRulePresets([preset, ...data.rulePresets]) });
        return preset;
      });
    }
    await this.ensureInitialized();
    const timestamp = new Date();
    const preset: NaverBulkPriceRulePreset = { id: randomUUID(), name: input.name, memo: input.memo, rules: input.rules, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() };
    await assertWorkDataDatabaseEnabled().insert(naverBulkPriceRulePresets).values({ id: preset.id, name: preset.name, memo: preset.memo, rulesJson: preset.rules, createdAt: timestamp, updatedAt: timestamp });
    await this.syncPresetSnapshotToFile({
      rulePresets: await this.listRulePresets(),
    });
    return preset;
  }

  async updateRulePreset(id: string, input: NaverBulkPriceRulePresetInput) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.rulePresets.find((item) => item.id === id);
        if (!current) return null;
        const next: NaverBulkPriceRulePreset = { ...current, name: input.name, memo: input.memo, rules: input.rules, updatedAt: new Date().toISOString() };
        await this.persistLegacy({ ...data, rulePresets: sortRulePresets(data.rulePresets.map((item) => (item.id === id ? next : item))) });
        return next;
      });
    }
    const current = (await this.listRulePresets()).find((item) => item.id === id);
    if (!current) return null;
    const next: NaverBulkPriceRulePreset = { ...current, name: input.name, memo: input.memo, rules: input.rules, updatedAt: new Date().toISOString() };
    await assertWorkDataDatabaseEnabled().update(naverBulkPriceRulePresets).set({ name: next.name, memo: next.memo, rulesJson: next.rules, updatedAt: toDateOrNull(next.updatedAt) ?? new Date() }).where(eq(naverBulkPriceRulePresets.id, id));
    await this.syncPresetSnapshotToFile({
      rulePresets: await this.listRulePresets(),
    });
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
    await assertWorkDataDatabaseEnabled().delete(naverBulkPriceRulePresets).where(eq(naverBulkPriceRulePresets.id, id));
    await this.syncPresetSnapshotToFile({
      rulePresets: (await this.listRulePresets()).filter((item) => item.id !== id),
    });
    return current;
  }

  async createRun(input: Omit<NaverBulkPriceRun, "id" | "createdAt" | "updatedAt">) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const timestamp = new Date().toISOString();
        const run: NaverBulkPriceRun = { id: randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp };
        await this.persistLegacy({ ...data, runs: sortRuns([run, ...data.runs]) });
        return run;
      });
    }
    await this.ensureInitialized();
    const timestamp = new Date();
    const run: NaverBulkPriceRun = { id: randomUUID(), ...input, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() };
    await assertWorkDataDatabaseEnabled().insert(naverBulkPriceRuns).values({ id: run.id, storeId: run.storeId, sourceConfigJson: run.sourceConfig, rulesJson: run.rules, status: run.status, summaryJson: run.summary, createdAt: timestamp, updatedAt: timestamp, startedAt: toDateOrNull(run.startedAt), finishedAt: toDateOrNull(run.finishedAt) });
    return run;
  }

  async updateRun(runId: string, patch: NaverBulkPriceRunPatch) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.runs.find((item) => item.id === runId);
        if (!current) return null;
        const next: NaverBulkPriceRun = { ...current, ...patch, updatedAt: new Date().toISOString() };
        await this.persistLegacy({ ...data, runs: sortRuns(data.runs.map((item) => (item.id === runId ? next : item))) });
        return next;
      });
    }
    const current = await this.getRun(runId);
    if (!current) return null;
    const next: NaverBulkPriceRun = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.patchRun(runId, {
      status: next.status,
      summary: next.summary,
      updatedAt: next.updatedAt,
      startedAt: next.startedAt,
      finishedAt: next.finishedAt,
    });
    return next;
  }

  async patchRun(runId: string, patch: NaverBulkPriceRunPatch) {
    if (this.legacyMode) {
      await this.mutateLegacy(async (data) => {
        const current = data.runs.find((item) => item.id === runId);
        if (!current) {
          return;
        }

        const next: NaverBulkPriceRun = {
          ...current,
          ...patch,
          updatedAt: patch.updatedAt ?? new Date().toISOString(),
        };
        await this.persistLegacy({
          ...data,
          runs: sortRuns(data.runs.map((item) => (item.id === runId ? next : item))),
        });
      });
      return;
    }

    await this.ensureInitialized();
    const updatedAt = patch.updatedAt ?? new Date().toISOString();
    const values: Record<string, unknown> = {
      updatedAt: toDateOrNull(updatedAt) ?? new Date(),
    };

    if (patch.status !== undefined) {
      values.status = patch.status;
    }
    if (patch.summary !== undefined) {
      values.summaryJson = patch.summary;
    }
    if (patch.startedAt !== undefined) {
      values.startedAt = toDateOrNull(patch.startedAt);
    }
    if (patch.finishedAt !== undefined) {
      values.finishedAt = toDateOrNull(patch.finishedAt);
    }

    await assertWorkDataDatabaseEnabled()
      .update(naverBulkPriceRuns)
      .set(values)
      .where(eq(naverBulkPriceRuns.id, runId));
  }

  async getRun(runId: string) {
    if (this.legacyMode) {
      const run = (await this.loadLegacy()).runs.find((item) => item.id === runId);
      return run ? clone(run) : null;
    }
    await this.ensureInitialized();
    const rows = await assertWorkDataDatabaseEnabled().select().from(naverBulkPriceRuns).where(eq(naverBulkPriceRuns.id, runId)).limit(1);
    return rows[0] ? mapRunRow(rows[0]) : null;
  }

  async listRuns() {
    if (this.legacyMode) return clone(sortRuns((await this.loadLegacy()).runs));
    await this.ensureInitialized();
    return (await assertWorkDataDatabaseEnabled().select().from(naverBulkPriceRuns).orderBy(desc(naverBulkPriceRuns.updatedAt))).map(mapRunRow);
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

    await assertWorkDataDatabaseEnabled()
      .delete(naverBulkPriceRunItems)
      .where(eq(naverBulkPriceRunItems.runId, runId));
    await assertWorkDataDatabaseEnabled()
      .delete(naverBulkPriceRuns)
      .where(eq(naverBulkPriceRuns.id, runId));
    return true;
  }

  async createRunItems(runId: string, items: Omit<NaverBulkPriceRunItem, "id" | "runId" | "createdAt" | "updatedAt">[]) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const timestamp = new Date().toISOString();
        const created = items.map<NaverBulkPriceRunItem>((item) => ({ id: randomUUID(), runId, ...item, createdAt: timestamp, updatedAt: timestamp }));
        await this.persistLegacy({ ...data, runItems: [...data.runItems, ...created] });
        return created;
      });
    }
    await this.ensureInitialized();
    const timestamp = new Date();
    const created = items.map<NaverBulkPriceRunItem>((item) => ({ id: randomUUID(), runId, ...item, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() }));
    if (created.length) {
      const database = assertWorkDataDatabaseEnabled();
      const rows = created.map((item) => ({
        id: item.id, runId, rowKey: item.rowKey, originProductNo: item.originProductNo, channelProductNo: item.channelProductNo, sellerManagementCode: item.sellerManagementCode, sellerBarcode: item.sellerBarcode, productName: item.productName, matchedCode: item.matchedCode, status: item.status, messagesJson: item.messages, currentPrice: item.currentPrice, currentStockQuantity: item.currentStockQuantity, sourceSoldOut: item.sourceSoldOut, currentSaleStatus: item.currentSaleStatus, currentDisplayStatus: item.currentDisplayStatus, targetStockQuantity: item.targetStockQuantity, targetSaleStatus: item.targetSaleStatus, targetDisplayStatus: item.targetDisplayStatus, saleStatusCode: item.saleStatusCode, saleStatusLabel: item.saleStatusLabel, hasOptions: item.hasOptions, optionType: item.optionType, optionCount: item.optionCount, optionHandlingMessage: item.optionHandlingMessage, basePrice: item.basePrice, discountedBaseCost: item.discountedBaseCost as number | null, effectiveCost: item.effectiveCost as number | null, rawTargetPrice: item.rawTargetPrice as number | null, adjustedTargetPrice: item.adjustedTargetPrice as number | null, roundedTargetPrice: item.roundedTargetPrice, computedPrice: item.computedPrice, manualOverridePrice: item.manualOverridePrice, effectiveTargetPrice: item.effectiveTargetPrice, lastAppliedAt: toDateOrNull(item.lastAppliedAt), lastAppliedPrice: item.lastAppliedPrice, modifiedAt: toDateOrNull(item.modifiedAt), sourceRowJson: item.sourceRow, createdAt: timestamp, updatedAt: timestamp,
      }));
      for (let offset = 0; offset < rows.length; offset += RUN_ITEM_INSERT_BATCH_SIZE) {
        await database
          .insert(naverBulkPriceRunItems)
          .values(rows.slice(offset, offset + RUN_ITEM_INSERT_BATCH_SIZE));
      }
    }
    return created;
  }

  async listRunItems(runId: string) {
    if (this.legacyMode) return clone(sortRunItems((await this.loadLegacy()).runItems.filter((item) => item.runId === runId)));
    await this.ensureInitialized();
    return (await assertWorkDataDatabaseEnabled().select().from(naverBulkPriceRunItems).where(eq(naverBulkPriceRunItems.runId, runId)).orderBy(naverBulkPriceRunItems.createdAt)).map(mapRunItemRow);
  }

  async listRunItemsByRowKeys(runId: string, rowKeys: string[]) {
    if (!rowKeys.length) {
      return [];
    }

    if (this.legacyMode) {
      const wanted = new Set(rowKeys);
      return clone(
        sortRunItems(
          (await this.loadLegacy()).runItems.filter(
            (item) => item.runId === runId && wanted.has(item.rowKey),
          ),
        ),
      );
    }

    await this.ensureInitialized();
    return (
      await assertWorkDataDatabaseEnabled()
        .select()
        .from(naverBulkPriceRunItems)
        .where(
          and(
            eq(naverBulkPriceRunItems.runId, runId),
            inArray(naverBulkPriceRunItems.rowKey, rowKeys),
          ),
        )
        .orderBy(naverBulkPriceRunItems.createdAt)
    ).map(mapRunItemRow);
  }

  async listRecentRunItems(runId: string, limit: number) {
    const normalizedLimit = Math.max(1, limit);

    if (this.legacyMode) {
      return clone(
        sortRecentRunItems(
          (await this.loadLegacy()).runItems.filter(
            (item) => item.runId === runId && isRecentRunItem(item),
          ),
        ).slice(0, normalizedLimit),
      );
    }

    await this.ensureInitialized();
    const queryLimit = Math.max(normalizedLimit * 5, normalizedLimit);
    return (
      await assertWorkDataDatabaseEnabled()
        .select()
        .from(naverBulkPriceRunItems)
        .where(eq(naverBulkPriceRunItems.runId, runId))
        .orderBy(desc(naverBulkPriceRunItems.updatedAt), desc(naverBulkPriceRunItems.createdAt))
        .limit(queryLimit)
    )
      .map(mapRunItemRow)
      .filter((item) => isRecentRunItem(item))
      .slice(0, normalizedLimit);
  }

  async getRunItem(itemId: string) {
    if (this.legacyMode) {
      const item = (await this.loadLegacy()).runItems.find((entry) => entry.id === itemId);
      return item ? clone(item) : null;
    }
    await this.ensureInitialized();
    const rows = await assertWorkDataDatabaseEnabled().select().from(naverBulkPriceRunItems).where(eq(naverBulkPriceRunItems.id, itemId)).limit(1);
    return rows[0] ? mapRunItemRow(rows[0]) : null;
  }

  async updateRunItem(itemId: string, patch: NaverBulkPriceRunItemPatch) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const current = data.runItems.find((item) => item.id === itemId);
        if (!current) return null;
        const next: NaverBulkPriceRunItem = { ...current, ...patch, updatedAt: new Date().toISOString() };
        await this.persistLegacy({ ...data, runItems: data.runItems.map((item) => (item.id === itemId ? next : item)) });
        return next;
      });
    }
    const current = await this.getRunItem(itemId);
    if (!current) return null;
    const next: NaverBulkPriceRunItem = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.patchRunItem(itemId, {
      status: next.status,
      messages: next.messages,
      manualOverridePrice: next.manualOverridePrice,
      effectiveTargetPrice: next.effectiveTargetPrice,
      lastAppliedAt: next.lastAppliedAt,
      lastAppliedPrice: next.lastAppliedPrice,
      updatedAt: next.updatedAt,
    });
    return next;
  }

  async patchRunItem(itemId: string, patch: NaverBulkPriceRunItemPatch) {
    if (this.legacyMode) {
      await this.mutateLegacy(async (data) => {
        const current = data.runItems.find((item) => item.id === itemId);
        if (!current) {
          return;
        }

        const next: NaverBulkPriceRunItem = {
          ...current,
          ...patch,
          updatedAt: patch.updatedAt ?? new Date().toISOString(),
        };
        await this.persistLegacy({
          ...data,
          runItems: data.runItems.map((item) => (item.id === itemId ? next : item)),
        });
      });
      return;
    }

    await this.ensureInitialized();
    const updatedAt = patch.updatedAt ?? new Date().toISOString();
    const values: Record<string, unknown> = {
      updatedAt: toDateOrNull(updatedAt) ?? new Date(),
    };

    if (patch.status !== undefined) {
      values.status = patch.status;
    }
    if (patch.messages !== undefined) {
      values.messagesJson = patch.messages;
    }
    if (patch.manualOverridePrice !== undefined) {
      values.manualOverridePrice = patch.manualOverridePrice;
    }
    if (patch.effectiveTargetPrice !== undefined) {
      values.effectiveTargetPrice = patch.effectiveTargetPrice;
    }
    if (patch.lastAppliedAt !== undefined) {
      values.lastAppliedAt = toDateOrNull(patch.lastAppliedAt);
    }
    if (patch.lastAppliedPrice !== undefined) {
      values.lastAppliedPrice = patch.lastAppliedPrice;
    }

    await assertWorkDataDatabaseEnabled()
      .update(naverBulkPriceRunItems)
      .set(values)
      .where(eq(naverBulkPriceRunItems.id, itemId));
  }

  async updateRunItems(runId: string, iteratee: (item: NaverBulkPriceRunItem) => NaverBulkPriceRunItem) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const nextItems = data.runItems.map((item) => item.runId === runId ? { ...iteratee(clone(item)), updatedAt: new Date().toISOString() } : item);
        await this.persistLegacy({ ...data, runItems: nextItems });
        return sortRunItems(nextItems.filter((item) => item.runId === runId));
      });
    }
    const nextItems = (await this.listRunItems(runId)).map((item) => ({ ...iteratee(clone(item)), updatedAt: new Date().toISOString() }));
    for (const item of nextItems) {
      await assertWorkDataDatabaseEnabled().update(naverBulkPriceRunItems).set({ status: item.status, messagesJson: item.messages, currentPrice: item.currentPrice, currentStockQuantity: item.currentStockQuantity, sourceSoldOut: item.sourceSoldOut, currentSaleStatus: item.currentSaleStatus, currentDisplayStatus: item.currentDisplayStatus, targetStockQuantity: item.targetStockQuantity, targetSaleStatus: item.targetSaleStatus, targetDisplayStatus: item.targetDisplayStatus, saleStatusCode: item.saleStatusCode, saleStatusLabel: item.saleStatusLabel, hasOptions: item.hasOptions, optionType: item.optionType, optionCount: item.optionCount, optionHandlingMessage: item.optionHandlingMessage, basePrice: item.basePrice, discountedBaseCost: item.discountedBaseCost as number | null, effectiveCost: item.effectiveCost as number | null, rawTargetPrice: item.rawTargetPrice as number | null, adjustedTargetPrice: item.adjustedTargetPrice as number | null, roundedTargetPrice: item.roundedTargetPrice, computedPrice: item.computedPrice, manualOverridePrice: item.manualOverridePrice, effectiveTargetPrice: item.effectiveTargetPrice, lastAppliedAt: toDateOrNull(item.lastAppliedAt), lastAppliedPrice: item.lastAppliedPrice, modifiedAt: toDateOrNull(item.modifiedAt), sourceRowJson: item.sourceRow, updatedAt: toDateOrNull(item.updatedAt) ?? new Date() }).where(eq(naverBulkPriceRunItems.id, item.id));
    }
    return sortRunItems(nextItems);
  }

  async upsertLatestRecord(input: NaverBulkPriceLatestAppliedRecord) {
    if (this.legacyMode) {
      return this.mutateLegacy(async (data) => {
        const next = data.latestRecords.filter((item) => item.rowKey !== input.rowKey);
        next.unshift(input);
        await this.persistLegacy({ ...data, latestRecords: next });
        return input;
      });
    }
    await this.ensureInitialized();
    await assertWorkDataDatabaseEnabled().insert(naverBulkPriceLatestRecords).values({ rowKey: input.rowKey, originProductNo: input.originProductNo, channelProductNo: input.channelProductNo, sellerManagementCode: input.sellerManagementCode, sellerBarcode: input.sellerBarcode, matchedCode: input.matchedCode, beforePrice: input.beforePrice, appliedPrice: input.appliedPrice, appliedAt: toDateOrNull(input.appliedAt) ?? new Date(), runId: input.runId, storeId: input.storeId }).onConflictDoUpdate({ target: naverBulkPriceLatestRecords.rowKey, set: { originProductNo: input.originProductNo, channelProductNo: input.channelProductNo, sellerManagementCode: input.sellerManagementCode, sellerBarcode: input.sellerBarcode, matchedCode: input.matchedCode, beforePrice: input.beforePrice, appliedPrice: input.appliedPrice, appliedAt: toDateOrNull(input.appliedAt) ?? new Date(), runId: input.runId, storeId: input.storeId } });
    return clone(input);
  }

  async listLatestRecordsByRowKeys(rowKeys: string[]) {
    if (!rowKeys.length) return [];
    if (this.legacyMode) {
      const wanted = new Set(rowKeys);
      return clone((await this.loadLegacy()).latestRecords.filter((item) => wanted.has(item.rowKey)));
    }
    await this.ensureInitialized();
    return (await assertWorkDataDatabaseEnabled().select().from(naverBulkPriceLatestRecords).where(inArray(naverBulkPriceLatestRecords.rowKey, rowKeys))).map(mapLatestRecordRow);
  }

  async getRunDetail(
    runId: string,
    options?: {
      rowKeys?: string[] | null;
      includeItems?: boolean;
      includeLatestRecords?: boolean;
    },
  ): Promise<NaverBulkPriceRunDetail | null> {
    const run = await this.getRun(runId);
    if (!run) return null;
    const includeItems = options?.includeItems ?? true;
    const normalizedRowKeys = Array.from(
      new Set(
        (options?.rowKeys ?? [])
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    );
    const items = includeItems
      ? normalizedRowKeys.length
        ? await this.listRunItemsByRowKeys(runId, normalizedRowKeys)
        : await this.listRunItems(runId)
      : [];
    const latestRecords =
      options?.includeLatestRecords === false
        ? []
        : await this.listLatestRecordsByRowKeys(items.map((item) => item.rowKey));
    return { run, items, latestRecords };
  }
}

export const naverBulkPriceStore = new NaverBulkPriceStore();
