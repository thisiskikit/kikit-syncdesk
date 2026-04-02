import { Router } from "express";
import {
  createBulkPriceRunHandler,
  createRulePresetHandler,
  createSourcePresetHandler,
  deleteBulkPriceRunHandler,
  deleteRulePresetHandler,
  deleteSourcePresetHandler,
  getBulkPriceRunHandler,
  getBulkPriceRunLiveHandler,
  getSourceMetadataHandler,
  listBulkPriceRunsHandler,
  listRulePresetsHandler,
  listSourcePresetsHandler,
  pauseBulkPriceRunHandler,
  previewBulkPriceHandler,
  resumeBulkPriceRunHandler,
  stopBulkPriceRunHandler,
  updateRulePresetHandler,
  updateSourcePresetHandler,
} from "../http/handlers/coupang-bulk-price";

const router = Router();

router.get("/bulk-price/source/metadata", getSourceMetadataHandler);
router.get("/bulk-price/source-presets", listSourcePresetsHandler);
router.post("/bulk-price/source-presets", createSourcePresetHandler);
router.put("/bulk-price/source-presets/:id", updateSourcePresetHandler);
router.delete("/bulk-price/source-presets/:id", deleteSourcePresetHandler);
router.get("/bulk-price/rule-presets", listRulePresetsHandler);
router.post("/bulk-price/rule-presets", createRulePresetHandler);
router.put("/bulk-price/rule-presets/:id", updateRulePresetHandler);
router.delete("/bulk-price/rule-presets/:id", deleteRulePresetHandler);
router.post("/bulk-price/preview", previewBulkPriceHandler);
router.post("/bulk-price/runs", createBulkPriceRunHandler);
router.get("/bulk-price/runs", listBulkPriceRunsHandler);
router.get("/bulk-price/runs/:id", getBulkPriceRunHandler);
router.post("/bulk-price/runs/:id/live", getBulkPriceRunLiveHandler);
router.delete("/bulk-price/runs/:id", deleteBulkPriceRunHandler);
router.post("/bulk-price/runs/:id/pause", pauseBulkPriceRunHandler);
router.post("/bulk-price/runs/:id/resume", resumeBulkPriceRunHandler);
router.post("/bulk-price/runs/:id/stop", stopBulkPriceRunHandler);

export default router;
