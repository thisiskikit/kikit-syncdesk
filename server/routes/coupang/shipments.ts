import { Router } from "express";
import {
  applyShipmentWorksheetInvoiceInputHandler,
  collectShipmentWorksheetHandler,
  getShipmentWorksheetDetailHandler,
  getShipmentWorksheetHandler,
  getShipmentWorksheetViewHandler,
  patchShipmentWorksheetHandler,
  resolveShipmentWorksheetBulkRowsHandler,
  updateInvoiceHandler,
  uploadInvoiceHandler,
} from "../../http/handlers/coupang/shipments";

const router = Router();

router.get("/worksheet", getShipmentWorksheetHandler);
router.get("/worksheet/view", getShipmentWorksheetViewHandler);
router.get("/worksheet/detail", getShipmentWorksheetDetailHandler);
router.post("/collect", collectShipmentWorksheetHandler);
router.patch("/worksheet", patchShipmentWorksheetHandler);
router.post("/worksheet/invoice-input/apply", applyShipmentWorksheetInvoiceInputHandler);
router.post("/worksheet/resolve", resolveShipmentWorksheetBulkRowsHandler);
router.post("/invoices/upload", uploadInvoiceHandler);
router.post("/invoices/update", updateInvoiceHandler);

export default router;
