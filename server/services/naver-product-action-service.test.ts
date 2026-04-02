import { beforeEach, describe, expect, it, vi } from "vitest";

const { storageMock, getStoreMock, saveLegacyMemoMock } = vi.hoisted(() => ({
  storageMock: {
    listCatalogOptionsByChannelProduct: vi.fn(),
    createDraft: vi.fn(),
    addDraftItems: vi.fn(),
  },
  getStoreMock: vi.fn(),
  saveLegacyMemoMock: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: storageMock,
}));

vi.mock("./channel-settings-store", () => ({
  channelSettingsStore: {
    getStore: getStoreMock,
  },
}));

vi.mock("./product-library-service", () => ({
  saveLegacyNaverProductMemo: saveLegacyMemoMock,
}));

import {
  createNaverProductStatusDraft,
  updateNaverProductMemo,
} from "./naver-product-action-service";

describe("naver-product-action-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoreMock.mockResolvedValue({
      id: "store-1",
      channel: "naver",
      storeName: "Test Store",
    });
  });

  it("creates a draft from all matched NAVER catalog options for a product", async () => {
    storageMock.listCatalogOptionsByChannelProduct.mockResolvedValue([
      {
        id: "row-1",
        channel: "naver",
        channelProductId: "channel-100",
        channelOptionId: "option-1",
        sellerProductCode: null,
        productName: "상품 A",
        optionName: "빨강",
        price: 1000,
        stockQuantity: 10,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
        masterSku: "master-1",
        optionSku: "sku-1",
        mappingSource: "sync",
        syncedAt: "2026-03-22T00:00:00.000Z",
      },
      {
        id: "row-2",
        channel: "naver",
        channelProductId: "channel-100",
        channelOptionId: "option-2",
        sellerProductCode: null,
        productName: "상품 A",
        optionName: "파랑",
        price: 1000,
        stockQuantity: 10,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
        masterSku: "master-1",
        optionSku: "sku-2",
        mappingSource: "sync",
        syncedAt: "2026-03-22T00:00:00.000Z",
      },
    ]);
    storageMock.createDraft.mockResolvedValue({ id: "draft-1" });
    storageMock.addDraftItems.mockResolvedValue([]);

    const result = await createNaverProductStatusDraft({
      storeId: "store-1",
      originProductNo: "100",
      channelProductNo: "channel-100",
      productName: "상품 A",
    });

    expect(result).toEqual({
      draftId: "draft-1",
      matchedItemCount: 2,
    });
    expect(storageMock.listCatalogOptionsByChannelProduct).toHaveBeenCalledWith({
      channel: "naver",
      channelProductId: "channel-100",
    });
    expect(storageMock.addDraftItems).toHaveBeenCalledWith("draft-1", [
      {
        channel: "naver",
        masterSku: "master-1",
        optionSku: "sku-1",
        channelProductId: "channel-100",
        channelOptionId: "option-1",
        requestedPatch: {},
      },
      {
        channel: "naver",
        masterSku: "master-1",
        optionSku: "sku-2",
        channelProductId: "channel-100",
        channelOptionId: "option-2",
        requestedPatch: {},
      },
    ]);
  });

  it("returns a sync guidance error when no catalog options match the product", async () => {
    storageMock.listCatalogOptionsByChannelProduct.mockResolvedValue([]);

    await expect(
      createNaverProductStatusDraft({
        storeId: "store-1",
        originProductNo: "100",
        channelProductNo: "channel-100",
        productName: "상품 A",
      }),
    ).rejects.toThrow("카탈로그 동기화 후 다시 시도해 주세요.");
  });

  it("persists product memos through the product library service", async () => {
    saveLegacyMemoMock.mockResolvedValue({
      storeId: "store-1",
      channelProductId: "100",
      memo: "메모 내용",
      updatedAt: "2026-03-22T00:00:00.000Z",
    });

    const result = await updateNaverProductMemo({
      storeId: "store-1",
      originProductNo: "100",
      productName: "상품 A",
      memo: "메모 내용",
    });

    expect(result.memo).toBe("메모 내용");
    expect(saveLegacyMemoMock).toHaveBeenCalledWith({
      storeId: "store-1",
      originProductNo: "100",
      productName: "상품 A",
      memo: "메모 내용",
    });
  });
});
