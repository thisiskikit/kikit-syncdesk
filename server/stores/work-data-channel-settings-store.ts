import { randomUUID } from "crypto";
import path from "path";
import { desc, eq } from "drizzle-orm";
import type {
  ChannelStoreSummary,
  ConnectionTestResult,
  ConnectionTestStatus,
  UpsertChannelStoreInput,
} from "@shared/channel-settings";
import type { ChannelCode } from "@shared/channel-control";
import { channelStoreSettings } from "@shared/schema";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../services/shared/work-data-db";
import type {
  ChannelSettingsStorePort,
  StoredChannelStore,
} from "../interfaces/channel-settings-store";

export type {
  StoredChannelCredentials,
  StoredChannelStore,
} from "../interfaces/channel-settings-store";

type PersistedChannelSettings = {
  version: 1;
  stores: StoredChannelStore[];
};

function maskSecret(secret: string) {
  if (!secret) return null;
  const suffix = secret.slice(-4);
  return `${"*".repeat(Math.max(secret.length - Math.min(secret.length, 4), 4))}${suffix}`;
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConnectionStatus(value: string | null | undefined): ConnectionTestStatus {
  return value === "success" || value === "failed" ? value : "idle";
}

function normalizeStoredStore(value: unknown): StoredChannelStore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeText(typeof record.id === "string" ? record.id : "");
  const channel = normalizeText(typeof record.channel === "string" ? record.channel : "");
  const storeName = normalizeText(typeof record.storeName === "string" ? record.storeName : "");
  const createdAt = normalizeText(typeof record.createdAt === "string" ? record.createdAt : "");
  const updatedAt = normalizeText(typeof record.updatedAt === "string" ? record.updatedAt : "");
  const credentials =
    record.credentials && typeof record.credentials === "object" && !Array.isArray(record.credentials)
      ? (record.credentials as Record<string, unknown>)
      : {};
  const connectionTest =
    record.connectionTest &&
    typeof record.connectionTest === "object" &&
    !Array.isArray(record.connectionTest)
      ? (record.connectionTest as Record<string, unknown>)
      : {};

  if (!id || !channel || !storeName || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    channel: channel as ChannelCode,
    storeName,
    credentials: {
      clientId: normalizeText(typeof credentials.clientId === "string" ? credentials.clientId : ""),
      clientSecret: normalizeText(
        typeof credentials.clientSecret === "string" ? credentials.clientSecret : "",
      ),
    },
    connectionTest: {
      status: normalizeConnectionStatus(
        typeof connectionTest.status === "string" ? connectionTest.status : "",
      ),
      testedAt:
        typeof connectionTest.testedAt === "string" && connectionTest.testedAt.trim()
          ? connectionTest.testedAt
          : null,
      message:
        typeof connectionTest.message === "string" && connectionTest.message.trim()
          ? connectionTest.message
          : null,
    },
    createdAt,
    updatedAt,
  };
}

function normalizePersistedSettings(value: PersistedChannelSettings | null) {
  const stores = Array.isArray(value?.stores)
    ? value.stores
        .map((entry) => normalizeStoredStore(entry))
        .filter((entry): entry is StoredChannelStore => Boolean(entry))
    : [];

  return {
    version: 1 as const,
    stores,
  };
}

