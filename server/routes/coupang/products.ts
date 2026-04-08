import { Router } from "express";
import {
  getProductDetailHandler,
  listProductExplorerHandler,
  listProductsHandler,
  updatePriceHandler,
  updatePricesBulkHandler,
  updateQuantitiesBulkHandler,
  updateQuantityHandler,
  updateSaleStatusHandler,
  updateSaleStatusesBulkHandler,
} from "../../http/handlers/coupang/products";

const router = Router();

router.get("/", listProductsHandler);
router.get("/explorer", listProductExplorerHandler);
router.get("/detail", getProductDetailHandler);
router.post("/prices/bulk", updatePricesBulkHandler);
router.post("/quantities/bulk", updateQuantitiesBulkHandler);
router.post("/sale-status/bulk", updateSaleStatusesBulkHandler);
router.post("/price", updatePriceHandler);
router.post("/quantity", updateQuantityHandler);
router.post("/sale-status", updateSaleStatusHandler);

export default router;
