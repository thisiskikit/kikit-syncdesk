import path from "path";
import type { Dirent } from "fs";
import { readdir } from "fs/promises";
import { and, eq } from "drizzle-orm";
import type {
  CoupangProductDetailResponse,
  CoupangProductExplorerRow,
} from "@shared/coupang";
import {
  coupangProductDetailCacheEntries,
  coupangProductExplorerCacheEntries,
} from "@shared/schema";
import type {
  CoupangProductCacheStorePort,
  CoupangProductExplorerSnapshot,
} from "../interfaces/coupang-product-cache-store";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../services/shared/work-data-db";

type PersistedCoupangProductCache = {
  version: 1;
  explorers: Record<string, CoupangProductExplorerSnapshot>;
  details: Record<string, CoupangProductDetailResponse>;
};

type PersistedDetailShard = {
  version: 1;
  items: Record<string, CoupangProductDetailResponse>;
};

function buildDetailId(storeId: string, sellerProductId: string) {
  return `${storeId}:${sellerProductId}`;
}

function getLegacyFilePath(filePath?: string) {
  return path.resolve(
    process.cwd(),
    filePath ?? (process.env.COUPANG_PRODUCT_CACHE_FILE || "data/coupang-product-cache.json"),
  );
}

function getCacheRootDir(legacyFilePath: string) {
  const extension = path.extname(legacyFilePath);
  const baseName = extension
    ? path.basename(legacyFilePath, extension)
    : path.basename(legacyFilePath);

  return path.join(path.dirname(legacyFilePath), baseName);
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitLegacyDetailKey(detailKey: string) {
  const separatorIndex = detailKey.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  const storeId = detailKey.slice(0, separatorIndex).trim();
  const sellerProductId = detailKey.slice(separatorIndex + 1).trim();
  if (!storeId || !sellerProductId) {
    return null;
  }

  return { storeId, sellerProductId };
}

function cloneValue<T>(value: T) {
  return structuredClone(value);
}

function mapExplorerRow(
  row: typeof coupangProductExplorerCacheEntries.$inferSelect,
): CoupangProductExplorerSnapshot | null {
  return row.snapshotJson && typeof row.snapshotJson === "object"
    ? cloneValue(row.snapshotJson as CoupangProductExplorerSnapshot)
    : null;
}

function mapDetailRow(
  row: typeof coupangProductDetailCacheEntries.$inferSelect,
): CoupangProductDetailResponse | null {
  return row.responseJson && typeof row.responseJson === "object"
    ? cloneValue(row.responseJson as CoupangProductDetailResponse)
    : null;
}

export class WorkDataCoupangProductCacheStore implements CoupangProductCacheStorePort {
  private readonly legacyFilePath: string;
  private readonly rootDir: string;
  private readonly explorersDir: string;
  private readonly detailsDir: string;
  private initializePromise: Promise<void> | null = null;

  constructor(filePath?: string) {
    this.legacyFilePath = getLegacyFilePath(filePath);
    this.rootDir = getCacheRootDir(this.legacyFilePath);
    this.explorersDir = path.join(this.rootDir, "explorers");
    this.detailsDir = path.join(this.rootDir, "details");
  }

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "coupang-product-cache",
          async () => {
            const importedExplorerCount = await this.importShardedExplorers();
            const importedDetailCount = await this.importShardedDetails();

            if (importedExplorerCount > 0 || importedDetailCount > 0) {
              return {
                importedExplorerCount,
                importedDetailCount,
                source: "sharded-file",
              };
            }

            const importedLegacy = await this.importLegacyFile();
            return {
              importedExplorerCount: importedLegacy.importedExplorerCount,
              importedDetailCount: importedLegacy.importedDetailCount,
              source: importedLegacy.importedExplorerCount || importedLegacy.importedDetailCount
                ? "legacy-file"
                : "empty",
            };
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

  private async importShardedExplorers() {
    let importedCount = 0;
    let files: Dirent<string>[];

    try {
      files = await readdir(this.explorersDir, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: string }).code)
          : null;
      if (code === "ENOENT") {
        return 0;
      }
      throw error;
    }

    const database = assertWorkDataDatabaseEnabled();
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) {
        continue;
      }

      const storeId = decodePathSegment(file.name.slice(0, -5));
      const snapshot = await readJsonFileIfExists<CoupangProductExplorerSnapshot>(
        path.join(this.explorersDir, file.name),
      );
      if (!snapshot || !storeId.trim()) {
        continue;
      }

      await database
        .insert(coupangProductExplorerCacheEntries)
        .values({
          storeId,
          snapshotJson: snapshot,
          fetchedAt: toDateOrNull(snapshot.fetchedAt),
          updatedAt: toDateOrNull(snapshot.fetchedAt) ?? new Date(),
        })
        .onConflictDoUpdate({
          target: coupangProductExplorerCacheEntries.storeId,
          set: {
            snapshotJson: snapshot,
            fetchedAt: toDateOrNull(snapshot.fetchedAt),
            updatedAt: toDateOrNull(snapshot.fetchedAt) ?? new Date(),
          },
        });
      importedCount += 1;
    }

    return importedCount;
  }

  private async importShardedDetails() {
    let storeDirs: Dirent<string>[];

    try {
      storeDirs = await readdir(this.detailsDir, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: string }).code)
          : null;
      if (code === "ENOENT") {
        return 0;
      }
      throw error;
    }

    const database = assertWorkDataDatabaseEnabled();
    let importedCount = 0;

    for (const storeDir of storeDirs) {
      if (!storeDir.isDirectory()) {
        continue;
      }

      const storeId = decodePathSegment(storeDir.name);
      const shardFiles = await readdir(path.join(this.detailsDir, storeDir.name), {
        withFileTypes: true,
        encoding: "utf8",
      }).catch(() => [] as Dirent<string>[]);

      for (const shardFile of shardFiles) {
        if (!shardFile.isFile() || !shardFile.name.endsWith(".json")) {
          continue;
        }

        const shard = await readJsonFileIfExists<PersistedDetailShard>(
          path.join(this.detailsDir, storeDir.name, shardFile.name),
        );

        if (!shard?.items || typeof shard.items !== "object" || Array.isArray(shard.items)) {
          continue;
        }

        for (const [sellerProductId, response] of Object.entries(shard.items)) {
          if (!sellerProductId.trim()) {
            continue;
          }

          await database
            .insert(coupangProductDetailCacheEntries)
            .values({
              id: buildDetailId(storeId, sellerProductId),
              storeId,
              sellerProductId,
              responseJson: response,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: coupangProductDetailCacheEntries.id,
              set: {
                responseJson: response,
                updatedAt: new Date(),
              },
            });
          importedCount += 1;
        }
      }
    }

    return importedCount;
  }

  private async importLegacyFile() {
    const parsed = await readJsonFileIfExists<PersistedCoupangProductCache>(this.legacyFilePath);
    if (!parsed) {
      return { importedExplorerCount: 0, importedDetailCount: 0 };
    }

    const database = assertWorkDataDatabaseEnabled();
    let importedExplorerCount = 0;
    let importedDetailCount = 0;

    const explorers =
      parsed.explorers && typeof parsed.explorers === "object" && !Array.isArray(parsed.explorers)
        ? parsed.explorers
        : {};
    for (const [storeId, snapshot] of Object.entries(explorers)) {
      if (!storeId.trim()) {
        continue;
      }

      await database
        .insert(coupangProductExplorerCacheEntries)
        .values({
          storeId,
          snapshotJson: snapshot,
          fetchedAt: toDateOrNull(snapshot.fetchedAt),
          updatedAt: toDateOrNull(snapshot.fetchedAt) ?? new Date(),
        })
        .onConflictDoUpdate({
          target: coupangProductExplorerCacheEntries.storeId,
          set: {
            snapshotJson: snapshot,
            fetchedAt: toDateOrNull(snapshot.fetchedAt),
            updatedAt: toDateOrNull(snapshot.fetchedAt) ?? new Date(),
          },
        });
      importedExplorerCount += 1;
    }

    const details =
      parsed.details && typeof parsed.details === "object" && !Array.isArray(parsed.details)
        ? parsed.details
        : {};
    for (const [detailKey, response] of Object.entries(details)) {
      const parsedKey = splitLegacyDetailKey(detailKey);
      if (!parsedKey) {
        continue;
      }

      await database
        .insert(coupangProductDetailCacheEntries)
        .values({
          id: buildDetailId(parsedKey.storeId, parsedKey.sellerProductId),
          storeId: parsedKey.storeId,
          sellerProductId: parsedKey.sellerProductId,
          responseJson: response,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: coupangProductDetailCacheEntries.id,
          set: {
            responseJson: response,
            updatedAt: new Date(),
          },
        });
      importedDetailCount += 1;
    }

    return { importedExplorerCount, importedDetailCount };
  }

  async getExplorer(storeId: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(coupangProductExplorerCacheEntries)
      .where(eq(coupangProductExplorerCacheEntries.storeId, storeId))
      .limit(1);

    const row = rows[0];
    return row ? mapExplorerRow(row) : null;
  }

  async setExplorer(storeId: string, snapshot: CoupangProductExplorerSnapshot) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    await database
      .insert(coupangProductExplorerCacheEntries)
      .values({
        storeId,
        snapshotJson: cloneValue(snapshot),
        fetchedAt: toDateOrNull(snapshot.fetchedAt),
        updatedAt: toDateOrNull(snapshot.fetchedAt) ?? new Date(),
      })
      .onConflictDoUpdate({
        target: coupangProductExplorerCacheEntries.storeId,
        set: {
          snapshotJson: cloneValue(snapshot),
          fetchedAt: toDateOrNull(snapshot.fetchedAt),
          updatedAt: toDateOrNull(snapshot.fetchedAt) ?? new Date(),
        },
      });
  }

  async updateExplorer(
    storeId: string,
    updater: (
      snapshot: CoupangProductExplorerSnapshot | null,
    ) => CoupangProductExplorerSnapshot | null,
  ) {
    const current = await this.getExplorer(storeId);
    const nextSnapshot = updater(current ? cloneValue(current) : null);

    if (!nextSnapshot) {
      await this.invalidateStore(storeId);
      return;
    }

    await this.setExplorer(storeId, nextSnapshot);
  }

  async patchExplorerRow(
    storeId: string,
    sellerProductId: string,
    updater: (row: CoupangProductExplorerRow) => CoupangProductExplorerRow | null,
  ) {
    const snapshot = await this.getExplorer(storeId);
    if (!snapshot) {
      return;
    }

    const index = snapshot.items.findIndex((row) => row.sellerProductId === sellerProductId);
    if (index < 0) {
      return;
    }

    const nextRow = updater(cloneValue(snapshot.items[index]!));
    if (nextRow) {
      snapshot.items[index] = cloneValue(nextRow);
    } else {
      snapshot.items.splice(index, 1);
    }

    await this.setExplorer(storeId, snapshot);
  }

  async getDetail(storeId: string, sellerProductId: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(coupangProductDetailCacheEntries)
      .where(
        and(
          eq(coupangProductDetailCacheEntries.storeId, storeId),
          eq(coupangProductDetailCacheEntries.sellerProductId, sellerProductId),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? mapDetailRow(row) : null;
  }

  async setDetail(storeId: string, sellerProductId: string, response: CoupangProductDetailResponse) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    await database
      .insert(coupangProductDetailCacheEntries)
      .values({
        id: buildDetailId(storeId, sellerProductId),
        storeId,
        sellerProductId,
        responseJson: cloneValue(response),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: coupangProductDetailCacheEntries.id,
        set: {
          responseJson: cloneValue(response),
          updatedAt: new Date(),
        },
      });
  }

  async updateDetail(
    storeId: string,
    sellerProductId: string,
    updater: (
      response: CoupangProductDetailResponse | null,
    ) => CoupangProductDetailResponse | null,
  ) {
    const current = await this.getDetail(storeId, sellerProductId);
    const nextResponse = updater(current ? cloneValue(current) : null);

    if (!nextResponse) {
      await this.invalidateProduct(storeId, sellerProductId);
      return;
    }

    await this.setDetail(storeId, sellerProductId, nextResponse);
  }

  async invalidateStore(storeId: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    await database
      .delete(coupangProductExplorerCacheEntries)
      .where(eq(coupangProductExplorerCacheEntries.storeId, storeId));
    await database
      .delete(coupangProductDetailCacheEntries)
      .where(eq(coupangProductDetailCacheEntries.storeId, storeId));
  }

  async invalidateProduct(storeId: string, sellerProductId: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    await database
      .delete(coupangProductDetailCacheEntries)
      .where(
        and(
          eq(coupangProductDetailCacheEntries.storeId, storeId),
          eq(coupangProductDetailCacheEntries.sellerProductId, sellerProductId),
        ),
      );
  }
}

export const workDataCoupangProductCacheStore: CoupangProductCacheStorePort =
  new WorkDataCoupangProductCacheStore();
