import { Router } from "express";
import {
  confirmOrdersHandler,
  delayDispatchHandler,
  dispatchOrdersHandler,
  getOrderDetailHandler,
  listOrdersHandler,
} from "../http/handlers/naver-orders";

const router = Router();

router.get("/orders", listOrdersHandler);
router.get("/orders/:productOrderId", getOrderDetailHandler);
router.post("/orders/confirm", confirmOrdersHandler);
router.post("/orders/dispatch", dispatchOrdersHandler);
router.post("/orders/delay-dispatch", delayDispatchHandler);

export default router;
