import type { OperationLogEntry } from "@shared/operations";
import {
  logStore,
  type CreateOperationInput,
  type UpdateOperationInput,
} from "../logs/store";

export type { CreateOperationInput, UpdateOperationInput };

export class OperationStore {
  async listRecent(limit = 50) {
    return logStore.listRecentOperations(limit);
  }

  async getById(id: string) {
    return logStore.getOperationById(id);
  }

  async findActiveRetryFor(operationId: string) {
    return logStore.findActiveRetryFor(operationId);
  }

  async create(input: CreateOperationInput) {
    return logStore.createOperation(input);
  }

  async update(id: string, patch: UpdateOperationInput) {
    return logStore.updateOperation(id, patch);
  }

  subscribe(listener: (entry: OperationLogEntry) => void) {
    return logStore.subscribeToOperations(listener);
  }
}

export const operationStore = new OperationStore();
