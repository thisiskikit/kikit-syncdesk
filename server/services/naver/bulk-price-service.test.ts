import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  NaverBulkPricePreviewResponse,
  NaverBulkPriceRuleSet,
  NaverBulkPriceSourceConfig,
} from "@shared/naver-bulk-price";
import {
  NaverBulkPriceService,
  buildNaverBulkPricePreviewRows,
  calculateBulkPriceValues,
  resolveMasterSkuDatabaseUrl,
} from "./bulk-price-service";
import { NaverBulkPriceStore } from "./bulk-price-store";

function createSourceConfig(): NaverBulkPriceSourceConfig {
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
    naverMatchField: "sellerManagementCode",
  };
}

function createRules(overrides?: Partial<NaverBulkPriceRuleSet>): NaverBulkPriceRuleSet {
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

function buildRowKey(originProductNo: string, channelProductNo: string | null) {
  return `${originProductNo}::${channelProductNo ?? ""}`;
}

function createPreviewRow(originProductNo: string, computedPrice = 1000) {
  return {
    rowKey: buildRowKey(originProductNo, `channel-${originProductNo}`),
    originProductNo,
    channelProductNo: `channel-${originProductNo}`,
    sellerManagementCode: `SELLER-${originProductNo}`,
    sellerBarcode: `BARCODE-${originProductNo}`,
    productName: `Product ${originProductNo}`,
    matchedCode: `CODE-${originProductNo}`,
    status: "ready" as const,
    messages: [],
    isSelectable: true,
    modifiedAt: null,
    lastAppliedAt: null,
    lastAppliedPrice: null,
    currentPrice: 900,
    currentStockQuantity: 102,
    sourceSoldOut: null,
    currentSaleStatus: "SALE" as const,
    currentDisplayStatus: "ON" as const,
    targetStockQuantity: null,
    targetSaleStatus: null,
    needsPriceUpdate: true,
    needsInventoryUpdate: false,
    needsSaleStatusUpdate: false,
    targetDisplayStatus: null,
    needsDisplayStatusUpdate: false,
    saleStatusCode: "SALE",
    saleStatusLabel: "On Sale",
    hasOptions: false,
    optionType: "none" as const,
    optionCount: 0,
    optionHandlingMessage: "Origin price only.",
    basePrice: 500,
    discountedBaseCost: 450,
    effectiveCost: 950,
    rawTargetPrice: 1187.5,
    adjustedTargetPrice: 1187.5,
    roundedTargetPrice: computedPrice,
    computedPrice,
    manualOverridePrice: null,
    effectiveTargetPrice: computedPrice,
    sourceRow: {
      match_code: `CODE-${originProductNo}`,
      base_price: 500,
    },
  };
}

function createPreviewResponse(
  originProductNos: string[],
  overrides?: Partial<NaverBulkPricePreviewResponse>,
): NaverBulkPricePreviewResponse {
  const rows = originProductNos.map((originProductNo) => createPreviewRow(originProductNo));
  return {
    previewId: "preview-test",
    sourceConfig: createSourceConfig(),
    rules: createRules(),
    rows,
    stats: {
      totalNaverItems: rows.length,
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
    generatedAt: new Date().toISOString(),
    page: 1,
    pageSize: 100,
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
const originalBulkPriceFile = process.env.NAVER_BULK_PRICE_FILE;

afterEach(async () => {
  process.env.NAVER_BULK_PRICE_FILE = originalBulkPriceFile;
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("naver bulk price helpers", () => {
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
    const rows = buildNaverBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [
        {
          matchedCode: "CODE-A",
          basePrice: 1000,
          sourceSoldOut: null,
          soldOutValueError: null,
          raw: { match_code: "CODE-A", base_price: 1000 },
        },
        {
          matchedCode: "CODE-A",
          basePrice: 1100,
          sourceSoldOut: null,
          soldOutValueError: null,
          raw: { match_code: "CODE-A", base_price: 1100 },
        },
      ],
      naverRows: [
        {
          rowKey: buildRowKey("origin-1", "channel-1"),
          originProductNo: "origin-1",
          channelProductNo: "channel-1",
          sellerManagementCode: "SELLER-1",
          sellerBarcode: "BARCODE-1",
          productName: "Product 1",
          matchedCode: "CODE-A",
          currentPrice: 1000,
          stockQuantity: 5,
          saleStatusCode: "SALE",
          displayStatusCode: "ON",
          saleStatusLabel: "On Sale",
          hasOptions: false,
          optionType: "none" as const,
          optionCount: 0,
          optionHandlingMessage: "Origin price only.",
          modifiedAt: null,
        },
        {
          rowKey: buildRowKey("origin-2", "channel-2"),
          originProductNo: "origin-2",
          channelProductNo: "channel-2",
          sellerManagementCode: "SELLER-2",
          sellerBarcode: "BARCODE-2",
          productName: "Product 2",
          matchedCode: "CODE-B",
          currentPrice: 1000,
          stockQuantity: 5,
          saleStatusCode: "SALE",
          displayStatusCode: "ON",
          saleStatusLabel: "On Sale",
          hasOptions: true,
          optionType: "unknown" as const,
          optionCount: 0,
          optionHandlingMessage: "Origin price only.",
          modifiedAt: null,
        },
      ],
    }).rows;

    expect(rows[0]?.status).toBe("conflict");
    expect(rows[1]?.status).toBe("unmatched");
    expect(rows[1]?.optionHandlingMessage).toContain("Origin");
  });

  it("omits preview rows when only stale work-date source rows exist", () => {
    const result = buildNaverBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [],
      excludedOnlyMatchCodes: new Set(["CODE-OLD"]),
      naverRows: [
        {
          rowKey: buildRowKey("origin-1", "channel-1"),
          originProductNo: "origin-1",
          channelProductNo: "channel-1",
          sellerManagementCode: "SELLER-1",
          sellerBarcode: "BARCODE-1",
          productName: "Product 1",
          matchedCode: "CODE-OLD",
          currentPrice: 1000,
          stockQuantity: 5,
          saleStatusCode: "SALE",
          displayStatusCode: "ON",
          saleStatusLabel: "On Sale",
          hasOptions: false,
          optionType: "none" as const,
          optionCount: 0,
          optionHandlingMessage: "Origin price only.",
          modifiedAt: null,
        },
      ],
    });

    expect(result.rows).toHaveLength(0);
    expect(result.excludedPreviewRowCount).toBe(1);
  });

  it("marks rows invalid when the sold-out value cannot be parsed", () => {
    const rows = buildNaverBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [
        {
          matchedCode: "CODE-A",
          basePrice: 500,
          sourceSoldOut: null,
          soldOutValueError: "Sold-out value is invalid.",
          raw: { match_code: "CODE-A", base_price: 500, is_sold_out: "maybe" },
        },
      ],
      naverRows: [
        {
          rowKey: buildRowKey("origin-1", "channel-1"),
          originProductNo: "origin-1",
          channelProductNo: "channel-1",
          sellerManagementCode: "SELLER-1",
          sellerBarcode: "BARCODE-1",
          productName: "Product 1",
          matchedCode: "CODE-A",
          currentPrice: 1000,
          stockQuantity: 5,
          saleStatusCode: "SALE",
          displayStatusCode: "ON",
          saleStatusLabel: "On Sale",
          hasOptions: false,
          optionType: "none" as const,
          optionCount: 0,
          optionHandlingMessage: "Origin price only.",
          modifiedAt: null,
        },
      ],
    }).rows;

    expect(rows[0]?.status).toBe("invalid_source");
    expect(rows[0]?.messages).toContain("Sold-out value is invalid.");
    expect(rows[0]?.isSelectable).toBe(false);
  });

  it("keeps rows selectable when only the sale status needs syncing", () => {
    const basePrice = 500;
    const computedPrice = calculateBulkPriceValues(basePrice, createRules()).computedPrice;
    const rows = buildNaverBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [
        {
          matchedCode: "CODE-A",
          basePrice,
          sourceSoldOut: false,
          soldOutValueError: null,
          raw: { match_code: "CODE-A", base_price: basePrice, is_sold_out: false },
        },
      ],
      naverRows: [
        {
          rowKey: buildRowKey("origin-1", "channel-1"),
          originProductNo: "origin-1",
          channelProductNo: "channel-1",
          sellerManagementCode: "SELLER-1",
          sellerBarcode: "BARCODE-1",
          productName: "Product 1",
          matchedCode: "CODE-A",
          currentPrice: computedPrice,
          stockQuantity: 5,
          saleStatusCode: "OUTOFSTOCK",
          displayStatusCode: "ON",
          saleStatusLabel: "Out of stock",
          hasOptions: false,
          optionType: "none" as const,
          optionCount: 0,
          optionHandlingMessage: "Origin price only.",
          modifiedAt: null,
        },
      ],
    }).rows;

    expect(rows[0]?.needsPriceUpdate).toBe(false);
    expect(rows[0]?.needsSaleStatusUpdate).toBe(true);
    expect(rows[0]?.targetSaleStatus).toBe("SALE");
    expect(rows[0]?.isSelectable).toBe(true);
  });

  it("keeps rows selectable when only the stock quantity needs syncing", () => {
    const basePrice = 500;
    const computedPrice = calculateBulkPriceValues(basePrice, createRules()).computedPrice;
    const rows = buildNaverBulkPricePreviewRows({
      rules: createRules(),
      latestRecords: [],
      sourceRows: [
        {
          matchedCode: "CODE-A",
          basePrice,
          sourceSoldOut: true,
          soldOutValueError: null,
          raw: { match_code: "CODE-A", base_price: basePrice, is_sold_out: true },
        },
      ],
      naverRows: [
        {
          rowKey: buildRowKey("origin-1", "channel-1"),
          originProductNo: "origin-1",
          channelProductNo: "channel-1",
          sellerManagementCode: "SELLER-1",
          sellerBarcode: "BARCODE-1",
          productName: "Product 1",
          matchedCode: "CODE-A",
          currentPrice: computedPrice,
          stockQuantity: 5,
          saleStatusCode: "SALE",
          displayStatusCode: "ON",
          saleStatusLabel: "On Sale",
          hasOptions: false,
          optionType: "none" as const,
          optionCount: 0,
          optionHandlingMessage: "Origin price only.",
          modifiedAt: null,
        },
      ],
    }).rows;

    expect(rows[0]?.needsPriceUpdate).toBe(false);
    expect(rows[0]?.needsInventoryUpdate).toBe(true);
    expect(rows[0]?.needsSaleStatusUpdate).toBe(false);
    expect(rows[0]?.targetStockQuantity).toBe(0);
    expect(rows[0]?.isSelectable).toBe(true);
  });

  it("requires master sku database url", () => {
    expect(() => resolveMasterSkuDatabaseUrl("")).toThrow(
      /MASTER_SKU_DATABASE_URL is required/i,
    );
  });

  it("creates, updates, and deletes presets independently", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-preset-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);

    const service = new NaverBulkPriceService({
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
      buildPreview: async () => createPreviewResponse(["origin-1"]),
      applyPriceUpdate: async () => ({ message: "updated" }),
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
        naverMatchField: "sellerBarcode",
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
    expect(updatedSourcePreset.sourceConfig.naverMatchField).toBe("sellerBarcode");
    expect(updatedRulePreset.name).toBe("rule-b");
    expect(updatedRulePreset.rules.fixedAdjustment).toBe(500);

    await service.deleteSourcePreset(createdSourcePreset.id);
    await service.deleteRulePreset(createdRulePreset.id);

    expect((await service.listSourcePresets()).items).toEqual([]);
    expect((await service.listRulePresets()).items).toEqual([]);
  });

  it("reuses a cached preview when creating a run from the current preview result", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-preview-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    let buildPreviewCallCount = 0;

    const service = new NaverBulkPriceService({
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
      buildPreview: async () => {
        buildPreviewCallCount += 1;
        return createPreviewResponse(["origin-1"]);
      },
      applyPriceUpdate: async () => ({ message: "updated" }),
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      items: [
        {
          rowKey: buildRowKey("origin-1", "channel-origin-1"),
          manualOverridePrice: null,
        },
      ],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return (
        next.run.status === "succeeded" ||
        next.run.status === "partially_succeeded"
      );
    });

    expect(buildPreviewCallCount).toBe(1);
  });

  it("clears the preview cache after a successful run completes", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-preview-refresh-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    let buildPreviewCallCount = 0;

    const service = new NaverBulkPriceService({
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
      buildPreview: async () => {
        buildPreviewCallCount += 1;
        return createPreviewResponse(["origin-1"]);
      },
      applyPriceUpdate: async () => ({ message: "updated" }),
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      items: [
        {
          rowKey: buildRowKey("origin-1", "channel-origin-1"),
          manualOverridePrice: null,
        },
      ],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    expect(buildPreviewCallCount).toBe(2);
  });

  it("pages preview rows on the server and reuses the preview session", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-preview-page-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    let buildPreviewCallCount = 0;

    const unmatchedRow = {
      ...createPreviewRow("origin-3"),
      matchedCode: null,
      status: "unmatched" as const,
      messages: ["No matching source row was found."],
      isSelectable: false,
      basePrice: null,
      discountedBaseCost: null,
      effectiveCost: null,
      rawTargetPrice: null,
      adjustedTargetPrice: null,
      roundedTargetPrice: null,
      computedPrice: null,
      effectiveTargetPrice: null,
      sourceRow: null,
    };

    const service = new NaverBulkPriceService({
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
      buildPreview: async () => {
        buildPreviewCallCount += 1;
        return createPreviewResponse([], {
          rows: [createPreviewRow("origin-2"), createPreviewRow("origin-1"), unmatchedRow],
          stats: {
            totalNaverItems: 3,
            readyCount: 2,
            selectableCount: 2,
            conflictCount: 0,
            unmatchedCount: 1,
            invalidSourceCount: 0,
          },
        });
      },
      applyPriceUpdate: async () => ({ message: "updated" }),
    });

    const firstPage = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      matchedOnly: true,
      page: 1,
      pageSize: 1,
      sort: {
        field: "product",
        direction: "asc",
      },
    });
    const secondPage = await service.preview({
      previewId: firstPage.previewId,
      matchedOnly: true,
      page: 2,
      pageSize: 1,
      sort: {
        field: "product",
        direction: "asc",
      },
    });

    expect(buildPreviewCallCount).toBe(1);
    expect(firstPage.previewId).toBe(secondPage.previewId);
    expect(firstPage.filteredTotal).toBe(2);
    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.rows[0]?.originProductNo).toBe("origin-1");
    expect(secondPage.rows[0]?.originProductNo).toBe("origin-2");
  });

  it("rejects stale preview ids after the preview session expires", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-preview-expired-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);

    const service = new NaverBulkPriceService({
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
      buildPreview: async () => createPreviewResponse(["origin-1"]),
      applyPriceUpdate: async () => ({ message: "updated" }),
      previewCacheTtlMs: 1_000,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    await expect(
      service.createRun({
        sourceConfig: createSourceConfig(),
        rules: createRules(),
        previewId: preview.previewId,
        items: [
          {
            rowKey: buildRowKey("origin-1", "channel-origin-1"),
            manualOverridePrice: null,
          },
        ],
      }),
    ).rejects.toThrow(/Preview session expired/i);
  });

  it("creates runs from all selectable rows while honoring excluded row keys", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-run-all-selectable-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    const applied: string[] = [];

    const service = new NaverBulkPriceService({
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
      buildPreview: async () => createPreviewResponse(["origin-1", "origin-2"]),
      applyPriceUpdate: async ({ originProductNo }) => {
        applied.push(originProductNo);
        return { message: "updated" };
      },
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      selectionMode: "all_selectable",
      excludedRowKeys: [buildRowKey("origin-2", "channel-origin-2")],
      items: [],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(applied).toEqual(["origin-1"]);
    expect(completed.run.summary.total).toBe(1);
    expect(completed.items.map((item) => item.rowKey)).toEqual([
      buildRowKey("origin-1", "channel-origin-1"),
    ]);
  });

  it("creates runs from all ready rows even when some ready rows are not immediately actionable", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-run-all-ready-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    const applied: string[] = [];

    const nonActionableReadyRow = {
      ...createPreviewRow("origin-2"),
      currentPrice: 1000,
      status: "ready" as const,
      isSelectable: false,
      messages: ["Current price already matches target price."],
    };

    const service = new NaverBulkPriceService({
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
        createPreviewResponse([], {
          rows: [createPreviewRow("origin-1"), nonActionableReadyRow],
          stats: {
            totalNaverItems: 2,
            readyCount: 2,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async ({ originProductNo }) => {
        applied.push(originProductNo);
        return { message: "updated" };
      },
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      selectionMode: "all_ready",
      excludedRowKeys: [],
      items: [],
    });

    expect(detail.items.map((item) => item.rowKey)).toEqual([
      buildRowKey("origin-1", "channel-origin-1"),
      buildRowKey("origin-2", "channel-origin-2"),
    ]);
    expect(
      detail.items.find((item) => item.originProductNo === "origin-2")?.status,
    ).toBe("skipped_unmatched");

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.items.some(
        (item) => item.originProductNo === "origin-1" && item.status === "succeeded",
      );
    }, 2_000);

    const completed = await service.getRunDetail(detail.run.id);
    expect(applied).toEqual(["origin-1"]);
    expect(completed.run.summary.total).toBe(2);
  });
});

