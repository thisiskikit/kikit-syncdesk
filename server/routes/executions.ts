import { Router } from "express";
import { executeDraft, retryFailedRun } from "../services/execution-service";
import { storage } from "../storage";
import { sendData, sendError } from "../services/shared/api-response";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const detail = await executeDraft(req.body?.draftId, req.body?.createdBy || "system");
    sendData(res, detail);
  } catch (error) {
    sendError(res, 400, {
      code: "EXECUTION_FAILED",
      message: error instanceof Error ? error.message : "Execution failed",
    });
  }
});

router.get("/runs", async (_req, res) => {
  sendData(res, await storage.listExecutionRuns());
});

router.get("/runs/:id", async (req, res) => {
  const detail = await storage.getExecutionRunDetail(req.params.id);
  if (!detail) {
    sendError(res, 404, {
      code: "EXECUTION_RUN_NOT_FOUND",
      message: "Execution run not found",
    });
    return;
  }
  sendData(res, detail);
});

router.post("/runs/:id/retry-failures", async (req, res) => {
  try {
    sendData(res, await retryFailedRun(req.params.id, req.body?.createdBy || "system"));
  } catch (error) {
    sendError(res, 400, {
      code: "EXECUTION_RETRY_FAILED",
      message: error instanceof Error ? error.message : "Retry failed",
    });
  }
});

export default router;
