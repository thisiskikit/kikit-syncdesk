import type { AddressInfo } from "net";
import { createServer, type Server } from "http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import router from "./naver-bulk-price";
import { naverBulkPriceService } from "../services/naver/bulk-price-service";

function createSampleRun() {
  return {
    id: "run-1",
    storeId: "store-1",
    sourceConfig: {
      storeId: "store-1",
      schema: "public",
      table: "master_price",
      basePriceColumn: "base_price",
      sourceMatchColumn: "match_code",
      soldOutColumn: "",
      workDateColumn: "work_date",
      workDateFrom: "2026-04-01",
      workDateTo: "2026-04-01",
      naverMatchField: "sellerManagementCode" as const,
    },
    rules: {
      fixedAdjustment: 0,
      feeRate: 0.1,
      marginRate: 0.05,
      inboundShippingCost: 0,
      discountRate: 0,
      roundingUnit: 10 as const,
      roundingMode: "ceil" as const,
    },
    status: "queued" as const,
    summary: {
      total: 1,
      queued: 1,
      running: 0,
      succeeded: 0,
      failed: 0,
      paused: 0,
      stopped: 0,
      skippedConflict: 0,
      skippedUnmatched: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };
}

function createSampleRunItem(rowKey: string) {
  return {
    id: `${rowKey}-item`,
    runId: "run-1",
    rowKey,
    originProductNo: rowKey,
    channelProductNo: null,
    sellerManagementCode: null,
    sellerBarcode: null,
    productName: `Product ${rowKey}`,
    matchedCode: rowKey,
    status: "queued" as const,
    messages: [],
    currentPrice: 1000,
    saleStatusCode: "SALE",
    saleStatusLabel: "On Sale",
    hasOptions: false,
    optionType: "none" as const,
    optionCount: 0,
    optionHandlingMessage: "Origin price only.",
    basePrice: 900,
    discountedBaseCost: 900,
    effectiveCost: 900,
    rawTargetPrice: 1000,
    adjustedTargetPrice: 1000,
    roundedTargetPrice: 1000,
    computedPrice: 1000,
    manualOverridePrice: null,
    effectiveTargetPrice: 1000,
    lastAppliedAt: null,
    lastAppliedPrice: null,
    modifiedAt: null,
    sourceRow: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use("/api/naver", router);

  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopTestServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
});

describe("naver bulk price routes", () => {
  it("parses preview paging and sort input before calling the service", async () => {
    const previewSpy = vi.spyOn(naverBulkPriceService, "preview").mockResolvedValue({
      previewId: "preview-1",
      sourceConfig: createSampleRun().sourceConfig,
      rules: createSampleRun().rules,
      rows: [],
      stats: {
        totalNaverItems: 0,
        readyCount: 0,
        selectableCount: 0,
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
      page: 2,
      pageSize: 100,
      filteredTotal: 0,
      totalPages: 1,
    });
    const { server, baseUrl } = await startTestServer();

    try {
      const response = await fetch(`${baseUrl}/api/naver/bulk-price/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceConfig: createSampleRun().sourceConfig,
          rules: createSampleRun().rules,
          page: 2,
          pageSize: 100,
          matchedOnly: true,
          sort: {
            field: "product",
            direction: "desc",
          },
        }),
      });

      expect(response.ok).toBe(true);
      expect(previewSpy).toHaveBeenCalledWith({
        previewId: null,
        sourceConfig: createSampleRun().sourceConfig,
        rules: createSampleRun().rules,
        page: 2,
        pageSize: 100,
        matchedOnly: true,
        sort: {
          field: "product",
          direction: "desc",
        },
      });
    } finally {
      await stopTestServer(server);
    }
  });

  it("serves run summary payloads without requiring full run detail", async () => {
    const summarySpy = vi
      .spyOn(naverBulkPriceService, "getRunSummary")
      .mockResolvedValue({
        run: createSampleRun(),
        recentItems: [createSampleRunItem("row-1")],
      });
    const { server, baseUrl } = await startTestServer();

    try {
      const response = await fetch(`${baseUrl}/api/naver/bulk-price/runs/run-1/summary`);
      const payload = (await response.json()) as {
        success: boolean;
        data: Record<string, unknown>;
      };

      expect(response.ok).toBe(true);
      expect(summarySpy).toHaveBeenCalledWith("run-1");
      expect(payload.success).toBe(true);
      expect(payload.data).toHaveProperty("recentItems");
      expect(payload.data).not.toHaveProperty("items");
    } finally {
      await stopTestServer(server);
    }
  });

  it("forwards row key filters when requesting run detail", async () => {
    const detailSpy = vi
      .spyOn(naverBulkPriceService, "getRunDetailWithOptions")
      .mockResolvedValue({
        run: createSampleRun(),
        items: [createSampleRunItem("row-2")],
        latestRecords: [],
      });
    const { server, baseUrl } = await startTestServer();

    try {
      const response = await fetch(
        `${baseUrl}/api/naver/bulk-price/runs/run-1?rowKey=row-1&rowKey=row-2&includeLatestRecords=0`,
      );

      expect(response.ok).toBe(true);
      expect(detailSpy).toHaveBeenCalledWith({
        runId: "run-1",
        rowKeys: ["row-1", "row-2"],
        includeItems: true,
        includeLatestRecords: false,
      });
    } finally {
      await stopTestServer(server);
    }
  });

  it("allows preview-only run creation without sourceConfig in the request body", async () => {
    const createRunSpy = vi
      .spyOn(naverBulkPriceService, "createRun")
      .mockResolvedValue({
        run: createSampleRun(),
        items: [createSampleRunItem("row-1")],
        latestRecords: [],
      });
    const { server, baseUrl } = await startTestServer();

    try {
      const response = await fetch(`${baseUrl}/api/naver/bulk-price/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          previewId: "preview-1",
          selectionMode: "all_ready",
          excludedRowKeys: ["row-2"],
          manualOverrides: {
            "row-1": 12345,
          },
        }),
      });

      expect(response.ok).toBe(true);
      expect(createRunSpy).toHaveBeenCalledWith({
        sourceConfig: undefined,
        rules: undefined,
        previewId: "preview-1",
        selectionMode: "all_ready",
        excludedRowKeys: ["row-2"],
        selectedRowKeys: [],
        manualOverrides: {
          "row-1": 12345,
        },
        items: [],
      });
    } finally {
      await stopTestServer(server);
    }
  });
});
