import { Router } from "express";
import { syncChannels } from "../services/catalog-sync";
import { storage } from "../storage";
import { sendData, sendError } from "../services/shared/api-response";

const router = Router();

router.get("/sync-runs", async (_req, res) => {
  sendData(res, await storage.listSyncRuns());
});

router.post("/sync", async (req, res) => {
  try {
    const requested = Array.isArray(req.body?.channels) ? req.body.channels : ["naver", "coupang"];
    const channels = requested.filter(
      (value: string) => value === "naver" || value === "coupang",
    );
    const results = await syncChannels(channels);
    sendData(res, { items: results });
  } catch (error) {
    sendError(res, 500, {
      code: "SYNC_FAILED",
      message: error instanceof Error ? error.message : "Sync failed",
    });
  }
});

export default router;
