import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { NaverProductListResponse } from "@shared/naver-products";
import type { NaverProductCacheStorePort } from "../interfaces/naver-product-cache-store";

type PersistedNaverProductCache = {
  version: 1;
  entries: Record<string, NaverProductListResponse>;
};

const defaultData: PersistedNaverProductCache = {
  version: 1,
  entries: {},
};

class NaverProductCacheStore {
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.NAVER_PRODUCT_CACHE_FILE || "data/naver-product-cache.json",
  );

  private cache: PersistedNaverProductCache | null = null;
  private writePromise = Promise.resolve();

  private async load() {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PersistedNaverProductCache>;
      this.cache = {
        version: 1,
        entries:
          parsed.entries && typeof parsed.entries === "object" && !Array.isArray(parsed.entries)
            ? (parsed.entries as Record<string, NaverProductListResponse>)
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

  private async persist(nextData: PersistedNaverProductCache) {
    this.cache = nextData;
    const payload = JSON.stringify(nextData, null, 2);

    this.writePromise = this.writePromise.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf-8");
    });

    await this.writePromise;
  }

  async get(storeId: string) {
    const data = await this.load();
    const entry = data.entries[storeId];
    return entry ? structuredClone(entry) : null;
  }

  async set(storeId: string, response: NaverProductListResponse) {
    const data = await this.load();
    await this.persist({
      version: 1,
      entries: {
        ...data.entries,
        [storeId]: {
          ...structuredClone(response),
          servedFromCache: false,
        },
      },
    });
  }
}

export const fileNaverProductCacheStore: NaverProductCacheStorePort = new NaverProductCacheStore();
