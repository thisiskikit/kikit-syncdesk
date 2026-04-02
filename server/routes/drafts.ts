import { Router } from "express";
import { addDraftItems, getDraftDetail, updateDraftItem, validateDraft } from "../services/draft-service";
import { storage } from "../storage";
import { sendCreated, sendData, sendError } from "../services/shared/api-response";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const draft = await storage.createDraft({
      source: req.body?.source || "manual",
      status: "draft",
      note: req.body?.note || null,
      csvFileName: req.body?.csvFileName || null,
      createdBy: req.body?.createdBy || "system",
      summaryJson: {},
    });
    sendCreated(res, draft);
  } catch (error) {
    sendError(res, 500, {
      code: "DRAFT_CREATE_FAILED",
      message: error instanceof Error ? error.message : "Draft create failed",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    sendData(res, await getDraftDetail(req.params.id));
  } catch (error) {
    sendError(res, 404, {
      code: "DRAFT_NOT_FOUND",
      message: error instanceof Error ? error.message : "Draft not found",
    });
  }
});

router.post("/:id/items", async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const created = await addDraftItems(req.params.id, items);
    if (req.body?.csvFileName) {
      await storage.updateDraft(req.params.id, { csvFileName: req.body.csvFileName });
    }
    sendData(res, { items: created });
  } catch (error) {
    sendError(res, 400, {
      code: "DRAFT_ITEM_CREATE_FAILED",
      message: error instanceof Error ? error.message : "Draft item create failed",
    });
  }
});

router.patch("/:id/items/:itemId", async (req, res) => {
  try {
    const item = await updateDraftItem(req.params.id, req.params.itemId, {
      requestedPatch: req.body?.requestedPatch,
      masterSku: req.body?.masterSku,
      optionSku: req.body?.optionSku,
      channelProductId: req.body?.channelProductId,
      channelOptionId: req.body?.channelOptionId,
    });
    sendData(res, item);
  } catch (error) {
    sendError(res, 400, {
      code: "DRAFT_ITEM_UPDATE_FAILED",
      message: error instanceof Error ? error.message : "Draft item update failed",
    });
  }
});

router.post("/:id/validate", async (req, res) => {
  try {
    sendData(res, await validateDraft(req.params.id));
  } catch (error) {
    sendError(res, 400, {
      code: "DRAFT_VALIDATE_FAILED",
      message: error instanceof Error ? error.message : "Draft validation failed",
    });
  }
});

router.get("/:id/preview", async (req, res) => {
  try {
    sendData(res, await validateDraft(req.params.id));
  } catch (error) {
    sendError(res, 400, {
      code: "DRAFT_PREVIEW_FAILED",
      message: error instanceof Error ? error.message : "Draft preview failed",
    });
  }
});

export default router;
