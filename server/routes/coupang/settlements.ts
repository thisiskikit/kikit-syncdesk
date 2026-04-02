import { Router } from "express";
import { listSettlementsHandler } from "../../http/handlers/coupang/settlements";

const router = Router();

router.get("/", listSettlementsHandler);

export default router;
