import { randomUUID } from "crypto";
import path from "path";
import { desc, eq } from "drizzle-orm";
import type { ConnectionTestResult } from "@shared/channel-settings";
import {
  COUPANG_DEFAULT_BASE_URL,
  type CoupangStoreSummary,
  type TestCoupangConnectionInput,
  type UpsertCoupangStoreInput,
} from "@shared/coupang";
import { coupangStoreSettings } from "@shared/schema";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../services/shared/work-data-db";
import type {
  CoupangSettingsStorePort,
  StoredCoupangStore,
} from "../interfaces/coupang-settings-store";

export type { StoredCoupangStore } from "../interfaces/coupang-settings-store";

type PersistedCoupangSettings = {
  version: 1;
  stores: StoredCoupangStore[];
};

function maskSecret(secret: string) {
  if (!secret) return null;
  const suffix = secret.slice(-4);
  return `${"*".repeat(Math.max(secret.length - Math.min(secret.length, 4), 4))}${suffix}`;
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConnectionStatus(value: string | null | undefined) {
  return value === "success" || value === "failed" ? value : "idle";
}

function normalizeShipmentPlatformKey(value?: string | null) {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (!/^[A-Z0-9]$/.test(normalized)) {
    throw new Error("Shipment platform key must be a single English letter or number.");
  }

  return normalized;
}

function normalizeStoredStore(value: unknown): StoredCoupangStore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeText(typeof record.id === "string" ? record.id : "");
  const storeName = normalizeText(typeof record.storeName === "string" ? record.storeName : "");
  const vendorId = normalizeText(typeof record.vendorId === "string" ? record.vendorId : "");
  const baseUrl = normalizeText(typeof record.baseUrl === "string" ? record.baseUrl : "");
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

  if (!id || !storeName || !vendorId || !baseUrl || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    channel: "coupang",
    storeName,
    vendorId,
    shipmentPlatformKey: normalizeShipmentPlatformKey(
      typeof record.shipmentPlatformKey === "string" ? record.shipmentPlatformKey : null,
    ),
    credentials: {
      accessKey: normalizeText(typeof credentials.accessKey === "string" ? credentials.accessKey : ""),
      secretKey: normalizeText(typeof credentials.secretKey === "string" ? credentials.secretKey : ""),
    },
    baseUrl: normalizeCoupangBaseUrl(baseUrl),
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

function normalizePersistedSettings(value: PersistedCoupangSettings | null) {
  const stores = Array.isArray(value?.stores)
    ? value.stores
        .map((entry) => normalizeStoredStore(entry))
        .filter((entry): entry is StoredCoupangStore => Boolean(entry))
    : [];

  return {
    version: 1 as const,
    stores,
  };
}

export function normalizeCoupangBaseUrl(value?: string | null) {
  const raw = (value || COUPANG_DEFAULT_BASE_URL).trim();

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("유효한 Coupang base URL을 입력해 주세요.");
  }

  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !isLocalhost) {
    throw new Error("Coupang base URL은 https 또는 localhost여야 합니다.");
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function toStoredStore(row: typeof coupangStoreSettings.$inferSelect): StoredCoupangStore {
  return {
    id: row.id,
    channel: "coupang",
    storeName: row.storeName,
    vendorId: row.vendorId,
    shipmentPlatformKey: row.shipmentPlatformKey ?? null,
    credentials: {
      accessKey: row.accessKey,
      secretKey: row.secretKey,
    },
    baseUrl: row.baseUrl,
    connectionTest: {
      status: normalizeConnectionStatus(row.connectionStatus),
      testedAt: toIsoString(row.connectionTestedAt),
      message: row.connectionMessage,
    },
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

function toSummary(store: StoredCoupangStore): CoupangStoreSummary {
  return {
    id: store.id,
    channel: "coupang",
    storeName: store.storeName,
    vendorId: store.vendorId,
    shipmentPlatformKey: store.shipmentPlatformKey ?? null,
    credentials: {
      accessKey: store.credentials.accessKey,
      hasSecretKey: Boolean(store.credentials.secretKey),
      secretKeyMasked: maskSecret(store.credentials.secretKey),
    },
    baseUrl: store.baseUrl,
    connectionTest:
      store.connectionTest.status === "idle"
        ? {
            status: "idle",
            testedAt: null,
            message: null,
          }
        : {
            status: store.connectionTest.status,
            testedAt: store.connectionTest.testedAt ?? new Date().toISOString(),
            message: store.connectionTest.message ?? "",
          },
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  };
}

class CoupangSettingsStore {
  private readonly filePath = path.resolve(
    process.cwd(),
    process.env.COUPANG_SETTINGS_FILE || "data/coupang-settings.json",
  );

  private initializePromise: Promise<void> | null = null;

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "coupang-settings.json",
          async () => {
            const parsed = normalizePersistedSettings(
              await readJsonFileIfExists<PersistedCoupangSettings>(this.filePath),
            );

            if (!parsed.stores.length) {
              return { importedCount: 0 };
            }

            const database = assertWorkDataDatabaseEnabled();

            for (const store of parsed.stores) {
              await database
                .insert(coupangStoreSettings)
                .values({
                  id: store.id,
                  channel: "coupang",
                  storeName: store.storeName,
                  vendorId: store.vendorId,
                  shipmentPlatformKey: store.shipmentPlatformKey ?? null,
                  accessKey: store.credentials.accessKey,
                  secretKey: store.credentials.secretKey,
                  baseUrl: store.baseUrl,
                  connectionStatus: store.connectionTest.status,
                  connectionTestedAt: toDateOrNull(store.connectionTest.testedAt),
                  connectionMessage: store.connectionTest.message,
                  createdAt: toDateOrNull(store.createdAt) ?? new Date(),
                  updatedAt: toDateOrNull(store.updatedAt) ?? new Date(),
                })
                .onConflictDoUpdate({
                  target: coupangStoreSettings.id,
                  set: {
                    storeName: store.storeName,
                    vendorId: store.vendorId,
                    shipmentPlatformKey: store.shipmentPlatformKey ?? null,
                    accessKey: store.credentials.accessKey,
                    secretKey: store.credentials.secretKey,
                    baseUrl: store.baseUrl,
                    connectionStatus: store.connectionTest.status,
                    connectionTestedAt: toDateOrNull(store.connectionTest.testedAt),
                    connectionMessage: store.connectionTest.message,
                    updatedAt: toDateOrNull(store.updatedAt) ?? new Date(),
                  },
                });
            }

            return { importedCount: parsed.stores.length };
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
      .from(coupangStoreSettings)
      .orderBy(desc(coupangStoreSettings.updatedAt));

    return rows.map((row) => toSummary(toStoredStore(row)));
  }

  async getStore(id: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(coupangStoreSettings)
      .where(eq(coupangStoreSettings.id, id))
      .limit(1);

    return rows[0] ? toStoredStore(rows[0]) : null;
  }

  async saveStore(input: UpsertCoupangStoreInput) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const existing = input.id ? await this.getStore(input.id) : null;
    const timestamp = new Date();
    const normalizedBaseUrl = normalizeCoupangBaseUrl(input.baseUrl);
    const shipmentPlatformKey = normalizeShipmentPlatformKey(input.shipmentPlatformKey);
    const nextSecret =
      input.credentials.secretKey && input.credentials.secretKey.length > 0
        ? input.credentials.secretKey
        : existing?.credentials.secretKey ?? "";

    if (!nextSecret) {
      throw new Error("secretKey is required.");
    }

    const nextStore: StoredCoupangStore = {
      id: existing?.id ?? randomUUID(),
      channel: "coupang",
      storeName: input.storeName.trim(),
      vendorId: input.vendorId.trim(),
      shipmentPlatformKey,
      credentials: {
        accessKey: input.credentials.accessKey.trim(),
        secretKey: nextSecret,
      },
      baseUrl: normalizedBaseUrl,
      connectionTest:
        existing &&
        existing.vendorId === input.vendorId.trim() &&
        existing.credentials.accessKey === input.credentials.accessKey.trim() &&
        existing.credentials.secretKey === nextSecret &&
        existing.baseUrl === normalizedBaseUrl
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
      .insert(coupangStoreSettings)
      .values({
        id: nextStore.id,
        channel: "coupang",
        storeName: nextStore.storeName,
        vendorId: nextStore.vendorId,
        shipmentPlatformKey: nextStore.shipmentPlatformKey ?? null,
        accessKey: nextStore.credentials.accessKey,
        secretKey: nextStore.credentials.secretKey,
        baseUrl: nextStore.baseUrl,
        connectionStatus: nextStore.connectionTest.status,
        connectionTestedAt: toDateOrNull(nextStore.connectionTest.testedAt),
        connectionMessage: nextStore.connectionTest.message,
        createdAt: toDateOrNull(nextStore.createdAt) ?? timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: coupangStoreSettings.id,
        set: {
          storeName: nextStore.storeName,
          vendorId: nextStore.vendorId,
          shipmentPlatformKey: nextStore.shipmentPlatformKey ?? null,
          accessKey: nextStore.credentials.accessKey,
          secretKey: nextStore.credentials.secretKey,
          baseUrl: nextStore.baseUrl,
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
    const target = await this.getStore(storeId);

    if (!target) {
      return null;
    }

    const nextStore: StoredCoupangStore = {
      ...target,
      connectionTest: {
        status: result.status,
        testedAt: result.testedAt,
        message: result.message,
      },
      updatedAt: new Date().toISOString(),
    };

    const database = assertWorkDataDatabaseEnabled();
    await database
      .update(coupangStoreSettings)
      .set({
        connectionStatus: result.status,
        connectionTestedAt: toDateOrNull(result.testedAt),
        connectionMessage: result.message,
        updatedAt: toDateOrNull(nextStore.updatedAt) ?? new Date(),
      })
      .where(eq(coupangStoreSettings.id, storeId));

    return toSummary(nextStore);
  }
}

export function resolveCoupangTestInput(input: TestCoupangConnectionInput, storedSecret?: string) {
  const secretKey =
    input.credentials.secretKey && input.credentials.secretKey.trim().length > 0
      ? input.credentials.secretKey.trim()
      : storedSecret ?? "";

  if (!secretKey) {
    throw new Error("secretKey is required for connection test.");
  }

  return {
    vendorId: input.vendorId.trim(),
    accessKey: input.credentials.accessKey.trim(),
    secretKey,
    baseUrl: normalizeCoupangBaseUrl(input.baseUrl),
  };
}

export const workDataCoupangSettingsStore: CoupangSettingsStorePort =
  new CoupangSettingsStore();
