import { randomUUID } from "crypto";
import type { Dirent } from "fs";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  eventLogs,
  operationLogs,
} from "@shared/schema";
import type {
  EventLogEntry,
  LogChannel,
  LogEntry,
  LogEventType,
  LogLevel,
  LogListQuery,
  LogListResponse,
  OperationLogRecord,
} from "@shared/logs";
import { getOperationLogMessage, isOperationStatus } from "@shared/logs";
import type {
  OperationChannel,
  OperationLogEntry,
  OperationMode,
  OperationResultSummary,
  OperationStatus,
  OperationTargetType,
} from "@shared/operations";
import type { LogStorePort } from "../interfaces/log-store";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  readJsonFileIfExists,
  runWorkDataImportOnce,
  toDateOrNull,
  toIsoString,
} from "../services/shared/work-data-db";
import { compactLogEntry } from "../services/operations/presentation";
import { normalizeOperationEntry } from "./file-log-store";

type CreateOperationInput = Parameters<LogStorePort["createOperation"]>[0];
type UpdateOperationInput = Parameters<LogStorePort["updateOperation"]>[1];
type CreateEventLogInput = Parameters<LogStorePort["createEvent"]>[0];

type LegacyOperationLogEntry = {
  id?: string;
  channel?: OperationChannel;
  actionName?: string;
  targetCount?: number;
  startedAt?: string;
  finishedAt?: string | null;
  status?: OperationStatus;
  summary?: string | null;
  summaryJson?: Record<string, unknown> | null;
  errorMessage?: string | null;
  retryable?: boolean;
  retryInputJson?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

type LegacyPersistedOperations = {
  version?: number;
  items?: LegacyOperationLogEntry[];
};

type PersistedOperations = {
  version: 2;
  items: OperationLogEntry[];
};

type CursorPayload = {
  updatedAt: string;
  id: string;
};

function readIntegerEnv(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw?.trim()) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function readPathEnv(name: string, fallback: string) {
  const raw = process.env[name];
  return raw?.trim() ? raw.trim() : fallback;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampString(value: string, maxLength = 280) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function computeDurationMs(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) {
    return null;
  }

  const startedMs = new Date(startedAt).getTime();
  const finishedMs = new Date(finishedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs)) {
    return null;
  }

  return Math.max(0, finishedMs - startedMs);
}

function sanitizeMetaValue(
  value: unknown,
  options: {
    depth?: number;
    maxStringLength?: number;
    maxEntries?: number;
  } = {},
): unknown {
  const depth = options.depth ?? 0;
  const maxStringLength = options.maxStringLength ?? 280;
  const maxEntries = options.maxEntries ?? 12;

  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return clampString(value, maxStringLength);
  }

  if (Array.isArray(value)) {
    return value.slice(0, maxEntries).map((item) =>
      depth >= 2
        ? typeof item === "string"
          ? clampString(item, maxStringLength)
          : String(item)
        : sanitizeMetaValue(item, {
            depth: depth + 1,
            maxStringLength,
            maxEntries,
          }),
    );
  }

  if (!isObjectRecord(value)) {
    return clampString(String(value), maxStringLength);
  }

  if (depth >= 2) {
    return clampString(JSON.stringify(value), maxStringLength);
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, maxEntries)
      .map(([key, nestedValue]) => [
        key,
        sanitizeMetaValue(nestedValue, {
          depth: depth + 1,
          maxStringLength,
          maxEntries,
        }),
      ]),
  );
}

function ensureSummary(value: unknown): OperationResultSummary | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  return {
    headline:
      typeof value.headline === "string"
        ? value.headline
        : typeof value.message === "string"
          ? value.message
          : null,
    detail: typeof value.detail === "string" ? value.detail : null,
    stats: isObjectRecord(value.stats) ? value.stats : null,
    preview: typeof value.preview === "string" ? value.preview : null,
  };
}

