import { describe, expect, it } from "vitest";
import {
  applyExplorerCategoryPaths,
  buildVendorItemPriceUpdateRequest,
  buildCoupangProductExplorerPage,
  buildCoupangProductFullUpdatePayload,
  buildCoupangProductPartialUpdatePayload,
  buildExplorerSummaryRow,
  mergeExplorerRowWithDetail,
} from "./product-service";

describe("coupang product explorer helpers", () => {
  it("filters deleted rows, matches selected columns, sorts, and paginates", () => {
    const snapshot = {
      store: {
        id: "store-1",
        name: "Main Store",
        vendorId: "A0001",
      },
      items: [
        {
          sellerProductId: "100",
          sellerProductName: "Blue Widget",
          vendorId: "A0001",
          displayCategoryCode: "10",
          displayCategoryName: "Widget",
          brand: "Alpha",
          status: "APPROVED",
          statusName: "APPROVED",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: "2026-03-20T00:00:00.000Z",
          lastModifiedAt: "2026-03-24T10:00:00.000Z",
          deliveryCharge: 2500,
          deliveryChargeType: "NOT_FREE",
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 2,
          totalInventory: 7,
          minSalePrice: 12000,
          maxSalePrice: 15000,
          vendorItems: [
            {
              vendorItemId: "v-100-a",
              sellerProductItemId: "spi-100-a",
              itemName: "Blue / Small",
              externalVendorSku: "BLUE-S",
              originalPrice: 13000,
              salePrice: 12000,
              inventoryCount: 3,
              saleStatus: "ONSALE",
              lastModifiedAt: "2026-03-24T10:00:00.000Z",
              attributes: ["Color: Blue", "Size: Small"],
            },
          ],
        },
        {
          sellerProductId: "200",
          sellerProductName: "Red Widget",
          vendorId: "A0001",
          displayCategoryCode: "10",
          displayCategoryName: "Widget",
          brand: "Beta",
          status: "SUSPENDED",
          statusName: "SUSPENDED",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: "2026-03-18T00:00:00.000Z",
          lastModifiedAt: "2026-03-23T10:00:00.000Z",
          deliveryCharge: 0,
          deliveryChargeType: "FREE",
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 2,
          minSalePrice: 9000,
          maxSalePrice: 9000,
          vendorItems: [
            {
              vendorItemId: "v-200-a",
              sellerProductItemId: "spi-200-a",
              itemName: "Red / One Size",
              externalVendorSku: "RED-ONE",
              originalPrice: 9500,
              salePrice: 9000,
              inventoryCount: 2,
              saleStatus: "SUSPENDED",
              lastModifiedAt: "2026-03-23T10:00:00.000Z",
              attributes: ["Color: Red"],
            },
          ],
        },
        {
          sellerProductId: "300",
          sellerProductName: "Deleted Widget",
          vendorId: "A0001",
          displayCategoryCode: "10",
          displayCategoryName: "Widget",
          brand: "Gamma",
          status: "DELETED",
          statusName: "DELETED",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: "2026-03-10T00:00:00.000Z",
          lastModifiedAt: "2026-03-21T10:00:00.000Z",
          deliveryCharge: 3000,
          deliveryChargeType: "NOT_FREE",
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 0,
          minSalePrice: 5000,
          maxSalePrice: 5000,
          vendorItems: [],
        },
      ],
      fetchedAt: "2026-03-25T00:00:00.000Z",
      servedFromFallback: false,
      message: null,
      source: "live",
    } as Parameters<typeof buildCoupangProductExplorerPage>[0]["snapshot"];

    const searchResult = buildCoupangProductExplorerPage({
      snapshot,
      searchField: "vendorItemName",
      searchQuery: "Blue",
      sortField: "minSalePrice",
      sortDirection: "asc",
      page: 1,
      pageSize: 20,
    });

    expect(searchResult.total).toBe(1);
    expect(searchResult.items.map((item) => item.sellerProductId)).toEqual(["100"]);

    const pagedResult = buildCoupangProductExplorerPage({
      snapshot,
      searchField: "all",
      searchQuery: "",
      sortField: "minSalePrice",
      sortDirection: "asc",
      page: 1,
      pageSize: 1,
    });

    expect(pagedResult.total).toBe(2);
    expect(pagedResult.totalPages).toBe(2);
    expect(pagedResult.items[0]?.sellerProductId).toBe("200");
  });

  it("keeps sale-stopped or suspended products in the explorer by default", () => {
    const snapshot = {
      store: { id: "store-1", name: "Main Store", vendorId: "A0001" },
      items: [
        {
          sellerProductId: "100",
          sellerProductName: "Onsale Item",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "APPROVED",
          statusName: "APPROVED",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: null,
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 1,
          minSalePrice: 1000,
          maxSalePrice: 1000,
          vendorItems: [],
        },
        {
          sellerProductId: "200",
          sellerProductName: "Stopped Item",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "SUSPENDED",
          statusName: "판매중지",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: null,
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 0,
          minSalePrice: 1000,
          maxSalePrice: 1000,
          vendorItems: [],
        },
      ],
      fetchedAt: "2026-03-25T00:00:00.000Z",
      servedFromFallback: false,
      message: null,
      source: "live",
    } as Parameters<typeof buildCoupangProductExplorerPage>[0]["snapshot"];

    const result = buildCoupangProductExplorerPage({
      snapshot,
      searchField: "all",
      searchQuery: "",
      sortField: "sellerProductName",
      sortDirection: "asc",
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map((item) => item.sellerProductId)).toEqual(["100", "200"]);
  });

  it("filters products by overlapping sale period", () => {
    const snapshot = {
      store: { id: "store-1", name: "Main Store", vendorId: "A0001" },
      items: [
        {
          sellerProductId: "100",
          sellerProductName: "March Event",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "APPROVED",
          statusName: "APPROVED",
          saleStartedAt: "2026-03-20T09:00:00+09:00",
          saleEndedAt: "2026-03-27T23:59:59+09:00",
          createdAt: null,
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 1,
          minSalePrice: 1000,
          maxSalePrice: 1000,
          vendorItems: [],
        },
        {
          sellerProductId: "200",
          sellerProductName: "April Event",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "APPROVED",
          statusName: "APPROVED",
          saleStartedAt: "2026-04-02T09:00:00+09:00",
          saleEndedAt: "2026-04-05T23:59:59+09:00",
          createdAt: null,
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 1,
          minSalePrice: 2000,
          maxSalePrice: 2000,
          vendorItems: [],
        },
        {
          sellerProductId: "300",
          sellerProductName: "Always On",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "APPROVED",
          statusName: "APPROVED",
          saleStartedAt: "2026-03-01T09:00:00+09:00",
          saleEndedAt: null,
          createdAt: null,
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 1,
          minSalePrice: 3000,
          maxSalePrice: 3000,
          vendorItems: [],
        },
      ],
      fetchedAt: "2026-03-25T00:00:00.000Z",
      servedFromFallback: false,
      message: null,
      source: "live",
    } as Parameters<typeof buildCoupangProductExplorerPage>[0]["snapshot"];

    const result = buildCoupangProductExplorerPage({
      snapshot,
      searchField: "all",
      searchQuery: "",
      salePeriodFrom: "2026-03-25",
      salePeriodTo: "2026-03-28",
      sortField: "saleStartedAt",
      sortDirection: "asc",
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map((item) => item.sellerProductId)).toEqual(["300", "100"]);
  });

  it("filters products created on or after the selected date", () => {
    const snapshot = {
      store: { id: "store-1", name: "Main Store", vendorId: "A0001" },
      items: [
        {
          sellerProductId: "100",
          sellerProductName: "Recent Item",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "APPROVED",
          statusName: "APPROVED",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: "2026-03-20T09:00:00+09:00",
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 1,
          minSalePrice: 1000,
          maxSalePrice: 1000,
          vendorItems: [],
        },
        {
          sellerProductId: "200",
          sellerProductName: "Older Item",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "APPROVED",
          statusName: "APPROVED",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: "2026-03-18T09:00:00+09:00",
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 1,
          minSalePrice: 1000,
          maxSalePrice: 1000,
          vendorItems: [],
        },
        {
          sellerProductId: "300",
          sellerProductName: "Unknown CreatedAt",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "APPROVED",
          statusName: "APPROVED",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: null,
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 1,
          minSalePrice: 1000,
          maxSalePrice: 1000,
          vendorItems: [],
        },
      ],
      fetchedAt: "2026-03-25T00:00:00.000Z",
      servedFromFallback: false,
      message: null,
      source: "live",
    } as Parameters<typeof buildCoupangProductExplorerPage>[0]["snapshot"];

    const result = buildCoupangProductExplorerPage({
      snapshot,
      searchField: "all",
      searchQuery: "",
      createdAtFrom: "2026-03-19",
      sortField: "createdAt",
      sortDirection: "asc",
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map((item) => item.sellerProductId)).toEqual(["100"]);
  });

  it("filters exposure and operation cards while keeping facet counts aligned", () => {
    const snapshot = {
      store: { id: "store-1", name: "Main Store", vendorId: "A0001" },
      items: [
        {
          sellerProductId: "100",
          sellerProductName: "Restricted Suspended",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "APPROVED",
          statusName: "APPROVED",
          violationTypes: ["NO_VA_V2"],
          exposureState: "restricted",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: null,
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 3,
          minSalePrice: 1000,
          maxSalePrice: 1000,
          onSaleOptionCount: 0,
          suspendedOptionCount: 1,
          zeroInventoryOptionCount: 0,
          bestPriceGuaranteedOptionCount: 0,
          vendorItems: [],
        },
        {
          sellerProductId: "200",
          sellerProductName: "Normal Suspended",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "SUSPENDED",
          statusName: "SUSPENDED",
          violationTypes: [],
          exposureState: "normal",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: null,
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 2,
          minSalePrice: 1000,
          maxSalePrice: 1000,
          onSaleOptionCount: 0,
          suspendedOptionCount: 1,
          zeroInventoryOptionCount: 0,
          bestPriceGuaranteedOptionCount: 0,
          vendorItems: [],
        },
        {
          sellerProductId: "300",
          sellerProductName: "Low Exposure",
          vendorId: "A0001",
          displayCategoryCode: null,
          displayCategoryName: null,
          brand: null,
          status: "APPROVED",
          statusName: "APPROVED",
          violationTypes: ["ATTR"],
          exposureState: "low",
          saleStartedAt: null,
          saleEndedAt: null,
          createdAt: null,
          lastModifiedAt: null,
          deliveryCharge: null,
          deliveryChargeType: null,
          thumbnailUrl: null,
          previewHtml: null,
          optionCount: 1,
          totalInventory: 0,
          minSalePrice: 1000,
          maxSalePrice: 1000,
          onSaleOptionCount: 1,
          suspendedOptionCount: 0,
          zeroInventoryOptionCount: 1,
          bestPriceGuaranteedOptionCount: 1,
          vendorItems: [],
        },
      ],
      fetchedAt: "2026-03-25T00:00:00.000Z",
      servedFromFallback: false,
      message: null,
      source: "live",
    } as Parameters<typeof buildCoupangProductExplorerPage>[0]["snapshot"];

    const result = buildCoupangProductExplorerPage({
      snapshot,
      searchField: "all",
      searchQuery: "",
      exposureCard: "restricted",
      operationCard: "suspended",
      sortField: "sellerProductName",
      sortDirection: "asc",
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map((item) => item.sellerProductId)).toEqual(["100"]);
    expect(result.facets.exposure.all).toBe(2);
    expect(result.facets.exposure.restricted).toBe(1);
    expect(result.facets.exposure.normal).toBe(1);
    expect(result.facets.operation.all).toBe(1);
    expect(result.facets.operation.suspended).toBe(1);
    expect(result.facets.operation.zeroInventory).toBe(0);
  });

  it("reuses cached enriched explorer fields when rebuilding from summary rows", () => {
    const previousRow = {
      sellerProductId: "100",
      productId: "product-100",
      sellerProductName: "Old Widget",
      vendorId: "A0001",
      displayCategoryCode: "10",
      displayCategoryName: "Widget",
      brand: "Old Brand",
      status: "APPROVED",
      statusName: "APPROVED",
      saleStartedAt: null,
      saleEndedAt: null,
      createdAt: "2026-03-20T00:00:00.000Z",
      lastModifiedAt: "2026-03-24T10:00:00.000Z",
      deliveryCharge: 2500,
      deliveryChargeType: "NOT_FREE",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg",
      previewHtml: "<p>Cached</p>",
      optionCount: 1,
      totalInventory: 7,
      minSalePrice: 12000,
      maxSalePrice: 12000,
      vendorItems: [
        {
          vendorItemId: "vendor-1",
          sellerProductItemId: "spi-1",
          itemId: "item-1",
          itemName: "Blue / Small",
          externalVendorSku: "BLUE-S",
          barcode: "880000000001",
          originalPrice: 13000,
          salePrice: 12000,
          inventoryCount: 7,
          saleStatus: "ONSALE",
          lastModifiedAt: "2026-03-24T10:00:00.000Z",
          attributes: ["Color: Blue"],
        },
      ],
    } as Parameters<typeof buildCoupangProductExplorerPage>[0]["snapshot"]["items"][number];

    const row = buildExplorerSummaryRow({
      summary: {
        sellerProductId: "100",
        productId: "product-100-next",
        sellerProductName: "New Widget",
        brand: "New Brand",
        status: "SUSPENDED",
        statusName: "SUSPENDED",
        lastModifiedAt: "2026-03-25T10:00:00.000Z",
      },
      previousRow,
      vendorIdFallback: "A0001",
    });

    expect(row.sellerProductName).toBe("New Widget");
    expect(row.brand).toBe("New Brand");
    expect(row.status).toBe("SUSPENDED");
    expect(row.productId).toBe("product-100-next");
    expect(row.deliveryCharge).toBe(2500);
    expect(row.thumbnailUrl).toBe("https://cdn.example.com/thumb.jpg");
    expect(row.previewHtml).toBe("<p>Cached</p>");
    expect(row.vendorItems[0]?.vendorItemId).toBe("vendor-1");
    expect(row.vendorItems[0]?.itemId).toBe("item-1");
    expect(row.vendorItems[0]?.barcode).toBe("880000000001");
    expect(row.minSalePrice).toBe(12000);
    expect(row.totalInventory).toBe(7);
  });

  it("fills missing category names from category path metadata", () => {
    const baseRow = {
      sellerProductId: "100",
      productId: null,
      sellerProductName: "Widget",
      vendorId: "A0001",
      displayCategoryCode: "56184",
      displayCategoryName: null,
      brand: null,
      status: "APPROVED",
      statusName: "APPROVED",
      saleStartedAt: null,
      saleEndedAt: null,
      createdAt: "2026-03-20T00:00:00.000Z",
      lastModifiedAt: "2026-03-24T10:00:00.000Z",
      deliveryCharge: null,
      deliveryChargeType: null,
      thumbnailUrl: null,
      previewHtml: null,
      optionCount: 1,
      totalInventory: 5,
      minSalePrice: 12000,
      maxSalePrice: 12000,
      vendorItems: [],
    } as Parameters<typeof buildCoupangProductExplorerPage>[0]["snapshot"]["items"][number];

    const hydrated = applyExplorerCategoryPaths(
      [
        baseRow,
        {
          ...baseRow,
          sellerProductId: "200",
          displayCategoryCode: "99999",
          displayCategoryName: "직접 내려온 카테고리",
        },
      ],
      new Map([["56184", "생활용품 > 정리/수납 > 정리 바구니"]]),
    );

    expect(hydrated[0]?.displayCategoryName).toBe("생활용품 > 정리/수납 > 정리 바구니");
    expect(hydrated[1]?.displayCategoryName).toBe("직접 내려온 카테고리");
  });

  it("hydrates explorer rows with detail data when a product is opened", () => {
    const row = {
      sellerProductId: "100",
      productId: null,
      sellerProductName: "Widget",
      vendorId: "A0001",
      displayCategoryCode: "10",
      displayCategoryName: "Widget",
      brand: "Brand",
      status: "APPROVED",
      statusName: "APPROVED",
      saleStartedAt: null,
      saleEndedAt: null,
      createdAt: "2026-03-20T00:00:00.000Z",
      lastModifiedAt: "2026-03-24T10:00:00.000Z",
      deliveryCharge: null,
      deliveryChargeType: null,
      thumbnailUrl: null,
      previewHtml: null,
      optionCount: 0,
      totalInventory: null,
      minSalePrice: null,
      maxSalePrice: null,
      vendorItems: [],
    } as Parameters<typeof buildCoupangProductExplorerPage>[0]["snapshot"]["items"][number];

    const merged = mergeExplorerRowWithDetail({
      row,
      detailData: {
        sellerProductId: "100",
        productId: "product-100",
        sellerProductName: "Hydrated Widget",
        brand: "Hydrated Brand",
        status: "APPROVED",
        statusName: "APPROVED",
        images: [
          {
            imageOrder: 0,
            imageType: "REPRESENTATION",
            vendorPath: "https://cdn.example.com/detail-thumb.jpg",
          },
        ],
        contents: [
          {
            contentsType: "HTML",
            contentDetails: [{ detailType: "TEXT", content: "<p>Detail Preview</p>" }],
          },
        ],
      },
      partialData: {
        deliveryCharge: 3000,
        deliveryChargeType: "NOT_FREE",
      },
      itemRows: [
        {
          sellerProductItemId: "spi-1",
          vendorItemId: "vendor-1",
          itemId: "item-1",
          itemName: "Blue / Small",
           offerCondition: "NEW",
           offerDescription: null,
           originalPrice: 13000,
           supplyPrice: 9000,
           salePrice: 12000,
          maximumBuyCount: 10,
          maximumBuyForPerson: null,
          maximumBuyForPersonPeriod: null,
          outboundShippingTimeDay: 1,
          unitCount: 1,
          adultOnly: "EVERYONE",
          taxType: "TAX",
          parallelImported: "NOT_PARALLEL_IMPORTED",
          overseasPurchased: "NOT_OVERSEAS_PURCHASED",
          externalVendorSku: "BLUE-S",
          barcode: null,
          emptyBarcode: null,
           emptyBarcodeReason: null,
           modelNo: null,
           saleAgentCommission: null,
           bestPriceGuaranteed3P: false,
           pccNeeded: false,
          saleStatus: "ONSALE",
          inventoryCount: 4,
          images: [],
          notices: [],
          attributes: [
            {
              attributeTypeName: "Color",
              attributeValueName: "Blue",
              exposed: "EXPOSED",
              editable: true,
            },
          ],
          contents: [],
          rawData: { modifiedAt: "2026-03-25T10:00:00.000Z" },
        },
        {
          sellerProductItemId: "spi-2",
          vendorItemId: "vendor-2",
          itemId: "item-2",
          itemName: "Blue / Large",
           offerCondition: "NEW",
           offerDescription: null,
           originalPrice: 15000,
           supplyPrice: 10000,
           salePrice: 14000,
          maximumBuyCount: 10,
          maximumBuyForPerson: null,
          maximumBuyForPersonPeriod: null,
          outboundShippingTimeDay: 1,
          unitCount: 1,
          adultOnly: "EVERYONE",
          taxType: "TAX",
          parallelImported: "NOT_PARALLEL_IMPORTED",
          overseasPurchased: "NOT_OVERSEAS_PURCHASED",
          externalVendorSku: "BLUE-L",
          barcode: null,
          emptyBarcode: null,
           emptyBarcodeReason: null,
           modelNo: null,
           saleAgentCommission: null,
           bestPriceGuaranteed3P: true,
           pccNeeded: false,
          saleStatus: "SUSPENDED",
          inventoryCount: 2,
          images: [],
          notices: [],
          attributes: [
            {
              attributeTypeName: "Size",
              attributeValueName: "Large",
              exposed: "EXPOSED",
              editable: true,
            },
          ],
          contents: [],
          rawData: { modifiedAt: "2026-03-25T11:00:00.000Z" },
        },
      ],
    });

    expect(merged.sellerProductName).toBe("Hydrated Widget");
    expect(merged.productId).toBe("product-100");
    expect(merged.deliveryCharge).toBe(3000);
    expect(merged.thumbnailUrl).toBe("https://cdn.example.com/detail-thumb.jpg");
    expect(merged.previewHtml).toContain("Detail Preview");
    expect(merged.optionCount).toBe(2);
    expect(merged.totalInventory).toBe(6);
    expect(merged.minSalePrice).toBe(12000);
    expect(merged.maxSalePrice).toBe(14000);
    expect(merged.vendorItems.map((item) => item.vendorItemId)).toEqual(["vendor-1", "vendor-2"]);
    expect(merged.vendorItems.map((item) => item.itemId)).toEqual(["item-1", "item-2"]);
    expect(merged.vendorItems.map((item) => item.barcode)).toEqual([null, null]);
    expect(merged.suspendedOptionCount).toBe(1);
    expect(merged.vendorItems.map((item) => item.supplyPrice)).toEqual([9000, 10000]);
    expect(merged.vendorItems.map((item) => item.bestPriceGuaranteed3P)).toEqual([false, true]);
  });
});

describe("coupang product payload builders", () => {
  it("builds vendor item price update requests with query params outside the signed path", () => {
    const request = buildVendorItemPriceUpdateRequest({
      vendorItemId: "vendor/item?1",
      price: 12700,
    });

    expect(request.path).toBe(
      "/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/vendor%2Fitem%3F1/prices/12700",
    );
    expect(request.path).not.toContain("?");
    expect(request.query.toString()).toBe("forceSalePriceUpdate=true");
  });

  it("keeps only allowed partial fields and omits undefined values", () => {
    const payload = buildCoupangProductPartialUpdatePayload({
      storeId: "store-1",
      sellerProductId: "100",
      deliveryCharge: 2500,
      returnAddress: "Seoul",
      returnAddressDetail: null,
      unionDeliveryType: undefined,
    });

    expect(payload).toEqual({
      sellerProductId: 100,
      deliveryCharge: 2500,
      returnAddress: "Seoul",
      returnAddressDetail: null,
    });
    expect(payload).not.toHaveProperty("storeId");
    expect(payload).not.toHaveProperty("unionDeliveryType");
  });

  it("preserves untouched raw fields while replacing edited full payload sections", () => {
    const payload = buildCoupangProductFullUpdatePayload({
      storeId: "store-1",
      sellerProductId: "100",
      requestApproval: true,
      sellerProductName: "Updated Name",
      displayCategoryCode: "1010",
      displayProductName: "Display Name",
      brand: "Brand",
      generalProductName: "General Name",
      productGroup: "GROUP",
      manufacture: "Maker",
      saleStartedAt: "2026-03-25",
      saleEndedAt: null,
      deliveryMethod: "SEQUENCIAL",
      deliveryCompanyCode: "KGB",
      deliveryChargeType: "NOT_FREE",
      deliveryCharge: 2500,
      freeShipOverAmount: 50000,
      deliveryChargeOnReturn: 5000,
      deliverySurcharge: 3000,
      remoteAreaDeliverable: "Y",
      unionDeliveryType: "NOT_UNION_DELIVERY",
      returnCenterCode: "RC01",
      returnChargeName: "왕복배송비",
      companyContactNumber: "010-0000-0000",
      returnZipCode: "12345",
      returnAddress: "Seoul",
      returnAddressDetail: "Detail",
      returnCharge: 5000,
      outboundShippingPlaceCode: "OUT01",
      vendorUserId: "vendor-user",
      extraInfoMessage: "memo",
      searchTags: ["tag1", "tag2"],
      images: [
        {
          imageOrder: 1,
          imageType: "REPRESENTATION",
          cdnPath: "https://cdn.example.com/image.jpg",
          vendorPath: "",
        },
      ],
      notices: [
        {
          noticeCategoryName: "기본",
          noticeCategoryDetailName: "제조국",
          content: "대한민국",
        },
      ],
      contents: [
        {
          contentsType: "HTML",
          contentDetails: [{ detailType: "TEXT", content: "<p>Hello</p>" }],
        },
      ],
      items: [
        {
          sellerProductItemId: "spi-1",
          vendorItemId: "vendor-1",
          itemId: "item-1",
          itemName: "Option 1",
          offerCondition: "NEW",
          offerDescription: "Option desc",
          originalPrice: 13000,
          salePrice: 12000,
          maximumBuyCount: 10,
          maximumBuyForPerson: 2,
          maximumBuyForPersonPeriod: 30,
          outboundShippingTimeDay: 1,
          unitCount: 1,
          adultOnly: "EVERYONE",
          taxType: "TAX",
          parallelImported: "NOT_PARALLEL_IMPORTED",
          overseasPurchased: "NOT_OVERSEAS_PURCHASED",
          externalVendorSku: "SKU-1",
          barcode: "880000000001",
          emptyBarcode: false,
          emptyBarcodeReason: null,
          modelNo: "MODEL-1",
          saleAgentCommission: 10,
          pccNeeded: false,
          images: [
            {
              imageOrder: 1,
              imageType: "REPRESENTATION",
              cdnPath: "https://cdn.example.com/item.jpg",
              vendorPath: "",
            },
          ],
          notices: [],
          attributes: [
            {
              attributeTypeName: "Color",
              attributeValueName: "Blue",
              exposed: "EXPOSED",
              editable: true,
            },
          ],
          contents: [],
          rawData: {
            extraItemField: "keep-me",
            untouchedNested: { flag: true },
          },
        },
      ],
      rawData: {
        untouchedTopLevel: "keep-me",
        nested: { preserve: true },
      },
    });

    expect(payload.sellerProductId).toBe(100);
    expect(payload.sellerProductName).toBe("Updated Name");
    expect(payload.requested).toBe(true);
    expect(payload.untouchedTopLevel).toBe("keep-me");
    expect(payload.nested).toEqual({ preserve: true });
    expect(payload.searchTags).toEqual(["tag1", "tag2"]);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      vendorItemId: "vendor-1",
      itemId: "item-1",
      itemName: "Option 1",
      extraItemField: "keep-me",
      untouchedNested: { flag: true },
    });
    expect(payload.items[0]?.images).toEqual([
      {
        imageOrder: 1,
        imageType: "REPRESENTATION",
        cdnPath: "https://cdn.example.com/item.jpg",
      },
    ]);
    expect(payload.items[0]?.attributes).toEqual([
      {
        attributeTypeName: "Color",
        attributeValueName: "Blue",
        exposed: "EXPOSED",
        editable: true,
      },
    ]);
  });
});
