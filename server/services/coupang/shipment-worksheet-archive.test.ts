import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CoupangShipmentArchiveRow,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";

const {
  getStoreMock,
  listStoreSummariesMock,
  getStoreSheetMock,
  getArchivedRowsMock,
  archiveRowsMock,
} = vi.hoisted(() => ({
  getStoreMock: vi.fn(),
  listStoreSummariesMock: vi.fn(),
  getStoreSheetMock: vi.fn(),
  getArchivedRowsMock: vi.fn(),
  archiveRowsMock: vi.fn(),
}));

vi.mock("./settings-store", () => ({
  coupangSettingsStore: {
    getStore: getStoreMock,
    listStoreSummaries: listStoreSummariesMock,
  },
}));

vi.mock("./shipment-worksheet-store", () => ({
  coupangShipmentWorksheetStore: {
    getStoreSheet: getStoreSheetMock,
    getArchivedRows: getArchivedRowsMock,
    archiveRows: archiveRowsMock,
  },
}));

import {
  getShipmentArchiveView,
  runShipmentArchive,
} from "./shipment-worksheet-service";

function buildStore() {
  return {
    id: "store-1",
    channel: "coupang" as const,
    storeName: "Archive Store",
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
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

function buildWorksheetRow(
  overrides: Partial<CoupangShipmentWorksheetRow> = {},
): CoupangShipmentWorksheetRow {
  return {
    id: overrides.id ?? "row-1",
    sourceKey: overrides.sourceKey ?? "store-1:shipment-1:vendor-1",
    storeId: "store-1",
    storeName: "Archive Store",
    orderDateText: "04/01",
    orderDateKey: "20260401",
    quantity: 1,
    productName: "Archive Product",
    optionName: "Option A",
    productOrderNumber: "PO-1",
    collectedPlatform: "coupang",
    ordererName: "Orderer",
    contact: "010-1111-2222",
    receiverName: "Receiver",
    receiverBaseName: "Receiver",
    personalClearanceCode: null,
    collectedAccountName: "Archive Store",
    deliveryCompanyCode: "CJ",
    selpickOrderNumber: "SEL-1",
    invoiceNumber: "1234567890",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "Seoul",
    deliveryRequest: "",
    buyerPhoneNumber: "010-9999-9999",
    productNumber: "P-1",
    exposedProductName: "Archive Product / Option A",
    coupangDisplayProductName: "Archive Product",
    productOptionNumber: "OPT-1",
    sellerProductCode: "SKU-1",
    isOverseas: false,
    shipmentBoxId: "shipment-1",
    orderId: "order-1",
    sellerProductId: "seller-1",
    vendorItemId: "vendor-1",
    availableActions: ["uploadInvoice"],
    orderStatus: "DELIVERING",
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceTerminalStatus: null,
    customerServiceState: "ready",
    customerServiceFetchedAt: "2026-04-01T00:00:00.000Z",
    orderedAtRaw: "2026-04-01T09:00:00+09:00",
    lastOrderHydratedAt: "2026-04-01T00:00:00.000Z",
    lastProductHydratedAt: "2026-04-01T00:00:00.000Z",
    estimatedShippingDate: "2026-04-02",
    splitShipping: false,
    invoiceTransmissionStatus: "succeeded",
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: "2026-04-01T01:00:00.000Z",
    invoiceAppliedAt: "2026-04-01T01:00:00.000Z",
    exportedAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildArchiveRow(
  overrides: Partial<CoupangShipmentArchiveRow> = {},
): CoupangShipmentArchiveRow {
  return {
    ...buildWorksheetRow(overrides),
    archivedAt: overrides.archivedAt ?? "2026-04-12T03:30:00.000Z",
    archiveReason: overrides.archiveReason ?? "retention_post_dispatch",
  };
}

function buildEmptySheet(items: CoupangShipmentWorksheetRow[] = []) {
  return {
    items,
    collectedAt: "2026-04-12T00:00:00.000Z",
    source: "live" as const,
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

describe("coupang shipment archive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T03:30:00.000Z"));
    vi.clearAllMocks();
    getStoreMock.mockResolvedValue(buildStore());
    listStoreSummariesMock.mockResolvedValue([buildStore()]);
    getArchivedRowsMock.mockResolvedValue([]);
    getStoreSheetMock.mockResolvedValue(buildEmptySheet());
    archiveRowsMock.mockImplementation(async (input: { items: unknown[]; dryRun?: boolean }) => ({
      archivedCount: input.dryRun ? 0 : input.items.length,
      skippedCount: 0,
      archivedSourceKeys: Array.isArray(input.items)
        ? input.items.map((item) => (item as { sourceKey: string }).sourceKey)
        : [],
      dryRun: input.dryRun === true,
    }));
  });

  it("archives only post-dispatch non-claim rows older than 30 days", async () => {
    const eligible = buildWorksheetRow({
      id: "eligible",
      sourceKey: "store-1:eligible:vendor",
      shipmentBoxId: "eligible",
      orderId: "order-eligible",
      vendorItemId: "vendor-eligible",
      orderStatus: "DELIVERING",
      exportedAt: "2026-02-01T00:00:00.000Z",
    });
    const active = buildWorksheetRow({
      id: "active",
      sourceKey: "store-1:active:vendor",
      shipmentBoxId: "active",
      orderId: "order-active",
      vendorItemId: "vendor-active",
      orderStatus: "ACCEPT",
      exportedAt: "2026-02-01T00:00:00.000Z",
      availableActions: ["markPreparing"],
    });
    const claim = buildWorksheetRow({
      id: "claim",
      sourceKey: "store-1:claim:vendor",
      shipmentBoxId: "claim",
      orderId: "order-claim",
      vendorItemId: "vendor-claim",
      customerServiceIssueCount: 1,
      customerServiceIssueSummary: "Return 1",
      customerServiceIssueBreakdown: [{ type: "return", count: 1, label: "Return" }],
    });
    const notExported = buildWorksheetRow({
      id: "not-exported",
      sourceKey: "store-1:not-exported:vendor",
      shipmentBoxId: "not-exported",
      orderId: "order-not-exported",
      vendorItemId: "vendor-not-exported",
      exportedAt: null,
    });
    getStoreSheetMock.mockResolvedValue(buildEmptySheet([eligible, active, claim, notExported]));

    const result = await runShipmentArchive({});

    expect(archiveRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        dryRun: false,
        items: expect.arrayContaining([
          expect.objectContaining({
            sourceKey: eligible.sourceKey,
            shipmentBoxId: eligible.shipmentBoxId,
            orderId: eligible.orderId,
            archiveReason: "retention_post_dispatch",
          }),
        ]),
      }),
    );
    expect(result.processedStoreCount).toBe(1);
    expect(result.archivedRowCount).toBe(1);
    expect(result.stores[0]).toMatchObject({
      eligibleRowCount: 1,
      archivedRowCount: 1,
      skippedRowCount: 0,
    });
  });

  it("supports dry-run without moving rows", async () => {
    const eligible = buildWorksheetRow({
      id: "eligible",
      sourceKey: "store-1:eligible:vendor",
      shipmentBoxId: "eligible",
      orderId: "order-eligible",
      vendorItemId: "vendor-eligible",
      orderStatus: "FINAL_DELIVERY",
      exportedAt: "2026-02-01T00:00:00.000Z",
    });
    getStoreSheetMock.mockResolvedValue(buildEmptySheet([eligible]));

    const result = await runShipmentArchive({ dryRun: true });

    expect(archiveRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        items: expect.arrayContaining([
          expect.objectContaining({
            sourceKey: eligible.sourceKey,
            shipmentBoxId: eligible.shipmentBoxId,
            archiveReason: "retention_post_dispatch",
          }),
        ]),
      }),
    );
    expect(result.archivedRowCount).toBe(0);
    expect(result.dryRun).toBe(true);
  });

  it("filters and paginates archive rows in archive view", async () => {
    getArchivedRowsMock.mockResolvedValue([
      buildArchiveRow({
        id: "row-1",
        sourceKey: "store-1:shipment-1:vendor-1",
        receiverName: "Search Target",
        archivedAt: "2026-04-12T03:30:00.000Z",
        archiveReason: "cancel_completed",
      }),
      buildArchiveRow({
        id: "row-2",
        sourceKey: "store-1:shipment-2:vendor-2",
        shipmentBoxId: "shipment-2",
        orderId: "order-2",
        vendorItemId: "vendor-2",
        receiverName: "Other Receiver",
        archivedAt: "2026-04-11T03:30:00.000Z",
        archiveReason: "retention_post_dispatch",
      }),
    ]);

    const result = await getShipmentArchiveView({
      storeId: "store-1",
      query: "Search Target",
      page: 1,
      pageSize: 10,
    });

    expect(result.totalRowCount).toBe(2);
    expect(result.filteredRowCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.receiverName).toBe("Search Target");
    expect(result.items[0]?.archiveReason).toBe("cancel_completed");
  });
});
