import { Router } from "express";
import {
  applyBulkPricesHandler,
  createStatusDraftHandler,
  getPricePreviewHandler,
  listProductsHandler,
  previewBulkPriceHandler,
  updateMemoHandler,
  updatePriceHandler,
} from "../http/handlers/naver-products";

const router = Router();

router.post("/products/price-preview/bulk", previewBulkPriceHandler);
router.post("/products/prices/bulk", applyBulkPricesHandler);
router.get("/products/price-preview", getPricePreviewHandler);
router.post("/products/price", updatePriceHandler);
router.post("/products/status-draft", createStatusDraftHandler);
router.put("/products/memo", updateMemoHandler);
router.get("/products", listProductsHandler);

export default router;
