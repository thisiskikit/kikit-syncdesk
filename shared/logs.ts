import {
  getOperationActionLabel,
  getOperationErrorSummary,
  getOperationMenuLabel,
  getOperationResultSummaryText,
  getOperationTitle,
  operationChannels,
  operationStatuses,
  type OperationChannel,
  type OperationLogEntry,
  type OperationStatus,
} from "./operations";

export const logKinds = ["operation", "event"] as const;
export type LogKind = (typeof logKinds)[number];

export const logLevels = ["info", "warning", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

export const logChannels = [...operationChannels, "system"] as const;
export type LogChannel = (typeof logChannels)[number];

export const logEventTypes = ["api", "external", "startup", "system-error"] as const;
export type LogEventType = (typeof logEventTypes)[number];

export interface BaseLogEntry {
  id: string;
  kind: LogKind;
  channel: LogChannel;
  menuKey: string | null;
  actionKey: string | null;
  level: LogLevel;
  status: OperationStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  message: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationLogRecord extends BaseLogEntry {
  kind: "operation";
  eventType: null;
  operation: OperationLogEntry;
}

export interface EventLogEntry extends BaseLogEntry {
  kind: "event";
  eventType: LogEventType;
  operationId: string | null;
}

export type LogEntry = OperationLogRecord | EventLogEntry;

export interface LogListResponse {
  items: LogEntry[];
  nextCursor: string | null;
}

export interface LogDetailResponse {
  item: LogEntry | null;
}

export interface LogListQuery {
  kind?: LogKind | "all";
  channel?: LogChannel | "all";
  status?: OperationStatus | "all";
  level?: LogLevel | "all";
  slowOnly?: boolean;
  q?: string;
  limit?: number;
  cursor?: string | null;
}

export function isLogChannel(value: string): value is LogChannel {
  return (logChannels as readonly string[]).includes(value);
}

export function isLogKind(value: string): value is LogKind {
  return (logKinds as readonly string[]).includes(value);
}

export function isLogLevel(value: string): value is LogLevel {
  return (logLevels as readonly string[]).includes(value);
}

export function isOperationStatus(value: string): value is OperationStatus {
  return (operationStatuses as readonly string[]).includes(value);
}

export function getLogChannelLabel(channel: LogChannel) {
  if (channel === "system") {
    return "SYSTEM";
  }

  return channel.toUpperCase();
}

const eventTypeLabelMap: Record<LogEventType, string> = {
  api: "API",
  external: "External API",
  startup: "Startup",
  "system-error": "System Error",
};

export function getLogEventTypeLabel(eventType: LogEventType) {
  return eventTypeLabelMap[eventType];
}

export function getOperationLogMessage(operation: OperationLogEntry) {
  return getOperationErrorSummary(operation) ?? getOperationResultSummaryText(operation.resultSummary);
}

export function getLogTitle(entry: LogEntry) {
  if (entry.kind === "operation") {
    return getOperationTitle(entry.operation);
  }

  if (entry.eventType === "api") {
    const method = typeof entry.meta?.method === "string" ? entry.meta.method : "API";
    const path = typeof entry.meta?.path === "string" ? entry.meta.path : "";
    return `${method} ${path}`.trim();
  }

  if (entry.eventType === "external") {
    const provider = typeof entry.meta?.provider === "string" ? entry.meta.provider.toUpperCase() : "EXTERNAL";
    const method = typeof entry.meta?.method === "string" ? entry.meta.method : "";
    const path = typeof entry.meta?.path === "string" ? entry.meta.path : "";
    return [provider, method, path].filter(Boolean).join(" ");
  }

  if (entry.eventType === "startup") {
    return entry.actionKey ? `Startup / ${entry.actionKey}` : "Startup";
  }

  return entry.message ?? "System Error";
}

export function getLogSubtitle(entry: LogEntry) {
  if (entry.kind === "operation") {
    return `${getOperationMenuLabel(entry.operation.menuKey)} / ${getOperationActionLabel(entry.operation.actionKey)}`;
  }

  return entry.eventType ? getLogEventTypeLabel(entry.eventType) : null;
}
