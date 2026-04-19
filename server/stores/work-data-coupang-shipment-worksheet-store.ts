import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE,
  isCoupangInvoiceAlreadyProcessedResult,
  type CoupangShipmentArchiveRow,
  type CoupangDataSource,
  type CoupangShipmentWorksheetRow,
  type CoupangShipmentWorksheetSyncSummary,
  type PatchCoupangShipmentWorksheetItemInput,
} from "@shared/coupang";
import {
  coupangShipmentArchiveRows,
  coupangShipmentRows,
  coupangShipmentSheets,
  type CoupangShipmentArchiveRowRow,
  type CoupangShipmentRowRow,
} from "@shared/schema";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../services/shared/work-data-db";
import { ensureWorksheetRawFields } from "../services/coupang/shipment-worksheet-raw-fields";
import type {
  ArchiveCoupangShipmentWorksheetRowsInput,
  ArchiveCoupangShipmentWorksheetRowsResult,
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
  version: 2;
  stores: Record<string, PersistedWorksheetStoreEntry>;
  archives: Record<string, CoupangShipmentArchiveRow[]>;
};

const defaultData: PersistedWorksheetStore = {
  version: 2,
  stores: {},
  archives: {},
};

const STALE_INVOICE_PENDING_THRESHOLD_MS = 5 * 60_000;
const STALE_INVOICE_PENDING_MESSAGE =
  "\uC804\uC1A1 \uACB0\uACFC \uD655\uC778\uC774 \uC9C0\uC5F0\uB418\uC5B4 \uC2E4\uD328\uB85C \uC804\uD658\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC804\uC1A1\uD574 \uC8FC\uC138\uC694.";
export const WORKSHEET_ROW_WRITE_CHUNK_SIZE = 200;

type WorkDataDatabase = ReturnType<typeof assertWorkDataDatabaseEnabled>;
type WorkDataTransaction = Parameters<Parameters<WorkDataDatabase["transaction"]>[0]>[0];

const COLUMN_BACKED_WORKSHEET_ROW_KEYS = new Set<keyof CoupangShipmentWorksheetRow>([
  "id",
  "sourceKey",
  "storeId",
  "selpickOrderNumber",
  "orderDateKey",
  "orderStatus",
  "orderedAtRaw",
  "lastOrderHydratedAt",
  "lastProductHydratedAt",
  "shipmentBoxId",
  "orderId",
  "sellerProductId",
  "vendorItemId",
  "receiverName",
  "receiverBaseName",
  "personalClearanceCode",
  "deliveryCompanyCode",
  "invoiceNumber",
  "invoiceTransmissionStatus",
  "invoiceTransmissionMessage",
  "invoiceTransmissionAt",
  "invoiceAppliedAt",
  "exportedAt",
  "createdAt",
  "updatedAt",
]);

type CompactWorksheetRowPayload = Partial<CoupangShipmentWorksheetRow> & {
  __compact?: true;
};

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
              (item.type !== "shipment_stop_requested" &&
                item.type !== "shipment_stop_handled" &&
                item.type !== "cancel" &&
                item.type !== "return" &&
                item.type !== "exchange") ||
              !Number.isFinite(item.count) ||
              typeof item.label !== "string",
          );
          return hasInvalidItem
            ? items.filter(
                (item): item is CoupangShipmentWorksheetRow["customerServiceIssueBreakdown"][number] =>
                  Boolean(item) &&
                  (item.type === "shipment_stop_requested" ||
                    item.type === "shipment_stop_handled" ||
                    item.type === "cancel" ||
                    item.type === "return" ||
                    item.type === "exchange") &&
                  Number.isFinite(item.count) &&
                  typeof item.label === "string",
              )
            : items;
        })()
      : [],
    customerServiceTerminalStatus:
      row.customerServiceTerminalStatus === "cancel_completed" ||
      row.customerServiceTerminalStatus === "return_completed"
        ? row.customerServiceTerminalStatus
        : null,
    customerServiceState:
      row.customerServiceState === "ready" ||
      row.customerServiceState === "stale" ||
      row.customerServiceState === "unknown"
        ? row.customerServiceState
        : "unknown",
    customerServiceFetchedAt:
      typeof row.customerServiceFetchedAt === "string" ? row.customerServiceFetchedAt : null,
    coupangDisplayProductName:
      typeof row.coupangDisplayProductName === "string" && row.coupangDisplayProductName.trim()
        ? row.coupangDisplayProductName
        : null,
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
    rawFields: ensureWorksheetRawFields(row),
  } satisfies CoupangShipmentWorksheetRow;
}

