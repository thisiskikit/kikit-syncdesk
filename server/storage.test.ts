import { describe, expect, it } from "vitest";
import type { NormalizedChannelProduct } from "@shared/channel-control";
import { IndexedMemoryStorage } from "./storage";

function buildCatalogProduct(
  overrides: Partial<NormalizedChannelProduct> = {},
): NormalizedChannelProduct {
  return {
    channel: "naver",
    channelProductId: "NAV-PROD-1",
    sellerProductCode: "SELLER-1",
    productName: "Product 1",
    productStatus: "sale",
    rawJson: { productId: "NAV-PROD-1" },
    options: [
      {
        channelOptionId: "NAV-OPT-1",
        optionName: "Option 1",
        price: 1000,
        stockQuantity: 10,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
        masterSku: "MSK-1",
        optionSku: "OPT-1",
        rawJson: { optionId: "NAV-OPT-1" },
      },
    ],
    ...overrides,
  };
}

describe("IndexedMemoryStorage", () => {
  it("upserts catalog rows without duplicating options and refreshes mapping indexes", async () => {
    const storage = new IndexedMemoryStorage();

    await storage.upsertCatalog([buildCatalogProduct()]);
    await storage.upsertCatalog([
      buildCatalogProduct({
        productName: "Product 1 Updated",
        options: [
          {
            channelOptionId: "NAV-OPT-1",
            optionName: "Option 1 Updated",
            price: 1500,
            stockQuantity: 12,
            saleStatus: "sale_stopped",
            soldOutStatus: "sold_out",
            masterSku: "MSK-2",
            optionSku: "OPT-2",
            rawJson: { optionId: "NAV-OPT-1", revision: 2 },
          },
        ],
      }),
    ]);

    const result = await storage.listCatalogOptions({ limit: 10, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      productName: "Product 1 Updated",
      optionName: "Option 1 Updated",
      price: 1500,
      saleStatus: "sale_stopped",
      soldOutStatus: "sold_out",
      masterSku: "MSK-2",
      optionSku: "OPT-2",
    });

    expect(
      await storage.findCatalogOptionTarget({
        channel: "naver",
        optionSku: "OPT-2",
      }),
    ).toMatchObject({
      channelOptionId: "NAV-OPT-1",
    });
    expect(
      await storage.findCatalogOptionTarget({
        channel: "naver",
        optionSku: "OPT-1",
      }),
    ).toBeNull();
  });

  it("returns channel product rows from cached indexes", async () => {
    const storage = new IndexedMemoryStorage();

    await storage.upsertCatalog([
      buildCatalogProduct({
        options: [
          {
            channelOptionId: "NAV-OPT-2",
            optionName: "B Option",
            price: 1000,
            stockQuantity: 10,
            saleStatus: "on_sale",
            soldOutStatus: "in_stock",
            masterSku: "MSK-1",
            optionSku: "OPT-2",
            rawJson: { optionId: "NAV-OPT-2" },
          },
          {
            channelOptionId: "NAV-OPT-1",
            optionName: "A Option",
            price: 1000,
            stockQuantity: 10,
            saleStatus: "on_sale",
            soldOutStatus: "in_stock",
            masterSku: "MSK-1",
            optionSku: "OPT-1",
            rawJson: { optionId: "NAV-OPT-1" },
          },
        ],
      }),
    ]);

    const rows = await storage.listCatalogOptionsByChannelProduct({
      channel: "naver",
      channelProductId: "NAV-PROD-1",
    });

    expect(rows.map((row) => row.optionName)).toEqual(["A Option", "B Option"]);
  });

  it("keeps execution run detail and failed item lookups indexed by run id", async () => {
    const storage = new IndexedMemoryStorage();
    const run = await storage.createExecutionRun({
      draftId: "draft-1",
      status: "running",
      createdBy: "tester",
      summaryJson: {},
    });

    await storage.createExecutionItemsBatch([
      {
        runId: run.id,
        draftItemId: "item-1",
        channel: "naver",
        masterSku: "MSK-1",
        optionSku: "OPT-1",
        channelProductId: "NAV-PROD-1",
        channelOptionId: "NAV-OPT-1",
        requestedPatchJson: { price: 1200 },
        beforeSnapshotJson: { price: 1000 },
        afterSnapshotJson: { price: 1200 },
        status: "succeeded",
        attemptCount: 1,
      },
      {
        runId: run.id,
        draftItemId: "item-2",
        channel: "coupang",
        masterSku: "MSK-2",
        optionSku: "OPT-2",
        channelProductId: "CP-PROD-1",
        channelOptionId: "CP-OPT-1",
        requestedPatchJson: { stockQuantity: 0 },
        beforeSnapshotJson: { stockQuantity: 5 },
        afterSnapshotJson: null,
        status: "failed",
        attemptCount: 1,
        errorCode: "ADAPTER_ERROR",
        errorMessage: "failed",
      },
    ]);

    const detail = await storage.getExecutionRunDetail(run.id);
    expect(detail?.items.map((item) => item.draftItemId)).toEqual(["item-1", "item-2"]);
    expect((await storage.getFailedExecutionItems(run.id)).map((item) => item.draftItemId)).toEqual([
      "item-2",
    ]);
  });
});
