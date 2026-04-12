import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CoupangOrderRow, CoupangShipmentWorksheetRow } from "@shared/coupang";
import type { CoupangShipmentWorksheetStoreSheet } from "./shipment-worksheet-store";

const {
  getStoreMock,
  listOrdersMock,
  getStoreSheetMock,
} = vi.hoisted(() => ({
  getStoreMock: vi.fn(),
  listOrdersMock: vi.fn(),
  getStoreSheetMock: vi.fn(),
}));

vi.mock("./settings-store", () => ({
  coupangSettingsStore: {
    getStore: getStoreMock,
  },
}));

vi.mock("./order-service", () => ({
  listOrders: listOrdersMock,
  listReturns: vi.fn(),
  listExchanges: vi.fn(),
  getOrderCustomerServiceSummary: vi.fn(),
  getOrderDetail: vi.fn(),
  getReturnDetail: vi.fn(),
  getExchangeDetail: vi.fn(),
  markPreparing: vi.fn(),
}));

vi.mock("./product-service", () => ({
  getProductDetail: vi.fn(),
}));

vi.mock("./shipment-worksheet-store", () => ({
  coupangShipmentWorksheetStore: {
    getStoreSheet: getStoreSheetMock,
    setStoreSheet: vi.fn(),
    patchRows: vi.fn(),
  },
}));

vi.mock("../logs/service", () => ({
  recordSystemErrorEvent: vi.fn(),
}));

import { auditShipmentWorksheetMissing } from "./shipment-worksheet-service";

function buildStore() {
  return {
    id: "store-1",
    channel: "coupang" as const,
    storeName: "테스트 스토어",
    vendorId: "A0001",
    shipmentPlatformKey: "T",
    credentials: {
      accessKey: "access-key",
      secretKey: "secret-key",
    },
    baseUrl: "https://api-gateway.coupang.com",
    connectionTest: {
      status: "success" as const,
      testedAt: "2026-04-12T00:00:00.000Z",
      message: "ok",
    },
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
  };
}

function buildLiveOrder(input: {
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  status: string;
  productName?: string;
}): CoupangOrderRow {
  return {
    id: `${input.shipmentBoxId}:${input.vendorItemId}`,
    shipmentBoxId: input.shipmentBoxId,
    orderId: input.orderId,
    orderedAt: "2026-04-12T09:00:00+09:00",
    paidAt: "2026-04-12T09:00:00+09:00",
    status: input.status,
    ordererName: "김주문",
    receiverName: "이수령",
    receiverSafeNumber: "050-1111-2222",
    receiverAddress: "서울",
    receiverPostCode: "12345",
    productName: input.productName ?? `상품 ${input.shipmentBoxId}`,
    optionName: "기본",
    sellerProductId: `SP-${input.vendorItemId}`,
    sellerProductName: input.productName ?? `상품 ${input.shipmentBoxId}`,
    vendorItemId: input.vendorItemId,
    externalVendorSku: `SKU-${input.vendorItemId}`,
    quantity: 1,
    salesPrice: 10000,
    orderPrice: 10000,
    discountPrice: 0,
    cancelCount: 0,
    holdCountForCancel: 0,
    deliveryCompanyName: null,
    deliveryCompanyCode: null,
    invoiceNumber: null,
    invoiceNumberUploadDate: null,
    estimatedShippingDate: null,
    inTransitDateTime: null,
    deliveredDate: null,
    shipmentType: null,
    splitShipping: false,
    ableSplitShipping: false,
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: "unknown",
    customerServiceFetchedAt: null,
    availableActions: input.status === "ACCEPT" ? ["markPreparing"] : ["uploadInvoice"],
  };
}

