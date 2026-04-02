import path from "path";
import { desc, eq } from "drizzle-orm";
import { naverProductMemoEntries } from "@shared/schema";
import type {
  NaverProductMemoEntry,
  NaverProductMemoStorePort,
  UpsertNaverProductMemoInput,
} from "../interfaces/naver-product-memo-store";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../services/shared/work-data-db";

type PersistedNaverProductMemos = {
  version: 1;
  entries: Record<string, NaverProductMemoEntry>;
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
    storeId: entry.storeId.trim(),
    originProductNo: entry.originProductNo.trim(),
    productName:
      typeof entry.productName === "string" && entry.productName.trim() ? entry.productName : null,
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

function mapRow(
  row: typeof naverProductMemoEntries.$inferSelect,
): NaverProductMemoEntry {
  return {
    storeId: row.storeId,
    originProductNo: row.originProductNo,
    productName: row.productName,
    memo: row.memo,
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

export class WorkDataNaverProductMemoStore implements NaverProductMemoStorePort {
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.NAVER_PRODUCT_MEMO_FILE || "data/naver-product-memos.json",
  );

  private initializePromise: Promise<void> | null = null;

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "naver-product-memos.json",
          async () => {
            const parsed = (await readJsonFileIfExists<PersistedNaverProductMemos>(this.filePath)) ?? {
              version: 1,
              entries: {},
            };

            const entries = Object.values(parsed.entries)
              .map((entry) => normalizeMemoEntry(entry))
              .filter((entry): entry is NaverProductMemoEntry => Boolean(entry));

            if (!entries.length) {
              return { importedCount: 0 };
            }

            const database = assertWorkDataDatabaseEnabled();
            for (const entry of entries) {
              await database
                .insert(naverProductMemoEntries)
                .values({
                  id: buildNaverProductMemoKey(entry.storeId, entry.originProductNo),
                  storeId: entry.storeId,
                  originProductNo: entry.originProductNo,
                  productName: entry.productName,
                  memo: entry.memo,
                  createdAt: toDateOrNull(entry.updatedAt) ?? new Date(),
                  updatedAt: toDateOrNull(entry.updatedAt) ?? new Date(),
                })
                .onConflictDoUpdate({
                  target: naverProductMemoEntries.id,
                  set: {
                    productName: entry.productName,
                    memo: entry.memo,
                    updatedAt: toDateOrNull(entry.updatedAt) ?? new Date(),
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

  async get(storeId: string, originProductNo: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(naverProductMemoEntries)
      .where(eq(naverProductMemoEntries.id, buildNaverProductMemoKey(storeId, originProductNo)))
      .limit(1);

    return rows[0] ? mapRow(rows[0]) : null;
  }

  async listByStore(storeId: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(naverProductMemoEntries)
      .where(eq(naverProductMemoEntries.storeId, storeId))
      .orderBy(desc(naverProductMemoEntries.updatedAt));

    return rows.map(mapRow);
  }

  async listAll() {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(naverProductMemoEntries)
      .orderBy(desc(naverProductMemoEntries.updatedAt));

    return rows.map(mapRow);
  }

  async upsert(input: UpsertNaverProductMemoInput) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const storeId = input.storeId.trim();
    const originProductNo = input.originProductNo.trim();

    if (!storeId) {
      throw new Error("storeId is required.");
    }

    if (!originProductNo) {
      throw new Error("originProductNo is required.");
    }

    const trimmedMemo = input.memo.trim();
    const updatedAt = new Date().toISOString();
    const id = buildNaverProductMemoKey(storeId, originProductNo);

    if (!trimmedMemo) {
      await database.delete(naverProductMemoEntries).where(eq(naverProductMemoEntries.id, id));
      return {
        storeId,
        originProductNo,
        memo: null,
        updatedAt,
      };
    }

    await database
      .insert(naverProductMemoEntries)
      .values({
        id,
        storeId,
        originProductNo,
        productName:
          typeof input.productName === "string" && input.productName.trim() ? input.productName : null,
        memo: trimmedMemo,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: naverProductMemoEntries.id,
        set: {
          productName:
            typeof input.productName === "string" && input.productName.trim() ? input.productName : null,
          memo: trimmedMemo,
          updatedAt: new Date(),
        },
      });

    return {
      storeId,
      originProductNo,
      memo: trimmedMemo,
      updatedAt,
    };
  }
}

export const workDataNaverProductMemoStore: NaverProductMemoStorePort =
  new WorkDataNaverProductMemoStore();