function normalizeArchiveRow(value: CoupangShipmentArchiveRow): CoupangShipmentArchiveRow {
  const row = normalizeWorksheetRow(value);
  return {
    ...row,
    archivedAt: typeof value.archivedAt === "string" ? value.archivedAt : new Date().toISOString(),
    archiveReason:
      value.archiveReason === "cancel_completed" || value.archiveReason === "return_completed"
        ? value.archiveReason
        : "retention_post_dispatch",
  };
}

export function buildCompactWorksheetRowData(
  value: CoupangShipmentWorksheetRow,
): CompactWorksheetRowPayload {
  const row = normalizeWorksheetRow(value);
  const compactRow: CompactWorksheetRowPayload = { __compact: true };

  for (const [key, fieldValue] of Object.entries(row) as Array<
    [keyof CoupangShipmentWorksheetRow, CoupangShipmentWorksheetRow[keyof CoupangShipmentWorksheetRow]]
  >) {
    if (COLUMN_BACKED_WORKSHEET_ROW_KEYS.has(key)) {
      continue;
    }

    (compactRow as Record<string, unknown>)[key] = structuredClone(fieldValue);
  }

  return compactRow;
}

export function restoreWorksheetRowFromDatabaseRow(
  row: CoupangShipmentRowRow,
): CoupangShipmentWorksheetRow {
  const rawRowData =
    row.rowDataJson && typeof row.rowDataJson === "object" && !Array.isArray(row.rowDataJson)
      ? (row.rowDataJson as CompactWorksheetRowPayload)
      : null;

  if (rawRowData && "sourceKey" in rawRowData && "shipmentBoxId" in rawRowData) {
    return normalizeWorksheetRow(rawRowData as CoupangShipmentWorksheetRow);
  }

  const compactPayload = rawRowData
    ? (() => {
        const { __compact, ...rest } = rawRowData;
        return rest;
      })()
    : null;

  const createdAt = toIsoString(row.createdAt) ?? new Date().toISOString();
  const updatedAt = toIsoString(row.updatedAt) ?? createdAt;
  const baseRow = {
    id: row.id,
    sourceKey: row.sourceKey,
    storeId: row.storeId,
    storeName: "",
    orderDateText: "",
    orderDateKey: row.orderDateKey,
    quantity: null,
    productName: "",
    optionName: null,
    productOrderNumber: "",
    collectedPlatform: "",
    ordererName: null,
    contact: null,
    receiverName: row.receiverName,
    receiverBaseName: row.receiverBaseName,
    personalClearanceCode: row.personalClearanceCode,
    collectedAccountName: "",
    deliveryCompanyCode: row.deliveryCompanyCode,
    selpickOrderNumber: row.selpickOrderNumber,
    invoiceNumber: row.invoiceNumber,
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: null,
    shippingFee: 0,
    receiverAddress: null,
    deliveryRequest: null,
    buyerPhoneNumber: null,
    productNumber: null,
    exposedProductName: "",
    coupangDisplayProductName: null,
    productOptionNumber: null,
    sellerProductCode: null,
    isOverseas: false,
    shipmentBoxId: row.shipmentBoxId,
    orderId: row.orderId,
    sellerProductId: row.sellerProductId,
    vendorItemId: row.vendorItemId,
    availableActions: [],
    orderStatus: row.orderStatus,
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceTerminalStatus: null,
    customerServiceState: "unknown",
    customerServiceFetchedAt: null,
    orderedAtRaw: row.orderedAtRaw,
    lastOrderHydratedAt: toIsoString(row.lastOrderHydratedAt),
    lastProductHydratedAt: toIsoString(row.lastProductHydratedAt),
    estimatedShippingDate: null,
    splitShipping: null,
    invoiceTransmissionStatus:
      row.invoiceTransmissionStatus === "pending" ||
      row.invoiceTransmissionStatus === "succeeded" ||
      row.invoiceTransmissionStatus === "failed"
        ? row.invoiceTransmissionStatus
        : null,
    invoiceTransmissionMessage: row.invoiceTransmissionMessage,
    invoiceTransmissionAt: toIsoString(row.invoiceTransmissionAt),
    exportedAt: toIsoString(row.exportedAt),
    invoiceAppliedAt: toIsoString(row.invoiceAppliedAt),
    createdAt,
    updatedAt,
  } satisfies CoupangShipmentWorksheetRow;

  return normalizeWorksheetRow({
    ...baseRow,
    ...(compactPayload ?? {}),
    id: row.id,
    sourceKey: row.sourceKey,
    storeId: row.storeId,
    selpickOrderNumber: row.selpickOrderNumber,
    orderDateKey: row.orderDateKey,
    orderStatus: row.orderStatus,
    orderedAtRaw: row.orderedAtRaw,
    lastOrderHydratedAt: toIsoString(row.lastOrderHydratedAt),
    lastProductHydratedAt: toIsoString(row.lastProductHydratedAt),
    shipmentBoxId: row.shipmentBoxId,
    orderId: row.orderId,
    sellerProductId: row.sellerProductId,
    vendorItemId: row.vendorItemId,
    receiverName: row.receiverName,
    receiverBaseName: row.receiverBaseName,
    personalClearanceCode: row.personalClearanceCode,
    deliveryCompanyCode: row.deliveryCompanyCode,
    invoiceNumber: row.invoiceNumber,
    invoiceTransmissionStatus:
      row.invoiceTransmissionStatus === "pending" ||
      row.invoiceTransmissionStatus === "succeeded" ||
      row.invoiceTransmissionStatus === "failed"
        ? row.invoiceTransmissionStatus
        : null,
    invoiceTransmissionMessage: row.invoiceTransmissionMessage,
    invoiceTransmissionAt: toIsoString(row.invoiceTransmissionAt),
    invoiceAppliedAt: toIsoString(row.invoiceAppliedAt),
    exportedAt: toIsoString(row.exportedAt),
    createdAt,
    updatedAt,
  } satisfies CoupangShipmentWorksheetRow);
}