function buildWorksheetRow(input: {
  id: string;
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  orderStatus?: string;
  productName?: string;
  queryToken?: string;
}): CoupangShipmentWorksheetRow {
  const sourceKey = `store-1:${input.shipmentBoxId}:${input.vendorItemId}`;

  return {
    id: input.id,
    sourceKey,
    storeId: "store-1",
    storeName: "테스트 스토어",
    orderDateText: "04/12",
    orderDateKey: "20260412",
    quantity: 1,
    productName: input.productName ?? `상품 ${input.shipmentBoxId}`,
    optionName: input.queryToken ? `옵션 ${input.queryToken}` : "기본",
    productOrderNumber: `PO-${input.shipmentBoxId}`,
    collectedPlatform: "coupang",
    ordererName: "김주문",
    contact: "010-1111-2222",
    receiverName: "이수령",
    receiverBaseName: "이수령",
    personalClearanceCode: null,
    collectedAccountName: "테스트 스토어",
    deliveryCompanyCode: "",
    selpickOrderNumber: `O20260412T${input.id.padStart(4, "0")}`,
    invoiceNumber: "",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "서울",
    deliveryRequest: null,
    buyerPhoneNumber: "010-2222-3333",
    productNumber: "P-1",
    exposedProductName: input.productName ?? `상품 ${input.shipmentBoxId}`,
    productOptionNumber: "OPT-1",
    sellerProductCode: "SELLER-1",
    isOverseas: false,
    shipmentBoxId: input.shipmentBoxId,
    orderId: input.orderId,
    sellerProductId: `SP-${input.vendorItemId}`,
    vendorItemId: input.vendorItemId,
    availableActions: [],
    orderStatus: input.orderStatus ?? "INSTRUCT",
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: "ready",
    customerServiceFetchedAt: "2026-04-12T00:00:00.000Z",
    orderedAtRaw: "2026-04-12T09:00:00+09:00",
    lastOrderHydratedAt: "2026-04-12T00:00:00.000Z",
    lastProductHydratedAt: "2026-04-12T00:00:00.000Z",
    estimatedShippingDate: null,
    splitShipping: false,
    invoiceTransmissionStatus: null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    exportedAt: null,
    invoiceAppliedAt: null,
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
  };
}

function buildSheet(items: CoupangShipmentWorksheetRow[]): CoupangShipmentWorksheetStoreSheet {
  return {
    items,
    collectedAt: "2026-04-12T00:00:00.000Z",
    source: "live",
    message: null,
    syncState: {
      lastIncrementalCollectedAt: null,
      lastFullCollectedAt: null,
      coveredCreatedAtFrom: null,
      coveredCreatedAtTo: null,
      lastStatusFilter: null,
    },
    syncSummary: null,
    updatedAt: "2026-04-12T00:00:00.000Z",
  };
}

function buildLiveResponse(items: CoupangOrderRow[]) {
  return {
    store: {
      id: "store-1",
      name: "테스트 스토어",
      vendorId: "A0001",
    },
    items,
    nextToken: null,
    fetchedAt: "2026-04-12T00:00:00.000Z",
    servedFromFallback: false,
    message: items.length ? null : "조회된 주문이 없습니다.",
    source: "live" as const,
  };
}

