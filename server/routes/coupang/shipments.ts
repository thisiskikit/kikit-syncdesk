import { Router } from "express";
import {
  applyShipmentWorksheetInvoiceInputHandler,
  auditShipmentWorksheetMissingHandler,
  collectShipmentWorksheetHandler,
  getShipmentArchiveDetailHandler,
  getShipmentArchiveViewHandler,
  getShipmentWorksheetDetailHandler,
  getShipmentWorksheetHandler,
  getShipmentWorksheetViewHandler,
  patchShipmentWorksheetHandler,
  reconcileShipmentWorksheetLiveHandler,
  refreshShipmentWorksheetHandler,
  resolveShipmentWorksheetBulkRowsHandler,
  updateInvoiceHandler,
  uploadInvoiceHandler,
} from "../../http/handlers/coupang/shipments";

const router = Router();

router.get("/worksheet", getShipmentWorksheetHandler);
router.get("/worksheet/view", getShipmentWorksheetViewHandler);
router.get("/worksheet/detail", getShipmentWorksheetDetailHandler);
router.get("/archive/view", getShipmentArchiveViewHandler);
router.get("/archive/detail", getShipmentArchiveDetailHandler);
router.post("/collect", collectShipmentWorksheetHandler);
router.post("/worksheet/refresh", refreshShipmentWorksheetHandler);
router.post("/worksheet/reconcile-live", reconcileShipmentWorksheetLiveHandler);
router.patch("/worksheet", patchShipmentWorksheetHandler);
router.post("/worksheet/invoice-input/apply", applyShipmentWorksheetInvoiceInputHandler);
router.post("/worksheet/audit-missing", auditShipmentWorksheetMissingHandler);
router.post("/worksheet/resolve", resolveShipmentWorksheetBulkRowsHandler);
router.post("/invoices/upload", uploadInvoiceHandler);
router.post("/invoices/update", updateInvoiceHandler);

export default router;
