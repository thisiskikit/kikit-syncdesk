import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CoupangOrderRow,
  CoupangShipmentArchiveRow,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";
import type { CoupangShipmentWorksheetStoreSheet } from "./shipment-worksheet-store";

const {
  getStoreMock,
  listOrdersMock,
  getOrderDetailMock,
  getProductDetailMock,
  getStoreSheetMock,
  getArchivedRowsMock,
  restoreArchivedRowsMock,
  materializeSelpickOrderNumbersMock,
  setStoreSheetMock,
  archiveRowsMock,
} = vi.hoisted(() => ({
  getStoreMock: vi.fn(),
  listOrdersMock: vi.fn(),
  getOrderDetailMock: vi.fn(),
  getProductDetailMock: vi.fn(),
  getStoreSheetMock: vi.fn(),
  getArchivedRowsMock: vi.fn(),
  restoreArchivedRowsMock: vi.fn(),
  materializeSelpickOrderNumbersMock: vi.fn(),
  setStoreSheetMock: vi.fn(),
  archiveRowsMock: vi.fn(),
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
  getOrderDetail: getOrderDetailMock,
  getReturnDetail: vi.fn(),
  getExchangeDetail: vi.fn(),
  markPreparing: vi.fn(),
}));

vi.mock("./product-service", () => ({
  getProductDetail: getProductDetailMock,
}));

