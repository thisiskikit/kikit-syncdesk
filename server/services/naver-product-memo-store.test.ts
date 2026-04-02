import { mkdtemp, rm } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it } from "vitest";
import { NaverProductMemoStore } from "./naver-product-memo-store";

describe("NaverProductMemoStore", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("writes memos to disk and reloads them in a fresh store instance", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "naver-product-memo-store-"));
    const filePath = path.join(tempDir, "naver-product-memos.json");
    const store = new NaverProductMemoStore(filePath);

    const saved = await store.upsert({
      storeId: "store-1",
      originProductNo: "100",
      productName: "상품 A",
      memo: "첫 번째 메모",
    });

    expect(saved.memo).toBe("첫 번째 메모");

    const reloadedStore = new NaverProductMemoStore(filePath);
    const loaded = await reloadedStore.get("store-1", "100");
    const storeItems = await reloadedStore.listByStore("store-1");

    expect(loaded?.memo).toBe("첫 번째 메모");
    expect(storeItems).toHaveLength(1);
    expect(storeItems[0]?.originProductNo).toBe("100");
    expect(storeItems[0]?.productName).toBe("상품 A");
  });
});
