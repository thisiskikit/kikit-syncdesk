import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { asc, eq } from "drizzle-orm";
import {
  COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE,
  isCoupangInvoiceAlreadyProcessedResult,
  type CoupangDataSource,
  type CoupangShipmentWorksheetRow,
  type CoupangShipmentWorksheetSyncSummary,
  type PatchCoupangShipmentWorksheetItemInput,
} from "@shared/coupang";
import { coupangShipmentRows, coupangShipmentSheets } from "@shared/schema";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../services/shared/work-data-db";
import type {
  CoupangShipmentWorksheetStorePort,
  CoupangShipmentWorksheetSyncState,
} from "../interfaces/coupang-shipment-worksheet-store";

export type { CoupangShipmentWorksheetSyncState } from "../interfaces/coupang-shipment-worksheet-store";

type PersistedWorksheetStoreEntry = {
  items: CoupangShipmentWorksheetRow[];
  collectedAt: string | null;
  source: CoupangDataSource;
  message: string | null;
  syncState: CoupangShipmentWorksheetSyncState;
  syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  updatedAt: string;
};

type PersistedWorksheetStore = {
  version: 1;
  stores: Record<string, PersistedWorksheetStoreEntry>;
};

const defaultData: PersistedWorksheetStore = {
  version: 1,
  stores: {},
};

const STALE_INVOICE_PENDING_THRESHOLD_MS = 5 * 60_000;
const STALE_INVOICE_PENDING_MESSAGE =
  "\uC804\uC1A1 \uACB0\uACFC \uD655\uC778\uC774 \uC9C0\uC5F0\uB418\uC5B4 \uC2E4\uD328\uB85C \uC804\uD658\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC804\uC1A1\uD574 \uC8FC\uC138\uC694.";

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function normalizeInvoiceTransmissionState(row: CoupangShipmentWorksheetRow) {
  const rawStatus =
    row.invoiceTransmissionStatus === "pending" ||
    row.invoiceTransmissionStatus === "succeeded" ||
    row.invoiceTransmissionStatus === "failed"
      ? row.invoiceTransmissionStatus
      : null;
  const invoiceTransmissionMessage = normalizeOptionalString(row.invoiceTransmissionMessage);
  const invoiceTransmissionAt = normalizeOptionalString(row.invoiceTransmissionAt);
  const invoiceAppliedAt = normalizeOptionalString(row.invoiceAppliedAt);
  const fallbackTransmissionAt =
    invoiceTransmissionAt ??
    normalizeOptionalString(row.updatedAt) ??
    normalizeOptionalString(row.createdAt);
  const isStalePending =
    rawStatus === "pending" &&
    (() => {
      const timestamp = parseTimestamp(fallbackTransmissionAt);
      return (
        timestamp !== null && Date.now() - timestamp >= STALE_INVOICE_PENDING_THRESHOLD_MS
      );
    })();
  const alreadyProcessed = isCoupangInvoiceAlreadyProcessedResult({
    message: invoiceTransmissionMessage,
  });
  const invoiceTransmissionStatus =
    alreadyProcessed || invoiceAppliedAt ? "succeeded" : isStalePending ? "failed" : rawStatus;
  const fallbackAppliedAt =
    invoiceAppliedAt ??
    fallbackTransmissionAt ??
    normalizeOptionalString(row.updatedAt) ??
    normalizeOptionalString(row.createdAt);

  return {
    invoiceTransmissionStatus,
    invoiceTransmissionMessage: alreadyProcessed
      ? COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE
      : isStalePending
        ? invoiceTransmissionMessage ?? STALE_INVOICE_PENDING_MESSAGE
      : invoiceTransmissionMessage,
    invoiceTransmissionAt: invoiceTransmissionAt ?? (isStalePending ? fallbackTransmissionAt : null),
    invoiceAppliedAt: invoiceTransmissionStatus === "succeeded" ? fallbackAppliedAt : null,
  } as const;
}