function buildOperationRecord(operation: OperationLogEntry): OperationLogRecord {
  const level: LogLevel =
    operation.status === "error"
      ? "error"
      : operation.status === "warning"
        ? "warning"
        : "info";

  return {
    id: operation.id,
    kind: "operation",
    eventType: null,
    channel: operation.channel,
    menuKey: operation.menuKey,
    actionKey: operation.actionKey,
    level,
    status: operation.status,
    startedAt: operation.startedAt,
    finishedAt: operation.finishedAt,
    durationMs: computeDurationMs(operation.startedAt, operation.finishedAt),
    message: getOperationLogMessage(operation),
    meta: sanitizeMetaValue(
      {
        mode: operation.mode,
        targetType: operation.targetType,
        targetCount: operation.targetCount,
        targetIds: operation.targetIds.slice(0, 10),
        retryable: operation.retryable,
        retryOfOperationId: operation.retryOfOperationId,
      },
      {
        maxEntries: 10,
      },
    ) as Record<string, unknown>,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    operation,
  };
}

function normalizeEventEntry(entry: Partial<EventLogEntry>): EventLogEntry {
  const timestamp = entry.createdAt || entry.startedAt || entry.updatedAt || new Date().toISOString();
  const channel: LogChannel =
    entry.channel === "naver" ||
    entry.channel === "coupang" ||
    entry.channel === "draft" ||
    entry.channel === "shared" ||
    entry.channel === "system"
      ? entry.channel
      : "system";

  const status =
    entry.status === "error" || entry.status === "warning" || entry.status === "success"
      ? entry.status
      : "success";

  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : randomUUID(),
    kind: "event",
    eventType:
      entry.eventType === "api" ||
      entry.eventType === "external" ||
      entry.eventType === "startup" ||
      entry.eventType === "system-error"
        ? entry.eventType
        : "system-error",
    channel,
    menuKey: typeof entry.menuKey === "string" ? entry.menuKey : null,
    actionKey: typeof entry.actionKey === "string" ? entry.actionKey : null,
    level:
      entry.level === "info" || entry.level === "warning" || entry.level === "error"
        ? entry.level
        : status === "error"
          ? "error"
          : status === "warning"
            ? "warning"
            : "info",
    status,
    startedAt: typeof entry.startedAt === "string" ? entry.startedAt : timestamp,
    finishedAt: typeof entry.finishedAt === "string" ? entry.finishedAt : null,
    durationMs:
      typeof entry.durationMs === "number" && Number.isFinite(entry.durationMs)
        ? Math.max(0, Math.round(entry.durationMs))
        : computeDurationMs(
            typeof entry.startedAt === "string" ? entry.startedAt : timestamp,
            typeof entry.finishedAt === "string" ? entry.finishedAt : null,
          ),
    message: typeof entry.message === "string" ? clampString(entry.message, 320) : null,
    meta: isObjectRecord(entry.meta)
      ? (sanitizeMetaValue(entry.meta, { maxEntries: 16 }) as Record<string, unknown>)
      : null,
    operationId: typeof entry.operationId === "string" ? entry.operationId : null,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : timestamp,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : timestamp,
  };
}

function slugifyActionName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3]+/g, "-")
      .replace(/^-+|-+$/g, "") || "legacy-action"
  );
}

function migrateLegacyEntry(entry: LegacyOperationLogEntry): OperationLogEntry {
  const timestamp = entry.createdAt || entry.startedAt || entry.updatedAt || new Date().toISOString();

  return normalizeOperationEntry({
    id: entry.id,
    channel: entry.channel ?? "shared",
    menuKey: entry.channel ? `${entry.channel}.legacy` : "shared.legacy",
    actionKey: slugifyActionName(entry.actionName ?? "legacy operation"),
    status: entry.status ?? "success",
    mode: entry.retryable ? "retry" : "background",
    targetType: "unknown",
    targetCount: Number.isFinite(entry.targetCount) ? Number(entry.targetCount) : 0,
    targetIds: [],
    requestPayload:
      isObjectRecord(entry.retryInputJson) ? structuredClone(entry.retryInputJson) : null,
    normalizedPayload:
      isObjectRecord(entry.retryInputJson) ? structuredClone(entry.retryInputJson) : null,
    resultSummary:
      entry.summary || entry.summaryJson
        ? {
            headline: entry.summary ?? null,
            detail: null,
            stats: entry.summaryJson ?? null,
            preview: entry.summary ?? null,
          }
        : null,
    errorCode: null,
    errorMessage: entry.errorMessage ?? null,
    retryable: Boolean(entry.retryable),
    retryOfOperationId: null,
    startedAt: entry.startedAt ?? timestamp,
    finishedAt: entry.finishedAt ?? null,
    createdAt: entry.createdAt ?? timestamp,
    updatedAt: entry.updatedAt ?? timestamp,
  });
}

