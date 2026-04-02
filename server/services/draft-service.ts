import {
  applyPatchToSnapshot,
  controlPatchSchema,
  hasControlPatchValues,
  type DraftItemInput,
  type DraftPreviewRow,
} from "@shared/channel-control";
import { validateMasterSkuReference } from "../integrations/master-sku";
import { storage } from "../storage";
import { mapWithConcurrency } from "./shared/async-control";

export const VALIDATION_CONCURRENCY = 8;

function normalizeMessages(input: unknown) {
  return Array.isArray(input)
    ? input.filter((item): item is string => typeof item === "string")
    : [];
}

export async function addDraftItems(draftId: string, items: DraftItemInput[]) {
  const draft = await storage.getDraft(draftId);
  if (!draft) {
    throw new Error("Draft not found");
  }

  return storage.addDraftItems(draftId, items);
}

export async function updateDraftItem(
  draftId: string,
  draftItemId: string,
  patch: {
    requestedPatch?: DraftItemInput["requestedPatch"];
    masterSku?: string | null;
    optionSku?: string | null;
    channelProductId?: string | null;
    channelOptionId?: string | null;
  },
) {
  const draft = await storage.getDraft(draftId);
  if (!draft) {
    throw new Error("Draft not found");
  }

  const item = await storage.updateDraftItem(draftItemId, {
    requestedPatchJson: patch.requestedPatch,
    masterSku: patch.masterSku,
    optionSku: patch.optionSku,
    channelProductId: patch.channelProductId,
    channelOptionId: patch.channelOptionId,
    validationStatus: "pending",
    validationMessagesJson: [],
  });

  if (!item) {
    throw new Error("Draft item not found");
  }

  return item;
}

export async function validateDraft(draftId: string) {
  const draft = await storage.getDraft(draftId);
  if (!draft) {
    throw new Error("Draft not found");
  }

  const items = await storage.listDraftItems(draftId);

  const validationResults = await mapWithConcurrency(
    items,
    VALIDATION_CONCURRENCY,
    async (item) => {
      const messages: string[] = [];
      const patchParse = controlPatchSchema.safeParse(item.requestedPatchJson);
      if (!patchParse.success) {
        messages.push(...patchParse.error.issues.map((issue) => issue.message));
      }
      if (patchParse.success && !hasControlPatchValues(patchParse.data)) {
        messages.push("가격, 재고, 판매상태 중 최소 1개는 수정되어야 합니다.");
      }

      const current = await storage.findCatalogOptionTarget({
        channel: item.channel,
        optionSku: item.optionSku,
        channelOptionId: item.channelOptionId,
      });

      if (!current) {
        messages.push("대상 옵션을 로컬 카탈로그 캐시에서 찾지 못했습니다. 먼저 sync가 필요합니다.");
      }

      const resolvedMasterSku = item.masterSku ?? current?.masterSku ?? null;
      const resolvedOptionSku = item.optionSku ?? current?.optionSku ?? null;
      const skuValidation = await validateMasterSkuReference({
        masterSku: resolvedMasterSku,
        optionSku: resolvedOptionSku,
      });

      if (!skuValidation.valid) {
        messages.push(skuValidation.message ?? "입력한 Master SKU 검증에 실패했습니다.");
      }

      const validationStatus = messages.length === 0 ? "valid" : "invalid";
      const next =
        current && patchParse.success
          ? applyPatchToSnapshot(current, patchParse.data)
          : {
              price: current?.price ?? null,
              stockQuantity: current?.stockQuantity ?? null,
              saleStatus: current?.saleStatus ?? null,
              soldOutStatus: current?.soldOutStatus ?? null,
            };

      return {
        validationStatus,
        previewRow: {
          draftItemId: item.id,
          validationStatus,
          messages,
          current,
          next,
        } satisfies DraftPreviewRow,
        storagePatch: {
          id: item.id,
          patch: {
            masterSku: resolvedMasterSku,
            optionSku: resolvedOptionSku,
            channelProductId: current?.channelProductId ?? item.channelProductId,
            channelOptionId: current?.channelOptionId ?? item.channelOptionId,
            currentSnapshotJson: current,
            validationStatus,
            validationMessagesJson: messages,
          },
        },
      };
    },
  );

  await storage.updateDraftItemsBatch(validationResults.map((result) => result.storagePatch));

  const summary = validationResults.reduce(
    (accumulator, result) => {
      if (result.validationStatus === "valid") {
        accumulator.validCount += 1;
      } else {
        accumulator.invalidCount += 1;
      }

      return accumulator;
    },
    {
      total: items.length,
      validCount: 0,
      invalidCount: 0,
    },
  );

  await storage.updateDraft(draftId, {
    status: summary.invalidCount === 0 ? "validated" : "draft",
    summaryJson: summary,
  });

  return {
    draft: await storage.getDraft(draftId),
    items: await storage.listDraftItems(draftId),
    previewRows: validationResults.map((result) => result.previewRow),
  };
}

export async function getDraftDetail(draftId: string) {
  const draft = await storage.getDraft(draftId);
  if (!draft) {
    throw new Error("Draft not found");
  }

  const items = await storage.listDraftItems(draftId);
  const previewRows = items.map<DraftPreviewRow>((item) => {
    const current = (item.currentSnapshotJson as DraftPreviewRow["current"]) ?? null;
    const patch = item.requestedPatchJson as DraftItemInput["requestedPatch"];

    return {
      draftItemId: item.id,
      validationStatus: item.validationStatus as DraftPreviewRow["validationStatus"],
      messages: normalizeMessages(item.validationMessagesJson),
      current,
      next:
        current && patch
          ? applyPatchToSnapshot(current, patch)
          : {
              price: current?.price ?? null,
              stockQuantity: current?.stockQuantity ?? null,
              saleStatus: current?.saleStatus ?? null,
              soldOutStatus: current?.soldOutStatus ?? null,
            },
    };
  });

  return { draft, items, previewRows };
}
