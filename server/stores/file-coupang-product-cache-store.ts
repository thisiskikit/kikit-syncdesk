import { mkdir, readFile, rename, rm, unlink, writeFile } from "fs/promises";
import path from "path";
import type {
  CoupangProductDetailResponse,
  CoupangProductExplorerRow,
} from "@shared/coupang";
import type {
  CoupangProductCacheStorePort,
  CoupangProductExplorerSnapshot,
} from "../interfaces/coupang-product-cache-store";

export type { CoupangProductExplorerSnapshot } from "../interfaces/coupang-product-cache-store";

type PersistedCoupangProductCache = {
  version: 1;
  explorers: Record<string, CoupangProductExplorerSnapshot>;
  details: Record<string, CoupangProductDetailResponse>;
};

type PersistedDetailShard = {
  version: 1;
  items: Record<string, CoupangProductDetailResponse>;
};

type PersistedCacheManifest = {
  version: 2;
  shardCount: number;
  migratedAt: string | null;
};

const SHARD_COUNT = 64;
const DEFAULT_MANIFEST: PersistedCacheManifest = {
  version: 2,
  shardCount: SHARD_COUNT,
  migratedAt: null,
};

function splitDetailKey(detailKey: string) {
  const separatorIndex = detailKey.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  const storeId = detailKey.slice(0, separatorIndex).trim();
  const sellerProductId = detailKey.slice(separatorIndex + 1).trim();
  if (!storeId || !sellerProductId) {
    return null;
  }

  return {
    storeId,
    sellerProductId,
  };
}

function normalizeStoreId(storeId: string) {
  return encodeURIComponent(storeId.trim());
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash >>> 0;
}

function getDetailShardKey(sellerProductId: string) {
  return (hashString(sellerProductId) % SHARD_COUNT).toString(16).padStart(2, "0");
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMissingFileError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code)
      : null;
  return code === "ENOENT";
}

function normalizeLegacyData(
  parsed: Partial<PersistedCoupangProductCache> | null,
): PersistedCoupangProductCache {
  return {
    version: 1,
    explorers:
      parsed?.explorers && isObjectRecord(parsed.explorers)
        ? (parsed.explorers as Record<string, CoupangProductExplorerSnapshot>)
        : {},
    details:
      parsed?.details && isObjectRecord(parsed.details)
        ? (parsed.details as Record<string, CoupangProductDetailResponse>)
        : {},
  };
}

function normalizeDetailShard(parsed: Partial<PersistedDetailShard> | null): PersistedDetailShard {
  return {
    version: 1,
    items:
      parsed?.items && isObjectRecord(parsed.items)
        ? (parsed.items as Record<string, CoupangProductDetailResponse>)
        : {},
  };
}

function cloneSnapshot<T>(value: T) {
  return structuredClone(value);
}

