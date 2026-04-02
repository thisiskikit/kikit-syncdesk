import type { RequestHandler } from "express";
import type { ConnectionTestResult } from "@shared/channel-settings";
import type {
  TestCoupangConnectionInput,
  UpsertCoupangStoreInput,
} from "@shared/coupang";
import {
  coupangSettingsStore,
  resolveCoupangTestInput,
} from "../../../services/coupang/settings-store";
import { testConnection } from "../../../services/coupang/product-service";
import {
  registerOperationRetryHandler,
  runTrackedOperation,
  summarizeResult,
} from "../../../services/operations/service";
import {
  sendCreated,
  sendData,
  sendError,
} from "../../../services/shared/api-response";
import { COUPANG_CONNECTION_MENU_KEY } from "../../coupang/constants";
import { buildConnectionPayload } from "../../coupang/payloads";

let retryHandlersRegistered = false;

export function registerCoupangStoreRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerOperationRetryHandler(
    {
      channel: "coupang",
      menuKey: COUPANG_CONNECTION_MENU_KEY,
      actionKey: "test-connection",
    },
    async ({ operation, requestPayload }) => {
      const request = (requestPayload ?? {}) as Record<string, unknown>;
      const storeId = typeof request.storeId === "string" ? request.storeId : undefined;
      const savedStore = storeId ? await coupangSettingsStore.getStore(storeId) : null;

      if (!savedStore) {
        throw new Error("Saved Coupang store is required for retry.");
      }

      return runTrackedOperation({
        channel: "coupang",
        menuKey: COUPANG_CONNECTION_MENU_KEY,
        actionKey: "test-connection",
        mode: "retry",
        targetType: "store",
        targetCount: 1,
        targetIds: [savedStore.id],
        requestPayload: buildConnectionPayload({
          storeId: savedStore.id,
          vendorId: savedStore.vendorId,
          accessKey: savedStore.credentials.accessKey,
          baseUrl: savedStore.baseUrl,
        }),
        normalizedPayload: buildConnectionPayload({
          storeId: savedStore.id,
          vendorId: savedStore.vendorId,
          accessKey: savedStore.credentials.accessKey,
          baseUrl: savedStore.baseUrl,
        }),
        retryable: true,
        retryOfOperationId: operation.id,
        execute: async () => {
          const result = await testConnection({
            storeId: savedStore.id,
            vendorId: savedStore.vendorId,
            accessKey: savedStore.credentials.accessKey,
            secretKey: savedStore.credentials.secretKey,
            baseUrl: savedStore.baseUrl,
          });

          await coupangSettingsStore.updateConnectionTest(savedStore.id, result);

          return {
            data: result,
            status: result.status === "success" ? "success" : "warning",
            resultSummary: summarizeResult({
              headline: result.message,
              detail: `COUPANG store ${savedStore.storeName}`,
              stats: { status: result.status },
              preview: result.message,
            }),
          };
        },
      });
    },
  );
}

export const listStoresHandler: RequestHandler = async (_req, res) => {
  try {
    const items = await coupangSettingsStore.listStoreSummaries();
    sendData(res, { items });
  } catch (error) {
    sendError(res, 500, {
      code: "COUPANG_SETTINGS_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang settings.",
    });
  }
};

export const saveStoreHandler: RequestHandler = async (req, res) => {
  try {
    const item = await coupangSettingsStore.saveStore(req.body as UpsertCoupangStoreInput);
    sendCreated(res, { item, message: "Saved." });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SETTINGS_SAVE_FAILED",
      message: error instanceof Error ? error.message : "Failed to save Coupang settings.",
    });
  }
};

export const testStoreConnectionHandler: RequestHandler = async (req, res) => {
  try {
    const input = req.body as TestCoupangConnectionInput;
    const savedStore = input.storeId ? await coupangSettingsStore.getStore(input.storeId) : null;
    const resolved = resolveCoupangTestInput(input, savedStore?.credentials.secretKey);
    const canRetry = Boolean(savedStore);

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_CONNECTION_MENU_KEY,
      actionKey: "test-connection",
      mode: "foreground",
      targetType: "store",
      targetCount: 1,
      targetIds: savedStore ? [savedStore.id] : [],
      requestPayload: buildConnectionPayload({
        storeId: savedStore?.id ?? null,
        vendorId: resolved.vendorId,
        accessKey: resolved.accessKey,
        baseUrl: resolved.baseUrl,
      }),
      normalizedPayload: buildConnectionPayload({
        storeId: savedStore?.id ?? null,
        vendorId: resolved.vendorId,
        accessKey: resolved.accessKey,
        baseUrl: resolved.baseUrl,
      }),
      retryable: canRetry,
      execute: async () => {
        const result = await testConnection(resolved);
        return {
          data: result,
          status: result.status === "success" ? "success" : "warning",
          resultSummary: summarizeResult({
            headline: result.message,
            detail: `COUPANG vendor ${resolved.vendorId}`,
            stats: { status: result.status },
            preview: result.message,
          }),
        };
      },
    });

    if (savedStore) {
      await coupangSettingsStore.updateConnectionTest(
        savedStore.id,
        tracked.data as ConnectionTestResult,
      );
    }

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_CONNECTION_TEST_FAILED",
      message: error instanceof Error ? error.message : "Failed to test Coupang connection.",
    });
  }
};
