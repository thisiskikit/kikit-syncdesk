import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  COUPANG_INVOICE_ALREADY_PROCESSED_MESSAGE,
  isCoupangInvoiceAlreadyProcessedResult,
  type CoupangShipmentArchiveRow,
  type CoupangShipmentArchiveReason,
  type CoupangDataSource,
  type CoupangShipmentWorksheetRow,
  type CoupangShipmentWorksheetSyncSummary,
  type PatchCoupangShipmentWorksheetItemInput,
} from "@shared/coupang";
import {
  coupangShipmentArchiveRows,
  coupangShipmentRows,
  coupangShipmentSelpickCounters,
  coupangShipmentSelpickRegistry,
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
  EnsureCoupangShipmentWorksheetSelpickIntegrityInput,
  MaterializeCoupangShipmentWorksheetSelpickNumbersInput,
  RestoreArchivedCoupangShipmentWorksheetRowsInput,
  RestoreArchivedCoupangShipmentWorksheetRowsResult,
} from "../interfaces/coupang-shipment-worksheet-store";

export type { CoupangShipmentWorksheetSyncState } from "../interfaces/coupang-shipment-worksheet-store";

type PersistedWorksheetStoreEntry = {
  items: CoupangShipmentWorksheetRow[];
  mirrorItems: CoupangShipmentWorksheetRow[];
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
  selpickRegistry: string[];
  selpickCounters: Record<string, number>;
};

const defaultData: PersistedWorksheetStore = {
  version: 2,
  stores: {},
  archives: {},
  selpickRegistry: [],
  selpickCounters: {},
};

const STALE_INVOICE_PENDING_THRESHOLD_MS = 5 * 60_000;
const STALE_INVOICE_PENDING_MESSAGE =
  "\uC804\uC1A1 \uACB0\uACFC \uD655\uC778\uC774 \uC9C0\uC5F0\uB418\uC5B4 \uC2E4\uD328\uB85C \uC804\uD658\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC804\uC1A1\uD574 \uC8FC\uC138\uC694.";
export const WORKSHEET_ROW_WRITE_CHUNK_SIZE = 200;
const SELPICK_ORDER_NUMBER_PATTERN = /^O(\d{8})([A-Z0-9])(\d{4,})$/i;

type WorkDataDatabase = ReturnType<typeof assertWorkDataDatabaseEnabled>;
type WorkDataTransaction = Parameters<Parameters<WorkDataDatabase["transaction"]>[0]>[0];
type SelpickEntryLocation = "active" | "archive";
type SelpickIntegrityEntry = {
  location: SelpickEntryLocation;
  id: string;
  storeId: string;
  sourceKey: string;
  selpickOrderNumber: string;
  orderDateKey: string;
  createdAt: string;
  sortOrder: number;
  exportedAt: string | null;
  invoiceAppliedAt: string | null;
  invoiceNumber: string;
  invoiceTransmissionStatus: string | null;
};

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
  const missingInCoupang = row.missingInCoupang === true;

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
    missingInCoupang,
    missingDetectedAt:
      missingInCoupang && typeof row.missingDetectedAt === "string" ? row.missingDetectedAt : null,
    missingDetectionSource:
      missingInCoupang &&
      (row.missingDetectionSource === "full_sync" ||
        row.missingDetectionSource === "reconcile_live")
        ? row.missingDetectionSource
        : null,
    lastSeenOrderStatus:
      missingInCoupang && typeof row.lastSeenOrderStatus === "string"
        ? row.lastSeenOrderStatus
        : null,
    lastSeenIssueSummary:
      missingInCoupang && typeof row.lastSeenIssueSummary === "string"
        ? row.lastSeenIssueSummary
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
      value.archiveReason === "cancel_completed" ||
      value.archiveReason === "return_completed" ||
      value.archiveReason === "not_found_in_coupang"
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
  const items = Array.isArray(value?.items) ? value.items.map(normalizeWorksheetRow) : [];
  const mirrorItems = Array.isArray(value?.mirrorItems)
    ? value.mirrorItems.map(normalizeWorksheetRow)
    : items;
  return {
    items,
    mirrorItems,
    collectedAt: typeof value?.collectedAt === "string" ? value.collectedAt : null,
    source: value?.source === "fallback" ? "fallback" : "live",
    message: typeof value?.message === "string" ? value.message : null,
    syncState: normalizeSyncState(value?.syncState),
    syncSummary: normalizeSyncSummary(value?.syncSummary),
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  } satisfies PersistedWorksheetStoreEntry;
}

function mergeWorksheetRowsBySourceKey(
  currentRows: readonly CoupangShipmentWorksheetRow[],
  nextRows: readonly CoupangShipmentWorksheetRow[],
) {
  const mergedBySourceKey = new Map(
    currentRows.map((row) => [row.sourceKey, normalizeWorksheetRow(row)] as const),
  );

  for (const row of nextRows) {
    mergedBySourceKey.set(row.sourceKey, normalizeWorksheetRow(row));
  }

  return Array.from(mergedBySourceKey.values());
}

