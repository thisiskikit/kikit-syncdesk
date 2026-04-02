import { Router } from "express";
import {
  getProductDetailHandler,
  listProductExplorerHandler,
  listProductsHandler,
  updateFullProductHandler,
  updatePartialProductHandler,
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
router.put("/partial", updatePartialProductHandler);
router.put("/full", updateFullProductHandler);
router.post("/price", updatePriceHandler);
router.post("/quantity", updateQuantityHandler);
router.post("/sale-status", updateSaleStatusHandler);

export default router;
