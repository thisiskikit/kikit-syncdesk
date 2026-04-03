import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./channel-settings-store", () => ({
  channelSettingsStore: {
    getStore: vi.fn(async () => ({
      id: "store-1",
      channel: "naver",
      storeName: "Test Store",
      credentials: {
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    })),
  },
}));

vi.mock("./naver-auth", () => ({
  issueNaverAccessToken: vi.fn(async () => ({
    accessToken: "test-token",
    expiresIn: 3600,
    tokenType: "Bearer",
  })),
}));

vi.mock("./naver-product-cache-store", () => ({
  naverProductCacheStore: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
  },
}));

vi.mock("./naver-product-seller-barcode-cache-store", () => ({
  naverProductSellerBarcodeCacheStore: {
    getMany: vi.fn(async () => new Map()),
    setMany: vi.fn(async () => undefined),
  },
}));

vi.mock("./product-library-service", () => ({
  listProductLibraryMemosByStore: vi.fn(async () => new Map()),
}));

import { naverProductSellerBarcodeCacheStore } from "./naver-product-seller-barcode-cache-store";
import {
  fetchNaverProductPricePreview,
  fetchNaverProducts,
  syncNaverProductAvailability,
  updateNaverProductSaleStatus,
  updateNaverProductSalePriceFromPreview,
} from "./naver-product-service";

function buildSearchPayload(input: {
  page: number;
  size: number;
  totalElements: number;
  itemCount: number;
}) {
  const totalPages = Math.max(1, Math.ceil(input.totalElements / input.size));
  const startNumber = (input.page - 1) * input.size + 1;

  return {
    contents: Array.from({ length: input.itemCount }, (_, index) => {
      const productNumber = startNumber + index;

      return {
        originProductNo: productNumber,
        channelProducts: [
          {
            originProductNo: productNumber,
            channelProductNo: `channel-${productNumber}`,
            name: `Product ${productNumber}`,
            sellerCodeInfo: {
              sellerBarcode: `BARCODE-${productNumber}`,
            },
            statusType: "SALE",
            channelProductDisplayStatusType: "ON",
            salePrice: productNumber * 10,
            discountedPrice: productNumber * 10,
            deliveryFee: 3000,
            stockQuantity: 5,
            regDate: "2026-03-22T00:00:00.000Z",
            modifiedDate: "2026-03-22T00:00:00.000Z",
          },
        ],
      };
    }),
    page: input.page,
    size: input.size,
    totalElements: input.totalElements,
    totalPages,
    first: input.page === 1,
    last: input.page >= totalPages,
  };
}

