import { Router } from "express";
import {
  approveReturnHandler,
  confirmReturnInboundHandler,
  getReturnDetailHandler,
  listReturnsHandler,
  markAlreadyShippedHandler,
  stopShipmentHandler,
  uploadReturnCollectionInvoiceHandler,
} from "../../http/handlers/coupang/returns";

const router = Router();

router.get("/", listReturnsHandler);
router.get("/detail", getReturnDetailHandler);
router.post("/stop-shipment", stopShipmentHandler);
router.post("/already-shipped", markAlreadyShippedHandler);
router.post("/receive-confirmation", confirmReturnInboundHandler);
router.post("/approve", approveReturnHandler);
router.post("/collection-invoice", uploadReturnCollectionInvoiceHandler);

export default router;