function normalizeWorksheetRow(value: CoupangShipmentWorksheetRow): CoupangShipmentWorksheetRow {
  const row = structuredClone(value) as CoupangShipmentWorksheetRow;
  const invoiceTransmissionState = normalizeInvoiceTransmissionState(row);

  return {
    ...row,
    orderStatus: typeof row.orderStatus === "string" ? row.orderStatus : null,
    customerServiceIssueCount: Number.isFinite(row.customerServiceIssueCount)
      ? Math.max(0, Math.trunc(row.customerServiceIssueCount))
      : 0,
    customerServiceIssueSummary:
      typeof row.customerServiceIssueSummary === "string" ? row.customerServiceIssueSummary : null,
    customerServiceIssueBreakdown: Array.isArray(row.customerServiceIssueBreakdown)
      ? (() => {
          const items = row.customerServiceIssueBreakdown;
          const hasInvalidItem = items.some(
            (item) =>
              !item ||
              (item.type !== "cancel" && item.type !== "return" && item.type !== "exchange") ||
              !Number.isFinite(item.count) ||
              typeof item.label !== "string",
          );
          return hasInvalidItem
            ? items.filter(
                (item): item is CoupangShipmentWorksheetRow["customerServiceIssueBreakdown"][number] =>
                  Boolean(item) &&
                  (item.type === "cancel" || item.type === "return" || item.type === "exchange") &&
                  Number.isFinite(item.count) &&
                  typeof item.label === "string",
              )
            : items;
        })()
      : [],
    customerServiceState:
      row.customerServiceState === "ready" ||
      row.customerServiceState === "stale" ||
      row.customerServiceState === "unknown"
        ? row.customerServiceState
        : "unknown",
    customerServiceFetchedAt:
      typeof row.customerServiceFetchedAt === "string" ? row.customerServiceFetchedAt : null,
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    orderedAtRaw: typeof row.orderedAtRaw === "string" ? row.orderedAtRaw : null,
    lastOrderHydratedAt:
      typeof row.lastOrderHydratedAt === "string" ? row.lastOrderHydratedAt : null,
    lastProductHydratedAt:
      typeof row.lastProductHydratedAt === "string" ? row.lastProductHydratedAt : null,
    ...invoiceTransmissionState,
    exportedAt: typeof row.exportedAt === "string" ? row.exportedAt : null,
  } satisfies CoupangShipmentWorksheetRow;
}

function normalizeSyncState(
  value: Partial<CoupangShipmentWorksheetSyncState> | null | undefined,
): CoupangShipmentWorksheetSyncState {
  return {
    lastIncrementalCollectedAt:
      typeof value?.lastIncrementalCollectedAt === "string"
        ? value.lastIncrementalCollectedAt
        : null,
    lastFullCollectedAt:
      typeof value?.lastFullCollectedAt === "string" ? value.lastFullCollectedAt : null,
    coveredCreatedAtFrom:
      typeof value?.coveredCreatedAtFrom === "string" ? value.coveredCreatedAtFrom : null,
    coveredCreatedAtTo:
      typeof value?.coveredCreatedAtTo === "string" ? value.coveredCreatedAtTo : null,
    lastStatusFilter: typeof value?.lastStatusFilter === "string" ? value.lastStatusFilter : null,
  };
}

function normalizeSyncSummary(
  value: Partial<CoupangShipmentWorksheetSyncSummary> | null | undefined,
) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    mode: value.mode === "full" ? "full" : "incremental",
    fetchedCount: Number.isFinite(value.fetchedCount) ? Math.max(0, value.fetchedCount ?? 0) : 0,
    insertedCount: Number.isFinite(value.insertedCount)
      ? Math.max(0, value.insertedCount ?? 0)
      : 0,
    updatedCount: Number.isFinite(value.updatedCount) ? Math.max(0, value.updatedCount ?? 0) : 0,
    skippedHydrationCount: Number.isFinite(value.skippedHydrationCount)
      ? Math.max(0, value.skippedHydrationCount ?? 0)
      : 0,
    autoExpanded: Boolean(value.autoExpanded),
    fetchCreatedAtFrom:
      typeof value.fetchCreatedAtFrom === "string" ? value.fetchCreatedAtFrom : null,
    fetchCreatedAtTo: typeof value.fetchCreatedAtTo === "string" ? value.fetchCreatedAtTo : null,
    statusFilter: typeof value.statusFilter === "string" ? value.statusFilter : null,
  } satisfies CoupangShipmentWorksheetSyncSummary;
}

function normalizeStoreEntry(value: Partial<PersistedWorksheetStoreEntry> | null | undefined) {
  return {
    items: Array.isArray(value?.items) ? value.items.map(normalizeWorksheetRow) : [],
    collectedAt: typeof value?.collectedAt === "string" ? value.collectedAt : null,
    source: value?.source === "fallback" ? "fallback" : "live",
    message: typeof value?.message === "string" ? value.message : null,
    syncState: normalizeSyncState(value?.syncState),
    syncSummary: normalizeSyncSummary(value?.syncSummary),
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  } satisfies PersistedWorksheetStoreEntry;
}