function mapRowToStoredStore(row: typeof channelStoreSettings.$inferSelect): StoredChannelStore {
  return {
    id: row.id,
    channel: row.channel as ChannelCode,
    storeName: row.storeName,
    credentials: {
      clientId: row.clientId,
      clientSecret: row.clientSecret,
    },
    connectionTest: {
      status: normalizeConnectionStatus(row.connectionStatus),
      testedAt: toIsoString(row.connectionTestedAt),
      message: row.connectionMessage,
    },
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

function toSummary(store: StoredChannelStore): ChannelStoreSummary {
  return {
    id: store.id,
    channel: store.channel,
    storeName: store.storeName,
    credentials: {
      clientId: store.credentials.clientId,
      hasClientSecret: Boolean(store.credentials.clientSecret),
      clientSecretMasked: maskSecret(store.credentials.clientSecret),
    },
    connectionTest: {
      status: store.connectionTest.status,
      testedAt: store.connectionTest.testedAt,
      message: store.connectionTest.message,
    },
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  };
}

class ChannelSettingsStore {
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.CHANNEL_SETTINGS_FILE || "data/channel-settings.json",
  );

  private initializePromise: Promise<void> | null = null;

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "channel-settings.json",
          async () => {
            const parsed = normalizePersistedSettings(
              await readJsonFileIfExists<PersistedChannelSettings>(this.filePath),
            );

            if (!parsed.stores.length) {
              return { importedCount: 0 };
            }

            const database = assertWorkDataDatabaseEnabled();

            for (const store of parsed.stores) {
              await database
                .insert(channelStoreSettings)
                .values({
                  id: store.id,
                  channel: store.channel,
                  storeName: store.storeName,
                  clientId: store.credentials.clientId,
                  clientSecret: store.credentials.clientSecret,
                  connectionStatus: store.connectionTest.status,
                  connectionTestedAt: toDateOrNull(store.connectionTest.testedAt),
                  connectionMessage: store.connectionTest.message,
                  createdAt: toDateOrNull(store.createdAt) ?? new Date(),
                  updatedAt: toDateOrNull(store.updatedAt) ?? new Date(),
                })
                .onConflictDoUpdate({
                  target: channelStoreSettings.id,
                  set: {
                    channel: store.channel,
                    storeName: store.storeName,
                    clientId: store.credentials.clientId,
                    clientSecret: store.credentials.clientSecret,
                    connectionStatus: store.connectionTest.status,
                    connectionTestedAt: toDateOrNull(store.connectionTest.testedAt),
                    connectionMessage: store.connectionTest.message,
                    updatedAt: toDateOrNull(store.updatedAt) ?? new Date(),
                  },
                });
            }

            return {
              importedCount: parsed.stores.length,
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

  async listStoreSummaries() {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(channelStoreSettings)
      .orderBy(desc(channelStoreSettings.updatedAt));

    return rows.map((row) => toSummary(mapRowToStoredStore(row)));
  }

  async getStore(id: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(channelStoreSettings)
      .where(eq(channelStoreSettings.id, id))
      .limit(1);

    return rows[0] ? mapRowToStoredStore(rows[0]) : null;
  }

  async saveStore(input: UpsertChannelStoreInput) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const existing = input.id ? await this.getStore(input.id) : null;
    const timestamp = new Date();
    const nextSecret =
      input.credentials.clientSecret && input.credentials.clientSecret.length > 0
        ? input.credentials.clientSecret
        : existing?.credentials.clientSecret ?? "";

    if (!nextSecret) {
      throw new Error("client_secret is required.");
    }

    const credentialsChanged =
      existing?.credentials.clientId !== input.credentials.clientId ||
      existing?.credentials.clientSecret !== nextSecret;

    const nextStore: StoredChannelStore = {
      id: existing?.id ?? randomUUID(),
      channel: input.channel,
      storeName: input.storeName,
      credentials: {
        clientId: input.credentials.clientId,
        clientSecret: nextSecret,
      },
      connectionTest:
        existing && !credentialsChanged
          ? existing.connectionTest
          : {
              status: "idle",
              testedAt: null,
              message: null,
            },
      createdAt: existing?.createdAt ?? timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };

    await database
      .insert(channelStoreSettings)
      .values({
        id: nextStore.id,
        channel: nextStore.channel,
        storeName: nextStore.storeName,
        clientId: nextStore.credentials.clientId,
        clientSecret: nextStore.credentials.clientSecret,
        connectionStatus: nextStore.connectionTest.status,
        connectionTestedAt: toDateOrNull(nextStore.connectionTest.testedAt),
        connectionMessage: nextStore.connectionTest.message,
        createdAt: toDateOrNull(nextStore.createdAt) ?? timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: channelStoreSettings.id,
        set: {
          channel: nextStore.channel,
          storeName: nextStore.storeName,
          clientId: nextStore.credentials.clientId,
          clientSecret: nextStore.credentials.clientSecret,
          connectionStatus: nextStore.connectionTest.status,
          connectionTestedAt: toDateOrNull(nextStore.connectionTest.testedAt),
          connectionMessage: nextStore.connectionTest.message,
          updatedAt: timestamp,
        },
      });

    return toSummary(nextStore);
  }

  async updateConnectionTest(storeId: string, result: ConnectionTestResult) {
    await this.ensureInitialized();
    const current = await this.getStore(storeId);

    if (!current) {
      return null;
    }

    const nextStore: StoredChannelStore = {
      ...current,
      connectionTest: {
        status: result.status,
        testedAt: result.testedAt,
        message: result.message,
      },
      updatedAt: new Date().toISOString(),
    };

    const database = assertWorkDataDatabaseEnabled();
    await database
      .update(channelStoreSettings)
      .set({
        connectionStatus: result.status,
        connectionTestedAt: toDateOrNull(result.testedAt),
        connectionMessage: result.message,
        updatedAt: toDateOrNull(nextStore.updatedAt) ?? new Date(),
      })
      .where(eq(channelStoreSettings.id, storeId));

    return toSummary(nextStore);
  }
}

export const workDataChannelSettingsStore: ChannelSettingsStorePort = new ChannelSettingsStore();
