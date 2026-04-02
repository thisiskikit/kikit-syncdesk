import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { NaverProductSellerBarcodeCacheStorePort } from "../interfaces/naver-product-seller-barcode-cache-store";

const NAVER_PRODUCT_SELLER_BARCODE_CACHE_TTL_MS = 24 * 60 * 60_000;

type PersistedSellerBarcodeEntry = {
  sellerBarcode: string;
  cachedAt: number;
};

type PersistedSellerBarcodeCache = {
  version: 1;
  entries: Record<string, Record<string, PersistedSellerBarcodeEntry>>;
};

const defaultData: PersistedSellerBarcodeCache = {
  version: 1,
  entries: {},
};

class NaverProductSellerBarcodeCacheStore {
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.NAVER_PRODUCT_SELLER_BARCODE_CACHE_FILE ||
      "data/naver-product-seller-barcode-cache.json",
  );

  private cache: PersistedSellerBarcodeCache | null = null;
  private writePromise = Promise.resolve();

  private async load() {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PersistedSellerBarcodeCache>;
      this.cache = {
        version: 1,
        entries:
          parsed.entries && typeof parsed.entries === "object" && !Array.isArray(parsed.entries)
            ? (parsed.entries as Record<string, Record<string, PersistedSellerBarcodeEntry>>)
            : {},
      };
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: string }).code)
          : null;

      if (code !== "ENOENT") {
        throw error;
      }

      this.cache = structuredClone(defaultData);
    }

    return this.cache;
  }

  private async persist(nextData: PersistedSellerBarcodeCache) {
    this.cache = nextData;
    const payload = JSON.stringify(nextData, null, 2);

    this.writePromise = this.writePromise.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf-8");
    });

    await this.writePromise;
  }

  private isFresh(entry: PersistedSellerBarcodeEntry) {
    return Date.now() - entry.cachedAt <= NAVER_PRODUCT_SELLER_BARCODE_CACHE_TTL_MS;
  }

  async getMany(storeId: string, originProductNos: string[]) {
    if (!originProductNos.length) {
      return new Map<string, string>();
    }

    const data = await this.load();
    const currentStoreEntries = { ...(data.entries[storeId] ?? {}) };
    const cachedSellerBarcodes = new Map<string, string>();
    let hasChanges = false;

    for (const originProductNo of originProductNos) {
      const entry = currentStoreEntries[originProductNo];
      if (!entry) {
        continue;
      }

      if (!this.isFresh(entry)) {
        delete currentStoreEntries[originProductNo];
        hasChanges = true;
        continue;
      }

      const normalizedSellerBarcode = entry.sellerBarcode.trim();
      if (!normalizedSellerBarcode) {
        delete currentStoreEntries[originProductNo];
        hasChanges = true;
        continue;
      }

      cachedSellerBarcodes.set(originProductNo, normalizedSellerBarcode);
    }

    if (hasChanges) {
      await this.persist({
        version: 1,
        entries: {
          ...data.entries,
          [storeId]: currentStoreEntries,
        },
      });
    }

    return cachedSellerBarcodes;
  }

  async setMany(
    storeId: string,
    entries: Array<{
      originProductNo: string;
      sellerBarcode: string;
    }>,
  ) {
    if (!entries.length) {
      return;
    }

    const data = await this.load();
    const currentStoreEntries = { ...(data.entries[storeId] ?? {}) };
    let hasChanges = false;
    const cachedAt = Date.now();

    for (const entry of entries) {
      const normalizedOriginProductNo = entry.originProductNo.trim();
      const normalizedSellerBarcode = entry.sellerBarcode.trim();

      if (!normalizedOriginProductNo || !normalizedSellerBarcode) {
        continue;
      }

      currentStoreEntries[normalizedOriginProductNo] = {
        sellerBarcode: normalizedSellerBarcode,
        cachedAt,
      };
      hasChanges = true;
    }

    if (!hasChanges) {
      return;
    }

    await this.persist({
      version: 1,
      entries: {
        ...data.entries,
        [storeId]: currentStoreEntries,
      },
    });
  }
}

export const fileNaverProductSellerBarcodeCacheStore: NaverProductSellerBarcodeCacheStorePort =
  new NaverProductSellerBarcodeCacheStore();
