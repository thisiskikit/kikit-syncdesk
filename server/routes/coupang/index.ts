import { Router } from "express";
import exchangesRouter from "./exchanges";
import ordersRouter from "./orders";
import productsRouter from "./products";
import returnsRouter from "./returns";
import settlementsRouter from "./settlements";
import shipmentsRouter from "./shipments";
import storesRouter from "./stores";

const router = Router();

router.use("/stores", storesRouter);
router.use("/products", productsRouter);
router.use("/", ordersRouter);
router.use("/shipments", shipmentsRouter);
router.use("/returns", returnsRouter);
router.use("/exchanges", exchangesRouter);
router.use("/settlements", settlementsRouter);

export default router;
