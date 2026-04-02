import type {
  EventLogEntry,
  LogChannel,
  LogEntry,
  LogEventType,
  LogLevel,
  LogListQuery,
  LogListResponse,
} from "@shared/logs";
import type {
  OperationChannel,
  OperationLogEntry,
  OperationMode,
  OperationResultSummary,
  OperationStatus,
  OperationTargetType,
} from "@shared/operations";

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

export interface LogStorePort {
  listRecentLogs(query?: LogListQuery): Promise<LogListResponse>;
  getLogById(id: string): Promise<LogEntry | null>;
  listRecentOperations(limit?: number): Promise<OperationLogEntry[]>;
  getOperationById(id: string): Promise<OperationLogEntry | null>;
  findActiveRetryFor(operationId: string): Promise<OperationLogEntry | null>;
  createOperation(input: CreateOperationInput): Promise<OperationLogEntry>;
  updateOperation(id: string, patch: UpdateOperationInput): Promise<OperationLogEntry | null>;
  createEvent(input: CreateEventLogInput): Promise<EventLogEntry>;
  subscribeToOperations(listener: (entry: OperationLogEntry) => void): () => void;
}
