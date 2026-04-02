import { Router } from "express";
import {
  approveCancelClaimHandler,
  approveReturnClaimHandler,
  holdExchangeClaimHandler,
  holdReturnClaimHandler,
  listClaimsHandler,
  redeliverExchangeClaimHandler,
  rejectExchangeClaimHandler,
  rejectReturnClaimHandler,
  releaseExchangeHoldClaimHandler,
  releaseReturnHoldClaimHandler,
} from "../http/handlers/naver-claims";

const router = Router();

router.get("/claims", listClaimsHandler);
router.post("/claims/cancel/approve", approveCancelClaimHandler);
router.post("/claims/return/approve", approveReturnClaimHandler);
router.post("/claims/return/hold", holdReturnClaimHandler);
router.post("/claims/return/release-hold", releaseReturnHoldClaimHandler);
router.post("/claims/return/reject", rejectReturnClaimHandler);
router.post("/claims/exchange/hold", holdExchangeClaimHandler);
router.post("/claims/exchange/release-hold", releaseExchangeHoldClaimHandler);
router.post("/claims/exchange/reject", rejectExchangeClaimHandler);
router.post("/claims/exchange/redeliver", redeliverExchangeClaimHandler);

export default router;
