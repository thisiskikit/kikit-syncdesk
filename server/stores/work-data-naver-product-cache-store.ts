import path from "path";
import { eq } from "drizzle-orm";
import type { NaverProductListResponse } from "@shared/naver-products";
import { naverProductCacheEntries } from "@shared/schema";
import type { NaverProductCacheStorePort } from "../interfaces/naver-product-cache-store";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
} from "../services/shared/work-data-db";

type PersistedNaverProductCache = {
  version: 1;
  entries: Record<string, NaverProductListResponse>;
};

function normalizePersistedNaverProductCache(value: PersistedNaverProductCache | null) {
  return {
    version: 1 as const,
    entries:
      value?.entries && typeof value.entries === "object" && !Array.isArray(value.entries)
        ? value.entries
        : {},
  };
}

export class WorkDataNaverProductCacheStore implements NaverProductCacheStorePort {
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.NAVER_PRODUCT_CACHE_FILE || "data/naver-product-cache.json",
  );

  private initializePromise: Promise<void> | null = null;

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "naver-product-cache.json",
          async () => {
            const parsed = normalizePersistedNaverProductCache(
              await readJsonFileIfExists<PersistedNaverProductCache>(this.filePath),
            );

            const entries = Object.entries(parsed.entries);
            if (!entries.length) {
              return { importedCount: 0 };
            }

            const database = assertWorkDataDatabaseEnabled();
            for (const [storeId, response] of entries) {
              await database
                .insert(naverProductCacheEntries)
                .values({
                  storeId,
                  responseJson: response,
                  updatedAt: toDateOrNull(response.fetchedAt) ?? new Date(),
                })
                .onConflictDoUpdate({
                  target: naverProductCacheEntries.storeId,
                  set: {
                    responseJson: response,
                    updatedAt: toDateOrNull(response.fetchedAt) ?? new Date(),
                  },
                });
            }

            return { importedCount: entries.length };
          },
          (result) => result,
        );
      })().catch((error) => {
        this.initializePromise = null;
        throw error;
      });
    }

    await this.initializePromise;
  }

  async get(storeId: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(naverProductCacheEntries)
      .where(eq(naverProductCacheEntries.storeId, storeId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    const response = row.responseJson;
    return response && typeof response === "object"
      ? structuredClone(response as NaverProductListResponse)
      : null;
  }

  async set(storeId: string, response: NaverProductListResponse) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const nextResponse = {
      ...structuredClone(response),
      servedFromCache: false,
    } satisfies NaverProductListResponse;

    await database
      .insert(naverProductCacheEntries)
      .values({
        storeId,
        responseJson: nextResponse,
        updatedAt: toDateOrNull(nextResponse.fetchedAt) ?? new Date(),
      })
      .onConflictDoUpdate({
        target: naverProductCacheEntries.storeId,
        set: {
          responseJson: nextResponse,
          updatedAt: toDateOrNull(nextResponse.fetchedAt) ?? new Date(),
        },
      });
  }
}

export const workDataNaverProductCacheStore: NaverProductCacheStorePort =
  new WorkDataNaverProductCacheStore();
