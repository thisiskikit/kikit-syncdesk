import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

const {
  getOrderCustomerServiceSummaryMock,
  getStoreMock,
  getArchivedRowsMock,
  getStoreSheetMock,
} = vi.hoisted(() => ({
  getOrderCustomerServiceSummaryMock: vi.fn(),
  getStoreMock: vi.fn(),
  getArchivedRowsMock: vi.fn(),
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
    getArchivedRows: getArchivedRowsMock,
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
  customerServiceTerminalStatus?: CoupangShipmentWorksheetRow["customerServiceTerminalStatus"];
  missingInCoupang?: boolean;
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
    missingInCoupang: input.missingInCoupang ?? false,
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: input.customerServiceState ?? "stale",
    customerServiceTerminalStatus: input.customerServiceTerminalStatus ?? null,
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00+09:00"));
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
        coveredCreatedAtFrom: "2026-04-01",
        coveredCreatedAtTo: "2026-04-17",
        lastStatusFilter: null,
      },
      syncSummary: null,
      updatedAt: "2026-04-17T09:00:00.000Z",
    });
    getArchivedRowsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(response.items[0]?.primaryDecision?.status).toBe("recheck");
    expect(response.decisionCounts.recheck).toBe(1);
    expect(response.decisionPreviewGroups.recheck.count).toBe(1);
    expect(response.coverageCreatedAtFrom).toBe(null);
    expect(response.coverageCreatedAtTo).toBe(null);
    expect(response.isAuthoritativeMirror).toBe(false);
    expect(response.lastFullSyncedAt).toBe(null);
    expect(response.missingInCoupangCount).toBe(0);
    expect(response.exceptionCounts.notFoundInCoupang).toBe(0);
  });

  it("returns authoritative mirror metadata from the last successful full sync", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [buildRow({ id: "1", status: "INSTRUCT", customerServiceState: "ready" })],
      collectedAt: "2026-04-20T09:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-04-20T09:00:00.000Z",
        lastFullCollectedAt: "2026-04-20T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-04-01",
        coveredCreatedAtTo: "2026-04-20",
        lastStatusFilter: null,
      },
      syncSummary: {
        mode: "incremental",
        fetchedCount: 10,
        insertedCount: 0,
        insertedSourceKeys: [],
        updatedCount: 10,
        skippedHydrationCount: 0,
        autoExpanded: false,
        fetchCreatedAtFrom: "2026-04-19",
        fetchCreatedAtTo: "2026-04-20",
        statusFilter: null,
        completedPhases: ["worksheet_collect"],
        pendingPhases: [],
        warningPhases: [],
      },
      updatedAt: "2026-04-20T09:00:00.000Z",
    });

    const response = await getShipmentWorksheetView({
      storeId: "store-1",
      createdAtFrom: "2026-03-22",
      createdAtTo: "2026-04-20",
      scope: "all",
      page: 1,
      pageSize: 50,
    });

    expect(response.coverageCreatedAtFrom).toBe("2026-03-22");
    expect(response.coverageCreatedAtTo).toBe("2026-04-20");
    expect(response.isAuthoritativeMirror).toBe(true);
    expect(response.lastFullSyncedAt).toBe("2026-04-20T09:00:00.000Z");
  });

  it("includes archived not-found exceptions in the worksheet view exception counts", async () => {
    getArchivedRowsMock.mockResolvedValue([
      {
        ...buildRow({ id: "missing", status: "DEPARTURE", customerServiceState: "ready" }),
        archivedAt: "2026-04-20T10:00:00.000Z",
        archiveReason: "not_found_in_coupang" as const,
        missingInCoupang: true,
        missingDetectedAt: "2026-04-20T10:00:00.000Z",
        missingDetectionSource: "full_sync" as const,
        lastSeenOrderStatus: "DEPARTURE",
        lastSeenIssueSummary: null,
      },
    ]);

    const response = await getShipmentWorksheetView({
      storeId: "store-1",
      createdAtFrom: "2026-04-17",
      createdAtTo: "2026-04-20",
      scope: "all",
      page: 1,
      pageSize: 50,
    });

    expect(response.missingInCoupangCount).toBe(1);
    expect(response.exceptionCounts.notFoundInCoupang).toBe(1);
  });

  it("separates Coupang mirror counts from the active worksheet list", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [buildRow({ id: "active", status: "DEPARTURE", customerServiceState: "ready" })],
      mirrorItems: [
        buildRow({ id: "active", status: "DEPARTURE", customerServiceState: "ready" }),
        buildRow({
          id: "return-completed",
          status: "DEPARTURE",
          customerServiceState: "ready",
          customerServiceTerminalStatus: "return_completed",
        }),
      ],
      collectedAt: "2026-04-20T09:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-04-20T09:00:00.000Z",
        lastFullCollectedAt: "2026-04-20T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-04-01",
        coveredCreatedAtTo: "2026-04-20",
        lastStatusFilter: null,
      },
      syncSummary: null,
      updatedAt: "2026-04-20T09:00:00.000Z",
    });

    const response = await getShipmentWorksheetView({
      storeId: "store-1",
      createdAtFrom: "2026-04-01",
      createdAtTo: "2026-04-20",
      datasetMode: "mirror",
      scope: "all",
      page: 1,
      pageSize: 50,
    });

    expect(response.datasetMode).toBe("mirror");
    expect(response.items.map((row) => row.id)).toEqual(["active", "return-completed"]);
    expect(response.mirrorFilteredRowCount).toBe(2);
    expect(response.activeFilteredRowCount).toBe(1);
    expect(response.activeExclusionCounts.return_completed).toBe(1);
    expect(response.items.find((row) => row.id === "return-completed")).toMatchObject({
      isVisibleInActive: false,
      excludedFromActiveReason: "return_completed",
    });
  });
});
