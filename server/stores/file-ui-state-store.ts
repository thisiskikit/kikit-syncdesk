import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { MenuStateEntry } from "@shared/ui-state";
import type { UiStateStorePort } from "../interfaces/ui-state-store";

type PersistedMenuState = {
  version: 1;
  items: Record<string, MenuStateEntry<Record<string, unknown>>>;
};

const defaultData: PersistedMenuState = {
  version: 1,
  items: {},
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

export class UiStateStore {
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.UI_STATE_FILE || "data/ui-state.json",
  );

  private cache: PersistedMenuState | null = null;
  private writePromise = Promise.resolve();

  private async load() {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PersistedMenuState>;
      this.cache = {
        version: 1,
        items:
          parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items)
            ? Object.fromEntries(
                Object.entries(parsed.items).map(([key, entry]) => {
                  const normalizedEntry =
                    entry && typeof entry === "object" && !Array.isArray(entry)
                      ? normalizeEntry(
                          key,
                          entry.value && typeof entry.value === "object" && !Array.isArray(entry.value)
                            ? (entry.value as Record<string, unknown>)
                            : {},
                          entry as Partial<MenuStateEntry<Record<string, unknown>>>,
                        )
                      : normalizeEntry(key, {});

                  return [key, normalizedEntry];
                }),
              )
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

  private async persist(nextData: PersistedMenuState) {
    this.cache = nextData;
    const payload = JSON.stringify(nextData, null, 2);

    this.writePromise = this.writePromise.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf-8");
    });

    await this.writePromise;
  }

  async get<TValue extends Record<string, unknown>>(key: string) {
    const data = await this.load();
    const entry = data.items[key];
    return entry ? (structuredClone(entry) as MenuStateEntry<TValue>) : null;
  }

  async set<TValue extends Record<string, unknown>>(key: string, value: TValue) {
    const data = await this.load();
    const current = data.items[key];
    const nextEntry = normalizeEntry(key, structuredClone(value), current);

    await this.persist({
      version: 1,
      items: {
        ...data.items,
        [key]: nextEntry,
      },
    });

    return structuredClone(nextEntry) as MenuStateEntry<TValue>;
  }
}

export const fileUiStateStore: UiStateStorePort = new UiStateStore();