function applyWorksheetRowPatch(
  row: CoupangShipmentWorksheetRow,
  patch: PatchCoupangShipmentWorksheetItemInput,
  updatedAt: string,
) {
  return normalizeWorksheetRow({
    ...row,
    receiverName:
      patch.receiverName !== undefined ? patch.receiverName ?? row.receiverName : row.receiverName,
    receiverBaseName:
      patch.receiverBaseName !== undefined ? patch.receiverBaseName : row.receiverBaseName,
    personalClearanceCode:
      patch.personalClearanceCode !== undefined
        ? patch.personalClearanceCode
        : row.personalClearanceCode,
    deliveryCompanyCode:
      patch.deliveryCompanyCode !== undefined
        ? (patch.deliveryCompanyCode ?? "").trim()
        : row.deliveryCompanyCode,
    invoiceNumber:
      patch.invoiceNumber !== undefined ? (patch.invoiceNumber ?? "").trim() : row.invoiceNumber,
    deliveryRequest:
      patch.deliveryRequest !== undefined ? patch.deliveryRequest : row.deliveryRequest,
    invoiceTransmissionStatus:
      patch.invoiceTransmissionStatus !== undefined
        ? patch.invoiceTransmissionStatus
        : row.invoiceTransmissionStatus,
    invoiceTransmissionMessage:
      patch.invoiceTransmissionMessage !== undefined
        ? patch.invoiceTransmissionMessage
        : row.invoiceTransmissionMessage,
    invoiceTransmissionAt:
      patch.invoiceTransmissionAt !== undefined
        ? patch.invoiceTransmissionAt
        : row.invoiceTransmissionAt,
    exportedAt: patch.exportedAt !== undefined ? patch.exportedAt : row.exportedAt,
    invoiceAppliedAt:
      patch.invoiceAppliedAt !== undefined ? patch.invoiceAppliedAt : row.invoiceAppliedAt,
    orderStatus: patch.orderStatus !== undefined ? patch.orderStatus : row.orderStatus,
    availableActions:
      patch.availableActions !== undefined ? patch.availableActions ?? [] : row.availableActions,
    updatedAt,
  });
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
    selpickRegistry: Array.from(
      new Set(
        Array.isArray(value?.selpickRegistry)
          ? value.selpickRegistry
              .map((item) => normalizeOptionalString(item))
              .filter((item): item is string => Boolean(item))
          : [],
      ),
    ),
    selpickCounters:
      value?.selpickCounters &&
      typeof value.selpickCounters === "object" &&
      !Array.isArray(value.selpickCounters)
        ? Object.fromEntries(
            Object.entries(value.selpickCounters)
              .map(([platformKey, sequence]) => [
                normalizeOptionalString(platformKey)?.toUpperCase() ?? "",
                Number.isFinite(sequence) ? Math.max(0, Math.trunc(Number(sequence))) : 0,
              ])
              .filter(([platformKey]) => Boolean(platformKey)),
          )
        : {},
  };
}

function normalizeSelpickOrderNumber(value: string | null | undefined) {
  return normalizeOptionalString(value)?.toUpperCase() ?? null;
}

function parseSelpickOrderNumber(value: string | null | undefined) {
  const normalized = normalizeSelpickOrderNumber(value);
  if (!normalized) {
    return null;
  }

  const matched = normalized.match(SELPICK_ORDER_NUMBER_PATTERN);
  if (!matched) {
    return null;
  }

  const sequence = Number(matched[3]);
  if (!Number.isFinite(sequence)) {
    return null;
  }

  return {
    normalized,
    orderDateKey: matched[1],
    platformKey: matched[2].toUpperCase(),
    sequence,
  };
}

function formatSelpickOrderNumber(orderDateKey: string, platformKey: string, sequence: number) {
  return `O${orderDateKey}${platformKey}${String(sequence).padStart(4, "0")}`;
}

function compareSelpickIntegrityEntries(left: SelpickIntegrityEntry, right: SelpickIntegrityEntry) {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt.localeCompare(right.createdAt);
  }

  if (left.location !== right.location) {
    return left.location === "active" ? -1 : 1;
  }

  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.sourceKey.localeCompare(right.sourceKey);
}

function canAutoRepairSelpickIntegrityEntry(entry: SelpickIntegrityEntry) {
  return (
    !normalizeOptionalString(entry.exportedAt) &&
    !normalizeOptionalString(entry.invoiceAppliedAt) &&
    !normalizeOptionalString(entry.invoiceNumber) &&
    entry.invoiceTransmissionStatus !== "succeeded"
  );
}

function buildSelpickIntegrityBlockedError(entries: SelpickIntegrityEntry[]) {
  const details = entries
    .slice(0, 3)
    .map((entry) => `${entry.selpickOrderNumber} (${entry.location}:${entry.sourceKey})`)
    .join(", ");

  return new Error(
    `운영 사용 이력이 있는 셀픽주문번호 중복이 있어 자동 복구하지 못했습니다.${details ? ` ${details}` : ""}${entries.length > 3 ? ` 외 ${entries.length - 3}건` : ""}`,
  );
}