vi.mock("./shipment-worksheet-store", () => ({
  coupangShipmentWorksheetStore: {
    getStoreSheet: getStoreSheetMock,
    getArchivedRows: getArchivedRowsMock,
    restoreArchivedRows: restoreArchivedRowsMock,
    materializeSelpickOrderNumbers: materializeSelpickOrderNumbersMock,
    setStoreSheet: setStoreSheetMock,
    archiveRows: archiveRowsMock,
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
    storeName: "Test Store",
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
    ordererName: "Buyer",
    receiverName: "Receiver",
    receiverSafeNumber: "050-1111-2222",
    receiverAddress: "Seoul",
    receiverPostCode: "12345",
    productName: input.productName ?? `Product ${input.shipmentBoxId}`,
    optionName: "Default",
    sellerProductId: `SP-${input.vendorItemId}`,
    sellerProductName: input.productName ?? `Product ${input.shipmentBoxId}`,
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
    storeName: "Test Store",
    orderDateText: "04/12",
    orderDateKey: "20260412",
    quantity: 1,
    productName: input.productName ?? `Product ${input.shipmentBoxId}`,
    optionName: input.queryToken ? `Option ${input.queryToken}` : "Default",
    productOrderNumber: `PO-${input.shipmentBoxId}`,
    collectedPlatform: "coupang",
    ordererName: "Buyer",
    contact: "010-1111-2222",
    receiverName: "Receiver",
    receiverBaseName: "Receiver",
    personalClearanceCode: null,
    collectedAccountName: "Test Store",
    deliveryCompanyCode: "",
    selpickOrderNumber: `O20260412T${input.id.padStart(4, "0")}`,
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
    exposedProductName: input.productName ?? `Product ${input.shipmentBoxId}`,
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

function buildArchivedRow(input: {
  id: string;
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  orderStatus?: string;
  archiveReason?: CoupangShipmentArchiveRow["archiveReason"];
}): CoupangShipmentArchiveRow {
  return {
    ...buildWorksheetRow(input),
    archivedAt: "2026-04-12T00:00:00.000Z",
    archiveReason: input.archiveReason ?? "not_found_in_coupang",
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
      name: "Test Store",
      vendorId: "A0001",
    },
    items,
    nextToken: null,
    fetchedAt: "2026-04-12T00:00:00.000Z",
    servedFromFallback: false,
    message: items.length ? null : "No matching orders.",
    source: "live" as const,
  };
}

function buildOrderDetailResponse(input: {
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  status?: string;
  productName?: string;
  optionName?: string | null;
}) {
  return {
    item: {
      shipmentBoxId: input.shipmentBoxId,
      orderId: input.orderId,
      orderedAt: "2026-04-12T09:00:00+09:00",
      paidAt: "2026-04-12T09:00:00+09:00",
      status: input.status ?? "INSTRUCT",
      orderer: {
        name: "Buyer",
        email: null,
        safeNumber: "050-1111-2222",
        ordererNumber: "010-1111-2222",
      },
      receiver: {
        name: "Receiver",
        safeNumber: "050-1111-2222",
        receiverNumber: "010-1111-2222",
        addr1: "Seoul",
        addr2: "101",
        postCode: "12345",
      },
      deliveryCompanyName: null,
      deliveryCompanyCode: null,
      invoiceNumber: null,
      inTransitDateTime: null,
      deliveredDate: null,
      parcelPrintMessage: null,
      shipmentType: null,
      splitShipping: false,
      ableSplitShipping: false,
      items: [
        buildLiveOrder({
          shipmentBoxId: input.shipmentBoxId,
          orderId: input.orderId,
          vendorItemId: input.vendorItemId,
          status: input.status ?? "INSTRUCT",
          productName: input.productName ?? "Detailed Product",
        }),
      ].map((item) => ({
        ...item,
        optionName: input.optionName ?? "Detailed Option",
        availableActions: ["uploadInvoice"] as const,
      })),
      relatedReturnRequests: [],
      relatedExchangeRequests: [],
    },
    source: "live" as const,
    message: null,
  };
}

function buildProductDetailResponse(input: {
  sellerProductId: string;
  vendorItemId: string;
  productName?: string;
  optionName?: string;
}) {
  return {
    item: {
      sellerProductId: input.sellerProductId,
      sellerProductName: input.productName ?? "Detailed Product",
      displayProductName: input.productName ?? "Detailed Product",
      deliveryInfo: {
        pccNeeded: false,
      },
      items: [
        {
          vendorItemId: input.vendorItemId,
          itemName: input.optionName ?? "Detailed Option",
          pccNeeded: false,
        },
      ],
    },
    source: "live" as const,
    message: null,
  };
}

describe("auditShipmentWorksheetMissing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoreMock.mockResolvedValue(buildStore());
    getStoreSheetMock.mockResolvedValue(buildSheet([]));
    getArchivedRowsMock.mockResolvedValue([]);
    restoreArchivedRowsMock.mockResolvedValue({
      restoredCount: 0,
      skippedCount: 0,
      restoredSourceKeys: [],
      items: [],
    });
    materializeSelpickOrderNumbersMock.mockImplementation(async ({ items }) =>
      items.map((item: CoupangShipmentWorksheetRow, index: number) => ({
        ...item,
        selpickOrderNumber:
          item.selpickOrderNumber || `O20260412T${String(index + 1).padStart(4, "0")}`,
      })),
    );
    setStoreSheetMock.mockImplementation(async (input) => buildSheet(input.items));
    archiveRowsMock.mockResolvedValue({
      archivedCount: 0,
      skippedCount: 0,
      archivedSourceKeys: [],
      dryRun: false,
    });
    getOrderDetailMock.mockImplementation(async ({ shipmentBoxId }) =>
      buildOrderDetailResponse({
        shipmentBoxId: shipmentBoxId ?? "unknown",
        orderId: `ORDER-${shipmentBoxId ?? "unknown"}`,
        vendorItemId: `VI-${shipmentBoxId ?? "unknown"}`,
        status: "INSTRUCT",
      }),
    );
    getProductDetailMock.mockImplementation(async ({ sellerProductId }) =>
      buildProductDetailResponse({
        sellerProductId,
        vendorItemId: sellerProductId.replace("SP-", ""),
      }),
    );
  });

  it("auto applies live ACCEPT and INSTRUCT orders that are missing from the worksheet", async () => {
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
    getOrderDetailMock.mockImplementation(async ({ shipmentBoxId }) =>
      buildOrderDetailResponse({
        shipmentBoxId,
        orderId: `ORDER-${shipmentBoxId}`,
        vendorItemId: `VI-${shipmentBoxId}`,
        status: shipmentBoxId === "200" ? "ACCEPT" : "INSTRUCT",
      }),
    );

    const result = await auditShipmentWorksheetMissing({
      storeId: "store-1",
      createdAtFrom: "2026-04-10",
      createdAtTo: "2026-04-12",
      viewQuery: {
        scope: "dispatch_active",
      },
    });

    expect(listOrdersMock).toHaveBeenCalledTimes(2);
    expect(materializeSelpickOrderNumbersMock).toHaveBeenCalledTimes(1);
    expect(setStoreSheetMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      auditedStatuses: ["INSTRUCT", "ACCEPT"],
      liveCount: 2,
      worksheetMatchedCount: 0,
      autoAppliedCount: 2,
      restoredCount: 0,
      exceptionCount: 0,
      hiddenInfoCount: 0,
    });
    expect(result.autoAppliedItems.map((item) => item.action)).toEqual(["inserted", "inserted"]);
  });

  it("updates matched worksheet rows without surfacing a status-only change as an exception", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildSheet([
        buildWorksheetRow({
          id: "1",
          shipmentBoxId: "400",
          orderId: "ORDER-400",
          vendorItemId: "VI-400",
          orderStatus: "ACCEPT",
        }),
      ]),
    );
    listOrdersMock.mockImplementation(async ({ status }) => {
      if (status === "INSTRUCT") {
        return buildLiveResponse([
          buildLiveOrder({
            shipmentBoxId: "400",
            orderId: "ORDER-400",
            vendorItemId: "VI-400",
            status: "INSTRUCT",
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
      },
    });

    expect(result).toMatchObject({
      liveCount: 1,
      worksheetMatchedCount: 1,
      autoAppliedCount: 1,
      exceptionCount: 0,
      hiddenInfoCount: 0,
    });
    expect(result.autoAppliedItems[0]?.action).toBe("status_updated");
    expect(setStoreSheetMock).toHaveBeenCalledTimes(1);
  });

  it("restores archived rows when the live order appears again", async () => {
    const archivedRow = buildArchivedRow({
      id: "10",
      shipmentBoxId: "500",
      orderId: "ORDER-500",
      vendorItemId: "VI-500",
      orderStatus: "INSTRUCT",
    });
    getArchivedRowsMock.mockResolvedValue([archivedRow]);
    restoreArchivedRowsMock.mockResolvedValue({
      restoredCount: 1,
      skippedCount: 0,
      restoredSourceKeys: [archivedRow.sourceKey],
      items: [archivedRow],
    });
    listOrdersMock.mockImplementation(async ({ status }) => {
      if (status === "INSTRUCT") {
        return buildLiveResponse([
          buildLiveOrder({
            shipmentBoxId: "500",
            orderId: "ORDER-500",
            vendorItemId: "VI-500",
            status: "INSTRUCT",
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
      },
    });

    expect(restoreArchivedRowsMock).toHaveBeenCalledWith({
      storeId: "store-1",
      sourceKeys: [archivedRow.sourceKey],
    });
    expect(result.restoredCount).toBe(1);
    expect(result.autoAppliedItems[0]?.action).toBe("restored");
  });

  it("keeps hidden matched rows as info only", async () => {
    const visibleRow = buildWorksheetRow({
      id: "1",
      shipmentBoxId: "600",
      orderId: "ORDER-600",
      vendorItemId: "VI-600",
      productName: "Visible Product",
      queryToken: "visible",
    });
    const hiddenRow = buildWorksheetRow({
      id: "2",
      shipmentBoxId: "601",
      orderId: "ORDER-601",
      vendorItemId: "VI-601",
      productName: "Hidden Product",
      queryToken: "hidden",
    });
    getStoreSheetMock.mockResolvedValue(buildSheet([visibleRow, hiddenRow]));
    listOrdersMock.mockImplementation(async ({ status }) => {
      if (status === "INSTRUCT") {
        return buildLiveResponse([
          buildLiveOrder({
            shipmentBoxId: "600",
            orderId: "ORDER-600",
            vendorItemId: "VI-600",
            status: "INSTRUCT",
            productName: "Visible Product",
          }),
          buildLiveOrder({
            shipmentBoxId: "601",
            orderId: "ORDER-601",
            vendorItemId: "VI-601",
            status: "INSTRUCT",
            productName: "Hidden Product",
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
      exceptionCount: 0,
      hiddenInfoCount: 1,
    });
    expect(result.autoAppliedCount).toBeGreaterThanOrEqual(0);
    expect(result.hiddenItems).toEqual([
      expect.objectContaining({
        sourceKey: "store-1:601:VI-601",
        rowId: "2",
        hiddenReason: "filtered_out",
      }),
    ]);
  });

  it("splits audit ranges longer than 7 days into multiple live lookups", async () => {
    listOrdersMock.mockResolvedValue(buildLiveResponse([]));

    const result = await auditShipmentWorksheetMissing({
      storeId: "store-1",
      createdAtFrom: "2026-04-01",
      createdAtTo: "2026-04-12",
      viewQuery: {
        scope: "dispatch_active",
      },
    });

    expect(result.liveCount).toBe(0);
    expect(listOrdersMock).toHaveBeenCalledTimes(4);
    expect(
      listOrdersMock.mock.calls.map(([input]) => ({
        status: input.status,
        createdAtFrom: input.createdAtFrom,
        createdAtTo: input.createdAtTo,
      })),
    ).toEqual([
      { status: "INSTRUCT", createdAtFrom: "2026-04-01", createdAtTo: "2026-04-07" },
      { status: "INSTRUCT", createdAtFrom: "2026-04-08", createdAtTo: "2026-04-12" },
      { status: "ACCEPT", createdAtFrom: "2026-04-01", createdAtTo: "2026-04-07" },
      { status: "ACCEPT", createdAtFrom: "2026-04-08", createdAtTo: "2026-04-12" },
    ]);
  });
});
