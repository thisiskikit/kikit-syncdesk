import { Router } from "express";
import {
  testChannelConnectionInputSchema,
  upsertChannelStoreInputSchema,
} from "@shared/channel-settings";
import { channelSettingsStore } from "../services/channel-settings-store";
import { testNaverConnection } from "../services/naver-auth";
import {
  sendCreated,
  sendData,
  sendError,
  sendNormalizedError,
} from "../services/shared/api-response";

const router = Router();

router.get("/stores", async (_req, res) => {
  try {
    const items = await channelSettingsStore.listStoreSummaries();
    sendData(res, { items });
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "SETTINGS_READ_FAILED",
      fallbackMessage: "Failed to load settings.",
      fallbackStatus: 500,
    });
  }
});

router.post("/stores", async (req, res) => {
  try {
    const input = upsertChannelStoreInputSchema.parse(req.body);
    const item = await channelSettingsStore.saveStore(input);
    sendCreated(res, { item, message: "Saved." });
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "SETTINGS_SAVE_FAILED",
      fallbackMessage: "Failed to save settings.",
      fallbackStatus: 400,
    });
  }
});

router.post("/stores/test-connection", async (req, res) => {
  try {
    const input = testChannelConnectionInputSchema.parse(req.body);
    const savedStore = input.storeId
      ? await channelSettingsStore.getStore(input.storeId)
      : null;

    if (input.storeId && !savedStore) {
      sendError(res, 404, {
        code: "STORE_NOT_FOUND",
        message: "Store not found.",
      });
      return;
    }

    const clientSecret =
      input.credentials.clientSecret && input.credentials.clientSecret.length > 0
        ? input.credentials.clientSecret
        : savedStore?.credentials.clientSecret ?? "";

    if (!clientSecret) {
      sendError(res, 400, {
        code: "MISSING_CLIENT_SECRET",
        message: "client_secret is required for connection test.",
      });
      return;
    }

    const result =
      input.channel === "naver"
        ? await testNaverConnection({
            clientId: input.credentials.clientId,
            clientSecret,
          })
        : {
            status: "failed" as const,
            testedAt: new Date().toISOString(),
            message: "Unsupported channel.",
          };

    const canPersistConnectionResult =
      Boolean(savedStore) &&
      savedStore?.channel === input.channel &&
      savedStore?.credentials.clientId === input.credentials.clientId &&
      !input.credentials.clientSecret;

    if (savedStore && canPersistConnectionResult) {
      await channelSettingsStore.updateConnectionTest(savedStore.id, result);
    }

    sendData(res, result);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "SETTINGS_CONNECTION_TEST_FAILED",
      fallbackMessage: "Failed to test connection.",
      fallbackStatus: 400,
    });
  }
});

export default router;
