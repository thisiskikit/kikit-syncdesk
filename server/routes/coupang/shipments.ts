import { Router } from "express";
import {
  collectShipmentWorksheetHandler,
  getShipmentWorksheetDetailHandler,
  getShipmentWorksheetHandler,
  patchShipmentWorksheetHandler,
  updateInvoiceHandler,
  uploadInvoiceHandler,
} from "../../http/handlers/coupang/shipments";

const router = Router();

router.get("/worksheet", getShipmentWorksheetHandler);
router.get("/worksheet/detail", getShipmentWorksheetDetailHandler);
router.post("/collect", collectShipmentWorksheetHandler);
router.patch("/worksheet", patchShipmentWorksheetHandler);
router.post("/invoices/upload", uploadInvoiceHandler);
router.post("/invoices/update", updateInvoiceHandler);

export default router;