async function readJsonFileIfExists<T>(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

async function removeFileIfExists(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

async function writeJsonAtomically(filePath: string, value: unknown) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tempFilePath = `${filePath}.tmp`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await removeFileIfExists(tempFilePath);
  await writeFile(tempFilePath, payload, "utf-8");
  await removeFileIfExists(filePath);
  await rename(tempFilePath, filePath);
}

function readKeepLegacyFileFlag() {
  return process.env.COUPANG_PRODUCT_CACHE_KEEP_LEGACY_FILE === "true";
}

export class FileCoupangProductCacheStore implements CoupangProductCacheStorePort {
  private readonly legacyFilePath: string;
  private readonly rootDir: string;
  private readonly explorersDir: string;
  private readonly detailsDir: string;
  private readonly manifestPath: string;
  private initializePromise: Promise<void> | null = null;
  private mutationQueue = Promise.resolve();

  constructor(filePath?: string) {
    this.legacyFilePath = getLegacyFilePath(filePath);
    this.rootDir = getCacheRootDir(this.legacyFilePath);
    this.explorersDir = path.join(this.rootDir, "explorers");
    this.detailsDir = path.join(this.rootDir, "details");
    this.manifestPath = path.join(this.rootDir, "manifest.json");
  }

  private getExplorerPath(storeId: string) {
    return path.join(this.explorersDir, `${normalizeStoreId(storeId)}.json`);
  }

  private buildCorruptLegacyFilePath() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${this.legacyFilePath}.corrupt-${timestamp}`;
  }

  private getDetailStoreDir(storeId: string) {
    return path.join(this.detailsDir, normalizeStoreId(storeId));
  }

  private getDetailShardPath(storeId: string, sellerProductId: string) {
    return path.join(
      this.getDetailStoreDir(storeId),
      `${getDetailShardKey(sellerProductId)}.json`,
    );
  }

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await mkdir(this.explorersDir, { recursive: true });
        await mkdir(this.detailsDir, { recursive: true });

        const existingManifest =
          await readJsonFileIfExists<PersistedCacheManifest>(this.manifestPath);
        if (existingManifest?.version === 2) {
          return;
        }

        const migrated = await this.migrateLegacyCacheIfNeeded();
        await writeJsonAtomically(this.manifestPath, {
          ...DEFAULT_MANIFEST,
          migratedAt: migrated ? new Date().toISOString() : null,
        } satisfies PersistedCacheManifest);
      })().catch((error) => {
        this.initializePromise = null;
        throw error;
      });
    }

    await this.initializePromise;
  }

  private async serializeMutation<T>(task: () => Promise<T>) {
    const result = this.mutationQueue.then(task, task);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readExplorer(storeId: string) {
    const snapshot = await readJsonFileIfExists<CoupangProductExplorerSnapshot>(
      this.getExplorerPath(storeId),
    );
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  private async writeExplorer(storeId: string, snapshot: CoupangProductExplorerSnapshot | null) {
    const filePath = this.getExplorerPath(storeId);

    if (!snapshot) {
      await removeFileIfExists(filePath);
      return;
    }

    await writeJsonAtomically(filePath, snapshot);
  }

  private async readDetailShard(storeId: string, sellerProductId: string) {
    const shard = await readJsonFileIfExists<PersistedDetailShard>(
      this.getDetailShardPath(storeId, sellerProductId),
    );
    return normalizeDetailShard(shard);
  }

  private async writeDetailShard(
    storeId: string,
    sellerProductId: string,
    shard: PersistedDetailShard,
  ) {
    const filePath = this.getDetailShardPath(storeId, sellerProductId);

    if (!Object.keys(shard.items).length) {
      await removeFileIfExists(filePath);
      return;
    }

    await writeJsonAtomically(filePath, shard);
  }

  private async migrateLegacyCacheIfNeeded() {
    let parsed: Partial<PersistedCoupangProductCache> | null;

    try {
      parsed = await readJsonFileIfExists<Partial<PersistedCoupangProductCache>>(this.legacyFilePath);
    } catch (error) {
      if (isMissingFileError(error)) {
        return false;
      }

      await rename(this.legacyFilePath, this.buildCorruptLegacyFilePath()).catch(() => undefined);
      return false;
    }

    if (!parsed) {
      return false;
    }

    const legacy = normalizeLegacyData(parsed);
    const detailShards = new Map<string, PersistedDetailShard>();

    for (const [storeId, snapshot] of Object.entries(legacy.explorers)) {
      if (!storeId.trim()) {
        continue;
      }

      await this.writeExplorer(storeId, snapshot);
    }

    for (const [detailKey, response] of Object.entries(legacy.details)) {
      const parsedKey = splitDetailKey(detailKey);
      if (!parsedKey) {
        continue;
      }

      const shardPath = this.getDetailShardPath(parsedKey.storeId, parsedKey.sellerProductId);
      const shard =
        detailShards.get(shardPath) ??
        normalizeDetailShard(
          await readJsonFileIfExists<PersistedDetailShard>(shardPath),
        );

      shard.items[parsedKey.sellerProductId] = cloneSnapshot(response);
      detailShards.set(shardPath, shard);
    }

    for (const [shardPath, shard] of Array.from(detailShards.entries())) {
      await writeJsonAtomically(shardPath, shard);
    }

    if (!readKeepLegacyFileFlag()) {
      await removeFileIfExists(this.legacyFilePath);
      await removeFileIfExists(`${this.legacyFilePath}.tmp`);
      await removeFileIfExists(`${this.legacyFilePath}.bak`);
    }

    return true;
  }

  async getExplorer(storeId: string) {
    await this.ensureInitialized();
    return this.readExplorer(storeId);
  }

  async setExplorer(storeId: string, snapshot: CoupangProductExplorerSnapshot) {
    await this.ensureInitialized();

    await this.serializeMutation(async () => {
      await this.writeExplorer(storeId, cloneSnapshot(snapshot));
    });
  }

  async updateExplorer(
    storeId: string,
    updater: (
      snapshot: CoupangProductExplorerSnapshot | null,
    ) => CoupangProductExplorerSnapshot | null,
  ) {
    await this.ensureInitialized();

    await this.serializeMutation(async () => {
      const current = await this.readExplorer(storeId);
      const nextSnapshot = updater(current ? cloneSnapshot(current) : null);
      await this.writeExplorer(storeId, nextSnapshot ? cloneSnapshot(nextSnapshot) : null);
    });
  }

  async patchExplorerRow(
    storeId: string,
    sellerProductId: string,
    updater: (row: CoupangProductExplorerRow) => CoupangProductExplorerRow | null,
  ) {
    await this.ensureInitialized();

    await this.serializeMutation(async () => {
      const snapshot = await this.readExplorer(storeId);
      if (!snapshot) {
        return;
      }

      const index = snapshot.items.findIndex((row) => row.sellerProductId === sellerProductId);
      if (index < 0) {
        return;
      }

      const currentRow = cloneSnapshot(snapshot.items[index]!);
      const nextRow = updater(currentRow);

      if (nextRow) {
        snapshot.items[index] = cloneSnapshot(nextRow);
      } else {
        snapshot.items.splice(index, 1);
      }

      await this.writeExplorer(storeId, snapshot);
    });
  }

  async getDetail(storeId: string, sellerProductId: string) {
    await this.ensureInitialized();

    const shard = await this.readDetailShard(storeId, sellerProductId);
    const response = shard.items[sellerProductId];
    return response ? cloneSnapshot(response) : null;
  }

  async setDetail(storeId: string, sellerProductId: string, response: CoupangProductDetailResponse) {
    await this.ensureInitialized();

    await this.serializeMutation(async () => {
      const shard = await this.readDetailShard(storeId, sellerProductId);
      shard.items[sellerProductId] = cloneSnapshot(response);
      await this.writeDetailShard(storeId, sellerProductId, shard);
    });
  }

  async updateDetail(
    storeId: string,
    sellerProductId: string,
    updater: (
      response: CoupangProductDetailResponse | null,
    ) => CoupangProductDetailResponse | null,
  ) {
    await this.ensureInitialized();

    await this.serializeMutation(async () => {
      const shard = await this.readDetailShard(storeId, sellerProductId);
      const current = shard.items[sellerProductId]
        ? cloneSnapshot(shard.items[sellerProductId]!)
        : null;
      const nextResponse = updater(current);

      if (nextResponse) {
        shard.items[sellerProductId] = cloneSnapshot(nextResponse);
      } else {
        delete shard.items[sellerProductId];
      }

      await this.writeDetailShard(storeId, sellerProductId, shard);
    });
  }

  async invalidateStore(storeId: string) {
    await this.ensureInitialized();

    await this.serializeMutation(async () => {
      await this.writeExplorer(storeId, null);
      await rm(this.getDetailStoreDir(storeId), { recursive: true, force: true });
    });
  }

  async invalidateProduct(storeId: string, sellerProductId: string) {
    await this.ensureInitialized();

    await this.serializeMutation(async () => {
      const shard = await this.readDetailShard(storeId, sellerProductId);
      if (!shard.items[sellerProductId]) {
        return;
      }

      delete shard.items[sellerProductId];
      await this.writeDetailShard(storeId, sellerProductId, shard);
    });
  }
}

export const fileCoupangProductCacheStore: CoupangProductCacheStorePort =
  new FileCoupangProductCacheStore();
