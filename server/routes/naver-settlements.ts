import { Router } from "express";
import { listSettlements } from "../services/naver-settlement-service";
import { sendData, sendError } from "../services/shared/api-response";

const router = Router();

function getErrorStatus(message: string) {
  return message.includes("required") || message.includes("valid") ? 400 : 502;
}

router.get("/settlements", async (req, res) => {
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : "";
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : "";

  if (!storeId) {
    sendError(res, 400, { code: "MISSING_STORE_ID", message: "storeId is required." });
    return;
  }

  if (!startDate || !endDate) {
    sendError(res, 400, { code: "MISSING_DATE_RANGE", message: "startDate and endDate are required." });
    return;
  }

  try {
    sendData(
      res,
      await listSettlements({
        storeId,
        startDate,
        endDate,
        refresh: req.query.refresh === "1",
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load NAVER settlements.";
    sendError(res, getErrorStatus(message), {
      code: getErrorStatus(message) === 400 ? "INVALID_NAVER_SETTLEMENT_REQUEST" : "NAVER_SETTLEMENT_API_FAILED",
      message,
    });
  }
});

export default router;
