import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CoupangCustomerServiceSummaryResponse,
  CoupangOrderDetail,
  CoupangOrderRow,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";
import type { CoupangShipmentWorksheetStoreSheet } from "./shipment-worksheet-store";

const {
  state,
  getStoreMock,
  getStoreSheetMock,
  setStoreSheetMock,
  getOrderCustomerServiceSummaryMock,
  getOrderDetailMock,
  getProductDetailMock,
} = vi.hoisted(() => ({
  state: {
    sheet: null as CoupangShipmentWorksheetStoreSheet | null,
  },
  getStoreMock: vi.fn(),
  getStoreSheetMock: vi.fn(),
  setStoreSheetMock: vi.fn(),
  getOrderCustomerServiceSummaryMock: vi.fn(),
  getOrderDetailMock: vi.fn(),
  getProductDetailMock: vi.fn(),
}));

vi.mock("./settings-store", () => ({
  coupangSettingsStore: {
    getStore: getStoreMock,
  },
}));

vi.mock("./shipment-worksheet-store", () => ({
  coupangShipmentWorksheetStore: {
    getStoreSheet: getStoreSheetMock,
    setStoreSheet: setStoreSheetMock,
    patchRows: vi.fn(),
    getArchivedRows: vi.fn(),
    archiveRows: vi.fn(),
  },
}));

vi.mock("./order-service", () => ({
  getExchangeDetail: vi.fn(),
  getOrderCustomerServiceSummary: getOrderCustomerServiceSummaryMock,
  getOrderDetail: getOrderDetailMock,
  getReturnDetail: vi.fn(),
  listExchanges: vi.fn(),
  listOrders: vi.fn(),
  listReturns: vi.fn(),
}));

vi.mock("./product-service", () => ({
  getProductDetail: getProductDetailMock,
}));

import { resolveShipmentWorksheetBulkRows } from "./shipment-worksheet-service";

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
      testedAt: "2026-04-17T00:00:00.000Z",
      message: "ok",
    },
    createdAt: "2026-04-17T00:00:00.000Z",
    updatedAt: "2026-04-17T00:00:00.000Z",
  };
}

function buildWorksheetRow(input?: Partial<CoupangShipmentWorksheetRow>): CoupangShipmentWorksheetRow {
  const updatedAt = input?.updatedAt ?? "2026-04-17T09:00:00.000Z";
  const lastHydratedAt = input?.lastOrderHydratedAt ?? updatedAt;

  return {
    id: input?.id ?? "row-1",
    sourceKey: input?.sourceKey ?? "store-1:SHIP-1:VI-stale",
    storeId: "store-1",
    storeName: "테스트 스토어",
    orderDateText: "04/17",
    orderDateKey: "20260417",
    quantity: 1,
    productName: "Album",
    optionName: "Default",
    productOrderNumber: input?.productOrderNumber ?? "ORDER-1",
    collectedPlatform: "coupang",
    ordererName: "Kim",
    contact: "010-1111-2222",
    receiverName: "Lee",
    receiverBaseName: "Lee",
    personalClearanceCode: null,
    collectedAccountName: "테스트 스토어",
    deliveryCompanyCode: input?.deliveryCompanyCode ?? "HYUNDAI",
    selpickOrderNumber: input?.selpickOrderNumber ?? "O20260417A0001",
    invoiceNumber: input?.invoiceNumber ?? "257645330736",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "Seoul",
    deliveryRequest: "문 앞",
    buyerPhoneNumber: "010-3333-4444",
    productNumber: "SP-1",
    exposedProductName: "Album, Default",
    coupangDisplayProductName: "Album",
    productOptionNumber: input?.productOptionNumber ?? "VI-stale",
    sellerProductCode: "SELLER-1",
    isOverseas: false,
    shipmentBoxId: input?.shipmentBoxId ?? "SHIP-1",
    orderId: input?.orderId ?? "ORDER-1",
    sellerProductId: input?.sellerProductId ?? "SP-1",
    vendorItemId: input?.vendorItemId ?? "VI-stale",
    availableActions: input?.availableActions ?? ["markPreparing"],
    orderStatus: input?.orderStatus ?? "ACCEPT",
    customerServiceIssueCount: input?.customerServiceIssueCount ?? 0,
    customerServiceIssueSummary: input?.customerServiceIssueSummary ?? null,
    customerServiceIssueBreakdown: input?.customerServiceIssueBreakdown ?? [],
    customerServiceState: input?.customerServiceState ?? "ready",
    customerServiceFetchedAt: input?.customerServiceFetchedAt ?? updatedAt,
    orderedAtRaw: input?.orderedAtRaw ?? "2026-04-17T09:00:00+09:00",
    lastOrderHydratedAt: lastHydratedAt,
    lastProductHydratedAt: input?.lastProductHydratedAt ?? updatedAt,
    estimatedShippingDate: input?.estimatedShippingDate ?? "2026-04-21+09:00",
    splitShipping: input?.splitShipping ?? false,
    invoiceTransmissionStatus: input?.invoiceTransmissionStatus ?? null,
    invoiceTransmissionMessage: input?.invoiceTransmissionMessage ?? null,
    invoiceTransmissionAt: input?.invoiceTransmissionAt ?? null,
    exportedAt: input?.exportedAt ?? null,
    invoiceAppliedAt: input?.invoiceAppliedAt ?? null,
    createdAt: input?.createdAt ?? "2026-04-17T09:00:00.000Z",
    updatedAt,
  };
}

