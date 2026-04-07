import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  BulkPricePreviewResponse,
  BulkPriceRuleSet,
  BulkPriceSourceConfig,
} from "@shared/coupang-bulk-price";
import {
  CoupangBulkPriceService,
  buildBulkPricePreviewRows,
  calculateBulkPriceValues,
  parseSoldOutSourceValue,
  resolveMasterSkuDatabaseUrl,
} from "./bulk-price-service";
import { CoupangBulkPriceStore } from "./bulk-price-store";

function createSourceConfig(): BulkPriceSourceConfig {
  return {
    storeId: "store-1",
    schema: "public",
    table: "master_price",
    basePriceColumn: "base_price",
    sourceMatchColumn: "match_code",
    soldOutColumn: "",
    workDateColumn: "work_date",
    workDateFrom: "2026-04-01",
    workDateTo: "2026-04-01",
    coupangMatchField: "externalVendorSku",
  };
}

function createRules(overrides?: Partial<BulkPriceRuleSet>): BulkPriceRuleSet {
  return {
    fixedAdjustment: 0,
    feeRate: 0.1,
    marginRate: 0.2,
    inboundShippingCost: 2500,
    discountRate: 0.1,
    roundingUnit: 10,
    roundingMode: "ceil",
    ...overrides,
  };
}

function createPreviewRow(vendorItemId: string, computedPrice = 1000) {
  return {
    vendorItemId,
    sellerProductId: `seller-${vendorItemId}`,
    sellerProductName: `Product ${vendorItemId}`,
    itemName: `Option ${vendorItemId}`,
    externalVendorSku: `SKU-${vendorItemId}`,
    barcode: null,
    matchedCode: `CODE-${vendorItemId}`,
    status: "ready" as const,
    messages: [],
    isSelectable: true,
    lastModifiedAt: null,
    lastAppliedAt: null,
    lastAppliedPrice: null,
    currentPrice: 900,
    currentInventoryCount: 102,
    sourceSoldOut: null,
    currentSaleStatus: "ONSALE" as const,
    targetInventoryCount: null,
    targetSaleStatus: null,
    needsPriceUpdate: true,
    needsInventoryUpdate: false,
    needsSaleStatusUpdate: false,
    basePrice: 500,
    discountedBaseCost: 450,
    effectiveCost: 950,
    rawTargetPrice: 1187.5,
    adjustedTargetPrice: 1187.5,
    roundedTargetPrice: computedPrice,
    computedPrice,
    manualOverridePrice: null,
    effectiveTargetPrice: computedPrice,
    sourceRow: null,
  };
}

function createPreviewResponse(
  vendorItemIds: string[],
  overrides?: Partial<BulkPricePreviewResponse>,
): BulkPricePreviewResponse {
  const rows = vendorItemIds.map((vendorItemId) => createPreviewRow(vendorItemId));
  return {
    sourceConfig: createSourceConfig(),
    rules: createRules(),
    rows,
    stats: {
      totalCoupangItems: rows.length,
      readyCount: rows.length,
      selectableCount: rows.filter((row) => row.isSelectable).length,
      conflictCount: 0,
      unmatchedCount: 0,
      invalidSourceCount: 0,
    },
    workDateFilterSummary: {
      enabled: true,
      column: "work_date",
      startDate: "2026-04-01",
      endDate: "2026-04-01",
      excludedSourceRowCount: 0,
      excludedPreviewRowCount: 0,
    },
    buildMetrics: {
      totalMs: 120,
      metadataMs: 5,
      coupangCandidateMs: 60,
      sourceQueryMs: 35,
      latestRecordLoadMs: 10,
      rowBuildMs: 10,
      coupangExplorerFetchedAt: "2026-04-01T00:00:00.000Z",
      coupangExplorerServedFromCache: false,
      coupangExplorerSource: "live",
    },
    generatedAt: new Date().toISOString(),
    previewId: "preview-test",
    page: 1,
    pageSize: rows.length || 1,
    filteredTotal: rows.length,
    totalPages: 1,
    ...overrides,
  };
}

