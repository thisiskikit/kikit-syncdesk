import { Router } from "express";
import { getNaverStats } from "../services/naver-stats-service";
import { sendData, sendError } from "../services/shared/api-response";

const router = Router();

function getErrorStatus(message: string) {
  return message.includes("required") || message.includes("valid") ? 400 : 502;
}

router.get("/stats", async (req, res) => {
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
      await getNaverStats({
        storeId,
        startDate,
        endDate,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load NAVER stats.";
    sendError(res, getErrorStatus(message), {
      code: getErrorStatus(message) === 400 ? "INVALID_NAVER_STATS_REQUEST" : "NAVER_STATS_API_FAILED",
      message,
    });
  }
});

export default router;
