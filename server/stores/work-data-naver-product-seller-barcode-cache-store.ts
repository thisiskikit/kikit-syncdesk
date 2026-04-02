import path from "path";
import { and, eq, inArray, lt } from "drizzle-orm";
import { naverProductSellerBarcodeCacheEntries } from "@shared/schema";
import type { NaverProductSellerBarcodeCacheStorePort } from "../interfaces/naver-product-seller-barcode-cache-store";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
} from "../services/shared/work-data-db";

const NAVER_PRODUCT_SELLER_BARCODE_CACHE_TTL_MS = 24 * 60 * 60_000;

type PersistedSellerBarcodeEntry = {
  sellerBarcode: string;
  cachedAt: number;
};

type PersistedSellerBarcodeCache = {
  version: 1;
  entries: Record<string, Record<string, PersistedSellerBarcodeEntry>>;
};

function buildEntryId(storeId: string, originProductNo: string) {
  return `${storeId}:${originProductNo}`;
}

function normalizePersistedSellerBarcodeCache(value: PersistedSellerBarcodeCache | null) {
  return {
    version: 1 as const,
    entries:
      value?.entries && typeof value.entries === "object" && !Array.isArray(value.entries)
        ? value.entries
        : {},
  };
}

export class WorkDataNaverProductSellerBarcodeCacheStore
  implements NaverProductSellerBarcodeCacheStorePort
{
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.NAVER_PRODUCT_SELLER_BARCODE_CACHE_FILE ||
      "data/naver-product-seller-barcode-cache.json",
  );

  private initializePromise: Promise<void> | null = null;

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "naver-product-seller-barcode-cache.json",
          async () => {
            const parsed = normalizePersistedSellerBarcodeCache(
              await readJsonFileIfExists<PersistedSellerBarcodeCache>(this.filePath),
            );

            const values: Array<{
              id: string;
              storeId: string;
              originProductNo: string;
              sellerBarcode: string;
              cachedAt: Date;
              updatedAt: Date;
            }> = [];

            for (const [storeId, storeEntries] of Object.entries(parsed.entries)) {
              if (!storeEntries || typeof storeEntries !== "object" || Array.isArray(storeEntries)) {
                continue;
              }

              for (const [originProductNo, entry] of Object.entries(storeEntries)) {
                const sellerBarcode = typeof entry?.sellerBarcode === "string" ? entry.sellerBarcode.trim() : "";
                const cachedAt = Number.isFinite(entry?.cachedAt)
                  ? new Date(Number(entry.cachedAt))
                  : new Date();

                if (!storeId.trim() || !originProductNo.trim() || !sellerBarcode) {
                  continue;
                }

                values.push({
                  id: buildEntryId(storeId, originProductNo),
                  storeId,
                  originProductNo,
                  sellerBarcode,
                  cachedAt,
                  updatedAt: cachedAt,
                });
              }
            }

            if (!values.length) {
              return { importedCount: 0 };
            }

            const database = assertWorkDataDatabaseEnabled();
            for (const value of values) {
              await database
                .insert(naverProductSellerBarcodeCacheEntries)
                .values(value)
                .onConflictDoUpdate({
                  target: naverProductSellerBarcodeCacheEntries.id,
                  set: {
                    sellerBarcode: value.sellerBarcode,
                    cachedAt: value.cachedAt,
                    updatedAt: value.updatedAt,
                  },
                });
            }

            return { importedCount: values.length };
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

  async getMany(storeId: string, originProductNos: string[]) {
    if (!originProductNos.length) {
      return new Map<string, string>();
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const cutoff = new Date(Date.now() - NAVER_PRODUCT_SELLER_BARCODE_CACHE_TTL_MS);
    const normalizedOriginProductNos = Array.from(
      new Set(originProductNos.map((value) => value.trim()).filter(Boolean)),
    );

    const rows = await database
      .select()
      .from(naverProductSellerBarcodeCacheEntries)
      .where(
        and(
          eq(naverProductSellerBarcodeCacheEntries.storeId, storeId),
          inArray(naverProductSellerBarcodeCacheEntries.originProductNo, normalizedOriginProductNos),
        ),
      );

    const staleIds = rows
      .filter((row) => row.cachedAt < cutoff || !row.sellerBarcode.trim())
      .map((row) => row.id);

    if (staleIds.length) {
      await database
        .delete(naverProductSellerBarcodeCacheEntries)
        .where(inArray(naverProductSellerBarcodeCacheEntries.id, staleIds));
    }

    return new Map(
      rows
        .filter((row) => row.cachedAt >= cutoff && row.sellerBarcode.trim())
        .map((row) => [row.originProductNo, row.sellerBarcode.trim()] as const),
    );
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

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const cachedAt = new Date();

    for (const entry of entries) {
      const originProductNo = entry.originProductNo.trim();
      const sellerBarcode = entry.sellerBarcode.trim();

      if (!storeId.trim() || !originProductNo || !sellerBarcode) {
        continue;
      }

      await database
        .insert(naverProductSellerBarcodeCacheEntries)
        .values({
          id: buildEntryId(storeId, originProductNo),
          storeId,
          originProductNo,
          sellerBarcode,
          cachedAt,
          updatedAt: cachedAt,
        })
        .onConflictDoUpdate({
          target: naverProductSellerBarcodeCacheEntries.id,
          set: {
            sellerBarcode,
            cachedAt,
            updatedAt: cachedAt,
          },
        });
    }

    await database
      .delete(naverProductSellerBarcodeCacheEntries)
      .where(
        and(
          eq(naverProductSellerBarcodeCacheEntries.storeId, storeId),
          lt(naverProductSellerBarcodeCacheEntries.cachedAt, new Date(Date.now() - NAVER_PRODUCT_SELLER_BARCODE_CACHE_TTL_MS)),
        ),
      );
  }
}

export const workDataNaverProductSellerBarcodeCacheStore: NaverProductSellerBarcodeCacheStorePort =
  new WorkDataNaverProductSellerBarcodeCacheStore();
