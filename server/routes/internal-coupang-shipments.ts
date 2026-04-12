import { Router } from "express";
import { runShipmentArchiveHandler } from "../http/handlers/coupang/shipments";

const router = Router();

router.post("/archive/run", runShipmentArchiveHandler);

export default router;
