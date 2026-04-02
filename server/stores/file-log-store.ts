import { randomUUID } from "crypto";
import { appendFile, mkdir, readFile, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { desc } from "drizzle-orm";
import type {
  EventLogEntry,
  LogChannel,
  LogEntry,
  LogEventType,
  LogKind,
  LogLevel,
  LogListQuery,
  LogListResponse,
  OperationLogRecord,
} from "@shared/logs";
import { getOperationLogMessage, isOperationStatus, logKinds } from "@shared/logs";
import type {
  OperationChannel,
  OperationLogEntry,
  OperationMode,
  OperationResultSummary,
  OperationStatus,
  OperationTargetType,
} from "@shared/operations";
import { db } from "../storage";
import { operationLogs } from "@shared/schema";
import { toIsoString } from "../services/shared/work-data-db";
import type { LogStorePort } from "../interfaces/log-store";

type PersistedOperations = {
  version: 2;
  items: OperationLogEntry[];
};

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
  version?: 1;
  items?: LegacyOperationLogEntry[];
};

type LogStoreMeta = {
  version: 1;
  imports: {
    legacyJson: boolean;
    legacyDb: boolean;
  };
};

export type CreateOperationInput = {
  channel: OperationChannel;
  menuKey: string;
  actionKey: string;
  status: OperationStatus;
  mode: OperationMode;
  targetType: OperationTargetType;
  targetCount: number;
  targetIds?: string[];
  requestPayload?: Record<string, unknown> | null;
  normalizedPayload?: Record<string, unknown> | null;
  resultSummary?: OperationResultSummary | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
  retryOfOperationId?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
};

export type UpdateOperationInput = Partial<
  Pick<
    OperationLogEntry,
    | "status"
    | "normalizedPayload"
    | "resultSummary"
    | "errorCode"
    | "errorMessage"
    | "finishedAt"
    | "retryable"
  >
>;

export type CreateEventLogInput = {
  channel: LogChannel;
  eventType: LogEventType;
  level: LogLevel;
  status: Extract<OperationStatus, "success" | "warning" | "error">;
  message: string;
  menuKey?: string | null;
  actionKey?: string | null;
  operationId?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  meta?: Record<string, unknown> | null;
};

type CursorPayload = {
  updatedAt: string;
  id: string;
};

type LogStoreOptions = {
  logDir?: string;
  retentionDays?: number;
  maxTotalBytes?: number;
  legacyOperationLogFile?: string;
  legacyDbImportLimit?: number;
};