export function restoreArchiveRowFromDatabaseRow(
  row: CoupangShipmentArchiveRowRow,
): CoupangShipmentArchiveRow {
  const restoredRow = restoreWorksheetRowFromDatabaseRow({
    ...row,
    sheetId: "archive",
  }) as CoupangShipmentArchiveRow;

  return normalizeArchiveRow({
    ...restoredRow,
    archivedAt: toIsoString(row.archivedAt) ?? new Date().toISOString(),
    archiveReason: restoredRow.archiveReason ?? "retention_post_dispatch",
  });
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
    mode:
      value.mode === "full"
        ? "full"
        : value.mode === "new_only"
          ? "new_only"
          : "incremental",
    fetchedCount: Number.isFinite(value.fetchedCount) ? Math.max(0, value.fetchedCount ?? 0) : 0,
    insertedCount: Number.isFinite(value.insertedCount)
      ? Math.max(0, value.insertedCount ?? 0)
      : 0,
    insertedSourceKeys: Array.isArray(value.insertedSourceKeys)
      ? value.insertedSourceKeys.filter((item): item is string => typeof item === "string")
      : [],
    updatedCount: Number.isFinite(value.updatedCount) ? Math.max(0, value.updatedCount ?? 0) : 0,
    skippedHydrationCount: Number.isFinite(value.skippedHydrationCount)
      ? Math.max(0, value.skippedHydrationCount ?? 0)
      : 0,
    autoExpanded: Boolean(value.autoExpanded),
    fetchCreatedAtFrom:
      typeof value.fetchCreatedAtFrom === "string" ? value.fetchCreatedAtFrom : null,
    fetchCreatedAtTo: typeof value.fetchCreatedAtTo === "string" ? value.fetchCreatedAtTo : null,
    statusFilter: typeof value.statusFilter === "string" ? value.statusFilter : null,
    completedPhases: Array.isArray(value.completedPhases)
      ? value.completedPhases.filter((item): item is CoupangShipmentWorksheetSyncSummary["completedPhases"][number] => typeof item === "string")
      : [],
    pendingPhases: Array.isArray(value.pendingPhases)
      ? value.pendingPhases.filter((item): item is CoupangShipmentWorksheetSyncSummary["pendingPhases"][number] => typeof item === "string")
      : [],
    warningPhases: Array.isArray(value.warningPhases)
      ? value.warningPhases.filter((item): item is CoupangShipmentWorksheetSyncSummary["warningPhases"][number] => typeof item === "string")
      : [],
    degraded: value.degraded === true,
    failedStatuses: Array.isArray(value.failedStatuses)
      ? value.failedStatuses.filter((item): item is string => typeof item === "string")
      : [],
    autoAuditRecommended: value.autoAuditRecommended === true,
    checkpointCount: Number.isFinite(value.checkpointCount)
      ? Math.max(0, value.checkpointCount ?? 0)
      : 0,
    checkpointPersistedCount: Number.isFinite(value.checkpointPersistedCount)
      ? Math.max(0, value.checkpointPersistedCount ?? 0)
      : 0,
    lastCheckpointAt:
      typeof value.lastCheckpointAt === "string" ? value.lastCheckpointAt : null,
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
    version: 2 as const,
    stores:
      value?.stores && typeof value.stores === "object" && !Array.isArray(value.stores)
        ? Object.fromEntries(
            Object.entries(value.stores).map(([storeId, entry]) => [
              storeId,
              normalizeStoreEntry(entry as Partial<PersistedWorksheetStoreEntry>),
            ]),
          )
        : {},
    archives:
      value?.archives && typeof value.archives === "object" && !Array.isArray(value.archives)
        ? Object.fromEntries(
            Object.entries(value.archives).map(([storeId, rows]) => [
              storeId,
              Array.isArray(rows)
                ? rows
                    .filter((row): row is CoupangShipmentArchiveRow => Boolean(row))
                    .map((row) => normalizeArchiveRow(row))
                : [],
            ]),
          )
        : {},
  };
}