function migratePersistedOperations(parsed: unknown): PersistedOperations {
  const payload = isObjectRecord(parsed) ? parsed : {};

  if (payload.version === 2 && Array.isArray(payload.items)) {
    return {
      version: 2,
      items: payload.items.map((entry) => normalizeOperationEntry(entry as Partial<OperationLogEntry>)),
    };
  }

  const legacy = payload as LegacyPersistedOperations;
  return {
    version: 2,
    items: Array.isArray(legacy.items) ? legacy.items.map(migrateLegacyEntry) : [],
  };
}

function mapDbOperationRow(row: typeof operationLogs.$inferSelect): OperationLogEntry {
  return normalizeOperationEntry({
    id: row.id,
    channel: row.channel as OperationChannel,
    menuKey: row.menuKey,
    actionKey: row.actionKey,
    status: row.status as OperationStatus,
    mode: row.mode as OperationMode,
    targetType: row.targetType as OperationTargetType,
    targetCount: row.targetCount,
    targetIds: Array.isArray(row.targetIdsJson)
      ? row.targetIdsJson.filter((value): value is string => typeof value === "string")
      : [],
    requestPayload: isObjectRecord(row.requestPayloadJson)
      ? (row.requestPayloadJson as Record<string, unknown>)
      : null,
    normalizedPayload: isObjectRecord(row.normalizedPayloadJson)
      ? (row.normalizedPayloadJson as Record<string, unknown>)
      : null,
    resultSummary: ensureSummary(row.resultSummaryJson),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    retryable: row.retryable,
    retryOfOperationId: row.retryOfOperationId,
    startedAt: toIsoString(row.startedAt) ?? new Date().toISOString(),
    finishedAt: toIsoString(row.finishedAt),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });
}

function mapDbEventRow(row: typeof eventLogs.$inferSelect): EventLogEntry {
  return normalizeEventEntry({
    id: row.id,
    kind: "event",
    channel: row.channel as LogChannel,
    eventType: row.eventType as LogEventType,
    level: row.level as LogLevel,
    status: row.status as OperationStatus,
    message: row.message,
    menuKey: row.menuKey,
    actionKey: row.actionKey,
    operationId: row.operationId,
    startedAt: toIsoString(row.startedAt) ?? new Date().toISOString(),
    finishedAt: toIsoString(row.finishedAt),
    durationMs: row.durationMs,
    meta: isObjectRecord(row.metaJson) ? (row.metaJson as Record<string, unknown>) : null,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });
}

function sortLogsDescending(left: LogEntry, right: LogEntry) {
  const updatedResult = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedResult !== 0) {
    return updatedResult;
  }

  return right.id.localeCompare(left.id);
}

function encodeCursor(input: CursorPayload) {
  return Buffer.from(JSON.stringify(input), "utf-8").toString("base64url");
}

function decodeCursor(value: string | null | undefined): CursorPayload | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf-8")) as unknown;
    if (
      isObjectRecord(parsed) &&
      typeof parsed.updatedAt === "string" &&
      typeof parsed.id === "string"
    ) {
      return {
        updatedAt: parsed.updatedAt,
        id: parsed.id,
      };
    }
  } catch {}

  return null;
}

function isAfterCursor(entry: LogEntry, cursor: CursorPayload) {
  if (entry.updatedAt !== cursor.updatedAt) {
    return entry.updatedAt.localeCompare(cursor.updatedAt) < 0;
  }

  return entry.id.localeCompare(cursor.id) < 0;
}