function deferred() {
  let resolve = () => undefined;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve,
  };
}

async function waitForCondition(
  callback: () => Promise<boolean>,
  timeoutMs = 5_000,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await callback()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out while waiting for condition.");
}

let tmpDir: string | null = null;
let originalBulkPriceFile = process.env.COUPANG_BULK_PRICE_FILE;

afterEach(async () => {
  process.env.COUPANG_BULK_PRICE_FILE = originalBulkPriceFile;
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("bulk price helpers", () => {
  it("calculates inverse price and rounding", () => {
    const result = calculateBulkPriceValues(10000, createRules());
    expect(result.discountedBaseCost).toBe(9000);
    expect(result.effectiveCost).toBe(11500);
    expect(result.rawTargetPrice).toBeCloseTo(16428.5714, 3);
    expect(result.roundedTargetPrice).toBe(16430);
  });

  it("applies negative fixed adjustment as a deduction", () => {
    const result = calculateBulkPriceValues(10000, createRules({ fixedAdjustment: -1000 }));
    expect(result.adjustedTargetPrice).toBeCloseTo(15428.5714, 3);
    expect(result.roundedTargetPrice).toBe(15430);
  });

  it("marks duplicate and unmatched preview rows", () => {
    const rows = buildBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [
        {
          matchedCode: "CODE-A",
          basePrice: 1000,
          sourceSoldOut: null,
          soldOutValueError: null,
        },
        {
          matchedCode: "CODE-A",
          basePrice: 1100,
          sourceSoldOut: null,
          soldOutValueError: null,
        },
      ],
      coupangRows: [
        {
          vendorItemId: "v1",
          sellerProductId: "s1",
          sellerProductName: "Product 1",
          itemName: "Option 1",
          externalVendorSku: "SKU-1",
          barcode: null,
          matchedCode: "CODE-A",
          currentPrice: 1000,
          currentInventoryCount: 5,
          saleStatus: "ONSALE",
          lastModifiedAt: null,
        },
        {
          vendorItemId: "v2",
          sellerProductId: "s2",
          sellerProductName: "Product 2",
          itemName: "Option 2",
          externalVendorSku: "SKU-2",
          barcode: null,
          matchedCode: "CODE-B",
          currentPrice: 1000,
          currentInventoryCount: 5,
          saleStatus: "ONSALE",
          lastModifiedAt: null,
        },
      ],
    }).rows;

    expect(rows[0]?.status).toBe("conflict");
    expect(rows[1]?.status).toBe("unmatched");
  });

  it("omits preview rows when only stale work-date source rows exist", () => {
    const result = buildBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [],
      excludedOnlyMatchCodes: new Set(["CODE-OLD"]),
      coupangRows: [
        {
          vendorItemId: "v1",
          sellerProductId: "s1",
          sellerProductName: "Product 1",
          itemName: "Option 1",
          externalVendorSku: "SKU-1",
          barcode: null,
          matchedCode: "CODE-OLD",
          currentPrice: 1000,
          currentInventoryCount: 5,
          saleStatus: "ONSALE",
          lastModifiedAt: null,
        },
      ],
    });

    expect(result.rows).toHaveLength(0);
    expect(result.excludedPreviewRowCount).toBe(1);
  });

  it("parses sold-out source values from common types", () => {
    expect(parseSoldOutSourceValue(true)).toBe(true);
    expect(parseSoldOutSourceValue(false)).toBe(false);
    expect(parseSoldOutSourceValue(1)).toBe(true);
    expect(parseSoldOutSourceValue(0)).toBe(false);
    expect(parseSoldOutSourceValue("YES")).toBe(true);
    expect(parseSoldOutSourceValue("판매중")).toBe(false);
    expect(parseSoldOutSourceValue("unknown")).toBeNull();
    expect(parseSoldOutSourceValue("")).toBeNull();
  });

  it("marks rows invalid when the sold-out source value cannot be parsed", () => {
    const rows = buildBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [
        {
          matchedCode: "CODE-A",
          basePrice: 1000,
          sourceSoldOut: null,
          soldOutValueError: "Sold-out value could not be parsed.",
        },
      ],
      coupangRows: [
        {
          vendorItemId: "v1",
          sellerProductId: "s1",
          sellerProductName: "Product 1",
          itemName: "Option 1",
          externalVendorSku: "SKU-1",
          barcode: null,
          matchedCode: "CODE-A",
          currentPrice: 1000,
          currentInventoryCount: 5,
          saleStatus: "ONSALE",
          lastModifiedAt: null,
        },
      ],
    }).rows;

    expect(rows[0]?.status).toBe("invalid_source");
    expect(rows[0]?.isSelectable).toBe(false);
    expect(rows[0]?.messages).toContain("Sold-out value could not be parsed.");
  });

  it("keeps same-price rows selectable when sale status still needs syncing", () => {
    const calculated = calculateBulkPriceValues(1000, createRules());
    const rows = buildBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [
        {
          matchedCode: "CODE-A",
          basePrice: 1000,
          sourceSoldOut: false,
          soldOutValueError: null,
        },
      ],
      coupangRows: [
        {
          vendorItemId: "v1",
          sellerProductId: "s1",
          sellerProductName: "Product 1",
          itemName: "Option 1",
          externalVendorSku: "SKU-1",
          barcode: null,
          matchedCode: "CODE-A",
          currentPrice: calculated.computedPrice,
          currentInventoryCount: 5,
          saleStatus: "SUSPENDED",
          lastModifiedAt: null,
        },
      ],
    }).rows;

    expect(rows[0]?.status).toBe("ready");
    expect(rows[0]?.needsPriceUpdate).toBe(false);
    expect(rows[0]?.needsSaleStatusUpdate).toBe(true);
    expect(rows[0]?.isSelectable).toBe(true);
    expect(rows[0]?.targetSaleStatus).toBe("ONSALE");
  });

  it("keeps inventory-only rows selectable when sold-out sync still needs syncing", () => {
    const calculated = calculateBulkPriceValues(1000, createRules());
    const rows = buildBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [
        {
          matchedCode: "CODE-A",
          basePrice: 1000,
          sourceSoldOut: true,
          soldOutValueError: null,
        },
      ],
      coupangRows: [
        {
          vendorItemId: "v1",
          sellerProductId: "s1",
          sellerProductName: "Product 1",
          itemName: "Option 1",
          externalVendorSku: "SKU-1",
          barcode: null,
          matchedCode: "CODE-A",
          currentPrice: calculated.computedPrice,
          currentInventoryCount: 5,
          saleStatus: "ONSALE",
          lastModifiedAt: null,
        },
      ],
    }).rows;

    expect(rows[0]?.needsPriceUpdate).toBe(false);
    expect(rows[0]?.needsInventoryUpdate).toBe(true);
    expect(rows[0]?.needsSaleStatusUpdate).toBe(false);
    expect(rows[0]?.targetInventoryCount).toBe(0);
    expect(rows[0]?.isSelectable).toBe(true);
  });

  it("requires master sku database url", () => {
    expect(() => resolveMasterSkuDatabaseUrl("")).toThrow(
      /MASTER_SKU_DATABASE_URL is required/i,
    );
  });

  it("creates, updates, and deletes presets independently", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-preset-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () => createPreviewResponse(["v1"]),
      applyPriceUpdate: async () => ({ message: "updated" }),
      applySaleStatusUpdate: async () => ({ message: "sale status updated" }),
    });

    const createdSourcePreset = await service.createSourcePreset({
      name: "source-a",
      memo: "first source",
      sourceConfig: createSourceConfig(),
    });
    const createdRulePreset = await service.createRulePreset({
      name: "rule-a",
      memo: "first rule",
      rules: createRules(),
    });

    expect((await service.listSourcePresets()).items).toHaveLength(1);
    expect((await service.listRulePresets()).items).toHaveLength(1);

    const updatedSourcePreset = await service.updateSourcePreset(createdSourcePreset.id, {
      name: "source-b",
      memo: "updated source",
      sourceConfig: {
        ...createSourceConfig(),
        soldOutColumn: "is_sold_out",
        coupangMatchField: "barcode",
      },
    });
    const updatedRulePreset = await service.updateRulePreset(createdRulePreset.id, {
      name: "rule-b",
      memo: "updated rule",
      rules: {
        ...createRules(),
        fixedAdjustment: 500,
      },
    });

    expect(updatedSourcePreset.name).toBe("source-b");
    expect(updatedSourcePreset.sourceConfig.soldOutColumn).toBe("is_sold_out");
    expect(updatedSourcePreset.sourceConfig.coupangMatchField).toBe("barcode");
    expect(updatedRulePreset.name).toBe("rule-b");
    expect(updatedRulePreset.rules.fixedAdjustment).toBe(500);

    await service.deleteSourcePreset(createdSourcePreset.id);
    await service.deleteRulePreset(createdRulePreset.id);

    expect((await service.listSourcePresets()).items).toEqual([]);
    expect((await service.listRulePresets()).items).toEqual([]);
  });
});

