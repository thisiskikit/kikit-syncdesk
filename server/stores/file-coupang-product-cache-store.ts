import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import type {
  CoupangDataSource,
  CoupangProductDetailResponse,
  CoupangProductExplorerRow,
  CoupangStoreRef,
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

const defaultData: PersistedCoupangProductCache = {
  version: 1,
  explorers: {},
  details: {},
};

const DEFAULT_PERSIST_DEBOUNCE_MS = 5_000;

function getDetailKey(storeId: string, sellerProductId: string) {
  return `${storeId}:${sellerProductId}`;
}

function readPersistDebounceMs() {
  const raw = process.env.COUPANG_PRODUCT_CACHE_PERSIST_DEBOUNCE_MS;
  if (!raw?.trim()) {
    return DEFAULT_PERSIST_DEBOUNCE_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PERSIST_DEBOUNCE_MS;
  }

  return Math.max(0, Math.min(60_000, Math.round(parsed)));
}

class CoupangProductCacheStore {
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.COUPANG_PRODUCT_CACHE_FILE || "data/coupang-product-cache.json",
  );
  private readonly persistDebounceMs = readPersistDebounceMs();

  private cache: PersistedCoupangProductCache | null = null;
  private writePromise = Promise.resolve();
  private mutationQueue = Promise.resolve();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private persistRequested = false;

  private get backupFilePath() {
    return `${this.filePath}.bak`;
  }

  private get tempFilePath() {
    return `${this.filePath}.tmp`;
  }

  private buildCorruptFilePath() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${this.filePath}.corrupt-${timestamp}`;
  }

  private normalizeParsedData(parsed: Partial<PersistedCoupangProductCache>) {
    return {
      version: 1,
      explorers:
        parsed.explorers && typeof parsed.explorers === "object" && !Array.isArray(parsed.explorers)
          ? (parsed.explorers as Record<string, CoupangProductExplorerSnapshot>)
          : {},
      details:
        parsed.details && typeof parsed.details === "object" && !Array.isArray(parsed.details)
          ? (parsed.details as Record<string, CoupangProductDetailResponse>)
          : {},
    } satisfies PersistedCoupangProductCache;
  }

  private isMissingFileError(error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    return code === "ENOENT";
  }

  private async removeFileIfExists(targetPath: string) {
    try {
      await unlink(targetPath);
    } catch (error) {
      if (!this.isMissingFileError(error)) {
        throw error;
      }
    }
  }

  private async readPersistedFile(targetPath: string) {
    const raw = await readFile(targetPath, "utf-8");
    return this.normalizeParsedData(JSON.parse(raw) as Partial<PersistedCoupangProductCache>);
  }

  private async tryReadPersistedFile(targetPath: string) {
    try {
      return await this.readPersistedFile(targetPath);
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return null;
      }

      return null;
    }
  }

  private async moveCorruptedPrimaryCache() {
    try {
      await rename(this.filePath, this.buildCorruptFilePath());
    } catch (error) {
      if (!this.isMissingFileError(error)) {
        throw error;
      }
    }
  }

  private async serializeMutation<T>(task: () => Promise<T>) {
    const result = this.mutationQueue.then(task, task);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async load() {
    if (this.cache) {
      return this.cache;
    }

    try {
      this.cache = await this.readPersistedFile(this.filePath);
    } catch (error) {
      if (this.isMissingFileError(error)) {
        const backupSnapshot = await this.tryReadPersistedFile(this.backupFilePath);
        this.cache = backupSnapshot ?? structuredClone(defaultData);
        if (backupSnapshot) {
          this.persist(this.cache);
          await this.flush();
        }
      } else {
        await this.moveCorruptedPrimaryCache();
        this.cache =
          (await this.tryReadPersistedFile(this.backupFilePath)) ?? structuredClone(defaultData);
        this.persist(this.cache);
        await this.flush();
      }
    }

    return this.cache;
  }

  private scheduleFlush(delayMs = this.persistDebounceMs) {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, Math.max(0, delayMs));
  }

  private persist(nextData: PersistedCoupangProductCache) {
    this.cache = nextData;
    this.persistRequested = true;
    this.scheduleFlush();
  }

  private async flush() {
    if (!this.cache || !this.persistRequested) {
      return;
    }

    this.persistRequested = false;
    const payload = JSON.stringify(this.cache, null, 2);

    this.writePromise = this.writePromise.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.tempFilePath, payload, "utf-8");
      await this.removeFileIfExists(this.backupFilePath);

      try {
        await rename(this.filePath, this.backupFilePath);
      } catch (error) {
        if (!this.isMissingFileError(error)) {
          throw error;
        }
      }

      try {
        await rename(this.tempFilePath, this.filePath);
      } catch (error) {
        if (!this.isMissingFileError(error)) {
          const backupSnapshot = await this.tryReadPersistedFile(this.backupFilePath);
          if (backupSnapshot) {
            await writeFile(this.filePath, JSON.stringify(backupSnapshot, null, 2), "utf-8");
          }
        }
        throw error;
      }

      await this.removeFileIfExists(this.backupFilePath);
    });

    await this.writePromise;

    if (this.persistRequested) {
      this.scheduleFlush(0);
    }
  }

  async getExplorer(storeId: string) {
    const data = await this.load();
    const entry = data.explorers[storeId];
    return entry ? structuredClone(entry) : null;
  }

  async setExplorer(storeId: string, snapshot: CoupangProductExplorerSnapshot) {
    await this.serializeMutation(async () => {
      const data = await this.load();
      data.explorers[storeId] = structuredClone(snapshot);
      this.persist(data);
    });
  }

  async updateExplorer(
    storeId: string,
    updater: (
      snapshot: CoupangProductExplorerSnapshot | null,
    ) => CoupangProductExplorerSnapshot | null,
  ) {
    await this.serializeMutation(async () => {
      const data = await this.load();
      const current = data.explorers[storeId] ? structuredClone(data.explorers[storeId]) : null;
      const nextSnapshot = updater(current);

      if (nextSnapshot) {
        data.explorers[storeId] = structuredClone(nextSnapshot);
      } else if (data.explorers[storeId]) {
        delete data.explorers[storeId];
      } else {
        return;
      }
      this.persist(data);
    });
  }

  async patchExplorerRow(
    storeId: string,
    sellerProductId: string,
    updater: (row: CoupangProductExplorerRow) => CoupangProductExplorerRow | null,
  ) {
    await this.serializeMutation(async () => {
      const data = await this.load();
      const snapshot = data.explorers[storeId];
      if (!snapshot) {
        return;
      }

      const index = snapshot.items.findIndex((row) => row.sellerProductId === sellerProductId);
      if (index < 0) {
        return;
      }

      const currentRow = structuredClone(snapshot.items[index]!);
      const nextRow = updater(currentRow);

      if (nextRow) {
        snapshot.items[index] = nextRow;
      } else {
        snapshot.items.splice(index, 1);
      }
      this.persist(data);
    });
  }

  async getDetail(storeId: string, sellerProductId: string) {
    const data = await this.load();
    const entry = data.details[getDetailKey(storeId, sellerProductId)];
    return entry ? structuredClone(entry) : null;
  }

  async setDetail(storeId: string, sellerProductId: string, response: CoupangProductDetailResponse) {
    await this.serializeMutation(async () => {
      const data = await this.load();
      data.details[getDetailKey(storeId, sellerProductId)] = structuredClone(response);
      this.persist(data);
    });
  }

  async updateDetail(
    storeId: string,
    sellerProductId: string,
    updater: (
      response: CoupangProductDetailResponse | null,
    ) => CoupangProductDetailResponse | null,
  ) {
    await this.serializeMutation(async () => {
      const data = await this.load();
      const key = getDetailKey(storeId, sellerProductId);
      const current = data.details[key] ? structuredClone(data.details[key]) : null;
      const nextResponse = updater(current);

      if (nextResponse) {
        data.details[key] = structuredClone(nextResponse);
      } else if (data.details[key]) {
        delete data.details[key];
      } else {
        return;
      }
      this.persist(data);
    });
  }

  async invalidateStore(storeId: string) {
    await this.serializeMutation(async () => {
      const data = await this.load();
      let changed = false;

      for (const key of Object.keys(data.details)) {
        if (key.startsWith(`${storeId}:`)) {
          delete data.details[key];
          changed = true;
        }
      }

      if (data.explorers[storeId]) {
        delete data.explorers[storeId];
        changed = true;
      }

      if (changed) {
        this.persist(data);
      }
    });
  }

  async invalidateProduct(storeId: string, sellerProductId: string) {
    await this.serializeMutation(async () => {
      const data = await this.load();
      const detailKey = getDetailKey(storeId, sellerProductId);
      if (!data.details[detailKey]) {
        return;
      }

      delete data.details[detailKey];
      this.persist(data);
    });
  }
}

export const fileCoupangProductCacheStore: CoupangProductCacheStorePort =
  new CoupangProductCacheStore();
