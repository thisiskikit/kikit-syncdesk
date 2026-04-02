import { Router } from "express";
import { sendData } from "../services/shared/api-response";

const router = Router();

router.get("/", (_req, res) => {
  sendData(res, {
    status: "ok",
    nodeEnv: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

export default router;