function getSearchText(entry: LogEntry) {
  if (entry.kind === "operation") {
    return [
      entry.channel,
      entry.menuKey ?? "",
      entry.actionKey ?? "",
      entry.operation.menuKey,
      entry.operation.actionKey,
      entry.operation.errorCode ?? "",
      entry.operation.errorMessage ?? "",
      entry.message ?? "",
      JSON.stringify(entry.operation.requestPayload ?? {}),
      JSON.stringify(entry.operation.normalizedPayload ?? {}),
      JSON.stringify(entry.operation.resultSummary ?? {}),
    ]
      .join(" ")
      .toLowerCase();
  }

  return [
    entry.channel,
    entry.eventType,
    entry.menuKey ?? "",
    entry.actionKey ?? "",
    entry.message ?? "",
    JSON.stringify(entry.meta ?? {}),
  ]
    .join(" ")
    .toLowerCase();
}

export class WorkDataLogStore implements LogStorePort {
  private readonly logDir: string;
  private readonly legacyOperationLogFile: string;
  private readonly scanLimit: number;
  private readonly operationListeners = new Set<(entry: OperationLogEntry) => void>();
  private initializePromise: Promise<void> | null = null;

  constructor() {
    this.logDir = path.resolve(process.cwd(), readPathEnv("LOG_DIR", "data/logs"));
    this.legacyOperationLogFile = path.resolve(
      process.cwd(),
      readPathEnv("OPERATION_LOG_FILE", "data/operation-logs.json"),
    );
    this.scanLimit = readIntegerEnv("LOG_DB_SCAN_LIMIT", 1000, 100, 5000);
  }

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await ensureWorkDataTables();
        await runWorkDataImportOnce(
          "log-store-to-db",
          async () => {
            const importedFromJson = await this.importLegacyOperationJson();
            const importedFromJsonl = await this.importLegacyJsonlLogs();
            return {
              importedFromJson,
              importedFromJsonl,
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

  private async upsertOperation(operation: OperationLogEntry) {
    const database = assertWorkDataDatabaseEnabled();
    await database
      .insert(operationLogs)
      .values({
        id: operation.id,
        channel: operation.channel,
        menuKey: operation.menuKey,
        actionKey: operation.actionKey,
        status: operation.status,
        mode: operation.mode,
        targetType: operation.targetType,
        targetCount: operation.targetCount,
        targetIdsJson: operation.targetIds,
        requestPayloadJson: operation.requestPayload,
        normalizedPayloadJson: operation.normalizedPayload,
        resultSummaryJson: operation.resultSummary,
        errorCode: operation.errorCode,
        errorMessage: operation.errorMessage,
        retryable: operation.retryable,
        retryOfOperationId: operation.retryOfOperationId,
        startedAt: toDateOrNull(operation.startedAt) ?? new Date(),
        finishedAt: toDateOrNull(operation.finishedAt),
        createdAt: toDateOrNull(operation.createdAt) ?? new Date(),
        updatedAt: toDateOrNull(operation.updatedAt) ?? new Date(),
      })
      .onConflictDoUpdate({
        target: operationLogs.id,
        set: {
          channel: operation.channel,
          menuKey: operation.menuKey,
          actionKey: operation.actionKey,
          status: operation.status,
          mode: operation.mode,
          targetType: operation.targetType,
          targetCount: operation.targetCount,
          targetIdsJson: operation.targetIds,
          requestPayloadJson: operation.requestPayload,
          normalizedPayloadJson: operation.normalizedPayload,
          resultSummaryJson: operation.resultSummary,
          errorCode: operation.errorCode,
          errorMessage: operation.errorMessage,
          retryable: operation.retryable,
          retryOfOperationId: operation.retryOfOperationId,
          startedAt: toDateOrNull(operation.startedAt) ?? new Date(),
          finishedAt: toDateOrNull(operation.finishedAt),
          updatedAt: toDateOrNull(operation.updatedAt) ?? new Date(),
        },
      });
  }

  private async upsertEvent(event: EventLogEntry) {
    const database = assertWorkDataDatabaseEnabled();
    await database
      .insert(eventLogs)
      .values({
        id: event.id,
        eventType: event.eventType,
        channel: event.channel,
        menuKey: event.menuKey,
        actionKey: event.actionKey,
        level: event.level,
        status: event.status,
        message: event.message,
        metaJson: event.meta,
        operationId: event.operationId,
        startedAt: toDateOrNull(event.startedAt) ?? new Date(),
        finishedAt: toDateOrNull(event.finishedAt),
        durationMs: event.durationMs,
        createdAt: toDateOrNull(event.createdAt) ?? new Date(),
        updatedAt: toDateOrNull(event.updatedAt) ?? new Date(),
      })
      .onConflictDoUpdate({
        target: eventLogs.id,
        set: {
          eventType: event.eventType,
          channel: event.channel,
          menuKey: event.menuKey,
          actionKey: event.actionKey,
          level: event.level,
          status: event.status,
          message: event.message,
          metaJson: event.meta,
          operationId: event.operationId,
          startedAt: toDateOrNull(event.startedAt) ?? new Date(),
          finishedAt: toDateOrNull(event.finishedAt),
          durationMs: event.durationMs,
          updatedAt: toDateOrNull(event.updatedAt) ?? new Date(),
        },
      });
  }

  private async importLegacyOperationJson() {
    const parsed = await readJsonFileIfExists<unknown>(this.legacyOperationLogFile);
    const migrated = migratePersistedOperations(parsed);

    for (const item of migrated.items) {
      await this.upsertOperation(item);
    }

    return migrated.items.length;
  }

  private async importLegacyJsonlLogs() {
    let files: Dirent<string>[];

    try {
      files = await readdir(this.logDir, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: string }).code)
          : null;
      if (code === "ENOENT") {
        return 0;
      }
      throw error;
    }

    let importedCount = 0;
    const logFiles = files
      .filter((entry: Dirent<string>) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name))
      .map((entry: Dirent<string>) => path.join(this.logDir, entry.name))
      .sort((left: string, right: string) => left.localeCompare(right));

    for (const filePath of logFiles) {
      const raw = await readFile(filePath, "utf-8").catch(() => "");
      const lines = raw.split(/\r?\n/).filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Partial<LogEntry>;
          if (parsed.kind === "operation" && isObjectRecord(parsed.operation)) {
            await this.upsertOperation(
              normalizeOperationEntry(parsed.operation as Partial<OperationLogEntry>),
            );
            importedCount += 1;
            continue;
          }

          if (parsed.kind === "event") {
            await this.upsertEvent(normalizeEventEntry(parsed as Partial<EventLogEntry>));
            importedCount += 1;
          }
        } catch {}
      }
    }

    return importedCount;
  }

  async listRecentLogs(query: LogListQuery = {}): Promise<LogListResponse> {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
    const cursor = decodeCursor(query.cursor);
    const normalizedQuery = query.q?.trim().toLowerCase() ?? "";

    const [operationRows, eventRows] = await Promise.all([
      database.select().from(operationLogs).orderBy(desc(operationLogs.updatedAt)).limit(this.scanLimit),
      database.select().from(eventLogs).orderBy(desc(eventLogs.updatedAt)).limit(this.scanLimit),
    ]);

    const entries = [
      ...operationRows.map((row) => buildOperationRecord(mapDbOperationRow(row))),
      ...eventRows.map((row) => mapDbEventRow(row)),
    ]
      .filter((entry) => (query.kind && query.kind !== "all" ? entry.kind === query.kind : true))
      .filter((entry) =>
        query.channel && query.channel !== "all" ? entry.channel === query.channel : true,
      )
      .filter((entry) =>
        query.status && query.status !== "all" ? entry.status === query.status : true,
      )
      .filter((entry) =>
        query.level && query.level !== "all" ? entry.level === query.level : true,
      )
      .filter((entry) => (query.slowOnly ? Boolean(entry.meta?.slow) : true))
      .filter((entry) => (normalizedQuery ? getSearchText(entry).includes(normalizedQuery) : true))
      .sort(sortLogsDescending)
      .filter((entry) => (cursor ? isAfterCursor(entry, cursor) : true));

    const items = entries
      .slice(0, limit)
      .map((entry) => compactLogEntry(structuredClone(entry)));
    const hasMore = entries.length > items.length;
    const nextCursor =
      hasMore && items.length
        ? encodeCursor({
            updatedAt: items[items.length - 1].updatedAt,
            id: items[items.length - 1].id,
          })
        : null;

    return {
      items,
      nextCursor,
    };
  }

  async getLogById(id: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const operationRows = await database
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.id, id))
      .limit(1);

    if (operationRows[0]) {
      return buildOperationRecord(mapDbOperationRow(operationRows[0]));
    }

    const eventRows = await database.select().from(eventLogs).where(eq(eventLogs.id, id)).limit(1);
    return eventRows[0] ? mapDbEventRow(eventRows[0]) : null;
  }

  async listRecentOperations(limit = 50) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(operationLogs)
      .orderBy(desc(operationLogs.updatedAt))
      .limit(Math.max(1, Math.min(limit, 200)));

    return rows.map(mapDbOperationRow);
  }

  async getOperationById(id: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.id, id))
      .limit(1);

    return rows[0] ? mapDbOperationRow(rows[0]) : null;
  }

  async findActiveRetryFor(operationId: string) {
    await this.ensureInitialized();
    const database = assertWorkDataDatabaseEnabled();
    const rows = await database
      .select()
      .from(operationLogs)
      .where(
        and(
          eq(operationLogs.retryOfOperationId, operationId),
          or(eq(operationLogs.status, "queued"), eq(operationLogs.status, "running")),
        ),
      )
      .orderBy(desc(operationLogs.updatedAt))
      .limit(1);

    return rows[0] ? mapDbOperationRow(rows[0]) : null;
  }

  async createOperation(input: CreateOperationInput) {
    await this.ensureInitialized();
    const timestamp = new Date().toISOString();
    const operation = normalizeOperationEntry({
      id: randomUUID(),
      channel: input.channel,
      menuKey: input.menuKey,
      actionKey: input.actionKey,
      status: input.status,
      mode: input.mode,
      targetType: input.targetType,
      targetCount: input.targetCount,
      targetIds: input.targetIds ?? [],
      requestPayload: input.requestPayload ?? null,
      normalizedPayload: input.normalizedPayload ?? null,
      resultSummary: input.resultSummary ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      retryable: input.retryable ?? false,
      retryOfOperationId: input.retryOfOperationId ?? null,
      startedAt: input.startedAt ?? timestamp,
      finishedAt: input.finishedAt ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.upsertOperation(operation);
    for (const listener of Array.from(this.operationListeners)) {
      listener(structuredClone(operation));
    }
    return structuredClone(operation);
  }

  async updateOperation(id: string, patch: UpdateOperationInput) {
    const current = await this.getOperationById(id);
    if (!current) {
      return null;
    }

    const operation = normalizeOperationEntry({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });

    await this.upsertOperation(operation);
    for (const listener of Array.from(this.operationListeners)) {
      listener(structuredClone(operation));
    }
    return structuredClone(operation);
  }

  async createEvent(input: CreateEventLogInput) {
    await this.ensureInitialized();
    const timestamp = new Date().toISOString();
    const event = normalizeEventEntry({
      id: randomUUID(),
      kind: "event",
      channel: input.channel,
      eventType: input.eventType,
      level: input.level,
      status: input.status,
      message: input.message,
      menuKey: input.menuKey ?? null,
      actionKey: input.actionKey ?? null,
      operationId: input.operationId ?? null,
      startedAt: input.startedAt ?? timestamp,
      finishedAt: input.finishedAt ?? timestamp,
      durationMs: input.durationMs ?? null,
      meta: input.meta ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.upsertEvent(event);
    return structuredClone(event);
  }

  subscribeToOperations(listener: (entry: OperationLogEntry) => void) {
    this.operationListeners.add(listener);
    return () => {
      this.operationListeners.delete(listener);
    };
  }
}

export const workDataLogStore: LogStorePort = new WorkDataLogStore();
