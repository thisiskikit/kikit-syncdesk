import type { RequestHandler } from "express";
import { listSettlements } from "../../../services/coupang/order-service";
import { sendData, sendError } from "../../../services/shared/api-response";
import { parsePositiveInteger } from "../../coupang/parsers";
import { ensureStoreId } from "../../coupang/tracked-actions";

export const listSettlementsHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    sendData(
      res,
      await listSettlements({
        storeId,
        recognitionDateFrom:
          typeof req.query.recognitionDateFrom === "string"
            ? req.query.recognitionDateFrom
            : undefined,
        recognitionDateTo:
          typeof req.query.recognitionDateTo === "string"
            ? req.query.recognitionDateTo
            : undefined,
        token: typeof req.query.token === "string" ? req.query.token : null,
        maxPerPage: parsePositiveInteger(req.query.maxPerPage, 50),
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SETTLEMENTS_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang settlements.",
    });
  }
};
