import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type {
  CoupangProductDetailResponse,
  CoupangProductExplorerRow,
} from "@shared/coupang";
import { afterEach, describe, expect, it } from "vitest";
import type { CoupangProductExplorerSnapshot } from "../interfaces/coupang-product-cache-store";
import { FileCoupangProductCacheStore } from "./file-coupang-product-cache-store";

const tempDirs: string[] = [];
const originalKeepLegacyFlag = process.env.COUPANG_PRODUCT_CACHE_KEEP_LEGACY_FILE;

function createExplorerRow(
  sellerProductId: string,
  sellerProductName: string,
): CoupangProductExplorerRow {
  return {
    sellerProductId,
    productId: null,
    sellerProductName,
    vendorId: "A0001",
    displayCategoryCode: null,
    displayCategoryName: null,
    brand: null,
    status: "APPROVED",
    statusName: "APPROVED",
    saleStartedAt: null,
    saleEndedAt: null,
    createdAt: "2026-03-20T00:00:00.000Z",
    lastModifiedAt: "2026-03-24T10:00:00.000Z",
    deliveryCharge: null,
    deliveryChargeType: null,
    thumbnailUrl: null,
    previewHtml: null,
    optionCount: 1,
    totalInventory: 1,
    minSalePrice: 1000,
    maxSalePrice: 1000,
    vendorItems: [],
  };
}

function createExplorerSnapshot(
  storeId: string,
  itemNames: Array<{ id: string; name: string }>,
): CoupangProductExplorerSnapshot {
  return {
    store: {
      id: storeId,
      name: `${storeId} Store`,
      vendorId: "A0001",
    },
    items: itemNames.map((item) => createExplorerRow(item.id, item.name)),
    fetchedAt: "2026-03-25T00:00:00.000Z",
    servedFromFallback: false,
    message: null,
    source: "live",
  };
}

function createDetailResponse(
  sellerProductId: string,
  sellerProductName: string,
): CoupangProductDetailResponse {
  return {
    sellerProductId,
    productId: `product-${sellerProductId}`,
    sellerProductName,
    brand: null,
    status: "APPROVED",
    statusName: "APPROVED",
    requested: false,
    displayCategoryCode: null,
    saleStartedAt: null,
    saleEndedAt: null,
    deliveryMethod: null,
    deliveryCompanyCode: null,
    deliveryChargeType: null,
    deliveryCharge: null,
    freeShipOverAmount: null,
    deliveryChargeOnReturn: null,
    deliverySurcharge: null,
    outboundShippingPlaceCode: null,
    returnCenterCode: null,
    returnChargeName: null,
    companyContactNumber: null,
    returnZipCode: null,
    returnAddress: null,
    returnAddressDetail: null,
    returnCharge: null,
    unionDeliveryType: null,
    extraInfoMessage: null,
    manufacture: null,
    generalProductName: null,
    displayProductName: null,
    productGroup: null,
    vendorUserId: null,
    images: [],
    notices: [],
    contents: [],
    rawData: {},
  } as unknown as CoupangProductDetailResponse;
}

afterEach(async () => {
  if (originalKeepLegacyFlag === undefined) {
    delete process.env.COUPANG_PRODUCT_CACHE_KEEP_LEGACY_FILE;
  } else {
    process.env.COUPANG_PRODUCT_CACHE_KEEP_LEGACY_FILE = originalKeepLegacyFlag;
  }

  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((tempDir) =>
      rm(tempDir, { recursive: true, force: true }),
    ),
  );
});

describe("FileCoupangProductCacheStore", () => {
  it("migrates the legacy monolithic cache into sharded files", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "coupang-product-cache-"));
    tempDirs.push(tempDir);

    const legacyFilePath = path.join(tempDir, "coupang-product-cache.json");
    const legacyPayload = {
      version: 1,
      explorers: {
        "store 1": createExplorerSnapshot("store 1", [
          { id: "100", name: "Blue Widget" },
          { id: "101", name: "Red Widget" },
        ]),
      },
      details: {
        "store 1:100": createDetailResponse("100", "Blue Widget"),
        "store 1:101": createDetailResponse("101", "Red Widget"),
        "store-2:200": createDetailResponse("200", "Green Widget"),
      },
    };

    await writeFile(legacyFilePath, JSON.stringify(legacyPayload, null, 2), "utf-8");

    const store = new FileCoupangProductCacheStore(legacyFilePath);
    const migratedExplorer = await store.getExplorer("store 1");
    const migratedDetail = await store.getDetail("store 1", "100");

    expect(migratedExplorer?.store.id).toBe("store 1");
    expect(migratedExplorer?.items).toHaveLength(2);
    expect(migratedDetail?.sellerProductId).toBe("100");

    const rootDir = path.join(tempDir, "coupang-product-cache");
    const manifest = JSON.parse(await readFile(path.join(rootDir, "manifest.json"), "utf-8")) as {
      version: number;
      shardCount: number;
      migratedAt: string | null;
    };
    const detailFiles = await readdir(path.join(rootDir, "details", encodeURIComponent("store 1")));

    expect(manifest.version).toBe(2);
    expect(manifest.shardCount).toBe(64);
    expect(manifest.migratedAt).toBeTruthy();
    expect(detailFiles.length).toBeGreaterThan(0);
    await expect(readFile(legacyFilePath, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stores explorer and detail shards independently and invalidates only the requested scope", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "coupang-product-cache-"));
    tempDirs.push(tempDir);

    const store = new FileCoupangProductCacheStore(
      path.join(tempDir, "coupang-product-cache.json"),
    );

    await store.setExplorer(
      "store-1",
      createExplorerSnapshot("store-1", [
        { id: "100", name: "Blue Widget" },
        { id: "101", name: "Red Widget" },
      ]),
    );
    await store.setDetail("store-1", "100", createDetailResponse("100", "Blue Widget"));
    await store.setDetail("store-1", "101", createDetailResponse("101", "Red Widget"));
    await store.setDetail("store-2", "200", createDetailResponse("200", "Green Widget"));

    await store.patchExplorerRow("store-1", "100", (row) => ({
      ...row,
      sellerProductName: "Blue Widget Patched",
    }));
    await store.updateDetail("store-1", "100", (current) =>
      current
        ? {
            ...current,
            sellerProductName: "Blue Widget Detail Patched",
          }
        : null,
    );

    expect((await store.getExplorer("store-1"))?.items[0]?.sellerProductName).toBe(
      "Blue Widget Patched",
    );
    expect((await store.getDetail("store-1", "100"))?.sellerProductName).toBe(
      "Blue Widget Detail Patched",
    );

    await store.invalidateProduct("store-1", "100");
    expect(await store.getDetail("store-1", "100")).toBeNull();
    expect(await store.getDetail("store-1", "101")).not.toBeNull();
    expect(await store.getDetail("store-2", "200")).not.toBeNull();

    await store.invalidateStore("store-1");
    expect(await store.getExplorer("store-1")).toBeNull();
    expect(await store.getDetail("store-1", "101")).toBeNull();
    expect(await store.getDetail("store-2", "200")).not.toBeNull();
  });
});