function buildSheet(items: CoupangShipmentWorksheetRow[]): CoupangShipmentWorksheetStoreSheet {
  return {
    items,
    collectedAt: "2026-04-17T09:00:00.000Z",
    source: "live",
    message: null,
    syncState: {
      lastIncrementalCollectedAt: "2026-04-17T09:00:00.000Z",
      lastFullCollectedAt: null,
      coveredCreatedAtFrom: "2026-04-17",
      coveredCreatedAtTo: "2026-04-17",
      lastStatusFilter: "ACCEPT",
    },
    syncSummary: null,
    updatedAt: "2026-04-17T09:00:00.000Z",
  };
}

function buildLiveOrderRow(input?: Partial<CoupangOrderRow>): CoupangOrderRow {
  return {
    id: input?.id ?? "row-1",
    shipmentBoxId: input?.shipmentBoxId ?? "SHIP-1",
    orderId: input?.orderId ?? "ORDER-1",
    orderedAt: input?.orderedAt ?? "2026-04-17T09:00:00+09:00",
    paidAt: input?.paidAt ?? "2026-04-17T09:00:01+09:00",
    status: input?.status ?? "INSTRUCT",
    ordererName: input?.ordererName ?? "Kim",
    receiverName: input?.receiverName ?? "Lee",
    receiverSafeNumber: input?.receiverSafeNumber ?? "010-1111-2222",
    receiverAddress: input?.receiverAddress ?? "Seoul",
    receiverPostCode: input?.receiverPostCode ?? "00000",
    productName: input?.productName ?? "Album",
    optionName: input?.optionName ?? "Default",
    sellerProductId: input?.sellerProductId ?? "SP-1",
    sellerProductName: input?.sellerProductName ?? "Album",
    vendorItemId: input?.vendorItemId ?? "VI-live",
    externalVendorSku: input?.externalVendorSku ?? "SELLER-1",
    quantity: input?.quantity ?? 1,
    salesPrice: input?.salesPrice ?? 10000,
    orderPrice: input?.orderPrice ?? 10000,
    discountPrice: input?.discountPrice ?? 0,
    cancelCount: input?.cancelCount ?? 0,
    holdCountForCancel: input?.holdCountForCancel ?? 0,
    deliveryCompanyName: input?.deliveryCompanyName ?? "NONE",
    deliveryCompanyCode: input?.deliveryCompanyCode ?? null,
    invoiceNumber: input?.invoiceNumber ?? "",
    invoiceNumberUploadDate: input?.invoiceNumberUploadDate ?? null,
    estimatedShippingDate: input?.estimatedShippingDate ?? "2026-04-21+09:00",
    inTransitDateTime: input?.inTransitDateTime ?? null,
    deliveredDate: input?.deliveredDate ?? null,
    shipmentType: input?.shipmentType ?? "THIRD_PARTY",
    splitShipping: input?.splitShipping ?? false,
    ableSplitShipping: input?.ableSplitShipping ?? false,
    customerServiceIssueCount: input?.customerServiceIssueCount ?? 0,
    customerServiceIssueSummary: input?.customerServiceIssueSummary ?? null,
    customerServiceIssueBreakdown: input?.customerServiceIssueBreakdown ?? [],
    customerServiceState: input?.customerServiceState ?? "ready",
    customerServiceFetchedAt: input?.customerServiceFetchedAt ?? "2026-04-17T09:00:00.000Z",
    availableActions: input?.availableActions ?? ["uploadInvoice", "cancelOrderItem"],
  };
}

function buildLiveDetail(row: CoupangOrderRow): CoupangOrderDetail {
  return {
    shipmentBoxId: row.shipmentBoxId,
    orderId: row.orderId,
    orderedAt: row.orderedAt,
    paidAt: row.paidAt,
    status: row.status,
    orderer: {
      name: "Kim",
      email: null,
      safeNumber: "010-5555-6666",
      ordererNumber: "010-5555-6666",
    },
    receiver: {
      name: "Lee",
      safeNumber: "010-1111-2222",
      receiverNumber: "010-1111-2222",
      addr1: "Seoul",
      addr2: "101",
      postCode: "00000",
    },
    deliveryCompanyName: "NONE",
    deliveryCompanyCode: null,
    invoiceNumber: "",
    inTransitDateTime: null,
    deliveredDate: null,
    parcelPrintMessage: "문 앞",
    shipmentType: "THIRD_PARTY",
    splitShipping: false,
    ableSplitShipping: false,
    items: [row],
    relatedReturnRequests: [],
    relatedExchangeRequests: [],
  };
}

describe("resolveShipmentWorksheetBulkRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.sheet = null;
    getStoreMock.mockResolvedValue(buildStore());
    getStoreSheetMock.mockImplementation(async () => structuredClone(state.sheet));
    setStoreSheetMock.mockImplementation(async (input) => {
      state.sheet = {
        items: structuredClone(input.items),
        collectedAt: input.collectedAt,
        source: input.source,
        message: input.message,
        syncState: structuredClone(input.syncState),
        syncSummary: input.syncSummary ? structuredClone(input.syncSummary) : null,
        updatedAt: "2026-04-17T10:00:00.000Z",
      };
      return structuredClone(state.sheet);
    });
    getProductDetailMock.mockResolvedValue(null);
    getOrderCustomerServiceSummaryMock.mockImplementation(
      async (input): Promise<CoupangCustomerServiceSummaryResponse> => ({
        store: {
          id: "store-1",
          name: "테스트 스토어",
          vendorId: "A0001",
        },
        items: input.items.map((item: { rowKey: string }) => ({
          rowKey: item.rowKey,
          customerServiceIssueCount: 0,
          customerServiceIssueSummary: null,
          customerServiceIssueBreakdown: [],
          customerServiceState: "ready" as const,
          customerServiceFetchedAt: "2026-04-17T10:00:00.000Z",
        })),
        fetchedAt: "2026-04-17T10:00:00.000Z",
        servedFromFallback: false,
        servedFromCache: false,
        message: null,
        source: "live",
        cacheState: "live",
      }),
    );
  });

  it("rehydrates stale invoice rows before invoice_ready resolution", async () => {
    state.sheet = buildSheet([
      buildWorksheetRow({
        orderStatus: "ACCEPT",
        availableActions: ["markPreparing"],
        vendorItemId: "VI-stale",
      }),
    ]);
    getOrderDetailMock.mockResolvedValue({
      store: {
        id: "store-1",
        name: "테스트 스토어",
        vendorId: "A0001",
      },
      item: buildLiveDetail(
        buildLiveOrderRow({
          status: "INSTRUCT",
          vendorItemId: "VI-live",
          availableActions: ["uploadInvoice", "cancelOrderItem"],
        }),
      ),
      fetchedAt: "2026-04-17T10:00:00.000Z",
      servedFromFallback: false,
      message: null,
      source: "live",
    });

    const result = await resolveShipmentWorksheetBulkRows({
      storeId: "store-1",
      viewQuery: {
        scope: "all",
        page: 1,
        pageSize: 50,
      },
      mode: "invoice_ready",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      orderStatus: "INSTRUCT",
      vendorItemId: "VI-live",
      availableActions: ["uploadInvoice", "cancelOrderItem"],
    });
    expect(result.matchedCount).toBe(1);
    expect(result.resolvedCount).toBe(1);
    expect(setStoreSheetMock).toHaveBeenCalled();
  });

  it("drops stale ACCEPT rows from prepare_ready when live status is already INSTRUCT", async () => {
    state.sheet = buildSheet([
      buildWorksheetRow({
        deliveryCompanyCode: "",
        invoiceNumber: "",
        orderStatus: "ACCEPT",
        availableActions: ["markPreparing"],
        vendorItemId: "VI-stale",
      }),
    ]);
    getOrderDetailMock.mockResolvedValue({
      store: {
        id: "store-1",
        name: "테스트 스토어",
        vendorId: "A0001",
      },
      item: buildLiveDetail(
        buildLiveOrderRow({
          status: "INSTRUCT",
          vendorItemId: "VI-live",
          availableActions: ["uploadInvoice", "cancelOrderItem"],
        }),
      ),
      fetchedAt: "2026-04-17T10:00:00.000Z",
      servedFromFallback: false,
      message: null,
      source: "live",
    });

    const result = await resolveShipmentWorksheetBulkRows({
      storeId: "store-1",
      viewQuery: {
        scope: "all",
        page: 1,
        pageSize: 50,
      },
      mode: "prepare_ready",
    });

    expect(result.items).toHaveLength(0);
    expect(result.blockedItems).toHaveLength(0);
    expect(result.matchedCount).toBe(0);
    expect(result.resolvedCount).toBe(0);
    expect(setStoreSheetMock).toHaveBeenCalled();
  });
});