describe("naver bulk price run lifecycle", () => {
  it("uses manual override when applying price", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-run-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    const applied: Array<{ originProductNo: string; price: number }> = [];

    const service = new NaverBulkPriceService({
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
      buildPreview: async () => createPreviewResponse(["origin-1"]),
      applyPriceUpdate: async ({ originProductNo, price }) => {
        applied.push({ originProductNo, price });
        return { message: "updated" };
      },
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      items: [
        {
          rowKey: buildRowKey("origin-1", "channel-origin-1"),
          manualOverridePrice: 777,
        },
      ],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(applied).toEqual([{ originProductNo: "origin-1", price: 777 }]);
    expect(completed.items[0]?.effectiveTargetPrice).toBe(777);
    expect(completed.items[0]?.status).toBe("succeeded");
    expect(completed.run.summary.recentChanges[0]).toMatchObject({
      rowId: buildRowKey("origin-1", "channel-origin-1"),
      matchedCode: "CODE-origin-1",
      beforePrice: 900,
      afterPrice: 777,
    });
  });

  it("runs stock-only rows without calling the price updater", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-stock-only-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    const priceUpdates: string[] = [];
    const availabilityUpdates: Array<{
      originProductNo: string;
      targetStockQuantity: number | null;
      targetSaleStatus: string | null;
      targetDisplayStatus: string | null;
    }> = [];

    const service = new NaverBulkPriceService({
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
        createPreviewResponse([], {
          rows: [
            {
              ...createPreviewRow("origin-1", 1000),
              currentPrice: 1000,
              currentStockQuantity: 5,
              sourceSoldOut: true,
              targetStockQuantity: 0,
              needsPriceUpdate: false,
              needsInventoryUpdate: true,
              needsSaleStatusUpdate: false,
              needsDisplayStatusUpdate: false,
              isSelectable: true,
            },
          ],
          stats: {
            totalNaverItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async ({ originProductNo }) => {
        priceUpdates.push(originProductNo);
        return { message: "updated" };
      },
      applyAvailabilityUpdate: async ({
        originProductNo,
        targetStockQuantity,
        targetSaleStatus,
        targetDisplayStatus,
      }) => {
        availabilityUpdates.push({
          originProductNo,
          targetStockQuantity,
          targetSaleStatus,
          targetDisplayStatus,
        });
        return {
          messages: ["availability updated"],
          inventoryUpdated: true,
          saleStatusUpdated: false,
          displayStatusUpdated: false,
        };
      },
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      items: [
        {
          rowKey: buildRowKey("origin-1", "channel-origin-1"),
          manualOverridePrice: null,
        },
      ],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(priceUpdates).toEqual([]);
    expect(availabilityUpdates).toEqual([
      {
        originProductNo: "origin-1",
        targetStockQuantity: 0,
        targetSaleStatus: null,
        targetDisplayStatus: null,
      },
    ]);
    expect(completed.run.summary.recentChanges[0]).toMatchObject({
      beforePrice: null,
      afterPrice: null,
      beforeStockQuantity: 5,
      afterStockQuantity: 0,
    });
  });

  it("queues and applies sale-status-only rows without a price update", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-sale-status-only-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    const computedPrice = calculateBulkPriceValues(500, createRules()).computedPrice;
    const priceUpdates: string[] = [];
    const saleStatusUpdates: Array<{ originProductNo: string; saleStatus: string }> = [];

    const service = new NaverBulkPriceService({
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
        createPreviewResponse([], {
          rows: [
            {
              ...createPreviewRow("origin-1", computedPrice),
              currentPrice: computedPrice,
              saleStatusCode: "OUTOFSTOCK",
              saleStatusLabel: "Out of stock",
              sourceSoldOut: false,
              currentSaleStatus: "OUTOFSTOCK",
              targetSaleStatus: "SALE",
              needsPriceUpdate: false,
              needsSaleStatusUpdate: true,
              isSelectable: true,
            },
          ],
          stats: {
            totalNaverItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async ({ originProductNo }) => {
        priceUpdates.push(originProductNo);
        return { message: "updated" };
      },
      applySaleStatusUpdate: async ({ originProductNo, saleStatus }) => {
        saleStatusUpdates.push({ originProductNo, saleStatus });
        return { message: "sale status updated" };
      },
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      items: [
        {
          rowKey: buildRowKey("origin-1", "channel-origin-1"),
          manualOverridePrice: null,
        },
      ],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(priceUpdates).toEqual([]);
    expect(saleStatusUpdates).toEqual([
      { originProductNo: "origin-1", saleStatus: "SALE" },
    ]);
    expect(completed.items[0]?.status).toBe("succeeded");
    expect(completed.items[0]?.lastAppliedAt).toBeNull();
    expect(completed.items[0]?.lastAppliedPrice).toBeNull();
    expect(completed.run.summary.recentChanges[0]).toMatchObject({
      rowId: buildRowKey("origin-1", "channel-origin-1"),
      beforePrice: null,
      afterPrice: null,
      beforeSaleStatus: "OUTOFSTOCK",
      afterSaleStatus: "SALE",
    });
  });

  it("restocks, resumes sale, and re-enables display in one availability sync", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-restock-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    const availabilityUpdates: Array<{
      originProductNo: string;
      targetStockQuantity: number | null;
      targetSaleStatus: string | null;
      targetDisplayStatus: string | null;
    }> = [];

    const service = new NaverBulkPriceService({
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
        createPreviewResponse([], {
          rows: [
            {
              ...createPreviewRow("origin-1", 1000),
              currentPrice: 1000,
              currentStockQuantity: 0,
              currentSaleStatus: "OUTOFSTOCK",
              currentDisplayStatus: "SUSPENSION",
              saleStatusCode: "OUTOFSTOCK",
              sourceSoldOut: false,
              targetStockQuantity: 102,
              targetSaleStatus: "SALE",
              targetDisplayStatus: "ON",
              needsPriceUpdate: false,
              needsInventoryUpdate: true,
              needsSaleStatusUpdate: true,
              needsDisplayStatusUpdate: true,
              isSelectable: true,
            },
          ],
          stats: {
            totalNaverItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async () => ({ message: "updated" }),
      applyAvailabilityUpdate: async ({
        originProductNo,
        targetStockQuantity,
        targetSaleStatus,
        targetDisplayStatus,
      }) => {
        availabilityUpdates.push({
          originProductNo,
          targetStockQuantity,
          targetSaleStatus,
          targetDisplayStatus,
        });
        return {
          messages: ["availability updated"],
          inventoryUpdated: true,
          saleStatusUpdated: true,
          displayStatusUpdated: true,
        };
      },
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      items: [
        {
          rowKey: buildRowKey("origin-1", "channel-origin-1"),
          manualOverridePrice: null,
        },
      ],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(availabilityUpdates).toEqual([
      {
        originProductNo: "origin-1",
        targetStockQuantity: 102,
        targetSaleStatus: "SALE",
        targetDisplayStatus: "ON",
      },
    ]);
    expect(completed.run.summary.recentChanges[0]).toMatchObject({
      beforeStockQuantity: 0,
      afterStockQuantity: 102,
      beforeSaleStatus: "OUTOFSTOCK",
      afterSaleStatus: "SALE",
      beforeDisplayStatus: "SUSPENSION",
      afterDisplayStatus: "ON",
    });
  });

  it("keeps last applied price when the price update succeeds but sale status sync fails", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-sale-status-fail-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);

    const service = new NaverBulkPriceService({
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
        createPreviewResponse([], {
          rows: [
            {
              ...createPreviewRow("origin-1", 1000),
              saleStatusCode: "OUTOFSTOCK",
              saleStatusLabel: "Out of stock",
              sourceSoldOut: false,
              currentSaleStatus: "OUTOFSTOCK",
              targetSaleStatus: "SALE",
              needsPriceUpdate: true,
              needsSaleStatusUpdate: true,
              isSelectable: true,
            },
          ],
          stats: {
            totalNaverItems: 1,
            readyCount: 1,
            selectableCount: 1,
            conflictCount: 0,
            unmatchedCount: 0,
            invalidSourceCount: 0,
          },
        }),
      applyPriceUpdate: async () => ({ message: "updated" }),
      applySaleStatusUpdate: async () => {
        throw new Error("sale sync failed");
      },
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      items: [
        {
          rowKey: buildRowKey("origin-1", "channel-origin-1"),
          manualOverridePrice: null,
        },
      ],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "failed";
    });

    const completed = await service.getRunDetail(detail.run.id);
    expect(completed.items[0]?.status).toBe("failed");
    expect(completed.items[0]?.lastAppliedPrice).toBe(1000);
    expect(completed.items[0]?.lastAppliedAt).not.toBeNull();
    expect(completed.items[0]?.messages).toContain(
      "Price updated, but NAVER sold-out sync failed: sale sync failed",
    );
  });

  it("passes preview snapshot into the NAVER update dependency", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-run-preview-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
    const receivedPreviews: Array<{
      originProductNo: string;
      currentPrice: number | null;
      hasOptions: boolean;
    }> = [];

    const service = new NaverBulkPriceService({
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
      buildPreview: async () => createPreviewResponse(["origin-1"]),
      applyPriceUpdate: async ({ preview }) => {
        receivedPreviews.push({
          originProductNo: preview?.originProductNo ?? "",
          currentPrice: preview?.currentPrice ?? null,
          hasOptions: preview?.hasOptions ?? false,
        });
        return { message: "updated" };
      },
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      items: [
        {
          rowKey: buildRowKey("origin-1", "channel-origin-1"),
          manualOverridePrice: null,
        },
      ],
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    expect(receivedPreviews).toEqual([
      {
        originProductNo: "origin-1",
        currentPrice: 900,
        hasOptions: false,
      },
    ]);
  });

  it("returns only the requested run rows when filtering run detail", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-run-filter-"));
    process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
    const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);

    const service = new NaverBulkPriceService({
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
      buildPreview: async () => createPreviewResponse(["origin-1", "origin-2"]),
      applyPriceUpdate: async () => ({ message: "updated" }),
      runWorkerConcurrency: 1,
    });

    const preview = await service.preview({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
    });

    const detail = await service.createRun({
      sourceConfig: createSourceConfig(),
      rules: createRules(),
      previewId: preview.previewId,
      items: ["origin-1", "origin-2"].map((originProductNo) => ({
        rowKey: buildRowKey(originProductNo, `channel-${originProductNo}`),
        manualOverridePrice: null,
      })),
    });

    await waitForCondition(async () => {
      const next = await service.getRunDetail(detail.run.id);
      return next.run.status === "succeeded";
    });

    const filtered = await service.getRunDetailWithOptions({
      runId: detail.run.id,
      rowKeys: [buildRowKey("origin-2", "channel-origin-2")],
      includeLatestRecords: false,
    });

    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.rowKey).toBe(buildRowKey("origin-2", "channel-origin-2"));
    expect(filtered.latestRecords).toEqual([]);
  });

  it(
    "pauses, resumes, and stops queued items sequentially",
    async () => {
      tmpDir = await mkdtemp(path.join(os.tmpdir(), "naver-bulk-price-run-"));
      process.env.NAVER_BULK_PRICE_FILE = path.join(tmpDir, "store.json");
      const store = new NaverBulkPriceStore(process.env.NAVER_BULK_PRICE_FILE);
      const deferredById = new Map(
        ["origin-1", "origin-2", "origin-3"].map((id) => [id, deferred()] as const),
      );

      const service = new NaverBulkPriceService({
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
          createPreviewResponse(["origin-1", "origin-2", "origin-3"]),
        applyPriceUpdate: async ({ originProductNo }) => {
          await deferredById.get(originProductNo)?.promise;
          return { message: `updated ${originProductNo}` };
        },
        runWorkerConcurrency: 1,
      });

      const preview = await service.preview({
        sourceConfig: createSourceConfig(),
        rules: createRules(),
      });

      const created = await service.createRun({
        sourceConfig: createSourceConfig(),
        rules: createRules(),
        previewId: preview.previewId,
        items: ["origin-1", "origin-2", "origin-3"].map((originProductNo) => ({
          rowKey: buildRowKey(originProductNo, `channel-${originProductNo}`),
          manualOverridePrice: null,
        })),
      });

      await waitForCondition(async () => {
        const detail = await service.getRunDetail(created.run.id);
        return detail.run.summary.running === 1;
      });

      await service.pauseRun(created.run.id);
      deferredById.get("origin-1")?.resolve();

      await waitForCondition(async () => {
        const detail = await service.getRunDetail(created.run.id);
        return detail.run.status === "paused";
      });

      const paused = await service.getRunDetail(created.run.id);
      expect(paused.items.filter((item) => item.status === "paused")).toHaveLength(2);

      await service.resumeRun(created.run.id);

      await waitForCondition(async () => {
        const detail = await service.getRunDetail(created.run.id);
        return detail.run.summary.running === 1;
      });

      await service.stopRun(created.run.id);
      deferredById.get("origin-2")?.resolve();

      await waitForCondition(async () => {
        const detail = await service.getRunDetail(created.run.id);
        return detail.run.status === "stopped";
      });

      const stopped = await service.getRunDetail(created.run.id);
      expect(stopped.run.summary.succeeded).toBe(2);
      expect(stopped.run.summary.stopped).toBe(1);
      expect(
        stopped.items.find((item) => item.originProductNo === "origin-3")?.status,
      ).toBe("stopped");
    },
    15_000,
  );
});
