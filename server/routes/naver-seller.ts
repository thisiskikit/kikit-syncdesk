import { Router } from "express";
import { getSellerInfo } from "../services/naver-seller-service";
import { sendData, sendError } from "../services/shared/api-response";

const router = Router();

router.get("/seller-info", async (req, res) => {
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";

  if (!storeId) {
    sendError(res, 400, { code: "MISSING_STORE_ID", message: "storeId is required." });
    return;
  }

  try {
    sendData(res, await getSellerInfo({ storeId }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load NAVER seller info.";
    sendError(res, 502, {
      code: "NAVER_SELLER_INFO_FAILED",
      message,
    });
  }
});

export default router;
