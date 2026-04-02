import { beforeEach, describe, expect, it } from "vitest";
import { resetChannelAdapterStates } from "../adapters/channel-adapter";
import { syncChannels } from "./catalog-sync";
import { validateDraft } from "./draft-service";
import { executeDraft, retryFailedRun } from "./execution-service";
import { storage } from "../storage";

async function createDraft(input: Parameters<typeof storage.createDraft>[0]) {
  const draft = await storage.createDraft(input);
  return draft.id;
}

describe("price control flow", () => {
  beforeEach(async () => {
    await storage.reset();
    resetChannelAdapterStates();
  });

  it("validates draft items and keeps their original order", async () => {
    await syncChannels(["naver", "coupang"]);

    const draftId = await createDraft({
      source: "manual",
      status: "draft",
      note: "validation test",
      csvFileName: null,
      createdBy: "tester",
      summaryJson: {},
    });

    await storage.addDraftItems(draftId, [
      {
        channel: "naver",
        optionSku: "OPT-1001-RED",
        requestedPatch: { price: 17000 },
      },
      {
        channel: "coupang",
        optionSku: "UNKNOWN",
        requestedPatch: { price: 9900 },
      },
      {
        channel: "coupang",
        optionSku: "OPT-2001-L",
        requestedPatch: {},
      },
    ]);

    const result = await validateDraft(draftId);

    expect(result.previewRows.map((row) => row.validationStatus)).toEqual([
      "valid",
      "invalid",
      "invalid",
    ]);
    expect(result.draft?.summaryJson).toEqual({
      total: 3,
      validCount: 1,
      invalidCount: 2,
    });
  });

  it("executes draft items with per-channel concurrency while preserving result order", async () => {
    await syncChannels(["naver", "coupang"]);

    const draftId = await createDraft({
      source: "manual",
      status: "draft",
      note: "execute test",
      csvFileName: null,
      createdBy: "tester",
      summaryJson: {},
    });

    await storage.addDraftItems(draftId, [
      {
        channel: "naver",
        optionSku: "OPT-1001-RED",
        requestedPatch: { price: 16500 },
      },
      {
        channel: "naver",
        optionSku: "OPT-3001-BLACK",
        requestedPatch: { price: 24500 },
      },
      {
        channel: "coupang",
        optionSku: "OPT-2001-L",
        requestedPatch: {},
      },
    ]);

    const detail = await executeDraft(draftId, "tester");

    expect(detail?.items.map((item) => item.status)).toEqual([
      "succeeded",
      "failed",
      "skipped",
    ]);
    expect(detail?.run.summaryJson).toEqual({
      total: 3,
      succeeded: 1,
      failed: 1,
      skipped: 1,
    });

    const retryDetail = await retryFailedRun(detail!.run.id, "tester");
    expect(retryDetail?.items).toHaveLength(1);
    expect(retryDetail?.items[0]).toMatchObject({
      status: "failed",
      optionSku: "OPT-3001-BLACK",
    });
  });
});
