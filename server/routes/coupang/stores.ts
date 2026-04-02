import { Router } from "express";
import {
  listStoresHandler,
  saveStoreHandler,
  testStoreConnectionHandler,
} from "../../http/handlers/coupang/stores";

const router = Router();

router.get("/", listStoresHandler);
router.post("/", saveStoreHandler);
router.post("/test-connection", testStoreConnectionHandler);

export default router;