const DEFAULT_META: LogStoreMeta = {
  version: 1,
  imports: {
    legacyJson: false,
    legacyDb: false,
  },
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

function toIsoDateKey(value: string) {
  return value.slice(0, 10);
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function clampString(value: string, maxLength = 280) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
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

function sortLogsDescending(left: LogEntry, right: LogEntry) {
  const updatedResult = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedResult !== 0) {
    return updatedResult;
  }

  return right.id.localeCompare(left.id);
}

function isEntryNewer(next: LogEntry, current: LogEntry) {
  const updatedResult = next.updatedAt.localeCompare(current.updatedAt);
  if (updatedResult !== 0) {
    return updatedResult > 0;
  }

  return next.id.localeCompare(current.id) >= 0;
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

export function normalizeOperationEntry(entry: Partial<OperationLogEntry>): OperationLogEntry {
  const timestamp = entry.createdAt || entry.startedAt || entry.updatedAt || new Date().toISOString();
  const status = isOperationStatus(String(entry.status)) ? (entry.status as OperationStatus) : "queued";

  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : randomUUID(),
    channel:
      entry.channel === "naver" ||
      entry.channel === "coupang" ||
      entry.channel === "draft" ||
      entry.channel === "shared"
        ? entry.channel
        : "shared",
    menuKey: typeof entry.menuKey === "string" && entry.menuKey ? entry.menuKey : "shared.unknown",
    actionKey:
      typeof entry.actionKey === "string" && entry.actionKey ? entry.actionKey : "unknown-action",
    status,
    mode:
      entry.mode === "foreground" ||
      entry.mode === "background" ||
      entry.mode === "system" ||
      entry.mode === "retry"
        ? entry.mode
        : "background",
    targetType:
      entry.targetType === "store" ||
      entry.targetType === "product" ||
      entry.targetType === "originProduct" ||
      entry.targetType === "vendorItem" ||
      entry.targetType === "order" ||
      entry.targetType === "draft" ||
      entry.targetType === "execution" ||
      entry.targetType === "selection" ||
      entry.targetType === "menu" ||
      entry.targetType === "unknown"
        ? entry.targetType
        : "unknown",
    targetCount:
      typeof entry.targetCount === "number" && Number.isFinite(entry.targetCount)
        ? Math.max(0, Math.floor(entry.targetCount))
        : 0,
    targetIds: Array.isArray(entry.targetIds)
      ? entry.targetIds.filter((value): value is string => typeof value === "string")
      : [],
    requestPayload:
      isObjectRecord(entry.requestPayload) ? structuredClone(entry.requestPayload) : null,
    normalizedPayload:
      isObjectRecord(entry.normalizedPayload) ? structuredClone(entry.normalizedPayload) : null,
    resultSummary: ensureSummary(entry.resultSummary),
    errorCode: typeof entry.errorCode === "string" ? entry.errorCode : null,
    errorMessage: typeof entry.errorMessage === "string" ? entry.errorMessage : null,
    retryable: Boolean(entry.retryable),
    retryOfOperationId:
      typeof entry.retryOfOperationId === "string" ? entry.retryOfOperationId : null,
    startedAt: typeof entry.startedAt === "string" ? entry.startedAt : timestamp,
    finishedAt: typeof entry.finishedAt === "string" ? entry.finishedAt : null,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : timestamp,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : timestamp,
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

async function readJsonFileIfExists<T>(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : null;

    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export class LogStore {
  private readonly logDir: string;
  private readonly metaPath: string;
  private readonly legacyOperationLogFile: string;
  private readonly retentionDays: number;
  private readonly maxTotalBytes: number;
  private readonly legacyDbImportLimit: number;
  private readonly cache = new Map<string, LogEntry>();
  private readonly operationListeners = new Set<(entry: OperationLogEntry) => void>();
  private initializePromise: Promise<void> | null = null;
  private writePromise = Promise.resolve();

  constructor(options: LogStoreOptions = {}) {
    this.logDir = path.resolve(
      process.cwd(),
      options.logDir ?? readPathEnv("LOG_DIR", "data/logs"),
    );
    this.metaPath = path.join(this.logDir, "_meta.json");
    this.legacyOperationLogFile = path.resolve(
      process.cwd(),
      options.legacyOperationLogFile ??
        readPathEnv("OPERATION_LOG_FILE", "data/operation-logs.json"),
    );
    this.retentionDays =
      options.retentionDays ?? readIntegerEnv("LOG_RETENTION_DAYS", 14, 1, 365);
    this.maxTotalBytes =
      options.maxTotalBytes ?? readIntegerEnv("LOG_MAX_TOTAL_MB", 25, 1, 500) * 1024 * 1024;
    this.legacyDbImportLimit =
      options.legacyDbImportLimit ?? readIntegerEnv("LOG_DB_IMPORT_LIMIT", 200, 0, 1_000);
  }

  private async ensureInitialized() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        await mkdir(this.logDir, { recursive: true });
        await this.pruneFiles();
        await this.loadFromFiles();
        await this.runLegacyImports();
      })().catch((error) => {
        this.initializePromise = null;
        throw error;
      });
    }

    await this.initializePromise;
  }

  private enqueueWrite(task: () => Promise<void>) {
    this.writePromise = this.writePromise.then(task, task);
    return this.writePromise;
  }

  private getLogFilePath(updatedAt: string) {
    return path.join(this.logDir, `${toIsoDateKey(updatedAt)}.jsonl`);
  }

  private async loadMeta() {
    const parsed = await readJsonFileIfExists<Partial<LogStoreMeta>>(this.metaPath);
    if (!isObjectRecord(parsed)) {
      return structuredClone(DEFAULT_META);
    }

    return {
      version: 1,
      imports: {
        legacyJson: Boolean(parsed.imports && isObjectRecord(parsed.imports) && parsed.imports.legacyJson),
        legacyDb: Boolean(parsed.imports && isObjectRecord(parsed.imports) && parsed.imports.legacyDb),
      },
    } satisfies LogStoreMeta;
  }

  private async persistMeta(meta: LogStoreMeta) {
    await writeFile(this.metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
  }

  private async listLogFiles() {
    const entries = await readdir(this.logDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name))
      .map((entry) => ({
        name: entry.name,
        path: path.join(this.logDir, entry.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    return files;
  }

  private async pruneFiles() {
    const files = await this.listLogFiles();
    if (!files.length) {
      return;
    }

    const keepAfter = new Date();
    keepAfter.setUTCDate(keepAfter.getUTCDate() - (this.retentionDays - 1));
    const keepDateKey = keepAfter.toISOString().slice(0, 10);

    for (const file of files) {
      if (file.name.slice(0, 10) < keepDateKey) {
        await unlink(file.path).catch(() => undefined);
      }
    }

    const retainedFiles = await this.listLogFiles();
    const sizedFiles = await Promise.all(
      retainedFiles.map(async (file) => ({
        ...file,
        size: (await stat(file.path)).size,
      })),
    );

    let totalBytes = sizedFiles.reduce((sum, file) => sum + file.size, 0);
    for (let index = 0; index < sizedFiles.length - 1 && totalBytes > this.maxTotalBytes; index += 1) {
      const file = sizedFiles[index];
      await unlink(file.path).catch(() => undefined);
      totalBytes -= file.size;
    }
  }

  private hydrateEntry(entry: LogEntry) {
    const current = this.cache.get(entry.id);
    if (!current || isEntryNewer(entry, current)) {
      this.cache.set(entry.id, entry);
    }
  }

  private async loadFromFiles() {
    this.cache.clear();
    const files = await this.listLogFiles();

    for (const file of files) {
      const raw = await readFile(file.path, "utf-8").catch(() => "");
      const lines = raw.split(/\r?\n/).filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Partial<LogEntry>;
          if (parsed.kind === "operation" && isObjectRecord(parsed.operation)) {
            const operation = normalizeOperationEntry(parsed.operation as Partial<OperationLogEntry>);
            this.hydrateEntry(
              buildOperationRecord(operation),
            );
            continue;
          }

          if (parsed.kind === "event") {
            this.hydrateEntry(normalizeEventEntry(parsed as Partial<EventLogEntry>));
          }
        } catch {}
      }
    }
  }

  private async appendEntries(entries: LogEntry[]) {
    if (!entries.length) {
      return;
    }

    await this.enqueueWrite(async () => {
      await mkdir(this.logDir, { recursive: true });

      for (const entry of entries) {
        await appendFile(this.getLogFilePath(entry.updatedAt), `${JSON.stringify(entry)}\n`, "utf-8");
      }

      await this.pruneFiles();
    });

    for (const entry of entries) {
      this.hydrateEntry(structuredClone(entry));
      if (entry.kind === "operation") {
        for (const listener of Array.from(this.operationListeners)) {
          listener(structuredClone(entry.operation));
        }
      }
    }
  }

  private async runLegacyImports() {
    const meta = await this.loadMeta();
    let mutated = false;

    if (!meta.imports.legacyJson) {
      const parsed = await readJsonFileIfExists<unknown>(this.legacyOperationLogFile);
      const migrated = migratePersistedOperations(parsed);
      if (migrated.items.length) {
        const entries = migrated.items.map((item) => buildOperationRecord(item));
        await this.appendEntries(entries.filter((entry) => !this.cache.has(entry.id)));
      }
      meta.imports.legacyJson = true;
      mutated = true;
    }

    if (!meta.imports.legacyDb) {
      if (db && this.legacyDbImportLimit > 0) {
        try {
          const rows = await db
            .select()
            .from(operationLogs)
            .orderBy(desc(operationLogs.updatedAt))
            .limit(this.legacyDbImportLimit);

          const entries = rows
            .map(mapDbOperationRow)
            .map((item) => buildOperationRecord(item))
            .filter((entry) => !this.cache.has(entry.id));

          if (entries.length) {
            await this.appendEntries(entries);
          }
        } catch {}
      }

      meta.imports.legacyDb = true;
      mutated = true;
    }

    if (mutated) {
      await this.persistMeta(meta);
    }
  }

  async listRecentLogs(query: LogListQuery = {}): Promise<LogListResponse> {
    await this.ensureInitialized();

    const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
    const cursor = decodeCursor(query.cursor);
    const normalizedQuery = query.q?.trim().toLowerCase() ?? "";

    const filtered = Array.from(this.cache.values())
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

    const items = filtered.slice(0, limit).map((entry) => structuredClone(entry));
    const hasMore = filtered.length > items.length;
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
    const entry = this.cache.get(id);
    return entry ? structuredClone(entry) : null;
  }

  async listRecentOperations(limit = 50) {
    const response = await this.listRecentLogs({
      kind: "operation",
      limit,
    });

    return response.items
      .filter((entry): entry is OperationLogRecord => entry.kind === "operation")
      .map((entry) => entry.operation);
  }

  async getOperationById(id: string) {
    const entry = await this.getLogById(id);
    return entry?.kind === "operation" ? entry.operation : null;
  }

  async findActiveRetryFor(operationId: string) {
    const operations = await this.listRecentOperations(200);
    return operations.find(
      (item) =>
        item.retryOfOperationId === operationId &&
        (item.status === "queued" || item.status === "running"),
    ) ?? null;
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

    await this.appendEntries([buildOperationRecord(operation)]);
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

    await this.appendEntries([buildOperationRecord(operation)]);
    return structuredClone(operation);
  }

  async createEvent(input: CreateEventLogInput) {
    await this.ensureInitialized();
    const timestamp = new Date().toISOString();
    const entry = normalizeEventEntry({
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

    await this.appendEntries([entry]);
    return structuredClone(entry);
  }

  subscribeToOperations(listener: (entry: OperationLogEntry) => void) {
    this.operationListeners.add(listener);
    return () => {
      this.operationListeners.delete(listener);
    };
  }
}

export const fileLogStore: LogStorePort = new LogStore();
