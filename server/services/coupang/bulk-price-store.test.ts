import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CoupangBulkPriceStore } from "./bulk-price-store";

const tempDirs: string[] = [];

async function createStore() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kikit-coupang-bulk-price-"));
  const filePath = path.join(tempDir, "coupang-bulk-price.json");
  tempDirs.push(tempDir);

  return {
    filePath,
    store: new CoupangBulkPriceStore(filePath),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("CoupangBulkPriceStore legacy persistence", () => {
  it("persists saved source and rule presets to disk", async () => {
    const { filePath, store } = await createStore();

    const sourcePreset = await store.createSourcePreset({
      name: "source preset",
      memo: "source memo",
      sourceConfig: {
        storeId: "store-1",
        schema: "public",
        table: "source_table",
        basePriceColumn: "price",
        sourceMatchColumn: "sku",
        soldOutColumn: "sold_out",
        workDateColumn: "work_date",
        workDateFrom: "2026-04-01",
        workDateTo: "2026-04-06",
        coupangMatchField: "externalVendorSku",
      },
    });

    const rulePreset = await store.createRulePreset({
      name: "rule preset",
      memo: "rule memo",
      rules: {
        fixedAdjustment: 0,
        feeRate: 10,
        marginRate: 20,
        inboundShippingCost: 3000,
        discountRate: 0,
        roundingUnit: 10,
        roundingMode: "ceil",
      },
    });

    const reloadedStore = new CoupangBulkPriceStore(filePath);
    const sourcePresets = await reloadedStore.listSourcePresets();
    const rulePresets = await reloadedStore.listRulePresets();

    expect(sourcePresets).toHaveLength(1);
    expect(sourcePresets[0]).toMatchObject({
      id: sourcePreset.id,
      name: "source preset",
      memo: "source memo",
    });
    expect(rulePresets).toHaveLength(1);
    expect(rulePresets[0]).toMatchObject({
      id: rulePreset.id,
      name: "rule preset",
      memo: "rule memo",
    });
  });
});