describe("preview service", () => {
  it("returns build metrics with the paged preview response", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-preview-service-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () =>
        createPreviewResponse(["v1"], {
          buildMetrics: {
            totalMs: 4321,
            metadataMs: 20,
            coupangCandidateMs: 3900,
            sourceQueryMs: 260,
            latestRecordLoadMs: 90,
            rowBuildMs: 51,
            coupangExplorerFetchedAt: "2026-04-01T09:00:00.000Z",
            coupangExplorerServedFromCache: true,
            coupangExplorerSource: "live",
          },
        }),
      applyPriceUpdate: async () => ({ message: "updated" }),
      applySaleStatusUpdate: async () => ({ message: "sale status updated" }),
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      page: 1,
      pageSize: 100,
    });

    expect(preview.buildMetrics).toMatchObject({
      totalMs: 4321,
      coupangCandidateMs: 3900,
      coupangExplorerServedFromCache: true,
      coupangExplorerSource: "live",
    });
  });
});

describe("bulk price run lifecycle", () => {
  it("uses manual override when applying price", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-run-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);
    const applied: Array<{ vendorItemId: string; price: number }> = [];

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () =>
        createPreviewResponse(["v1"], {
          rows: [createPreviewRow("v1", 900)],
          stats: {
            totalCoupangItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async ({ vendorItemId, price }) => {
        applied.push({ vendorItemId, price });
        return { message: "updated" };
      },
      applySaleStatusUpdate: async () => ({ message: "sale status updated" }),
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });
    const detail = await service.createRun({
      previewId: preview.previewId,
      items: [{ vendorItemId: "v1", manualOverridePrice: 777 }],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(applied).toEqual([{ vendorItemId: "v1", price: 777 }]);
    expect(completed.items[0]?.effectiveTargetPrice).toBe(777);
    expect(completed.items[0]?.status).toBe("succeeded");
    expect(completed.run.summary.recentChanges[0]).toMatchObject({
      rowId: "v1",
      matchedCode: "CODE-v1",
      beforePrice: 900,
      afterPrice: 777,
    });
  });

  it("creates run items for all ready rows when selectionMode is all_ready", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-run-all-ready-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () =>
        createPreviewResponse(["v1", "v2", "v3"], {
          rows: [
            {
              ...createPreviewRow("v1", 1010),
              isSelectable: false,
              needsPriceUpdate: false,
              effectiveTargetPrice: 1010,
            },
            {
              ...createPreviewRow("v2", 900),
              isSelectable: false,
              needsPriceUpdate: false,
              effectiveTargetPrice: 900,
            },
            {
              ...createPreviewRow("v3", 1020),
              status: "conflict",
              isSelectable: false,
              messages: ["conflict"],
            },
          ],
          stats: {
            totalCoupangItems: 3,
            readyCount: 2,
            selectableCount: 0,
            conflictCount: 1,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async () => ({ message: "updated" }),
      applySaleStatusUpdate: async () => ({ message: "sale status updated" }),
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });
    const detail = await service.createRun({
      previewId: preview.previewId,
      selectionMode: "all_ready",
      excludedRowKeys: [],
      items: [],
    });

    const runDetail = await service.getRunDetail(detail.run.id);
    expect(runDetail.items.map((item) => item.vendorItemId)).toEqual(["v1", "v2"]);
  });

  it("skips updates when the target price already matches the current price", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-run-same-price-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);
    const applied: Array<{ vendorItemId: string; price: number }> = [];

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () =>
        createPreviewResponse(["v1"], {
          rows: [createPreviewRow("v1", 900)],
          stats: {
            totalCoupangItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async ({ vendorItemId, price }) => {
        applied.push({ vendorItemId, price });
        return { message: "updated" };
      },
      applySaleStatusUpdate: async () => ({ message: "sale status updated" }),
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });
    const detail = await service.createRun({
      previewId: preview.previewId,
      items: [{ vendorItemId: "v1", manualOverridePrice: null }],
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(applied).toEqual([]);
    expect(completed.items[0]?.status).toBe("skipped_unmatched");
    expect(completed.items[0]?.messages).toContain(
      "Current price already matches target price.",
    );
  });

  it("runs inventory-only items without calling the price updater", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-inventory-only-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);
    const priceCalls: Array<{ vendorItemId: string; price: number }> = [];
    const inventoryCalls: Array<{ vendorItemId: string; inventoryCount: number }> = [];

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () =>
        createPreviewResponse(["v1"], {
          rows: [
            {
              ...createPreviewRow("v1", 900),
              currentPrice: 900,
              currentInventoryCount: 5,
              sourceSoldOut: true,
              targetInventoryCount: 0,
              needsPriceUpdate: false,
              needsInventoryUpdate: true,
              needsSaleStatusUpdate: false,
              isSelectable: true,
            },
          ],
          stats: {
            totalCoupangItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async ({ vendorItemId, price }) => {
        priceCalls.push({ vendorItemId, price });
        return { message: "updated" };
      },
      applyInventoryUpdate: async ({ vendorItemId, inventoryCount }) => {
        inventoryCalls.push({ vendorItemId, inventoryCount });
        return { message: "inventory updated" };
      },
      applySaleStatusUpdate: async () => ({ message: "sale status updated" }),
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });
    const detail = await service.createRun({
      previewId: preview.previewId,
      items: [{ vendorItemId: "v1", manualOverridePrice: null }],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(priceCalls).toEqual([]);
    expect(inventoryCalls).toEqual([{ vendorItemId: "v1", inventoryCount: 0 }]);
    expect(completed.items[0]?.status).toBe("succeeded");
    expect(completed.run.summary.recentChanges[0]).toMatchObject({
      rowId: "v1",
      beforePrice: null,
      afterPrice: null,
      beforeInventoryCount: 5,
      afterInventoryCount: 0,
    });
  });

  it("runs sale-status-only items without calling the price updater", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-sale-status-only-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);
    const priceCalls: Array<{ vendorItemId: string; price: number }> = [];
    const saleStatusCalls: Array<{ vendorItemId: string; saleStatus: string }> = [];

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () =>
        createPreviewResponse(["v1"], {
          rows: [
            {
              ...createPreviewRow("v1", 900),
              currentSaleStatus: "SUSPENDED",
              targetSaleStatus: "ONSALE",
              needsPriceUpdate: false,
              needsSaleStatusUpdate: true,
              isSelectable: true,
            },
          ],
          stats: {
            totalCoupangItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async ({ vendorItemId, price }) => {
        priceCalls.push({ vendorItemId, price });
        return { message: "updated" };
      },
      applyInventoryUpdate: async () => ({ message: "inventory updated" }),
      applySaleStatusUpdate: async ({ vendorItemId, saleStatus }) => {
        saleStatusCalls.push({ vendorItemId, saleStatus });
        return { message: "sale status updated" };
      },
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });
    const detail = await service.createRun({
      previewId: preview.previewId,
      items: [{ vendorItemId: "v1", manualOverridePrice: null }],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(priceCalls).toEqual([]);
    expect(saleStatusCalls).toEqual([{ vendorItemId: "v1", saleStatus: "ONSALE" }]);
    expect(completed.items[0]?.status).toBe("succeeded");
    expect(completed.items[0]?.lastAppliedPrice).toBeNull();
    expect(completed.run.summary.recentChanges[0]).toMatchObject({
      rowId: "v1",
      beforePrice: null,
      afterPrice: null,
      beforeSaleStatus: "SUSPENDED",
      afterSaleStatus: "ONSALE",
    });
  });

  it("restocks and resumes suspended items when the source says not sold out", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-restock-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);
    const inventoryCalls: Array<{ vendorItemId: string; inventoryCount: number }> = [];
    const saleStatusCalls: Array<{ vendorItemId: string; saleStatus: string }> = [];

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () =>
        createPreviewResponse(["v1"], {
          rows: [
            {
              ...createPreviewRow("v1", 900),
              currentPrice: 900,
              currentInventoryCount: 0,
              sourceSoldOut: false,
              currentSaleStatus: "SUSPENDED",
              targetInventoryCount: 102,
              targetSaleStatus: "ONSALE",
              needsPriceUpdate: false,
              needsInventoryUpdate: true,
              needsSaleStatusUpdate: true,
              isSelectable: true,
            },
          ],
          stats: {
            totalCoupangItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async () => ({ message: "updated" }),
      applyInventoryUpdate: async ({ vendorItemId, inventoryCount }) => {
        inventoryCalls.push({ vendorItemId, inventoryCount });
        return { message: "inventory updated" };
      },
      applySaleStatusUpdate: async ({ vendorItemId, saleStatus }) => {
        saleStatusCalls.push({ vendorItemId, saleStatus });
        return { message: "sale status updated" };
      },
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });
    const detail = await service.createRun({
      previewId: preview.previewId,
      items: [{ vendorItemId: "v1", manualOverridePrice: null }],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(inventoryCalls).toEqual([{ vendorItemId: "v1", inventoryCount: 102 }]);
    expect(saleStatusCalls).toEqual([{ vendorItemId: "v1", saleStatus: "ONSALE" }]);
    expect(completed.run.summary.recentChanges[0]).toMatchObject({
      beforeInventoryCount: 0,
      afterInventoryCount: 102,
      beforeSaleStatus: "SUSPENDED",
      afterSaleStatus: "ONSALE",
    });
  });

  it("keeps price success recorded when sale-status sync fails afterwards", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-partial-failure-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);
    const priceCalls: Array<{ vendorItemId: string; price: number }> = [];
    const saleStatusCalls: Array<{ vendorItemId: string; saleStatus: string }> = [];

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () =>
        createPreviewResponse(["v1"], {
          rows: [
            {
              ...createPreviewRow("v1", 950),
              currentSaleStatus: "SUSPENDED",
              targetSaleStatus: "ONSALE",
              needsPriceUpdate: true,
              needsSaleStatusUpdate: true,
              isSelectable: true,
            },
          ],
          stats: {
            totalCoupangItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async ({ vendorItemId, price }) => {
        priceCalls.push({ vendorItemId, price });
        return { message: "price updated" };
      },
      applyInventoryUpdate: async () => ({ message: "inventory updated" }),
      applySaleStatusUpdate: async ({ vendorItemId, saleStatus }) => {
        saleStatusCalls.push({ vendorItemId, saleStatus });
        throw new Error("sale sync failed");
      },
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });
    const detail = await service.createRun({
      previewId: preview.previewId,
      items: [{ vendorItemId: "v1", manualOverridePrice: null }],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "failed";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(priceCalls).toEqual([{ vendorItemId: "v1", price: 950 }]);
    expect(saleStatusCalls).toEqual([{ vendorItemId: "v1", saleStatus: "ONSALE" }]);
    expect(completed.items[0]?.status).toBe("failed");
    expect(completed.items[0]?.lastAppliedPrice).toBe(950);
    expect(completed.items[0]?.messages).toContain("price updated");
    expect(completed.items[0]?.messages).toContain(
      "Price updated, but Coupang sold-out sync failed: sale sync failed",
    );
    expect(completed.latestRecords[0]?.appliedPrice).toBe(950);
  });

  it("limits run workers using the configured concurrency", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-run-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);
    const deferredById = new Map(
      ["v1", "v2"].map((id) => [id, deferred()] as const),
    );
    const started: string[] = [];
    let activeCount = 0;
    let maxActiveCount = 0;

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () => createPreviewResponse(["v1", "v2"]),
      runWorkerConcurrency: 1,
      applyPriceUpdate: async ({ vendorItemId }) => {
        started.push(vendorItemId);
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await deferredById.get(vendorItemId)?.promise;
        activeCount -= 1;
        return { message: `updated ${vendorItemId}` };
      },
      applyInventoryUpdate: async () => ({ message: "inventory updated" }),
      applySaleStatusUpdate: async () => ({ message: "sale status updated" }),
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });
    const created = await service.createRun({
      previewId: preview.previewId,
      items: ["v1", "v2"].map((vendorItemId) => ({
        vendorItemId,
        manualOverridePrice: null,
      })),
    });

    await waitForCondition(async () => started.length === 1);
    expect(started).toEqual(["v1"]);

    deferredById.get("v1")?.resolve();

    await waitForCondition(async () => started.length === 2);
    expect(started).toEqual(["v1", "v2"]);

    deferredById.get("v2")?.resolve();

    await waitForCondition(async () => {
      const detail = await service.getRunDetail(created.run.id);
      return detail.run.summary.succeeded === 2;
    });

    expect(maxActiveCount).toBe(1);
  });

  it(
    "pauses, resumes, and stops queued items with concurrency two",
    async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "bulk-price-run-"));
    process.env.COUPANG_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new CoupangBulkPriceStore(process.env.COUPANG_BULK_PRICE_FILE);
    const deferredById = new Map(
      ["v1", "v2", "v3", "v4", "v5"].map((id) => [id, deferred()] as const),
    );

    const service = new CoupangBulkPriceService({
      store,
      loadSourceMetadata: async () => ({
        configured: true,
        databaseUrlAvailable: true,
        tables: [],
        columns: [],
        sampleRows: [],
        requestedTable: null,
        fetchedAt: new Date().toISOString(),
      }),
      buildPreview: async () => createPreviewResponse(["v1", "v2", "v3", "v4", "v5"]),
      applyPriceUpdate: async ({ vendorItemId }) => {
        await deferredById.get(vendorItemId)?.promise;
        return { message: `updated ${vendorItemId}` };
      },
      applySaleStatusUpdate: async () => ({ message: "sale status updated" }),
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });
    const created = await service.createRun({
      previewId: preview.previewId,
      items: ["v1", "v2", "v3", "v4", "v5"].map((vendorItemId) => ({
        vendorItemId,
        manualOverridePrice: null,
      })),
    });

    await waitForCondition(async () => {
      const detail = await service.getRunDetail(created.run.id);
      return detail.run.summary.running === 2;
    });

    await service.pauseRun(created.run.id);
    deferredById.get("v1")?.resolve();
    deferredById.get("v2")?.resolve();

    await waitForCondition(async () => {
      const detail = await service.getRunDetail(created.run.id);
      return detail.run.status === "paused";
    });

    const paused = await service.getRunDetail(created.run.id);
    expect(paused.items.filter((item) => item.status === "paused")).toHaveLength(3);

    await service.resumeRun(created.run.id);

    await waitForCondition(async () => {
      const detail = await service.getRunDetail(created.run.id);
      return detail.run.summary.running === 2;
    });

    await service.stopRun(created.run.id);
    deferredById.get("v3")?.resolve();
    deferredById.get("v4")?.resolve();

    await waitForCondition(async () => {
      const detail = await service.getRunDetail(created.run.id);
      return detail.run.status === "stopped";
    });

    const stopped = await service.getRunDetail(created.run.id);
    expect(stopped.run.summary.succeeded).toBe(4);
    expect(stopped.run.summary.stopped).toBe(1);
    expect(
      stopped.items.find((item) => item.vendorItemId === "v5")?.status,
    ).toBe("stopped");
    },
    15_000,
  );
});
