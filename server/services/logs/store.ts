import type { LogStorePort } from "../../interfaces/log-store";
import { LogStore } from "../../stores/file-log-store";
import { workDataLogStore } from "../../stores/work-data-log-store";

export type {
  CreateEventLogInput,
  CreateOperationInput,
  LogStorePort,
  UpdateOperationInput,
} from "../../interfaces/log-store";
export { LogStore };

export const logStore: LogStorePort = workDataLogStore;