describe("fetchNaverProducts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("applies maxItems to the requested page and trims the last visible page", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          buildSearchPayload({
            page: 3,
            size: 100,
            totalElements: 260,
            itemCount: 60,
          }),
        ),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const response = await fetchNaverProducts({
      storeId: "store-1",
      page: 3,
      size: 100,
      maxItems: 230,
    });

    expect(response.page).toBe(3);
    expect(response.size).toBe(100);
    expect(response.availableTotalElements).toBe(260);
    expect(response.totalElements).toBe(230);
    expect(response.totalPages).toBe(3);
    expect(response.loadedCount).toBe(30);
    expect(response.items).toHaveLength(30);
    expect(response.items[0]?.originProductNo).toBe("201");
    expect(response.items[0]?.deliveryFee).toBe(3000);
    expect(response.items[0]?.sellerBarcode).toBe("BARCODE-201");
    expect(response.items.at(-1)?.originProductNo).toBe("230");
    expect(response.limitedByMaxItems).toBe(true);
    expect(response.last).toBe(true);
  });

  it("stops after the first page in all mode when maxItems fits in one request", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          buildSearchPayload({
            page: 1,
            size: 500,
            totalElements: 1200,
            itemCount: 500,
          }),
        ),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const response = await fetchNaverProducts({
      storeId: "store-1",
      all: true,
      maxItems: 400,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(response.totalElements).toBe(400);
    expect(response.loadedCount).toBe(400);
    expect(response.items).toHaveLength(400);
    expect(response.isTruncated).toBe(false);
    expect(response.limitedByMaxItems).toBe(true);
  });

  it("hydrates seller barcode from origin product detail when list data does not include it", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contents: [
              {
                originProductNo: 2001,
                channelProducts: [
                  {
                    originProductNo: 2001,
                    channelProductNo: "channel-2001",
                    name: "Product 2001",
                    statusType: "SALE",
                    channelProductDisplayStatusType: "ON",
                    salePrice: 10010,
                    discountedPrice: 10010,
                    deliveryFee: 3000,
                    stockQuantity: 5,
                    regDate: "2026-03-22T00:00:00.000Z",
                    modifiedDate: "2026-03-22T00:00:00.000Z",
                  },
                ],
              },
            ],
            page: 1,
            size: 1,
            totalElements: 1,
            totalPages: 1,
            first: true,
            last: true,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            originProduct: {
              originProductNo: 2001,
              sellerCodeInfo: {
                sellerBarcode: "BARCODE-2001",
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );

    const response = await fetchNaverProducts({
      storeId: "store-1",
      page: 1,
      size: 1,
      includeSellerBarcodes: true,
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(response.items[0]?.sellerBarcode).toBe("BARCODE-2001");
  });

  it("retries seller barcode hydration when NAVER temporarily rate limits origin detail", async () => {
    vi.useFakeTimers();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contents: [
              {
                originProductNo: 1001,
                channelProducts: [
                  {
                    originProductNo: 1001,
                    channelProductNo: "channel-1001",
                    name: "Product 1001",
                    statusType: "SALE",
                    channelProductDisplayStatusType: "ON",
                    salePrice: 10010,
                    discountedPrice: 10010,
                    deliveryFee: 3000,
                    stockQuantity: 5,
                    regDate: "2026-03-22T00:00:00.000Z",
                    modifiedDate: "2026-03-22T00:00:00.000Z",
                  },
                ],
              },
            ],
            page: 1,
            size: 1,
            totalElements: 1,
            totalPages: 1,
            first: true,
            last: true,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "요청이 많아 서비스를 일시적으로 사용할 수 없습니다.",
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            originProduct: {
              originProductNo: 1001,
              sellerCodeInfo: {
                sellerBarcode: "BARCODE-1001",
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );

    const promise = fetchNaverProducts({
      storeId: "store-1",
      all: true,
      maxItems: 1,
      refresh: true,
      includeSellerBarcodes: true,
    });

    await vi.runAllTimersAsync();
    const response = await promise;

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(response.items[0]?.sellerBarcode).toBe("BARCODE-1001");
  });

  it("reuses persisted seller barcode cache before calling origin product detail", async () => {
    vi.mocked(naverProductSellerBarcodeCacheStore.getMany).mockResolvedValueOnce(
      new Map([["1001", "BARCODE-1001"]]),
    );

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          contents: [
            {
              originProductNo: 1001,
              channelProducts: [
                {
                  originProductNo: 1001,
                  channelProductNo: "channel-1001",
                  name: "Product 1001",
                  statusType: "SALE",
                  channelProductDisplayStatusType: "ON",
                  salePrice: 10010,
                  discountedPrice: 10010,
                  deliveryFee: 3000,
                  stockQuantity: 5,
                  regDate: "2026-03-22T00:00:00.000Z",
                  modifiedDate: "2026-03-22T00:00:00.000Z",
                },
              ],
            },
          ],
          page: 1,
          size: 1,
          totalElements: 1,
          totalPages: 1,
          first: true,
          last: true,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const response = await fetchNaverProducts({
      storeId: "store-1",
      page: 1,
      size: 1,
      includeSellerBarcodes: true,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(response.items[0]?.sellerBarcode).toBe("BARCODE-1001");
  });

  it("builds option rows from detail preview payloads", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          originProduct: {
            originProductNo: 1001,
            name: "Option Product",
            salePrice: 12900,
            statusType: "SALE",
            modifiedDate: "2026-03-22T00:00:00.000Z",
            detailAttribute: {
              optionInfo: {
                optionCombinations: [
                  {
                    optionName1: "Blue",
                    optionName2: "Large",
                    price: 12900,
                    stockQuantity: 12,
                    usable: true,
                    sellerManagementCode: "SKU-BL-L",
                  },
                  {
                    optionName1: "Blue",
                    optionName2: "Small",
                    price: 11900,
                    stockQuantity: 4,
                    usable: false,
                    sellerManagementCode: "SKU-BL-S",
                  },
                ],
              },
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const response = await fetchNaverProductPricePreview({
      storeId: "store-1",
      originProductNo: "1001",
      channelProductNo: "channel-1001",
    });

    expect(response.hasOptions).toBe(true);
    expect(response.optionType).toBe("combination");
    expect(response.optionCount).toBe(2);
    expect(response.optionRows).toEqual([
      {
        key: "combination-1",
        optionType: "combination",
        label: "Blue / Large",
        attributeSummary: null,
        sellerManagementCode: "SKU-BL-L",
        stockQuantity: 12,
        price: 12900,
        usable: true,
      },
      {
        key: "combination-2",
        optionType: "combination",
        label: "Blue / Small",
        attributeSummary: null,
        sellerManagementCode: "SKU-BL-S",
        stockQuantity: 4,
        price: 11900,
        usable: false,
      },
    ]);
  });

  it("updates sale price directly from preview data without refetching the product", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const result = await updateNaverProductSalePriceFromPreview({
      storeId: "store-1",
      newPrice: 11500,
      preview: {
        storeId: "store-1",
        storeName: "Test Store",
        originProductNo: "1001",
        channelProductNo: "channel-1001",
        productName: "Product 1001",
        currentPrice: 10010,
        saleStatusCode: "SALE",
        saleStatusLabel: "On sale",
        stockQuantity: 5,
        hasOptions: false,
        optionType: "none",
        optionCount: 0,
        optionHandlingMessage: "Origin price only.",
        optionRows: [],
        modifiedAt: "2026-03-22T00:00:00.000Z",
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(global.fetch).mock.calls[0]?.[0]).toBe(
      "https://api.commerce.naver.com/external/v1/products/origin-products/bulk-update",
    );
    expect(
      JSON.parse(String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      originProductNos: [1001],
      productBulkUpdateType: "SALE_PRICE",
      productSalePrice: {
        value: 11500,
        productSalePriceChangerType: "TO",
        productSalePriceChangerUnitType: "WON",
      },
    });
    expect(result.before.storeName).toBe("Test Store");
    expect(result.message).toBe("Sale price updated.");
  });

  it("retries sale price update when NAVER temporarily rate limits the request", async () => {
    vi.useFakeTimers();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "요청이 많아 서비스를 일시적으로 사용할 수 없습니다.",
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "요청이 많아 서비스를 일시적으로 사용할 수 없습니다.",
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      );

    const promise = updateNaverProductSalePriceFromPreview({
      storeId: "store-1",
      newPrice: 11500,
      preview: {
        storeId: "store-1",
        storeName: "Test Store",
        originProductNo: "1001",
        channelProductNo: "channel-1001",
        productName: "Product 1001",
        currentPrice: 10010,
        saleStatusCode: "SALE",
        saleStatusLabel: "On sale",
        stockQuantity: 5,
        hasOptions: false,
        optionType: "none",
        optionCount: 0,
        optionHandlingMessage: "Origin price only.",
        optionRows: [],
        modifiedAt: "2026-03-22T00:00:00.000Z",
      },
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result.message).toBe("Sale price updated.");
  });
});

describe("updateNaverProductSaleStatus", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends stock quantity when reopening an out-of-stock product", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contents: [
              {
                originProductNo: 1001,
                channelProducts: [
                  {
                    originProductNo: 1001,
                    channelProductNo: "channel-1001",
                    name: "Product 1001",
                    sellerManagementCode: "SELLER-1001",
                    statusType: "OUTOFSTOCK",
                    channelProductDisplayStatusType: "ON",
                    salePrice: 10010,
                    discountedPrice: 10010,
                    deliveryFee: 3000,
                    stockQuantity: 5,
                    regDate: "2026-03-22T00:00:00.000Z",
                    modifiedDate: "2026-03-22T00:00:00.000Z",
                  },
                ],
              },
            ],
            page: 1,
            size: 100,
            totalElements: 1,
            totalPages: 1,
            first: true,
            last: true,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      );

    const result = await updateNaverProductSaleStatus({
      storeId: "store-1",
      originProductNo: "1001",
      channelProductNo: "channel-1001",
      saleStatus: "SALE",
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(global.fetch).mock.calls[1]?.[1]?.body))).toEqual({
      statusType: "SALE",
      stockQuantity: 5,
    });
    expect(result.message).toBe("Sale status updated to on sale.");
  });

  it("rejects reopening an out-of-stock product when stock quantity is zero", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          contents: [
            {
              originProductNo: 1001,
              channelProducts: [
                {
                  originProductNo: 1001,
                  channelProductNo: "channel-1001",
                  name: "Product 1001",
                  sellerManagementCode: "SELLER-1001",
                  statusType: "OUTOFSTOCK",
                  channelProductDisplayStatusType: "ON",
                  salePrice: 10010,
                  discountedPrice: 10010,
                  deliveryFee: 3000,
                  stockQuantity: 0,
                  regDate: "2026-03-22T00:00:00.000Z",
                  modifiedDate: "2026-03-22T00:00:00.000Z",
                },
              ],
            },
          ],
          page: 1,
          size: 100,
          totalElements: 1,
          totalPages: 1,
          first: true,
          last: true,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    await expect(
      updateNaverProductSaleStatus({
        storeId: "store-1",
        originProductNo: "1001",
        channelProductNo: "channel-1001",
        saleStatus: "SALE",
      }),
    ).rejects.toThrow(/stock quantity greater than 0/i);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("syncNaverProductAvailability", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("restocks, resumes sale, and re-enables display when requested", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contents: [
              {
                originProductNo: 1001,
                channelProducts: [
                  {
                    originProductNo: 1001,
                    channelProductNo: "channel-1001",
                    name: "Product 1001",
                    sellerManagementCode: "SELLER-1001",
                    statusType: "OUTOFSTOCK",
                    channelProductDisplayStatusType: "SUSPENSION",
                    salePrice: 10010,
                    discountedPrice: 10010,
                    deliveryFee: 3000,
                    stockQuantity: 0,
                    regDate: "2026-03-22T00:00:00.000Z",
                    modifiedDate: "2026-03-22T00:00:00.000Z",
                  },
                ],
              },
            ],
            page: 1,
            size: 100,
            totalElements: 1,
            totalPages: 1,
            first: true,
            last: true,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            originProduct: {
              originProductNo: 1001,
              name: "Product 1001",
              statusType: "OUTOFSTOCK",
              stockQuantity: 0,
            },
            smartstoreChannelProduct: {
              channelProductDisplayStatusType: "SUSPENSION",
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      );

    const result = await syncNaverProductAvailability({
      storeId: "store-1",
      originProductNo: "1001",
      channelProductNo: "channel-1001",
      targetSaleStatus: "SALE",
      targetStockQuantity: 102,
      targetDisplayStatus: "ON",
    });

    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(vi.mocked(global.fetch).mock.calls[1]?.[1]?.body))).toEqual({
      statusType: "SALE",
      stockQuantity: 102,
    });
    expect(JSON.parse(String(vi.mocked(global.fetch).mock.calls[3]?.[1]?.body))).toMatchObject({
      originProduct: {
        originProductNo: 1001,
        statusType: "SALE",
        stockQuantity: 102,
      },
      smartstoreChannelProduct: {
        channelProductDisplayStatusType: "ON",
      },
    });
    expect(result).toEqual({
      messages: [
        "Sale status updated to on sale.",
        "Stock quantity and display status updated.",
      ],
      inventoryUpdated: true,
      saleStatusUpdated: true,
      displayStatusUpdated: true,
    });
  });

  it("syncs sold-out state by setting stock quantity to zero", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contents: [
              {
                originProductNo: 1001,
                channelProducts: [
                  {
                    originProductNo: 1001,
                    channelProductNo: "channel-1001",
                    name: "Product 1001",
                    sellerManagementCode: "SELLER-1001",
                    statusType: "SALE",
                    channelProductDisplayStatusType: "ON",
                    salePrice: 10010,
                    discountedPrice: 10010,
                    deliveryFee: 3000,
                    stockQuantity: 5,
                    regDate: "2026-03-22T00:00:00.000Z",
                    modifiedDate: "2026-03-22T00:00:00.000Z",
                  },
                ],
              },
            ],
            page: 1,
            size: 100,
            totalElements: 1,
            totalPages: 1,
            first: true,
            last: true,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            originProduct: {
              originProductNo: 1001,
              name: "Product 1001",
              statusType: "SALE",
              stockQuantity: 5,
            },
            smartstoreChannelProduct: {
              channelProductDisplayStatusType: "ON",
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      );

    const result = await syncNaverProductAvailability({
      storeId: "store-1",
      originProductNo: "1001",
      channelProductNo: "channel-1001",
      targetStockQuantity: 0,
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(vi.mocked(global.fetch).mock.calls[2]?.[1]?.body))).toMatchObject({
      originProduct: {
        originProductNo: 1001,
        statusType: "SALE",
        stockQuantity: 0,
      },
    });
    expect(result).toEqual({
      messages: ["Stock quantity updated."],
      inventoryUpdated: true,
      saleStatusUpdated: false,
      displayStatusUpdated: false,
    });
  });
});
