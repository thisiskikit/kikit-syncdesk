import { Router } from "express";
import { storage } from "../storage";
import { sendData, sendError } from "../services/shared/api-response";

const router = Router();

router.get("/options", async (req, res) => {
  try {
    const result = await storage.listCatalogOptions({
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      channel:
        typeof req.query.channel === "string"
          ? (req.query.channel as "naver" | "coupang" | "all")
          : "all",
      mapped:
        typeof req.query.mapped === "string"
          ? (req.query.mapped as "all" | "mapped" | "unmapped")
          : "all",
      limit: Number(req.query.limit ?? 50),
      offset: Number(req.query.offset ?? 0),
    });
    sendData(res, result);
  } catch (error) {
    sendError(res, 500, {
      code: "CATALOG_QUERY_FAILED",
      message: error instanceof Error ? error.message : "Catalog query failed",
    });
  }
});

export default router;
