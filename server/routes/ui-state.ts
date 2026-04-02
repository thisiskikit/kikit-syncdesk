import { Router } from "express";
import { sendData, sendError } from "../services/shared/api-response";
import { uiStateStore } from "../services/ui-state-store";

const router = Router();

router.get("/", async (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key.trim() : "";

  if (!key) {
    sendError(res, 400, {
      code: "INVALID_MENU_KEY",
      message: "key is required.",
    });
    return;
  }

  try {
    const item = await uiStateStore.get(key);
    sendData(res, { item });
  } catch (error) {
    sendError(res, 500, {
      code: "UI_STATE_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load menu state.",
    });
  }
});

router.put("/", async (req, res) => {
  const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
  const value =
    req.body?.value && typeof req.body.value === "object" && !Array.isArray(req.body.value)
      ? (req.body.value as Record<string, unknown>)
      : null;

  if (!key) {
    sendError(res, 400, {
      code: "INVALID_MENU_KEY",
      message: "key is required.",
    });
    return;
  }

  if (!value) {
    sendError(res, 400, {
      code: "INVALID_MENU_VALUE",
      message: "value must be an object.",
    });
    return;
  }

  try {
    const item = await uiStateStore.set(key, value);
    sendData(res, { item });
  } catch (error) {
    sendError(res, 500, {
      code: "UI_STATE_WRITE_FAILED",
      message: error instanceof Error ? error.message : "Failed to save menu state.",
    });
  }
});

export default router;