function buildWorksheetDatabaseRowValue(
  item: CoupangShipmentWorksheetRow,
  index: number,
  input: { sheetId: string; storeId: string },
) {
  return {
    id: item.id,
    sheetId: input.sheetId,
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
    rowDataJson: buildCompactWorksheetRowData(item),
    createdAt: toDateOrNull(item.createdAt) ?? new Date(),
    updatedAt: toDateOrNull(item.updatedAt) ?? new Date(),
  };
}

function buildArchiveDatabaseRowValue(
  item: CoupangShipmentArchiveRow,
  index: number,
  storeId: string,
) {
  return {
    id: item.id,
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
    archivedAt: toDateOrNull(item.archivedAt) ?? new Date(),
    rowDataJson: buildCompactWorksheetRowData(item),
    createdAt: toDateOrNull(item.createdAt) ?? new Date(),
    updatedAt: toDateOrNull(item.updatedAt) ?? new Date(),
  };
}

export function chunkWorksheetRows<T>(
  items: readonly T[],
  chunkSize = WORKSHEET_ROW_WRITE_CHUNK_SIZE,
) {
  const safeChunkSize = Math.max(1, Math.trunc(chunkSize) || WORKSHEET_ROW_WRITE_CHUNK_SIZE);
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += safeChunkSize) {
    chunks.push(items.slice(index, index + safeChunkSize));
  }

  return chunks;
}

function hashAdvisoryLockPart(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }

  return hash;
}