function normalizePersistedStore(value: Partial<PersistedWorksheetStore> | null) {
  return {
    version: 1 as const,
    stores:
      value?.stores && typeof value.stores === "object" && !Array.isArray(value.stores)
        ? Object.fromEntries(
            Object.entries(value.stores).map(([storeId, entry]) => [
              storeId,
              normalizeStoreEntry(entry as Partial<PersistedWorksheetStoreEntry>),
            ]),
          )
        : {},
  };
}

export class CoupangShipmentWorksheetStore {
  private readonly filePath: string;
  private readonly legacyMode: boolean;

  private cache: PersistedWorksheetStore | null = null;
  private writePromise = Promise.resolve();
  private initializePromise: Promise<void> | null = null;

  constructor(filePath?: string) {
    this.filePath = path.resolve(
      process.cwd(),
      filePath ?? process.env.COUPANG_SHIPMENT_WORKSHEET_FILE ?? "data/coupang-shipment-worksheet.json",
    );
    this.legacyMode = typeof filePath === "string";
  }

  private async loadLegacy() {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PersistedWorksheetStore>;
      this.cache = normalizePersistedStore(parsed);
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

  private async persistLegacy(nextData: PersistedWorksheetStore) {
    this.cache = nextData;
    const payload = JSON.stringify(nextData, null, 2);

    this.writePromise = this.writePromise.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, payload, "utf-8");
    });

    await this.writePromise;
  }

  private async ensureInitialized() {
    if (this.legacyMode) {
      return;
    }

    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "coupang-shipment-worksheet.json",
          async () => {
            const parsed = normalizePersistedStore(
              await readJsonFileIfExists<PersistedWorksheetStore>(this.filePath),
            );
            const database = assertWorkDataDatabaseEnabled();
            let importedStoreCount = 0;
            let importedRowCount = 0;

            for (const [storeId, entry] of Object.entries(parsed.stores)) {
              const sheetId = `sheet:${storeId}`;
              await database
                .insert(coupangShipmentSheets)
                .values({
                  id: sheetId,
                  storeId,
                  collectedAt: toDateOrNull(entry.collectedAt),
                  source: entry.source,
                  message: entry.message,
                  syncStateJson: entry.syncState,
                  syncSummaryJson: entry.syncSummary,
                  updatedAt: toDateOrNull(entry.updatedAt) ?? new Date(),
                })
                .onConflictDoUpdate({
                  target: coupangShipmentSheets.storeId,
                  set: {
                    collectedAt: toDateOrNull(entry.collectedAt),
                    source: entry.source,
                    message: entry.message,
                    syncStateJson: entry.syncState,
                    syncSummaryJson: entry.syncSummary,
                    updatedAt: toDateOrNull(entry.updatedAt) ?? new Date(),
                  },
                });

              await database
                .delete(coupangShipmentRows)
                .where(eq(coupangShipmentRows.storeId, storeId));

              if (entry.items.length) {
                await database.insert(coupangShipmentRows).values(
                  entry.items.map((item, index) => ({
                    id: item.id,
                    sheetId,
                    storeId,
                    sourceKey: item.sourceKey,
                    sortOrder: index,
                    selpickOrderNumber: item.selpickOrderNumber,
                    orderDateKey: item.orderDateKey,
                    orderStatus: item.orderStatus,
                    orderedAtRaw: item.orderedAtRaw,
                    lastOrderHydratedAt: toDateOrNull(item.lastOrderHydratedAt),
                    lastProductHydratedAt: toDateOrNull(item.lastProductHydratedAt),
                    shipmentBoxId: item.shipmentBoxId,
                    orderId: item.orderId,
                    sellerProductId: item.sellerProductId,
                    vendorItemId: item.vendorItemId,
                    receiverName: item.receiverName,
                    receiverBaseName: item.receiverBaseName,
                    personalClearanceCode: item.personalClearanceCode,
                    deliveryCompanyCode: item.deliveryCompanyCode,
                    invoiceNumber: item.invoiceNumber,
                    invoiceTransmissionStatus: item.invoiceTransmissionStatus,
                    invoiceTransmissionMessage: item.invoiceTransmissionMessage,
                    invoiceTransmissionAt: toDateOrNull(item.invoiceTransmissionAt),
                    invoiceAppliedAt: toDateOrNull(item.invoiceAppliedAt),
                    exportedAt: toDateOrNull(item.exportedAt),
                    rowDataJson: normalizeWorksheetRow(item),
                    createdAt: toDateOrNull(item.createdAt) ?? new Date(),
                    updatedAt: toDateOrNull(item.updatedAt) ?? new Date(),
                  })),
                );
              }

              importedStoreCount += 1;
              importedRowCount += entry.items.length;
            }

            return {
              importedStoreCount,
              importedRowCount,
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

  async getStoreSheet(storeId: string) {
    if (this.legacyMode) {
      const data = await this.loadLegacy();
      const entry = data.stores[storeId];
      return normalizeStoreEntry(entry);
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const sheetRows = await database
      .select()
      .from(coupangShipmentSheets)
      .where(eq(coupangShipmentSheets.storeId, storeId))
      .limit(1);

    const sheet = sheetRows[0];
    if (!sheet) {
      return normalizeStoreEntry(null);
    }

    const itemRows = await database
      .select()
      .from(coupangShipmentRows)
      .where(eq(coupangShipmentRows.storeId, storeId))
      .orderBy(asc(coupangShipmentRows.sortOrder));

    return normalizeStoreEntry({
      items: itemRows.map((row) => normalizeWorksheetRow(row.rowDataJson as CoupangShipmentWorksheetRow)),
      collectedAt: toIsoString(sheet.collectedAt),
      source: sheet.source === "fallback" ? "fallback" : "live",
      message: sheet.message,
      syncState: sheet.syncStateJson as CoupangShipmentWorksheetSyncState,
      syncSummary: sheet.syncSummaryJson as CoupangShipmentWorksheetSyncSummary | null,
      updatedAt: toIsoString(sheet.updatedAt) ?? new Date().toISOString(),
    });
  }

  async setStoreSheet(input: {
    storeId: string;
    items: CoupangShipmentWorksheetRow[];
    collectedAt: string | null;
    source: CoupangDataSource;
    message: string | null;
    syncState: CoupangShipmentWorksheetSyncState;
    syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  }) {
    const nextEntry = {
      items: input.items.map(normalizeWorksheetRow),
      collectedAt: input.collectedAt,
      source: input.source,
      message: input.message,
      syncState: normalizeSyncState(input.syncState),
      syncSummary: normalizeSyncSummary(input.syncSummary),
      updatedAt: new Date().toISOString(),
    } satisfies PersistedWorksheetStoreEntry;

    if (this.legacyMode) {
      const data = await this.loadLegacy();
      await this.persistLegacy({
        version: 1,
        stores: {
          ...data.stores,
          [input.storeId]: nextEntry,
        },
      });

      return normalizeStoreEntry(nextEntry);
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const timestamp = new Date();
    const sheetId = `sheet:${input.storeId}`;

    await database
      .insert(coupangShipmentSheets)
      .values({
        id: sheetId,
        storeId: input.storeId,
        collectedAt: toDateOrNull(nextEntry.collectedAt),
        source: nextEntry.source,
        message: nextEntry.message,
        syncStateJson: nextEntry.syncState,
        syncSummaryJson: nextEntry.syncSummary,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: coupangShipmentSheets.storeId,
        set: {
          collectedAt: toDateOrNull(nextEntry.collectedAt),
          source: nextEntry.source,
          message: nextEntry.message,
          syncStateJson: nextEntry.syncState,
          syncSummaryJson: nextEntry.syncSummary,
          updatedAt: timestamp,
        },
      });

    await database
      .delete(coupangShipmentRows)
      .where(eq(coupangShipmentRows.storeId, input.storeId));

    if (nextEntry.items.length) {
      await database.insert(coupangShipmentRows).values(
        nextEntry.items.map((item, index) => ({
          id: item.id,
          sheetId,
          storeId: input.storeId,
          sourceKey: item.sourceKey,
          sortOrder: index,
          selpickOrderNumber: item.selpickOrderNumber,
          orderDateKey: item.orderDateKey,
          orderStatus: item.orderStatus,
          orderedAtRaw: item.orderedAtRaw,
          lastOrderHydratedAt: toDateOrNull(item.lastOrderHydratedAt),
          lastProductHydratedAt: toDateOrNull(item.lastProductHydratedAt),
          shipmentBoxId: item.shipmentBoxId,
          orderId: item.orderId,
          sellerProductId: item.sellerProductId,
          vendorItemId: item.vendorItemId,
          receiverName: item.receiverName,
          receiverBaseName: item.receiverBaseName,
          personalClearanceCode: item.personalClearanceCode,
          deliveryCompanyCode: item.deliveryCompanyCode,
          invoiceNumber: item.invoiceNumber,
          invoiceTransmissionStatus: item.invoiceTransmissionStatus,
          invoiceTransmissionMessage: item.invoiceTransmissionMessage,
          invoiceTransmissionAt: toDateOrNull(item.invoiceTransmissionAt),
          invoiceAppliedAt: toDateOrNull(item.invoiceAppliedAt),
          exportedAt: toDateOrNull(item.exportedAt),
          rowDataJson: item,
          createdAt: toDateOrNull(item.createdAt) ?? new Date(),
          updatedAt: toDateOrNull(item.updatedAt) ?? new Date(),
        })),
      );
    }

    return normalizeStoreEntry({
      ...nextEntry,
      updatedAt: nextEntry.updatedAt,
    });
  }

  async patchRows(input: { storeId: string; items: PatchCoupangShipmentWorksheetItemInput[] }) {
    const current = await this.getStoreSheet(input.storeId);
    const rows = [...current.items];
    const rowIndexBySourceKey = new Map(rows.map((row, index) => [row.sourceKey, index] as const));
    const rowIndexBySelpickOrderNumber = new Map(
      rows.map((row, index) => [row.selpickOrderNumber, index] as const),
    );
    const missingKeys: string[] = [];
    const touchedSourceKeys: string[] = [];

    for (const patch of input.items) {
      const index =
        (patch.sourceKey ? rowIndexBySourceKey.get(patch.sourceKey) : undefined) ??
        (patch.selpickOrderNumber
          ? rowIndexBySelpickOrderNumber.get(patch.selpickOrderNumber)
          : undefined);

      if (index === undefined) {
        missingKeys.push(
          patch.sourceKey ??
            patch.selpickOrderNumber ??
            `patch-${missingKeys.length + touchedSourceKeys.length + 1}`,
        );
        continue;
      }

      const existingRow = rows[index];
      const nextRow: CoupangShipmentWorksheetRow = {
        ...existingRow,
        receiverName:
          patch.receiverName !== undefined
            ? patch.receiverName ?? existingRow.receiverName
            : existingRow.receiverName,
        receiverBaseName:
          patch.receiverBaseName !== undefined
            ? patch.receiverBaseName
            : existingRow.receiverBaseName,
        personalClearanceCode:
          patch.personalClearanceCode !== undefined
            ? patch.personalClearanceCode
            : existingRow.personalClearanceCode,
        deliveryCompanyCode:
          patch.deliveryCompanyCode !== undefined
            ? (patch.deliveryCompanyCode ?? "").trim()
            : existingRow.deliveryCompanyCode,
        invoiceNumber:
          patch.invoiceNumber !== undefined
            ? (patch.invoiceNumber ?? "").trim()
            : existingRow.invoiceNumber,
        deliveryRequest:
          patch.deliveryRequest !== undefined ? patch.deliveryRequest : existingRow.deliveryRequest,
        invoiceTransmissionStatus:
          patch.invoiceTransmissionStatus !== undefined
            ? patch.invoiceTransmissionStatus
            : existingRow.invoiceTransmissionStatus,
        invoiceTransmissionMessage:
          patch.invoiceTransmissionMessage !== undefined
            ? patch.invoiceTransmissionMessage
            : existingRow.invoiceTransmissionMessage,
        invoiceTransmissionAt:
          patch.invoiceTransmissionAt !== undefined
            ? patch.invoiceTransmissionAt
            : existingRow.invoiceTransmissionAt,
        exportedAt: patch.exportedAt !== undefined ? patch.exportedAt : existingRow.exportedAt,
        invoiceAppliedAt:
          patch.invoiceAppliedAt !== undefined ? patch.invoiceAppliedAt : existingRow.invoiceAppliedAt,
        updatedAt: new Date().toISOString(),
      };

      rows[index] = nextRow;
      touchedSourceKeys.push(nextRow.sourceKey);
    }

    const sheet = await this.setStoreSheet({
      storeId: input.storeId,
      items: rows,
      collectedAt: current.collectedAt,
      source: current.source,
      message: current.message,
      syncState: current.syncState,
      syncSummary: current.syncSummary,
    });

    return {
      sheet,
      missingKeys,
      touchedSourceKeys,
    };
  }
}

export const workDataCoupangShipmentWorksheetStore: CoupangShipmentWorksheetStorePort =
  new CoupangShipmentWorksheetStore();
