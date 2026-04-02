import path from "path";
import { eq } from "drizzle-orm";
import type { MenuStateEntry } from "@shared/ui-state";
import { uiStateEntries } from "@shared/schema";
import type { UiStateStorePort } from "../interfaces/ui-state-store";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../services/shared/work-data-db";

type PersistedMenuState = {
  version: 1;
  items: Record<string, MenuStateEntry<Record<string, unknown>>>;
};

function normalizeEntry(
  key: string,
  value: Record<string, unknown>,
  current?: Partial<MenuStateEntry<Record<string, unknown>>>,
) {
  const timestamp = new Date().toISOString();

  return {
    key,
    value,
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  } satisfies MenuStateEntry<Record<string, unknown>>;
}

function normalizePersistedMenuState(value: PersistedMenuState | null) {
  return {
    version: 1 as const,
    items:
      value?.items && typeof value.items === "object" && !Array.isArray(value.items)
        ? Object.fromEntries(
            Object.entries(value.items).map(([key, entry]) => [
              key,
              normalizeEntry(
                key,
                entry?.value && typeof entry.value === "object" && !Array.isArray(entry.value)
                  ? structuredClone(entry.value)
                  : {},
                entry,
              ),
            ]),
          )
        : {},
  };
}

export class WorkDataUiStateStore implements UiStateStorePort {
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.UI_STATE_FILE || "data/ui-state.json",
  );

  private initializePromise: Promise<void> | null = null;

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "ui-state.json",
          async () => {
            const parsed = normalizePersistedMenuState(
              await readJsonFileIfExists<PersistedMenuState>(this.filePath),
            );

            if (!Object.keys(parsed.items).length) {
              return { importedCount: 0 };
            }

            const database = assertWorkDataDatabaseEnabled();
            for (const [key, entry] of Object.entries(parsed.items)) {
              await database
                .insert(uiStateEntries)
                .values({
                  key,
                  valueJson: entry.value,
                  createdAt: toDateOrNull(entry.createdAt) ?? new Date(),
                  updatedAt: toDateOrNull(entry.updatedAt) ?? new Date(),
                })
                .onConflictDoUpdate({
                  target: uiStateEntries.key,
                  set: {
                    valueJson: entry.value,
                    updatedAt: toDateOrNull(entry.updatedAt) ?? new Date(),
                  },
                });
            }

            return {
              importedCount: Object.keys(parsed.items).length,
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

  async get<TValue extends Record<string, unknown>>(key: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(uiStateEntries)
      .where(eq(uiStateEntries.key, key))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      key: row.key,
      value:
        row.valueJson && typeof row.valueJson === "object" && !Array.isArray(row.valueJson)
          ? structuredClone(row.valueJson as TValue)
          : ({} as TValue),
      createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
      updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
    } satisfies MenuStateEntry<TValue>;
  }

  async set<TValue extends Record<string, unknown>>(key: string, value: TValue) {
    await this.ensureInitialized();
    const current = await this.get<TValue>(key);
    const nextEntry = normalizeEntry(key, structuredClone(value), current ?? undefined);
    const database = assertWorkDataDatabaseEnabled();

    await database
      .insert(uiStateEntries)
      .values({
        key,
        valueJson: nextEntry.value,
        createdAt: toDateOrNull(nextEntry.createdAt) ?? new Date(),
        updatedAt: toDateOrNull(nextEntry.updatedAt) ?? new Date(),
      })
      .onConflictDoUpdate({
        target: uiStateEntries.key,
        set: {
          valueJson: nextEntry.value,
          updatedAt: toDateOrNull(nextEntry.updatedAt) ?? new Date(),
        },
      });

    return structuredClone(nextEntry) as MenuStateEntry<TValue>;
  }
}

export const workDataUiStateStore: UiStateStorePort = new WorkDataUiStateStore();