async function acquireWorksheetStoreTransactionLock(tx: WorkDataTransaction, storeId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${hashAdvisoryLockPart("coupang_shipment_rows")}, ${hashAdvisoryLockPart(storeId)})`,
  );
}

function buildWorksheetSheetDatabaseValue(
  input: {
    sheetId: string;
    storeId: string;
    collectedAt: string | null;
    source: CoupangDataSource;
    message: string | null;
    syncState: CoupangShipmentWorksheetSyncState;
    syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  },
  timestamp: Date,
) {
  return {
    id: input.sheetId,
    storeId: input.storeId,
    collectedAt: toDateOrNull(input.collectedAt),
    source: input.source,
    message: input.message,
    syncStateJson: input.syncState,
    syncSummaryJson: input.syncSummary,
    updatedAt: timestamp,
  };
}

async function upsertWorksheetSheetRecord(
  tx: WorkDataTransaction,
  input: {
    sheetId: string;
    storeId: string;
    collectedAt: string | null;
    source: CoupangDataSource;
    message: string | null;
    syncState: CoupangShipmentWorksheetSyncState;
    syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  },
  timestamp: Date,
) {
  const value = buildWorksheetSheetDatabaseValue(input, timestamp);

  await tx
    .insert(coupangShipmentSheets)
    .values(value)
    .onConflictDoUpdate({
      target: coupangShipmentSheets.storeId,
      set: {
        collectedAt: value.collectedAt,
        source: value.source,
        message: value.message,
        syncStateJson: value.syncStateJson,
        syncSummaryJson: value.syncSummaryJson,
        updatedAt: value.updatedAt,
      },
    });
}

async function insertWorksheetRowsInChunks(
  tx: WorkDataTransaction,
  input: {
    sheetId: string;
    storeId: string;
    items: CoupangShipmentWorksheetRow[];
    startIndex?: number;
  },
) {
  if (!input.items.length) {
    return;
  }

  const chunks = chunkWorksheetRows(input.items);
  let offset = input.startIndex ?? 0;

  for (const chunk of chunks) {
    await tx.insert(coupangShipmentRows).values(
      chunk.map((item, index) =>
        buildWorksheetDatabaseRowValue(item, offset + index, {
          sheetId: input.sheetId,
          storeId: input.storeId,
        }),
      ),
    );
    offset += chunk.length;
  }
}

async function upsertWorksheetRowsInChunks(
  tx: WorkDataTransaction,
  input: {
    sheetId: string;
    storeId: string;
    items: CoupangShipmentWorksheetRow[];
    nextSortOrder: number;
    existingSortOrderBySourceKey: Map<string, number>;
  },
) {
  if (!input.items.length) {
    return;
  }

  const chunks = chunkWorksheetRows(input.items);
  let nextSortOrder = input.nextSortOrder;

  for (const chunk of chunks) {
    const values = chunk.map((item) => {
      const existingSortOrder = input.existingSortOrderBySourceKey.get(item.sourceKey);
      const sortOrder = existingSortOrder ?? nextSortOrder++;

      return buildWorksheetDatabaseRowValue(item, sortOrder, {
        sheetId: input.sheetId,
        storeId: input.storeId,
      });
    });

    await tx
      .insert(coupangShipmentRows)
      .values(values)
      .onConflictDoUpdate({
        target: coupangShipmentRows.sourceKey,
        set: {
          sheetId: input.sheetId,
          storeId: input.storeId,
          selpickOrderNumber: sql`excluded.selpick_order_number`,
          orderDateKey: sql`excluded.order_date_key`,
          orderStatus: sql`excluded.order_status`,
          orderedAtRaw: sql`excluded.ordered_at_raw`,
          lastOrderHydratedAt: sql`excluded.last_order_hydrated_at`,
          lastProductHydratedAt: sql`excluded.last_product_hydrated_at`,
          shipmentBoxId: sql`excluded.shipment_box_id`,
          orderId: sql`excluded.order_id`,
          sellerProductId: sql`excluded.seller_product_id`,
          vendorItemId: sql`excluded.vendor_item_id`,
          receiverName: sql`excluded.receiver_name`,
          receiverBaseName: sql`excluded.receiver_base_name`,
          personalClearanceCode: sql`excluded.personal_clearance_code`,
          deliveryCompanyCode: sql`excluded.delivery_company_code`,
          invoiceNumber: sql`excluded.invoice_number`,
          invoiceTransmissionStatus: sql`excluded.invoice_transmission_status`,
          invoiceTransmissionMessage: sql`excluded.invoice_transmission_message`,
          invoiceTransmissionAt: sql`excluded.invoice_transmission_at`,
          invoiceAppliedAt: sql`excluded.invoice_applied_at`,
          exportedAt: sql`excluded.exported_at`,
          rowDataJson: sql`excluded.row_data_json`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
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

  private async loadLegacy(): Promise<PersistedWorksheetStore> {
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

    if (!this.cache) {
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
              const importedAt = toDateOrNull(entry.updatedAt) ?? new Date();
              await database.transaction(async (tx) => {
                await acquireWorksheetStoreTransactionLock(tx, storeId);
                await upsertWorksheetSheetRecord(
                  tx,
                  {
                    sheetId,
                    storeId,
                    collectedAt: entry.collectedAt,
                    source: entry.source,
                    message: entry.message,
                    syncState: entry.syncState,
                    syncSummary: entry.syncSummary,
                  },
                  importedAt,
                );

                await tx
                  .delete(coupangShipmentRows)
                  .where(eq(coupangShipmentRows.storeId, storeId));

                await insertWorksheetRowsInChunks(tx, {
                  sheetId,
                  storeId,
                  items: entry.items,
                });
              });

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
      items: itemRows.map((row) => restoreWorksheetRowFromDatabaseRow(row)),
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
        version: 2,
        stores: {
          ...data.stores,
          [input.storeId]: nextEntry,
        },
        archives: data.archives,
      });

      return normalizeStoreEntry(nextEntry);
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const timestamp = new Date();
    const sheetId = `sheet:${input.storeId}`;

    await database.transaction(async (tx) => {
      await acquireWorksheetStoreTransactionLock(tx, input.storeId);
      await upsertWorksheetSheetRecord(
        tx,
        {
          sheetId,
          storeId: input.storeId,
          collectedAt: nextEntry.collectedAt,
          source: nextEntry.source,
          message: nextEntry.message,
          syncState: nextEntry.syncState,
          syncSummary: nextEntry.syncSummary,
        },
        timestamp,
      );

      await tx
        .delete(coupangShipmentRows)
        .where(eq(coupangShipmentRows.storeId, input.storeId));

      await insertWorksheetRowsInChunks(tx, {
        sheetId,
        storeId: input.storeId,
        items: nextEntry.items,
      });
    });

    return normalizeStoreEntry({
      ...nextEntry,
      updatedAt: nextEntry.updatedAt,
    });
  }

  async upsertStoreRows(input: {
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
      const currentEntry = normalizeStoreEntry(data.stores[input.storeId]);
      const mergedBySourceKey = new Map(
        currentEntry.items.map((row) => [row.sourceKey, row] as const),
      );

      for (const row of nextEntry.items) {
        mergedBySourceKey.set(row.sourceKey, row);
      }

      const persistedEntry = {
        ...currentEntry,
        items: Array.from(mergedBySourceKey.values()),
        collectedAt: nextEntry.collectedAt,
        source: nextEntry.source,
        message: nextEntry.message,
        syncState: nextEntry.syncState,
        syncSummary: nextEntry.syncSummary,
        updatedAt: nextEntry.updatedAt,
      } satisfies PersistedWorksheetStoreEntry;

      await this.persistLegacy({
        version: 2,
        stores: {
          ...data.stores,
          [input.storeId]: persistedEntry,
        },
        archives: data.archives,
      });

      return normalizeStoreEntry(persistedEntry);
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const timestamp = new Date();
    const sheetId = `sheet:${input.storeId}`;

    await database.transaction(async (tx) => {
      await acquireWorksheetStoreTransactionLock(tx, input.storeId);
      await upsertWorksheetSheetRecord(
        tx,
        {
          sheetId,
          storeId: input.storeId,
          collectedAt: nextEntry.collectedAt,
          source: nextEntry.source,
          message: nextEntry.message,
          syncState: nextEntry.syncState,
          syncSummary: nextEntry.syncSummary,
        },
        timestamp,
      );

      if (nextEntry.items.length) {
        const existingRows = await tx
          .select({
            sourceKey: coupangShipmentRows.sourceKey,
            sortOrder: coupangShipmentRows.sortOrder,
          })
          .from(coupangShipmentRows)
          .where(eq(coupangShipmentRows.storeId, input.storeId))
          .orderBy(asc(coupangShipmentRows.sortOrder));
        const existingSortOrderBySourceKey = new Map(
          existingRows.map((row) => [row.sourceKey, row.sortOrder] as const),
        );
        const nextSortOrder =
          existingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

        await upsertWorksheetRowsInChunks(tx, {
          sheetId,
          storeId: input.storeId,
          items: nextEntry.items,
          nextSortOrder,
          existingSortOrderBySourceKey,
        });
      }
    });

    return this.getStoreSheet(input.storeId);
  }

  async getArchivedRows(storeId: string) {
    if (this.legacyMode) {
      const data = await this.loadLegacy();
      return (data.archives[storeId] ?? []).map(normalizeArchiveRow);
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(coupangShipmentArchiveRows)
      .where(eq(coupangShipmentArchiveRows.storeId, storeId))
      .orderBy(desc(coupangShipmentArchiveRows.archivedAt), asc(coupangShipmentArchiveRows.sortOrder));

    return rows.map((row) => restoreArchiveRowFromDatabaseRow(row));
  }

  async getArchivedSourceKeys(storeId: string) {
    if (this.legacyMode) {
      const data = await this.loadLegacy();
      return Array.from(new Set((data.archives[storeId] ?? []).map((row) => row.sourceKey)));
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select({ sourceKey: coupangShipmentArchiveRows.sourceKey })
      .from(coupangShipmentArchiveRows)
      .where(eq(coupangShipmentArchiveRows.storeId, storeId));

    return Array.from(new Set(rows.map((row) => row.sourceKey)));
  }

  async archiveRows(input: ArchiveCoupangShipmentWorksheetRowsInput): Promise<ArchiveCoupangShipmentWorksheetRowsResult> {
    const dryRun = input.dryRun === true;
    const archivedAt = input.archivedAt || new Date().toISOString();
    const uniqueItems = Array.from(
      new Map(
        input.items
          .map((item) =>
            normalizeArchiveRow({
              ...item,
              archivedAt,
              archiveReason:
                "archiveReason" in item &&
                (item.archiveReason === "cancel_completed" ||
                  item.archiveReason === "return_completed")
                  ? item.archiveReason
                  : "retention_post_dispatch",
            }),
          )
          .map((item) => [item.sourceKey, item] as const),
      ).values(),
    );

    if (this.legacyMode) {
      const data = await this.loadLegacy();
      const currentArchives = data.archives[input.storeId] ?? [];
      const existingSourceKeys = new Set(currentArchives.map((row) => row.sourceKey));
      const itemsToArchive = uniqueItems
        .filter((item) => !existingSourceKeys.has(item.sourceKey))
        .map((item) => normalizeArchiveRow(item));
      const archivedSourceKeys = itemsToArchive.map((item) => item.sourceKey);
      const skippedCount = input.items.length - itemsToArchive.length;

      if (!dryRun && archivedSourceKeys.length) {
        const currentStore = normalizeStoreEntry(data.stores[input.storeId]);
        const remainingItems = currentStore.items.filter(
          (item) => !archivedSourceKeys.includes(item.sourceKey),
        );
        await this.persistLegacy({
          version: 2,
          stores: {
            ...data.stores,
            [input.storeId]: {
              ...currentStore,
              items: remainingItems,
              updatedAt: new Date().toISOString(),
            },
          },
          archives: {
            ...data.archives,
            [input.storeId]: [...itemsToArchive, ...currentArchives].sort((left, right) =>
              right.archivedAt.localeCompare(left.archivedAt),
            ),
          },
        });
      }

      return {
        archivedCount: itemsToArchive.length,
        skippedCount,
        archivedSourceKeys,
        dryRun,
      };
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const sourceKeys = uniqueItems.map((item) => item.sourceKey);
    if (!sourceKeys.length) {
      return {
        archivedCount: 0,
        skippedCount: 0,
        archivedSourceKeys: [],
        dryRun,
      };
    }

    const existingArchivedRows = await database
      .select({ sourceKey: coupangShipmentArchiveRows.sourceKey })
      .from(coupangShipmentArchiveRows)
      .where(
        and(
          eq(coupangShipmentArchiveRows.storeId, input.storeId),
          inArray(coupangShipmentArchiveRows.sourceKey, sourceKeys),
        ),
      );
    const existingArchivedKeySet = new Set(existingArchivedRows.map((row) => row.sourceKey));
    const itemsToArchive = uniqueItems
      .filter((item) => !existingArchivedKeySet.has(item.sourceKey))
      .map((item) => normalizeArchiveRow(item));
    const archivedSourceKeys = itemsToArchive.map((item) => item.sourceKey);
    const skippedCount = input.items.length - itemsToArchive.length;

    if (!dryRun) {
      await database.transaction(async (tx) => {
        if (itemsToArchive.length) {
          await tx.insert(coupangShipmentArchiveRows).values(
            itemsToArchive.map((item, index) =>
              buildArchiveDatabaseRowValue(item, index, input.storeId),
            ),
          );
        }

        await tx
          .delete(coupangShipmentRows)
          .where(
            and(
              eq(coupangShipmentRows.storeId, input.storeId),
              inArray(coupangShipmentRows.sourceKey, sourceKeys),
            ),
          );
      });
    }

    return {
      archivedCount: itemsToArchive.length,
      skippedCount,
      archivedSourceKeys,
      dryRun,
    };
  }

  async patchRows(input: { storeId: string; items: PatchCoupangShipmentWorksheetItemInput[] }) {
    if (!input.items.length) {
      return {
        sheet: await this.getStoreSheet(input.storeId),
        missingKeys: [],
        touchedSourceKeys: [],
      };
    }

    if (this.legacyMode) {
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
            patch.invoiceAppliedAt !== undefined
              ? patch.invoiceAppliedAt
              : existingRow.invoiceAppliedAt,
          orderStatus:
            patch.orderStatus !== undefined ? patch.orderStatus : existingRow.orderStatus,
          availableActions:
            patch.availableActions !== undefined
              ? patch.availableActions ?? []
              : existingRow.availableActions,
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

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const sourceKeys = Array.from(
      new Set(
        input.items
          .map((item) => item.sourceKey?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const selpickOrderNumbers = Array.from(
      new Set(
        input.items
          .map((item) => item.selpickOrderNumber?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const lookupConditions = [
      sourceKeys.length ? inArray(coupangShipmentRows.sourceKey, sourceKeys) : null,
      selpickOrderNumbers.length
        ? inArray(coupangShipmentRows.selpickOrderNumber, selpickOrderNumbers)
        : null,
    ].filter((value): value is NonNullable<typeof value> => value !== null);

    if (!lookupConditions.length) {
      return {
        sheet: await this.getStoreSheet(input.storeId),
        missingKeys: input.items.map(
          (item, index) => item.sourceKey ?? item.selpickOrderNumber ?? `patch-${index + 1}`,
        ),
        touchedSourceKeys: [],
      };
    }

    const existingRows = await database
      .select()
      .from(coupangShipmentRows)
      .where(
        and(
          eq(coupangShipmentRows.storeId, input.storeId),
          or(...lookupConditions),
        ),
      );

    const existingRowsBySourceKey = new Map(
      existingRows.map((row) => [row.sourceKey, row] as const),
    );
    const existingRowsBySelpickOrderNumber = new Map(
      existingRows.map((row) => [row.selpickOrderNumber, row] as const),
    );
    const timestamp = new Date();
    const touchedSourceKeys: string[] = [];
    const missingKeys: string[] = [];

    await database.transaction(async (tx) => {
      for (const patch of input.items) {
        const databaseRow =
          (patch.sourceKey ? existingRowsBySourceKey.get(patch.sourceKey) : undefined) ??
          (patch.selpickOrderNumber
            ? existingRowsBySelpickOrderNumber.get(patch.selpickOrderNumber)
            : undefined);

        if (!databaseRow) {
          missingKeys.push(
            patch.sourceKey ??
              patch.selpickOrderNumber ??
              `patch-${missingKeys.length + touchedSourceKeys.length + 1}`,
          );
          continue;
        }

        const existingRow = restoreWorksheetRowFromDatabaseRow(databaseRow);
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
            patch.invoiceAppliedAt !== undefined
              ? patch.invoiceAppliedAt
              : existingRow.invoiceAppliedAt,
          orderStatus:
            patch.orderStatus !== undefined ? patch.orderStatus : existingRow.orderStatus,
          availableActions:
            patch.availableActions !== undefined
              ? patch.availableActions ?? []
              : existingRow.availableActions,
          updatedAt: timestamp.toISOString(),
        };

        await tx
          .update(coupangShipmentRows)
          .set({
            receiverName: nextRow.receiverName,
            receiverBaseName: nextRow.receiverBaseName,
            personalClearanceCode: nextRow.personalClearanceCode,
            deliveryCompanyCode: nextRow.deliveryCompanyCode,
            invoiceNumber: nextRow.invoiceNumber,
            orderStatus: nextRow.orderStatus,
            invoiceTransmissionStatus: nextRow.invoiceTransmissionStatus,
            invoiceTransmissionMessage: nextRow.invoiceTransmissionMessage,
            invoiceTransmissionAt: toDateOrNull(nextRow.invoiceTransmissionAt),
            invoiceAppliedAt: toDateOrNull(nextRow.invoiceAppliedAt),
            exportedAt: toDateOrNull(nextRow.exportedAt),
            rowDataJson: buildCompactWorksheetRowData(nextRow),
            updatedAt: timestamp,
          })
          .where(eq(coupangShipmentRows.id, databaseRow.id));

        touchedSourceKeys.push(nextRow.sourceKey);
      }

      if (touchedSourceKeys.length) {
        await tx
          .update(coupangShipmentSheets)
          .set({ updatedAt: timestamp })
          .where(eq(coupangShipmentSheets.storeId, input.storeId));
      }
    });

    return {
      sheet: await this.getStoreSheet(input.storeId),
      missingKeys,
      touchedSourceKeys,
    };
  }
}

export const workDataCoupangShipmentWorksheetStore: CoupangShipmentWorksheetStorePort =
  new CoupangShipmentWorksheetStore();
