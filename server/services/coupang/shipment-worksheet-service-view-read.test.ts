import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

const {
  getOrderCustomerServiceSummaryMock,
  getStoreMock,
  getStoreSheetMock,
} = vi.hoisted(() => ({
  getOrderCustomerServiceSummaryMock: vi.fn(),
  getStoreMock: vi.fn(),
  getStoreSheetMock: vi.fn(),
}));

vi.mock("./order-service", () => ({
  getExchangeDetail: vi.fn(),
  getOrderCustomerServiceSummary: getOrderCustomerServiceSummaryMock,
  getOrderDetail: vi.fn(),
  getReturnDetail: vi.fn(),
  listExchanges: vi.fn(),
  listOrders: vi.fn(),
  listReturns: vi.fn(),
}));

vi.mock("./product-service", () => ({
  getProductDetail: vi.fn(),
}));

vi.mock("./settings-store", () => ({
  coupangSettingsStore: {
    getStore: getStoreMock,
    listStoreSummaries: vi.fn(),
  },
}));

vi.mock("./shipment-worksheet-store", () => ({
  coupangShipmentWorksheetStore: {
    archiveRows: vi.fn(),
    getArchivedRows: vi.fn(),
    getArchivedSourceKeys: vi.fn(),
    getStoreSheet: getStoreSheetMock,
    patchRows: vi.fn(),
    setStoreSheet: vi.fn(),
  },
}));

vi.mock("../logs/service", () => ({
  recordSystemErrorEvent: vi.fn(),
}));

import { getShipmentWorksheetView } from "./shipment-worksheet-service";

function buildRow(input: {
  id: string;
  status: string;
  customerServiceState?: CoupangShipmentWorksheetRow["customerServiceState"];
}) {
  return {
    id: input.id,
    sourceKey: `store-1:${input.id}`,
    storeId: "store-1",
    storeName: "Test Store",
    orderDateText: "04/17",
    orderDateKey: "20260417",
    quantity: 1,
    productName: `Product ${input.id}`,
    optionName: "Default",
    productOrderNumber: `PO-${input.id}`,
    collectedPlatform: "coupang",
    ordererName: "Kim",
    contact: "010-1111-2222",
    receiverName: "Lee",
    receiverBaseName: "Lee",
    personalClearanceCode: null,
    collectedAccountName: "Store Account",
    deliveryCompanyCode: "",
    selpickOrderNumber: `O20260417A${input.id.padStart(4, "0")}`,
    invoiceNumber: "",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "Seoul",
    deliveryRequest: null,
    buyerPhoneNumber: "010-2222-3333",
    productNumber: "P-1",
    exposedProductName: `Product ${input.id}, Default`,
    productOptionNumber: "OPT-1",
    sellerProductCode: "SELLER-1",
    isOverseas: false,
    shipmentBoxId: `SHIP-${input.id}`,
    orderId: `ORDER-${input.id}`,
    sellerProductId: `SP-${input.id}`,
    vendorItemId: `VI-${input.id}`,
    availableActions: ["uploadInvoice"],
    orderStatus: input.status,
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: input.customerServiceState ?? "stale",
    customerServiceFetchedAt: "2026-04-17T09:00:00.000Z",
    orderedAtRaw: "2026-04-17T09:00:00+09:00",
    lastOrderHydratedAt: null,
    lastProductHydratedAt: null,
    estimatedShippingDate: null,
    splitShipping: false,
    invoiceTransmissionStatus: null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    exportedAt: null,
    invoiceAppliedAt: null,
    createdAt: "2026-04-17T09:00:00.000Z",
    updatedAt: "2026-04-17T09:00:00.000Z",
  } satisfies CoupangShipmentWorksheetRow;
}

describe("getShipmentWorksheetView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoreMock.mockResolvedValue({
      id: "store-1",
      channel: "coupang",
      storeName: "Test Store",
      vendorId: "VENDOR-1",
      shipmentPlatformKey: null,
      credentials: {
        accessKey: "access",
        secretKey: "secret",
      },
      baseUrl: "https://api-gateway.coupang.com",
      connectionTest: {
        status: "success",
        testedAt: "2026-04-17T09:00:00.000Z",
        message: null,
      },
      createdAt: "2026-04-17T09:00:00.000Z",
      updatedAt: "2026-04-17T09:00:00.000Z",
    });
    getStoreSheetMock.mockResolvedValue({
      items: [buildRow({ id: "1", status: "INSTRUCT", customerServiceState: "stale" })],
      collectedAt: "2026-04-17T09:00:00.000Z",
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
      updatedAt: "2026-04-17T09:00:00.000Z",
    });
  });

  it("returns the stored worksheet snapshot without live customer service refresh", async () => {
    const response = await getShipmentWorksheetView({
      storeId: "store-1",
      scope: "all",
      page: 1,
      pageSize: 50,
    });

    expect(getOrderCustomerServiceSummaryMock).not.toHaveBeenCalled();
    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.customerServiceState).toBe("stale");
    expect(response.items[0]?.id).toBe("1");
  });
});
