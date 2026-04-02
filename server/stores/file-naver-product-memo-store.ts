import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type {
  NaverProductMemoEntry,
  NaverProductMemoStorePort,
} from "../interfaces/naver-product-memo-store";

export type { NaverProductMemoEntry } from "../interfaces/naver-product-memo-store";

type PersistedNaverProductMemos = {
  version: 1;
  entries: Record<string, NaverProductMemoEntry>;
};

const defaultData: PersistedNaverProductMemos = {
  version: 1,
  entries: {},
};

function normalizeMemoEntry(value: unknown): NaverProductMemoEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entry = value as Record<string, unknown>;

  if (
    typeof entry.storeId !== "string" ||
    !entry.storeId.trim() ||
    typeof entry.originProductNo !== "string" ||
    !entry.originProductNo.trim() ||
    typeof entry.memo !== "string"
  ) {
    return null;
  }

  return {
    storeId: entry.storeId,
    originProductNo: entry.originProductNo,
    productName: typeof entry.productName === "string" && entry.productName.trim() ? entry.productName : null,
    memo: entry.memo,
    updatedAt:
      typeof entry.updatedAt === "string" && entry.updatedAt.trim()
        ? entry.updatedAt
        : new Date().toISOString(),
  };
}

export function buildNaverProductMemoKey(storeId: string, originProductNo: string) {
  return `${storeId}:${originProductNo}`;
}

export class NaverProductMemoStore {
  private readonly filePath: string;
  private cache: PersistedNaverProductMemos | null = null;
  private writePromise = Promise.resolve();

  constructor(filePath = path.resolve(process.cwd(), process.env.NAVER_PRODUCT_MEMO_FILE || "data/naver-product-memos.json")) {
    this.filePath = filePath;
  }

  private async load() {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PersistedNaverProductMemos>;
      const entries = parsed.entries && typeof parsed.entries === "object" && !Array.isArray(parsed.entries)
        ? Object.fromEntries(
            Object.entries(parsed.entries)
              .map(([key, value]) => [key, normalizeMemoEntry(value)] as const)
              .filter((entry): entry is [string, NaverProductMemoEntry] => entry[1] !== null),
          )
        : {};

      this.cache = {
        version: 1,
        entries,
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

  private async persist(nextData: PersistedNaverProductMemos) {
    this.cache = nextData;
    const payload = JSON.stringify(nextData, null, 2);

    this.writePromise = this.writePromise.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf-8");
    });

    await this.writePromise;
  }

  async get(storeId: string, originProductNo: string) {
    const data = await this.load();
    return data.entries[buildNaverProductMemoKey(storeId, originProductNo)] ?? null;
  }

  async listByStore(storeId: string) {
    const data = await this.load();
    return Object.values(data.entries)
      .filter((entry) => entry.storeId === storeId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async listAll() {
    const data = await this.load();
    return Object.values(data.entries).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async upsert(input: {
    storeId: string;
    originProductNo: string;
    productName?: string | null;
    memo: string;
  }) {
    const storeId = input.storeId.trim();
    const originProductNo = input.originProductNo.trim();

    if (!storeId) {
      throw new Error("storeId is required.");
    }

    if (!originProductNo) {
      throw new Error("originProductNo is required.");
    }

    const data = await this.load();
    const key = buildNaverProductMemoKey(storeId, originProductNo);
    const trimmedMemo = input.memo.trim();
    const updatedAt = new Date().toISOString();

    if (!trimmedMemo) {
      const { [key]: _removed, ...restEntries } = data.entries;
      await this.persist({
        version: 1,
        entries: restEntries,
      });

      return {
        storeId,
        originProductNo,
        memo: null,
        updatedAt,
      };
    }

    const nextEntry: NaverProductMemoEntry = {
      storeId,
      originProductNo,
      productName:
        typeof input.productName === "string" && input.productName.trim() ? input.productName : null,
      memo: trimmedMemo,
      updatedAt,
    };

    await this.persist({
      version: 1,
      entries: {
        ...data.entries,
        [key]: nextEntry,
      },
    });

    return {
      storeId,
      originProductNo,
      memo: nextEntry.memo,
      updatedAt,
    };
  }
}

export const fileNaverProductMemoStore: NaverProductMemoStorePort = new NaverProductMemoStore();