describe("auditShipmentWorksheetMissing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoreMock.mockResolvedValue(buildStore());
  });

  it("reports live ACCEPT and INSTRUCT orders that are missing from the worksheet", async () => {
    getStoreSheetMock.mockResolvedValue(buildSheet([]));
    listOrdersMock.mockImplementation(async ({ status }) => {
      if (status === "INSTRUCT") {
        return buildLiveResponse([
          buildLiveOrder({
            shipmentBoxId: "100",
            orderId: "ORDER-100",
            vendorItemId: "VI-100",
            status: "INSTRUCT",
          }),
        ]);
      }

      return buildLiveResponse([
        buildLiveOrder({
          shipmentBoxId: "200",
          orderId: "ORDER-200",
          vendorItemId: "VI-200",
          status: "ACCEPT",
        }),
      ]);
    });

    const result = await auditShipmentWorksheetMissing({
      storeId: "store-1",
      createdAtFrom: "2026-04-10",
      createdAtTo: "2026-04-12",
      viewQuery: {
        scope: "dispatch_active",
      },
    });

    expect(listOrdersMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      auditedStatuses: ["INSTRUCT", "ACCEPT"],
      liveCount: 2,
      worksheetMatchedCount: 0,
      missingCount: 2,
      hiddenCount: 0,
    });
    expect(result.missingItems.map((item) => item.sourceKey)).toEqual([
      "store-1:100:VI-100",
      "store-1:200:VI-200",
    ]);
  });

  it("dedupes the same live row across statuses and keeps the more advanced INSTRUCT status", async () => {
    getStoreSheetMock.mockResolvedValue(buildSheet([]));
    listOrdersMock.mockImplementation(async ({ status }) => {
      const sharedOrder = buildLiveOrder({
        shipmentBoxId: "300",
        orderId: "ORDER-300",
        vendorItemId: "VI-300",
        status,
      });

      return buildLiveResponse([sharedOrder]);
    });

    const result = await auditShipmentWorksheetMissing({
      storeId: "store-1",
      createdAtFrom: "2026-04-10",
      createdAtTo: "2026-04-12",
      viewQuery: {
        scope: "dispatch_active",
      },
    });

    expect(result.liveCount).toBe(1);
    expect(result.missingItems).toHaveLength(1);
    expect(result.missingItems[0]?.status).toBe("INSTRUCT");
  });

  it("separates worksheet-matched rows that are hidden by the current view query", async () => {
    const visibleRow = buildWorksheetRow({
      id: "1",
      shipmentBoxId: "400",
      orderId: "ORDER-400",
      vendorItemId: "VI-400",
      productName: "보이는 상품",
      queryToken: "visible",
    });
    const hiddenRow = buildWorksheetRow({
      id: "2",
      shipmentBoxId: "401",
      orderId: "ORDER-401",
      vendorItemId: "VI-401",
      productName: "숨김 상품",
      queryToken: "hidden",
    });
    getStoreSheetMock.mockResolvedValue(buildSheet([visibleRow, hiddenRow]));
    listOrdersMock.mockImplementation(async ({ status }) => {
      if (status === "INSTRUCT") {
        return buildLiveResponse([
          buildLiveOrder({
            shipmentBoxId: "400",
            orderId: "ORDER-400",
            vendorItemId: "VI-400",
            status: "INSTRUCT",
            productName: "보이는 상품",
          }),
          buildLiveOrder({
            shipmentBoxId: "401",
            orderId: "ORDER-401",
            vendorItemId: "VI-401",
            status: "INSTRUCT",
            productName: "숨김 상품",
          }),
        ]);
      }

      return buildLiveResponse([]);
    });

    const result = await auditShipmentWorksheetMissing({
      storeId: "store-1",
      createdAtFrom: "2026-04-10",
      createdAtTo: "2026-04-12",
      viewQuery: {
        scope: "dispatch_active",
        query: "visible",
      },
    });

    expect(result).toMatchObject({
      liveCount: 2,
      worksheetMatchedCount: 2,
      missingCount: 0,
      hiddenCount: 1,
    });
    expect(result.hiddenItems).toEqual([
      expect.objectContaining({
        sourceKey: "store-1:401:VI-401",
        rowId: "2",
        hiddenReason: "filtered_out",
      }),
    ]);
  });

  it("rejects audit ranges longer than 7 days", async () => {
    getStoreSheetMock.mockResolvedValue(buildSheet([]));

    await expect(
      auditShipmentWorksheetMissing({
        storeId: "store-1",
        createdAtFrom: "2026-04-01",
        createdAtTo: "2026-04-12",
        viewQuery: {
          scope: "dispatch_active",
        },
      }),
    ).rejects.toThrow("누락 검수는 최대 7일 범위까지만 지원합니다.");
  });
});
