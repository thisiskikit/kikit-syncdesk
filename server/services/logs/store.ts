import type { LogStorePort } from "../../interfaces/log-store";
import { LogStore, fileLogStore } from "../../stores/file-log-store";

export type {
  CreateEventLogInput,
  CreateOperationInput,
  LogStorePort,
  UpdateOperationInput,
} from "../../interfaces/log-store";
export { LogStore };

export const logStore: LogStorePort = fileLogStore;
