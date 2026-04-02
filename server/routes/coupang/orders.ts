import { Router } from "express";
import {
  cancelOrdersHandler,
  getCustomerServiceSummaryHandler,
  getOrderDetailHandler,
  listOrdersHandler,
  markPreparingHandler,
} from "../../http/handlers/coupang/orders";

const router = Router();

router.get("/orders", listOrdersHandler);
router.post("/customer-service/summary", getCustomerServiceSummaryHandler);
router.get("/orders/detail", getOrderDetailHandler);
router.post("/orders/prepare", markPreparingHandler);
router.post("/orders/cancel", cancelOrdersHandler);

export default router;
