import { Router } from "express";
import {
  confirmExchangeInboundHandler,
  getExchangeDetailHandler,
  listExchangesHandler,
  rejectExchangeHandler,
  uploadExchangeInvoiceHandler,
} from "../../http/handlers/coupang/exchanges";

const router = Router();

router.get("/", listExchangesHandler);
router.get("/detail", getExchangeDetailHandler);
router.post("/receive-confirmation", confirmExchangeInboundHandler);
router.post("/reject", rejectExchangeHandler);
router.post("/invoices", uploadExchangeInvoiceHandler);

export default router;
