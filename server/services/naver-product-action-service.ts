import type { DraftItemInput } from "@shared/channel-control";
import { type NaverProductMemoUpdateResponse, type NaverProductStatusDraftResponse } from "@shared/naver-products";
import { storage } from "../storage";
import { channelSettingsStore } from "./channel-settings-store";
import { saveLegacyNaverProductMemo } from "./product-library-service";

function buildSyncRequiredMessage() {
  return "카탈로그 동기화 후 다시 시도해 주세요.";
}

async function assertNaverStore(storeId: string) {
  const store = await channelSettingsStore.getStore(storeId);

  if (!store) {
    throw new Error("Naver store settings not found.");
  }

  if (store.channel !== "naver") {
    throw new Error("Selected store is not a NAVER store.");
  }

  return store;
}

export async function createNaverProductStatusDraft(input: {
  storeId: string;
  originProductNo: string;
  channelProductNo: string | null;
  productName: string;
}): Promise<NaverProductStatusDraftResponse> {
  await assertNaverStore(input.storeId);

  const channelProductId = input.channelProductNo?.trim() ?? "";

  if (!channelProductId) {
    throw new Error(buildSyncRequiredMessage());
  }

  const matchedRows = await storage.listCatalogOptionsByChannelProduct({
    channel: "naver",
    channelProductId,
  });

  if (!matchedRows.length) {
    throw new Error(buildSyncRequiredMessage());
  }

  const draft = await storage.createDraft({
    source: "manual",
    status: "draft",
    note: `NAVER 판매상태 작업: ${input.productName || input.originProductNo}`,
    csvFileName: null,
    createdBy: "system",
    summaryJson: {
      action: "naver_sale_status",
      storeId: input.storeId,
      originProductNo: input.originProductNo,
      channelProductNo: channelProductId,
      matchedItemCount: matchedRows.length,
    },
  });

  const items: DraftItemInput[] = matchedRows.map((row) => ({
    channel: row.channel,
    masterSku: row.masterSku,
    optionSku: row.optionSku,
    channelProductId: row.channelProductId,
    channelOptionId: row.channelOptionId,
    requestedPatch: {},
  }));

  await storage.addDraftItems(draft.id, items);

  return {
    draftId: draft.id,
    matchedItemCount: items.length,
  };
}

export async function updateNaverProductMemo(input: {
  storeId: string;
  originProductNo: string;
  productName?: string | null;
  memo: string;
}): Promise<NaverProductMemoUpdateResponse> {
  await assertNaverStore(input.storeId);

  const record = await saveLegacyNaverProductMemo({
    storeId: input.storeId,
    originProductNo: input.originProductNo,
    productName: input.productName,
    memo: input.memo,
  });

  return {
    storeId: input.storeId,
    originProductNo: input.originProductNo,
    memo: record.memo || null,
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
}