function findDuplicateSelpickOrderNumbers(rows: readonly Pick<CoupangShipmentWorksheetRow, "selpickOrderNumber">[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const selpickOrderNumber = normalizeSelpickOrderNumber(row.selpickOrderNumber);
    if (!selpickOrderNumber) {
      continue;
    }

    counts.set(selpickOrderNumber, (counts.get(selpickOrderNumber) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([selpickOrderNumber]) => selpickOrderNumber);
}

function assertUniqueSelpickOrderNumbers(
  rows: readonly Pick<CoupangShipmentWorksheetRow, "selpickOrderNumber">[],
  message: string,
) {
  const duplicates = findDuplicateSelpickOrderNumbers(rows);
  if (!duplicates.length) {
    return;
  }

  throw new Error(
    `${message} ${duplicates.slice(0, 3).join(", ")}${duplicates.length > 3 ? ` 외 ${duplicates.length - 3}건` : ""}`,
  );
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

async function acquireSelpickIntegrityTransactionLock(tx: WorkDataTransaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${hashAdvisoryLockPart("coupang_shipment_selpick_integrity")}, 0)`,
  );
}

async function acquireSelpickPlatformTransactionLock(tx: WorkDataTransaction, platformKey: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${hashAdvisoryLockPart("coupang_shipment_selpick_platform")}, ${hashAdvisoryLockPart(platformKey)})`,
  );
}

async function acquireWorksheetStoreTransactionLock(tx: WorkDataTransaction, storeId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${hashAdvisoryLockPart("coupang_shipment_rows")}, ${hashAdvisoryLockPart(storeId)})`,
  );
}

async function reserveNextSelpickOrderNumberTx(
  tx: WorkDataTransaction,
  input: { platformKey: string; orderDateKey: string },
) {
  const platformKey = normalizeOptionalString(input.platformKey)?.toUpperCase();
  if (!platformKey || !/^[A-Z0-9]$/.test(platformKey)) {
    throw new Error("셀픽주문번호 발급용 배송 KEY가 올바르지 않습니다.");
  }

  await acquireSelpickPlatformTransactionLock(tx, platformKey);

  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const currentCounter = await tx
      .select({ lastSequence: coupangShipmentSelpickCounters.lastSequence })
      .from(coupangShipmentSelpickCounters)
      .where(eq(coupangShipmentSelpickCounters.platformKey, platformKey))
      .limit(1);
    const nextSequence = (currentCounter[0]?.lastSequence ?? 0) + 1;
    const now = new Date();

    if (currentCounter[0]) {
      await tx
        .update(coupangShipmentSelpickCounters)
        .set({
          lastSequence: nextSequence,
          updatedAt: now,
        })
        .where(eq(coupangShipmentSelpickCounters.platformKey, platformKey));
    } else {
      await tx.insert(coupangShipmentSelpickCounters).values({
        platformKey,
        lastSequence: nextSequence,
        updatedAt: now,
      });
    }

    const candidate = formatSelpickOrderNumber(input.orderDateKey, platformKey, nextSequence);
    const inserted = await tx
      .insert(coupangShipmentSelpickRegistry)
      .values({
        selpickOrderNumber: candidate,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ selpickOrderNumber: coupangShipmentSelpickRegistry.selpickOrderNumber });

    if (inserted[0]?.selpickOrderNumber) {
      return candidate;
    }
  }

  throw new Error("셀픽주문번호를 예약하지 못했습니다.");
}

async function insertSelpickRegistryEntriesTx(
  tx: WorkDataTransaction,
  selpickOrderNumbers: readonly string[],
) {
  const normalized = Array.from(
    new Set(
      selpickOrderNumbers
        .map((value) => normalizeSelpickOrderNumber(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (!normalized.length) {
    return;
  }

  const now = new Date();
  for (const chunk of chunkWorksheetRows(normalized, 500)) {
    await tx
      .insert(coupangShipmentSelpickRegistry)
      .values(
        chunk.map((selpickOrderNumber) => ({
          selpickOrderNumber,
          createdAt: now,
        })),
      )
      .onConflictDoNothing();
  }
}

async function syncSelpickCounterMaxTx(
  tx: WorkDataTransaction,
  platformKey: string,
  lastSequence: number,
) {
  if (!/^[A-Z0-9]$/.test(platformKey) || !Number.isFinite(lastSequence) || lastSequence < 0) {
    return;
  }

  const now = new Date();
  await tx
    .insert(coupangShipmentSelpickCounters)
    .values({
      platformKey,
      lastSequence,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: coupangShipmentSelpickCounters.platformKey,
      set: {
        lastSequence: sql`GREATEST(${coupangShipmentSelpickCounters.lastSequence}, ${lastSequence})`,
        updatedAt: now,
      },
    });
}

async function syncSelpickStateForRowsTx(
  tx: WorkDataTransaction,
  rows: Array<Pick<CoupangShipmentWorksheetRow, "selpickOrderNumber">>,
) {
  const selpickOrderNumbers = rows
    .map((row) => normalizeSelpickOrderNumber(row.selpickOrderNumber))
    .filter((value): value is string => Boolean(value));
  if (!selpickOrderNumbers.length) {
    return;
  }

  await insertSelpickRegistryEntriesTx(tx, selpickOrderNumbers);
  const maxSequenceByPlatformKey = new Map<string, number>();
  for (const selpickOrderNumber of selpickOrderNumbers) {
    const parsed = parseSelpickOrderNumber(selpickOrderNumber);
    if (!parsed) {
      continue;
    }

    maxSequenceByPlatformKey.set(
      parsed.platformKey,
      Math.max(maxSequenceByPlatformKey.get(parsed.platformKey) ?? 0, parsed.sequence),
    );
  }

  for (const [platformKey, lastSequence] of Array.from(maxSequenceByPlatformKey.entries())) {
    await syncSelpickCounterMaxTx(tx, platformKey, lastSequence);
  }
}

function mapActiveSelpickIntegrityEntry(
  row: Pick<
    CoupangShipmentRowRow,
    | "id"
    | "storeId"
    | "sourceKey"
    | "selpickOrderNumber"
    | "orderDateKey"
    | "createdAt"
    | "sortOrder"
    | "exportedAt"
    | "invoiceAppliedAt"
    | "invoiceNumber"
    | "invoiceTransmissionStatus"
  >,
): SelpickIntegrityEntry {
  return {
    location: "active",
    id: row.id,
    storeId: row.storeId,
    sourceKey: row.sourceKey,
    selpickOrderNumber: row.selpickOrderNumber,
    orderDateKey: row.orderDateKey,
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    sortOrder: row.sortOrder,
    exportedAt: toIsoString(row.exportedAt),
    invoiceAppliedAt: toIsoString(row.invoiceAppliedAt),
    invoiceNumber: row.invoiceNumber,
    invoiceTransmissionStatus: row.invoiceTransmissionStatus,
  };
}

function mapArchiveSelpickIntegrityEntry(
  row: Pick<
    CoupangShipmentArchiveRowRow,
    | "id"
    | "storeId"
    | "sourceKey"
    | "selpickOrderNumber"
    | "orderDateKey"
    | "createdAt"
    | "sortOrder"
    | "exportedAt"
    | "invoiceAppliedAt"
    | "invoiceNumber"
    | "invoiceTransmissionStatus"
  >,
): SelpickIntegrityEntry {
  return {
    location: "archive",
    id: row.id,
    storeId: row.storeId,
    sourceKey: row.sourceKey,
    selpickOrderNumber: row.selpickOrderNumber,
    orderDateKey: row.orderDateKey,
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    sortOrder: row.sortOrder,
    exportedAt: toIsoString(row.exportedAt),
    invoiceAppliedAt: toIsoString(row.invoiceAppliedAt),
    invoiceNumber: row.invoiceNumber,
    invoiceTransmissionStatus: row.invoiceTransmissionStatus,
  };
}

async function ensureSelpickIntegrityDbTx(tx: WorkDataTransaction) {
  await acquireSelpickIntegrityTransactionLock(tx);

  const [activeRows, archiveRows] = await Promise.all([
    tx
      .select({
        id: coupangShipmentRows.id,
        storeId: coupangShipmentRows.storeId,
        sourceKey: coupangShipmentRows.sourceKey,
        selpickOrderNumber: coupangShipmentRows.selpickOrderNumber,
        orderDateKey: coupangShipmentRows.orderDateKey,
        createdAt: coupangShipmentRows.createdAt,
        sortOrder: coupangShipmentRows.sortOrder,
        exportedAt: coupangShipmentRows.exportedAt,
        invoiceAppliedAt: coupangShipmentRows.invoiceAppliedAt,
        invoiceNumber: coupangShipmentRows.invoiceNumber,
        invoiceTransmissionStatus: coupangShipmentRows.invoiceTransmissionStatus,
      })
      .from(coupangShipmentRows),
    tx
      .select({
        id: coupangShipmentArchiveRows.id,
        storeId: coupangShipmentArchiveRows.storeId,
        sourceKey: coupangShipmentArchiveRows.sourceKey,
        selpickOrderNumber: coupangShipmentArchiveRows.selpickOrderNumber,
        orderDateKey: coupangShipmentArchiveRows.orderDateKey,
        createdAt: coupangShipmentArchiveRows.createdAt,
        sortOrder: coupangShipmentArchiveRows.sortOrder,
        exportedAt: coupangShipmentArchiveRows.exportedAt,
        invoiceAppliedAt: coupangShipmentArchiveRows.invoiceAppliedAt,
        invoiceNumber: coupangShipmentArchiveRows.invoiceNumber,
        invoiceTransmissionStatus: coupangShipmentArchiveRows.invoiceTransmissionStatus,
      })
      .from(coupangShipmentArchiveRows),
  ]);

  const entries = [
    ...activeRows.map(mapActiveSelpickIntegrityEntry),
    ...archiveRows.map(mapArchiveSelpickIntegrityEntry),
  ];
  const entriesBySelpick = new Map<string, SelpickIntegrityEntry[]>();

  for (const entry of entries) {
    const selpickOrderNumber = normalizeSelpickOrderNumber(entry.selpickOrderNumber);
    if (!selpickOrderNumber) {
      continue;
    }

    const group = entriesBySelpick.get(selpickOrderNumber);
    if (group) {
      group.push(entry);
      continue;
    }

    entriesBySelpick.set(selpickOrderNumber, [entry]);
  }

  const blockedEntries: SelpickIntegrityEntry[] = [];
  const existingSelpickOrderNumbers = entries
    .map((entry) => normalizeSelpickOrderNumber(entry.selpickOrderNumber))
    .filter((value): value is string => Boolean(value));
  await insertSelpickRegistryEntriesTx(tx, existingSelpickOrderNumbers);
  const existingMaxSequenceByPlatformKey = new Map<string, number>();
  for (const selpickOrderNumber of existingSelpickOrderNumbers) {
    const parsed = parseSelpickOrderNumber(selpickOrderNumber);
    if (!parsed) {
      continue;
    }

    existingMaxSequenceByPlatformKey.set(
      parsed.platformKey,
      Math.max(existingMaxSequenceByPlatformKey.get(parsed.platformKey) ?? 0, parsed.sequence),
    );
  }
  for (const [platformKey, lastSequence] of Array.from(existingMaxSequenceByPlatformKey.entries())) {
    await syncSelpickCounterMaxTx(tx, platformKey, lastSequence);
  }

  for (const group of Array.from(entriesBySelpick.values())) {
    if (group.length <= 1) {
      continue;
    }

    const sorted = [...group].sort(compareSelpickIntegrityEntries);
    for (const entry of sorted.slice(1)) {
      const parsed = parseSelpickOrderNumber(entry.selpickOrderNumber);
      if (!parsed || !canAutoRepairSelpickIntegrityEntry(entry)) {
        blockedEntries.push(entry);
        continue;
      }

      const repairedSelpickOrderNumber = await reserveNextSelpickOrderNumberTx(tx, {
        platformKey: parsed.platformKey,
        orderDateKey: entry.orderDateKey,
      });
      const now = new Date();

      if (entry.location === "active") {
        await tx
          .update(coupangShipmentRows)
          .set({
            selpickOrderNumber: repairedSelpickOrderNumber,
            updatedAt: now,
          })
          .where(eq(coupangShipmentRows.id, entry.id));
      } else {
        await tx
          .update(coupangShipmentArchiveRows)
          .set({
            selpickOrderNumber: repairedSelpickOrderNumber,
            updatedAt: now,
          })
          .where(eq(coupangShipmentArchiveRows.id, entry.id));
      }

      entry.selpickOrderNumber = repairedSelpickOrderNumber;
      entry.createdAt = entry.createdAt || now.toISOString();
    }
  }

  if (blockedEntries.length) {
    throw buildSelpickIntegrityBlockedError(blockedEntries);
  }

  const allSelpickOrderNumbers = entries
    .map((entry) => normalizeSelpickOrderNumber(entry.selpickOrderNumber))
    .filter((value): value is string => Boolean(value));
  await insertSelpickRegistryEntriesTx(tx, allSelpickOrderNumbers);

  const maxSequenceByPlatformKey = new Map<string, number>();
  for (const selpickOrderNumber of allSelpickOrderNumbers) {
    const parsed = parseSelpickOrderNumber(selpickOrderNumber);
    if (!parsed) {
      continue;
    }

    maxSequenceByPlatformKey.set(
      parsed.platformKey,
      Math.max(maxSequenceByPlatformKey.get(parsed.platformKey) ?? 0, parsed.sequence),
    );
  }

  for (const [platformKey, lastSequence] of Array.from(maxSequenceByPlatformKey.entries())) {
    await syncSelpickCounterMaxTx(tx, platformKey, lastSequence);
  }
}

function finalizeLegacySelpickState(
  data: PersistedWorksheetStore,
  registry: Set<string>,
  counters: Map<string, number>,
) {
  data.selpickRegistry = Array.from(registry).sort((left, right) => left.localeCompare(right));
  data.selpickCounters = Object.fromEntries(
    Array.from(counters.entries())
      .filter(([, value]) => Number.isFinite(value) && value >= 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function registerSelpickOrderNumbersLegacy(
  registry: Set<string>,
  counters: Map<string, number>,
  selpickOrderNumbers: Iterable<string>,
) {
  for (const rawValue of Array.from(selpickOrderNumbers)) {
    const selpickOrderNumber = normalizeSelpickOrderNumber(rawValue);
    if (!selpickOrderNumber) {
      continue;
    }

    registry.add(selpickOrderNumber);
    const parsed = parseSelpickOrderNumber(selpickOrderNumber);
    if (!parsed) {
      continue;
    }

    counters.set(
      parsed.platformKey,
      Math.max(counters.get(parsed.platformKey) ?? 0, parsed.sequence),
    );
  }
}

function resolveSelpickOrderDateKeyOrThrow(row: Pick<CoupangShipmentWorksheetRow, "sourceKey" | "orderDateKey">) {
  const orderDateKey = (typeof row.orderDateKey === "string" ? row.orderDateKey.trim() : "")
    .replace(/[^0-9]/g, "");
  if (/^\d{8}$/.test(orderDateKey)) {
    return orderDateKey;
  }

  throw new Error(
    `셀픽주문번호를 발급할 주문일자를 확인하지 못했습니다. sourceKey=${row.sourceKey}`,
  );
}

async function ensureSelpickIntegrityLegacy(
  store: {
    loadLegacy(): Promise<PersistedWorksheetStore>;
    persistLegacy(nextData: PersistedWorksheetStore): Promise<void>;
    setCache?(nextData: PersistedWorksheetStore): void;
  },
) {
  const data = await store.loadLegacy();
  const registry = new Set(
    data.selpickRegistry
      .map((value) => normalizeSelpickOrderNumber(value))
      .filter((value): value is string => Boolean(value)),
  );
  const counters = new Map(
    Object.entries(data.selpickCounters).map(([platformKey, sequence]) => [
      platformKey.toUpperCase(),
      Math.max(0, Math.trunc(sequence)),
    ]),
  );
  const entries: Array<SelpickIntegrityEntry & { row: CoupangShipmentWorksheetRow | CoupangShipmentArchiveRow }> = [];

  for (const entry of Object.values(data.stores)) {
    for (const row of entry.items) {
      entries.push({
        location: "active",
        id: row.id,
        storeId: row.storeId,
        sourceKey: row.sourceKey,
        selpickOrderNumber: row.selpickOrderNumber,
        orderDateKey: row.orderDateKey,
        createdAt: row.createdAt,
        sortOrder: 0,
        exportedAt: row.exportedAt,
        invoiceAppliedAt: row.invoiceAppliedAt,
        invoiceNumber: row.invoiceNumber,
        invoiceTransmissionStatus: row.invoiceTransmissionStatus,
        row,
      });
    }
  }

  for (const rows of Object.values(data.archives)) {
    for (const row of rows) {
      entries.push({
        location: "archive",
        id: row.id,
        storeId: row.storeId,
        sourceKey: row.sourceKey,
        selpickOrderNumber: row.selpickOrderNumber,
        orderDateKey: row.orderDateKey,
        createdAt: row.createdAt,
        sortOrder: 0,
        exportedAt: row.exportedAt,
        invoiceAppliedAt: row.invoiceAppliedAt,
        invoiceNumber: row.invoiceNumber,
        invoiceTransmissionStatus: row.invoiceTransmissionStatus,
        row,
      });
    }
  }

  const entriesBySelpick = new Map<string, Array<typeof entries[number]>>();
  for (const entry of entries) {
    const selpickOrderNumber = normalizeSelpickOrderNumber(entry.selpickOrderNumber);
    if (!selpickOrderNumber) {
      continue;
    }

    const group = entriesBySelpick.get(selpickOrderNumber);
    if (group) {
      group.push(entry);
      continue;
    }

    entriesBySelpick.set(selpickOrderNumber, [entry]);
  }

  let changed = false;
  const blockedEntries: SelpickIntegrityEntry[] = [];
  registerSelpickOrderNumbersLegacy(
    registry,
    counters,
    entries.map((entry) => entry.selpickOrderNumber),
  );

  const reserveLegacySelpickOrderNumber = (platformKey: string, orderDateKey: string) => {
    const normalizedPlatformKey = platformKey.toUpperCase();
    let nextSequence = (counters.get(normalizedPlatformKey) ?? 0) + 1;

    while (true) {
      const candidate = formatSelpickOrderNumber(orderDateKey, normalizedPlatformKey, nextSequence);
      if (!registry.has(candidate)) {
        registry.add(candidate);
        counters.set(normalizedPlatformKey, nextSequence);
        return candidate;
      }

      nextSequence += 1;
    }
  };

  for (const group of Array.from(entriesBySelpick.values())) {
    if (group.length <= 1) {
      continue;
    }

    const sorted = [...group].sort(compareSelpickIntegrityEntries);
    for (const entry of sorted.slice(1)) {
      const parsed = parseSelpickOrderNumber(entry.selpickOrderNumber);
      if (!parsed || !canAutoRepairSelpickIntegrityEntry(entry)) {
        blockedEntries.push(entry);
        continue;
      }

      const repairedSelpickOrderNumber = reserveLegacySelpickOrderNumber(
        parsed.platformKey,
        entry.orderDateKey,
      );
      entry.row.selpickOrderNumber = repairedSelpickOrderNumber;
      entry.row.updatedAt = new Date().toISOString();
      entry.selpickOrderNumber = repairedSelpickOrderNumber;
      changed = true;
    }
  }

  if (blockedEntries.length) {
    throw buildSelpickIntegrityBlockedError(blockedEntries);
  }

  for (const entry of entries) {
    const normalizedSelpickOrderNumber = normalizeSelpickOrderNumber(entry.row.selpickOrderNumber);
    if (normalizedSelpickOrderNumber) {
      registry.add(normalizedSelpickOrderNumber);
    }

    const parsed = parseSelpickOrderNumber(entry.row.selpickOrderNumber);
    if (!parsed) {
      continue;
    }

    counters.set(parsed.platformKey, Math.max(counters.get(parsed.platformKey) ?? 0, parsed.sequence));
  }

  finalizeLegacySelpickState(data, registry as Set<string>, counters);
  if (changed) {
    await store.persistLegacy(data);
  } else {
    store.setCache?.(data);
  }

  return { data, registry, counters };
}

function buildWorksheetSheetDatabaseValue(
  input: {
    sheetId: string;
    storeId: string;
    collectedAt: string | null;
    source: CoupangDataSource;
    message: string | null;
    mirrorItems: CoupangShipmentWorksheetRow[];
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
    mirrorItemsJson: input.mirrorItems,
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
    mirrorItems: CoupangShipmentWorksheetRow[];
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
        mirrorItemsJson: value.mirrorItemsJson,
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

  private setLegacyCache(nextData: PersistedWorksheetStore) {
    this.cache = nextData;
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
            let importedArchiveRowCount = 0;
            const registry = new Set(
              parsed.selpickRegistry
                .map((value) => normalizeSelpickOrderNumber(value))
                .filter((value): value is string => Boolean(value)),
            );
            const counters = new Map(
              Object.entries(parsed.selpickCounters).map(([platformKey, sequence]) => [
                platformKey.toUpperCase(),
                Math.max(0, Math.trunc(Number(sequence ?? 0))),
              ]),
            );
            const storeIds = Array.from(
              new Set([...Object.keys(parsed.stores), ...Object.keys(parsed.archives)]),
            );

            for (const storeId of storeIds) {
              const entry = parsed.stores[storeId]
                ? normalizeStoreEntry(parsed.stores[storeId])
                : null;
              const archiveItems = (parsed.archives[storeId] ?? []).map(normalizeArchiveRow);
              const importedAt =
                toDateOrNull(entry?.updatedAt ?? archiveItems[0]?.archivedAt ?? null) ?? new Date();
              await database.transaction(async (tx) => {
                await acquireWorksheetStoreTransactionLock(tx, storeId);
                if (entry) {
                  const sheetId = `sheet:${storeId}`;
                  await upsertWorksheetSheetRecord(
                    tx,
                    {
                      sheetId,
                      storeId,
                      collectedAt: entry.collectedAt,
                      source: entry.source,
                      message: entry.message,
                      mirrorItems: entry.mirrorItems,
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
                }

                await tx
                  .delete(coupangShipmentArchiveRows)
                  .where(eq(coupangShipmentArchiveRows.storeId, storeId));

                if (archiveItems.length) {
                  await tx.insert(coupangShipmentArchiveRows).values(
                    archiveItems.map((item, index) =>
                      buildArchiveDatabaseRowValue(item, index, storeId),
                    ),
                  );
                }
              });

              if (entry) {
                importedStoreCount += 1;
                importedRowCount += entry.items.length;
                registerSelpickOrderNumbersLegacy(
                  registry,
                  counters,
                  entry.mirrorItems.map((row) => row.selpickOrderNumber),
                );
              }

              if (archiveItems.length) {
                importedArchiveRowCount += archiveItems.length;
                registerSelpickOrderNumbersLegacy(
                  registry,
                  counters,
                  archiveItems.map((row) => row.selpickOrderNumber),
                );
              }
            }

            await database.transaction(async (tx) => {
              await insertSelpickRegistryEntriesTx(tx, Array.from(registry));
              for (const [platformKey, lastSequence] of Array.from(counters.entries())) {
                await syncSelpickCounterMaxTx(tx, platformKey, lastSequence);
              }
            });

            return {
              importedStoreCount,
              importedRowCount,
              importedArchiveRowCount,
              importedSelpickRegistryCount: registry.size,
              importedSelpickCounterCount: counters.size,
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
      mirrorItems: Array.isArray(sheet.mirrorItemsJson)
        ? sheet.mirrorItemsJson.map((row) => normalizeWorksheetRow(row as CoupangShipmentWorksheetRow))
        : undefined,
      collectedAt: toIsoString(sheet.collectedAt),
      source: sheet.source === "fallback" ? "fallback" : "live",
      message: sheet.message,
      syncState: sheet.syncStateJson as CoupangShipmentWorksheetSyncState,
      syncSummary: sheet.syncSummaryJson as CoupangShipmentWorksheetSyncSummary | null,
      updatedAt: toIsoString(sheet.updatedAt) ?? new Date().toISOString(),
    });
  }

  async ensureSelpickIntegrity(_input: EnsureCoupangShipmentWorksheetSelpickIntegrityInput) {
    if (this.legacyMode) {
      await ensureSelpickIntegrityLegacy({
        loadLegacy: () => this.loadLegacy(),
        persistLegacy: (nextData) => this.persistLegacy(nextData),
        setCache: (nextData) => this.setLegacyCache(nextData),
      });
      return;
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    await database.transaction(async (tx) => {
      await ensureSelpickIntegrityDbTx(tx);
    });
  }

  async materializeSelpickOrderNumbers(
    input: MaterializeCoupangShipmentWorksheetSelpickNumbersInput,
  ) {
    const normalizedItems = input.items.map(normalizeWorksheetRow);
    assertUniqueSelpickOrderNumbers(
      normalizedItems,
      "셀픽주문번호 중복이 있어 번호 발급을 진행할 수 없습니다.",
    );

    if (!normalizedItems.length) {
      return normalizedItems;
    }

    if (this.legacyMode) {
      const { data, registry, counters } = await ensureSelpickIntegrityLegacy({
        loadLegacy: () => this.loadLegacy(),
        persistLegacy: (nextData) => this.persistLegacy(nextData),
        setCache: (nextData) => this.setLegacyCache(nextData),
      });
      const platformKey = input.platformKey.trim().toUpperCase();
      let metadataChanged = false;
      const materializedItems = normalizedItems.map((row) => {
        const existingSelpickOrderNumber = normalizeSelpickOrderNumber(row.selpickOrderNumber);
        if (existingSelpickOrderNumber) {
          const parsed = parseSelpickOrderNumber(existingSelpickOrderNumber);
          const previousRegistrySize = registry.size;
          const previousCounter = parsed ? counters.get(parsed.platformKey) ?? 0 : null;
          registerSelpickOrderNumbersLegacy(registry, counters, [existingSelpickOrderNumber]);
          if (registry.size !== previousRegistrySize) {
            metadataChanged = true;
          }
          if (
            parsed &&
            (counters.get(parsed.platformKey) ?? 0) !== (previousCounter ?? 0)
          ) {
            metadataChanged = true;
          }
          return existingSelpickOrderNumber === row.selpickOrderNumber
            ? row
            : {
                ...row,
                selpickOrderNumber: existingSelpickOrderNumber,
              };
        }

        const orderDateKey = resolveSelpickOrderDateKeyOrThrow(row);
        let nextSequence = (counters.get(platformKey) ?? 0) + 1;
        let nextSelpickOrderNumber = formatSelpickOrderNumber(orderDateKey, platformKey, nextSequence);
        while (registry.has(nextSelpickOrderNumber)) {
          nextSequence += 1;
          nextSelpickOrderNumber = formatSelpickOrderNumber(orderDateKey, platformKey, nextSequence);
        }

        registry.add(nextSelpickOrderNumber);
        counters.set(platformKey, nextSequence);
        metadataChanged = true;
        return {
          ...row,
          selpickOrderNumber: nextSelpickOrderNumber,
        };
      });

      finalizeLegacySelpickState(data, registry, counters);
      if (metadataChanged) {
        await this.persistLegacy(data);
      } else {
        this.setLegacyCache(data);
      }

      assertUniqueSelpickOrderNumbers(
        materializedItems,
        "셀픽주문번호 중복이 있어 번호 발급 결과를 확정할 수 없습니다.",
      );
      return materializedItems;
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const platformKey = input.platformKey.trim().toUpperCase();
    return database.transaction(async (tx) => {
      await ensureSelpickIntegrityDbTx(tx);
      await acquireSelpickPlatformTransactionLock(tx, platformKey);
      await syncSelpickStateForRowsTx(tx, normalizedItems);

      const materializedItems: CoupangShipmentWorksheetRow[] = [];
      for (const row of normalizedItems) {
        const existingSelpickOrderNumber = normalizeSelpickOrderNumber(row.selpickOrderNumber);
        if (existingSelpickOrderNumber) {
          materializedItems.push({
            ...row,
            selpickOrderNumber: existingSelpickOrderNumber,
          });
          continue;
        }

        const orderDateKey = resolveSelpickOrderDateKeyOrThrow(row);
        const nextSelpickOrderNumber = await reserveNextSelpickOrderNumberTx(tx, {
          platformKey,
          orderDateKey,
        });
        materializedItems.push({
          ...row,
          selpickOrderNumber: nextSelpickOrderNumber,
        });
      }

      assertUniqueSelpickOrderNumbers(
        materializedItems,
        "셀픽주문번호 중복이 있어 번호 발급 결과를 확정할 수 없습니다.",
      );
      return materializedItems;
    });
  }

  async setStoreSheet(input: {
    storeId: string;
    items: CoupangShipmentWorksheetRow[];
    mirrorItems?: CoupangShipmentWorksheetRow[];
    collectedAt: string | null;
    source: CoupangDataSource;
    message: string | null;
    syncState: CoupangShipmentWorksheetSyncState;
    syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  }) {
    const nextEntry = {
      items: input.items.map(normalizeWorksheetRow),
      mirrorItems: (input.mirrorItems ?? input.items).map(normalizeWorksheetRow),
      collectedAt: input.collectedAt,
      source: input.source,
      message: input.message,
      syncState: normalizeSyncState(input.syncState),
      syncSummary: normalizeSyncSummary(input.syncSummary),
      updatedAt: new Date().toISOString(),
    } satisfies PersistedWorksheetStoreEntry;
    assertUniqueSelpickOrderNumbers(
      nextEntry.mirrorItems,
      "셀픽주문번호 중복이 있어 워크시트 저장을 진행할 수 없습니다.",
    );

    if (this.legacyMode) {
      const data = await this.loadLegacy();
      const nextData = {
        version: 2,
        stores: {
          ...data.stores,
          [input.storeId]: nextEntry,
        },
        archives: data.archives,
        selpickRegistry: [...data.selpickRegistry],
        selpickCounters: { ...data.selpickCounters },
      } satisfies PersistedWorksheetStore;
      const registry = new Set(
        nextData.selpickRegistry
          .map((value) => normalizeSelpickOrderNumber(value))
          .filter((value): value is string => Boolean(value)),
      );
      const counters = new Map(
        Object.entries(nextData.selpickCounters).map(([platformKey, sequence]) => [
          platformKey.toUpperCase(),
          Math.max(0, Math.trunc(sequence)),
        ]),
      );
      registerSelpickOrderNumbersLegacy(
        registry,
        counters,
        nextEntry.mirrorItems.map((row) => row.selpickOrderNumber),
      );
      finalizeLegacySelpickState(nextData, registry, counters);
      await this.persistLegacy(nextData);

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
          mirrorItems: nextEntry.mirrorItems,
          syncState: nextEntry.syncState,
          syncSummary: nextEntry.syncSummary,
        },
        timestamp,
      );

      await tx
        .delete(coupangShipmentRows)
        .where(eq(coupangShipmentRows.storeId, input.storeId));

      await syncSelpickStateForRowsTx(tx, nextEntry.mirrorItems);
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
    mirrorItems?: CoupangShipmentWorksheetRow[];
    collectedAt: string | null;
    source: CoupangDataSource;
    message: string | null;
    syncState: CoupangShipmentWorksheetSyncState;
    syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  }) {
    const nextEntry = {
      items: input.items.map(normalizeWorksheetRow),
      mirrorItems: (input.mirrorItems ?? input.items).map(normalizeWorksheetRow),
      collectedAt: input.collectedAt,
      source: input.source,
      message: input.message,
      syncState: normalizeSyncState(input.syncState),
      syncSummary: normalizeSyncSummary(input.syncSummary),
      updatedAt: new Date().toISOString(),
    } satisfies PersistedWorksheetStoreEntry;
    assertUniqueSelpickOrderNumbers(
      nextEntry.mirrorItems,
      "셀픽주문번호 중복이 있어 워크시트 저장을 진행할 수 없습니다.",
    );

    if (this.legacyMode) {
      const data = await this.loadLegacy();
      const currentEntry = normalizeStoreEntry(data.stores[input.storeId]);
      const persistedEntry = {
        ...currentEntry,
        items: mergeWorksheetRowsBySourceKey(currentEntry.items, nextEntry.items),
        mirrorItems: mergeWorksheetRowsBySourceKey(
          currentEntry.mirrorItems,
          nextEntry.mirrorItems,
        ),
        collectedAt: nextEntry.collectedAt,
        source: nextEntry.source,
        message: nextEntry.message,
        syncState: nextEntry.syncState,
        syncSummary: nextEntry.syncSummary,
        updatedAt: nextEntry.updatedAt,
      } satisfies PersistedWorksheetStoreEntry;
      assertUniqueSelpickOrderNumbers(
        persistedEntry.mirrorItems,
        "셀픽주문번호 중복이 있어 워크시트 저장을 진행할 수 없습니다.",
      );

      const nextData = {
        version: 2,
        stores: {
          ...data.stores,
          [input.storeId]: persistedEntry,
        },
        archives: data.archives,
        selpickRegistry: [...data.selpickRegistry],
        selpickCounters: { ...data.selpickCounters },
      } satisfies PersistedWorksheetStore;
      const registry = new Set(
        nextData.selpickRegistry
          .map((value) => normalizeSelpickOrderNumber(value))
          .filter((value): value is string => Boolean(value)),
      );
      const counters = new Map(
        Object.entries(nextData.selpickCounters).map(([platformKey, sequence]) => [
          platformKey.toUpperCase(),
          Math.max(0, Math.trunc(sequence)),
        ]),
      );
      registerSelpickOrderNumbersLegacy(
        registry,
        counters,
        persistedEntry.mirrorItems.map((row) => row.selpickOrderNumber),
      );
      finalizeLegacySelpickState(nextData, registry, counters);
      await this.persistLegacy(nextData);

      return normalizeStoreEntry(persistedEntry);
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const timestamp = new Date();
    const sheetId = `sheet:${input.storeId}`;
    const currentSheet = await this.getStoreSheet(input.storeId);
    const mergedActiveItems = mergeWorksheetRowsBySourceKey(currentSheet.items, nextEntry.items);
    const mergedMirrorItems = mergeWorksheetRowsBySourceKey(
      currentSheet.mirrorItems,
      nextEntry.mirrorItems,
    );
    assertUniqueSelpickOrderNumbers(
      mergedMirrorItems,
      "셀픽주문번호 중복이 있어 워크시트 저장을 진행할 수 없습니다.",
    );

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
          mirrorItems: mergedMirrorItems,
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

        await syncSelpickStateForRowsTx(tx, mergedMirrorItems);
        await upsertWorksheetRowsInChunks(tx, {
          sheetId,
          storeId: input.storeId,
          items: mergedActiveItems,
          nextSortOrder,
          existingSortOrderBySourceKey,
        });
      } else {
        await syncSelpickStateForRowsTx(tx, mergedMirrorItems);
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

  async restoreArchivedRows(
    input: RestoreArchivedCoupangShipmentWorksheetRowsInput,
  ): Promise<RestoreArchivedCoupangShipmentWorksheetRowsResult> {
    const sourceKeys = Array.from(
      new Set(
        input.sourceKeys
          .map((value) => value.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const archiveReason = input.archiveReason ?? null;

    if (!sourceKeys.length) {
      return {
        restoredCount: 0,
        skippedCount: 0,
        restoredSourceKeys: [],
        items: [],
      };
    }

    const matchesArchiveReason = (
      row: Pick<CoupangShipmentArchiveRow, "archiveReason">,
      expectedReason: CoupangShipmentArchiveReason | null,
    ) => expectedReason === null || row.archiveReason === expectedReason;

    if (this.legacyMode) {
      const data = await this.loadLegacy();
      const currentArchives = (data.archives[input.storeId] ?? []).map(normalizeArchiveRow);
      const rowsToRestore = currentArchives.filter(
        (row) =>
          sourceKeys.includes(row.sourceKey) && matchesArchiveReason(row, archiveReason),
      );
      const restoredSourceKeys = Array.from(new Set(rowsToRestore.map((row) => row.sourceKey)));

      if (restoredSourceKeys.length) {
        await this.persistLegacy({
          version: 2,
          stores: { ...data.stores },
          archives: {
            ...data.archives,
            [input.storeId]: currentArchives.filter(
              (row) => !restoredSourceKeys.includes(row.sourceKey),
            ),
          },
          selpickRegistry: [...data.selpickRegistry],
          selpickCounters: { ...data.selpickCounters },
        });
      }

      return {
        restoredCount: restoredSourceKeys.length,
        skippedCount: sourceKeys.length - restoredSourceKeys.length,
        restoredSourceKeys,
        items: rowsToRestore,
      };
    }

    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const selectedRows = await database
      .select()
      .from(coupangShipmentArchiveRows)
      .where(
        and(
          eq(coupangShipmentArchiveRows.storeId, input.storeId),
          inArray(coupangShipmentArchiveRows.sourceKey, sourceKeys),
        ),
      );

    const rowsToRestore = selectedRows
      .map((row) => restoreArchiveRowFromDatabaseRow(row))
      .filter((row) => matchesArchiveReason(row, archiveReason));
    const rowIdsToDelete = rowsToRestore.map((row) => row.id);
    const restoredSourceKeys = Array.from(new Set(rowsToRestore.map((row) => row.sourceKey)));

    if (rowIdsToDelete.length) {
      await database
        .delete(coupangShipmentArchiveRows)
        .where(
          and(
            eq(coupangShipmentArchiveRows.storeId, input.storeId),
            inArray(coupangShipmentArchiveRows.id, rowIdsToDelete),
          ),
        );
    }

    return {
      restoredCount: restoredSourceKeys.length,
      skippedCount: sourceKeys.length - restoredSourceKeys.length,
      restoredSourceKeys,
      items: rowsToRestore,
    };
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
                  item.archiveReason === "return_completed" ||
                  item.archiveReason === "not_found_in_coupang")
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
          selpickRegistry: [...data.selpickRegistry],
          selpickCounters: { ...data.selpickCounters },
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
      assertUniqueSelpickOrderNumbers(
        current.mirrorItems,
        "운영 사용 이력이 있는 셀픽주문번호 중복이 있어 자동 복구 없이 워크시트 수정을 진행할 수 없습니다.",
      );
      const activeRows = [...current.items];
      const mirrorRows = [...current.mirrorItems];
      const rowIndexBySourceKey = new Map(
        activeRows.map((row, index) => [row.sourceKey, index] as const),
      );
      const rowIndexBySelpickOrderNumber = new Map(
        activeRows.map((row, index) => [row.selpickOrderNumber, index] as const),
      );
      const missingKeys: string[] = [];
      const touchedSourceKeys: string[] = [];
      const touchedRowBySourceKey = new Map<string, CoupangShipmentWorksheetRow>();

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

        const nextRow = applyWorksheetRowPatch(activeRows[index], patch, new Date().toISOString());

        activeRows[index] = nextRow;
        touchedRowBySourceKey.set(nextRow.sourceKey, nextRow);
        touchedSourceKeys.push(nextRow.sourceKey);
      }

      const patchedMirrorRows = mirrorRows.map(
        (row) => touchedRowBySourceKey.get(row.sourceKey) ?? row,
      );

      const sheet = await this.setStoreSheet({
        storeId: input.storeId,
        items: activeRows,
        mirrorItems: patchedMirrorRows,
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
    const currentSheet = await this.getStoreSheet(input.storeId);
    assertUniqueSelpickOrderNumbers(
      currentSheet.mirrorItems,
      "운영 사용 이력이 있는 셀픽주문번호 중복이 있어 자동 복구 없이 워크시트 수정을 진행할 수 없습니다.",
    );
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
    const touchedRowBySourceKey = new Map<string, CoupangShipmentWorksheetRow>();

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

        const nextRow = applyWorksheetRowPatch(
          restoreWorksheetRowFromDatabaseRow(databaseRow),
          patch,
          timestamp.toISOString(),
        );

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

        touchedRowBySourceKey.set(nextRow.sourceKey, nextRow);
        touchedSourceKeys.push(nextRow.sourceKey);
      }

      if (touchedSourceKeys.length) {
        const patchedMirrorItems = currentSheet.mirrorItems.map(
          (row) => touchedRowBySourceKey.get(row.sourceKey) ?? row,
        );
        await tx
          .update(coupangShipmentSheets)
          .set({
            mirrorItemsJson: patchedMirrorItems,
            updatedAt: timestamp,
          })
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
