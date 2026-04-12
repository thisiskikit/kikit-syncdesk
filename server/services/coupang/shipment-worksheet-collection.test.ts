import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CoupangExchangeRow,
  CoupangReturnRow,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";

const {
  getStoreMock,
  listOrdersMock,
  listReturnsMock,
  listExchangesMock,
  getOrderCustomerServiceSummaryMock,
  getOrderDetailMock,
  markPreparingMock,
  getProductDetailMock,
  getStoreSheetMock,
  getArchivedSourceKeysMock,
  setStoreSheetMock,
  recordSystemErrorEventMock,
} = vi.hoisted(() => ({
  getStoreMock: vi.fn(),
  listOrdersMock: vi.fn(),
  listReturnsMock: vi.fn(),
  listExchangesMock: vi.fn(),
  getOrderCustomerServiceSummaryMock: vi.fn(),
  getOrderDetailMock: vi.fn(),
  markPreparingMock: vi.fn(),
  getProductDetailMock: vi.fn(),
  getStoreSheetMock: vi.fn(),
  getArchivedSourceKeysMock: vi.fn(),
  setStoreSheetMock: vi.fn(),
  recordSystemErrorEventMock: vi.fn(),
}));

vi.mock("./settings-store", () => ({
  coupangSettingsStore: {
    getStore: getStoreMock,
  },
}));

vi.mock("./order-service", () => ({
  listOrders: listOrdersMock,
  listReturns: listReturnsMock,
  listExchanges: listExchangesMock,
  getOrderCustomerServiceSummary: getOrderCustomerServiceSummaryMock,
  getOrderDetail: getOrderDetailMock,
  markPreparing: markPreparingMock,
}));

vi.mock("./product-service", () => ({
  getProductDetail: getProductDetailMock,
}));

vi.mock("./shipment-worksheet-store", () => ({
  coupangShipmentWorksheetStore: {
    getStoreSheet: getStoreSheetMock,
    getArchivedSourceKeys: getArchivedSourceKeysMock,
    setStoreSheet: setStoreSheetMock,
  },
}));

vi.mock("../logs/service", () => ({
  recordSystemErrorEvent: recordSystemErrorEventMock,
}));

import { collectShipmentWorksheet, getShipmentWorksheet } from "./shipment-worksheet-service";

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
      testedAt: "2026-03-26T00:00:00.000Z",
      message: "ok",
    },
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
  };
}

function buildOrderRow(input: {
  id: string;
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  status: string;
  productName: string;
  optionName?: string | null;
  sellerProductName?: string;
  availableActions: ("markPreparing" | "cancelOrderItem" | "uploadInvoice")[];
  quantity?: number;
  salesPrice?: number | null;
  orderPrice?: number | null;
  deliveryCompanyCode?: string | null;
  invoiceNumber?: string | null;
  invoiceNumberUploadDate?: string | null;
}) {
  return {
    id: input.id,
    shipmentBoxId: input.shipmentBoxId,
    orderId: input.orderId,
    orderedAt: "2026-03-26T09:00:00+09:00",
    paidAt: "2026-03-26T09:00:00+09:00",
    status: input.status,
    ordererName: "Kim",
    receiverName: "Lee",
    receiverSafeNumber: "050-1111-2222",
    receiverAddress: "Seoul",
    receiverPostCode: "12345",
    productName: input.productName,
    optionName: input.optionName ?? "Default",
    sellerProductId: `P-${input.vendorItemId}`,
    sellerProductName: input.sellerProductName ?? input.productName,
    vendorItemId: input.vendorItemId,
    externalVendorSku: `SKU-${input.vendorItemId}`,
    quantity: input.quantity ?? 1,
    salesPrice: input.salesPrice ?? 10000,
    orderPrice: input.orderPrice ?? 10000,
    discountPrice: 0,
    cancelCount: 0,
    holdCountForCancel: 0,
    deliveryCompanyName: null,
    deliveryCompanyCode: input.deliveryCompanyCode ?? null,
    invoiceNumber: input.invoiceNumber ?? null,
    invoiceNumberUploadDate: input.invoiceNumberUploadDate ?? null,
    estimatedShippingDate: null,
    inTransitDateTime: null,
    deliveredDate: null,
    shipmentType: null,
    splitShipping: false,
    ableSplitShipping: false,
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: "unknown" as const,
    customerServiceFetchedAt: null,
    availableActions: input.availableActions,
  };
}

function buildReturnRow(
  overrides: Partial<CoupangReturnRow> = {},
): CoupangReturnRow {
  return {
    id: "return-1",
    receiptId: "50000111",
    orderId: "O-700",
    status: "RETURNS_UNCHECKED",
    cancelType: "RETURN",
    receiptType: "RETURN",
    returnDeliveryType: "SELLER",
    releaseStatus: "RELEASED",
    releaseStatusName: "COMPLETE",
    productName: "Claim Product",
    sellerProductId: "P-V-700",
    sellerProductName: "Claim Product",
    vendorItemId: "V-700",
    vendorItemName: "Claim Product / Default",
    shipmentBoxId: "700",
    purchaseCount: 1,
    cancelCount: 1,
    createdAt: "2026-03-26T09:00:00+09:00",
    modifiedAt: "2026-03-26T10:00:00+09:00",
    completeConfirmDate: null,
    completeConfirmType: null,
    reasonCode: "BUYER_CHANGED_MIND",
    reason: "BUYER_CHANGED_MIND",
    faultByType: "BUYER",
    preRefund: false,
    requesterName: "Lee",
    requesterPhone: "02-1234-5678",
    requesterMobile: "010-1111-2222",
    requesterAddress: "Seoul",
    requesterPostCode: "12345",
    deliveryCompanyCode: "CJGLS",
    deliveryInvoiceNo: "RET-700",
    retrievalChargeAmount: 3000,
    canMarkShipmentStopped: false,
    canMarkAlreadyShipped: false,
    canApproveReturn: true,
    canConfirmInbound: true,
    canUploadCollectionInvoice: true,
    ...overrides,
  };
}

function buildExchangeRow(
  overrides: Partial<CoupangExchangeRow> = {},
): CoupangExchangeRow {
  return {
    exchangeId: "70000101",
    orderId: "O-800",
    status: "EXCHANGED",
    orderDeliveryStatusCode: "DELIVERING",
    collectStatus: "COLLECTED",
    collectCompleteDate: "2026-03-26T09:00:00+09:00",
    createdAt: "2026-03-26T08:00:00+09:00",
    modifiedAt: "2026-03-26T11:00:00+09:00",
    reasonCode: "SIZE",
    reason: "SIZE_EXCHANGE",
    reasonDetail: "REQUESTED_LARGER_SIZE",
    productName: "Exchange Product",
    vendorItemId: "V-800",
    vendorItemName: "Exchange Product / Default",
    sellerProductId: "P-V-800",
    sellerProductName: "Exchange Product",
    shipmentBoxId: "800",
    originalShipmentBoxId: "800",
    quantity: 1,
    returnCustomerName: "Kim",
    returnMobile: "010-2222-3333",
    returnAddress: "Busan",
    deliveryCustomerName: "Kim",
    deliveryMobile: "010-2222-3333",
    deliveryAddress: "Busan",
    deliverCode: "CJGLS",
    invoiceNumber: "EX-800",
    canConfirmInbound: true,
    canReject: true,
    canUploadExchangeInvoice: true,
    ...overrides,
  };
}

function buildWorksheetRow(input: {
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  status?: string;
  productName?: string;
  optionName?: string | null;
  selpickOrderNumber?: string;
  deliveryCompanyCode?: string;
  invoiceNumber?: string;
  updatedAt?: string;
  createdAt?: string;
  lastOrderHydratedAt?: string | null;
  lastProductHydratedAt?: string | null;
  customerServiceIssueCount?: number;
  customerServiceIssueSummary?: string | null;
  customerServiceIssueBreakdown?: CoupangShipmentWorksheetRow["customerServiceIssueBreakdown"];
  customerServiceState?: "unknown" | "ready" | "stale";
  customerServiceFetchedAt?: string | null;
  deliveryRequest?: string | null;
  contact?: string | null;
  buyerPhoneNumber?: string | null;
  invoiceTransmissionStatus?: "pending" | "succeeded" | "failed" | null;
  invoiceTransmissionMessage?: string | null;
  invoiceTransmissionAt?: string | null;
  coupangDeliveryCompanyCode?: string | null;
  coupangInvoiceNumber?: string | null;
  coupangInvoiceUploadedAt?: string | null;
}) {
  const productName = input.productName ?? "Stored Product";
  const optionName = input.optionName ?? "Default";

  return {
    id: `${input.shipmentBoxId}:${input.vendorItemId}`,
    sourceKey: `store-1:${input.shipmentBoxId}:${input.vendorItemId}`,
    storeId: "store-1",
    storeName: "Test Store",
    orderDateText: "03/26",
    orderDateKey: "20260326",
    quantity: 1,
    productName,
    optionName,
    productOrderNumber: input.orderId,
    collectedPlatform: "Coupang",
    ordererName: "Kim",
    contact: input.contact ?? "050-1111-2222",
    receiverName: "Lee",
    receiverBaseName: "Lee",
    personalClearanceCode: null,
    collectedAccountName: "Test Store",
    deliveryCompanyCode: input.deliveryCompanyCode ?? "",
    selpickOrderNumber: input.selpickOrderNumber ?? "O20260326T0001",
    invoiceNumber: input.invoiceNumber ?? "",
    coupangDeliveryCompanyCode: input.coupangDeliveryCompanyCode ?? null,
    coupangInvoiceNumber: input.coupangInvoiceNumber ?? null,
    coupangInvoiceUploadedAt: input.coupangInvoiceUploadedAt ?? null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "Seoul",
    deliveryRequest: input.deliveryRequest ?? "memo",
    buyerPhoneNumber: input.buyerPhoneNumber ?? "050-1111-2222",
    productNumber: `P-${input.vendorItemId}`,
    exposedProductName: `${productName}, ${optionName}`,
    productOptionNumber: input.vendorItemId,
    sellerProductCode: `SKU-${input.vendorItemId}`,
    isOverseas: false,
    shipmentBoxId: input.shipmentBoxId,
    orderId: input.orderId,
    sellerProductId: `P-${input.vendorItemId}`,
    vendorItemId: input.vendorItemId,
    availableActions: ["uploadInvoice"],
    orderStatus: input.status ?? "INSTRUCT",
    customerServiceIssueCount: input.customerServiceIssueCount ?? 0,
    customerServiceIssueSummary: input.customerServiceIssueSummary ?? null,
    customerServiceIssueBreakdown: input.customerServiceIssueBreakdown ?? [],
    customerServiceState: input.customerServiceState ?? "unknown",
    customerServiceFetchedAt: input.customerServiceFetchedAt ?? null,
    orderedAtRaw: "2026-03-26T09:00:00+09:00",
    lastOrderHydratedAt: input.lastOrderHydratedAt ?? "2026-03-26T00:00:00.000Z",
    lastProductHydratedAt: input.lastProductHydratedAt ?? "2026-03-26T00:00:00.000Z",
    estimatedShippingDate: null,
    splitShipping: false,
    invoiceTransmissionStatus: input.invoiceTransmissionStatus ?? null,
    invoiceTransmissionMessage: input.invoiceTransmissionMessage ?? null,
    invoiceTransmissionAt: input.invoiceTransmissionAt ?? null,
    exportedAt: null,
    invoiceAppliedAt: null,
    createdAt: input.createdAt ?? "2026-03-26T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-03-26T00:00:00.000Z",
  } satisfies CoupangShipmentWorksheetRow;
}

function buildEmptySheet() {
  return {
    items: [],
    collectedAt: null,
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
    updatedAt: "2026-03-26T00:00:00.000Z",
  };
}

describe("coupang shipment worksheet collection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T10:30:00.000Z"));
    vi.clearAllMocks();
    getStoreMock.mockResolvedValue(buildStore());
    getStoreSheetMock.mockResolvedValue(buildEmptySheet());
    getArchivedSourceKeysMock.mockResolvedValue([]);
    listReturnsMock.mockResolvedValue({
      items: [],
      source: "live",
      message: null,
    });
    listExchangesMock.mockResolvedValue({
      items: [],
      source: "live",
      message: null,
    });
    getOrderCustomerServiceSummaryMock.mockResolvedValue({
      items: [],
      source: "live",
      message: null,
    });
    getOrderDetailMock.mockResolvedValue({
      item: null,
      source: "live",
      message: null,
    });
    getProductDetailMock.mockResolvedValue(null);
    setStoreSheetMock.mockImplementation(
      async (input: {
        items: unknown[];
        collectedAt: string;
        source: "live" | "fallback";
        message: string | null;
        syncState: unknown;
        syncSummary: unknown;
      }) => ({
        items: input.items,
        collectedAt: input.collectedAt,
        source: input.source,
        message: input.message,
        syncState: input.syncState,
        syncSummary: input.syncSummary,
        updatedAt: input.collectedAt,
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves new ACCEPT orders to preparing and unlocks invoice upload in the worksheet", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "100:V-1",
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-1",
          status: "ACCEPT",
          productName: "Fresh Order 1",
          availableActions: ["markPreparing", "cancelOrderItem"],
        }),
        buildOrderRow({
          id: "100:V-2",
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-2",
          status: "ACCEPT",
          productName: "Fresh Order 2",
          availableActions: ["markPreparing", "cancelOrderItem"],
        }),
        buildOrderRow({
          id: "200:V-3",
          shipmentBoxId: "200",
          orderId: "O-200",
          vendorItemId: "V-3",
          status: "INSTRUCT",
          productName: "Ready Order",
          availableActions: ["uploadInvoice", "cancelOrderItem"],
        }),
      ],
      source: "live",
      message: null,
    });
    markPreparingMock.mockResolvedValue({
      items: [
        {
          shipmentBoxId: "100",
          status: "succeeded",
        },
      ],
      summary: {
        total: 1,
        succeededCount: 1,
        failedCount: 0,
        warningCount: 0,
        skippedCount: 0,
      },
      completedAt: "2026-03-26T00:00:00.000Z",
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(listOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        fetchAllPages: true,
        includeCustomerService: false,
      }),
    );
    expect(getOrderDetailMock).toHaveBeenCalled();
    expect(
      getOrderDetailMock.mock.calls.every(
        ([input]) => (input as { includeCustomerService?: boolean }).includeCustomerService === false,
      ),
    ).toBe(true);
    expect(markPreparingMock).toHaveBeenCalledTimes(1);
    expect(markPreparingMock).toHaveBeenCalledWith({
      storeId: "store-1",
      items: [
        {
          shipmentBoxId: "100",
          orderId: "O-100",
          productName: "Fresh Order 1",
        },
      ],
    });
    expect(result.items).toHaveLength(3);
    const preparedRows = result.items.filter((item) => item.shipmentBoxId === "100");
    expect(preparedRows).toHaveLength(2);
    expect(preparedRows.every((item) => item.availableActions.includes("uploadInvoice"))).toBe(true);
    expect(preparedRows.some((item) => item.availableActions.includes("markPreparing"))).toBe(false);
    expect(result.syncSummary).toMatchObject({
      mode: "full",
      insertedCount: 3,
      updatedCount: 0,
      autoExpanded: true,
    });
  });

  it("keeps collection working when the prepare call fails", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "100:V-1",
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-1",
          status: "ACCEPT",
          productName: "Fresh Order",
          availableActions: ["markPreparing", "cancelOrderItem"],
        }),
      ],
      source: "live",
      message: null,
    });
    markPreparingMock.mockRejectedValue(new Error("prepare failed"));

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.availableActions).toContain("markPreparing");
    expect(result.message).toContain("prepare failed");
  });

  it("prefers registered product and option names from the product detail", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "500:V-500",
          shipmentBoxId: "500",
          orderId: "O-500",
          vendorItemId: "V-500",
          status: "INSTRUCT",
          productName: "Exposed Product, Exposed Option",
          optionName: "Exposed Option",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });
    getProductDetailMock.mockResolvedValue({
      item: {
        sellerProductId: "P-V-500",
        sellerProductName: "Registered Product",
        displayProductName: "Exposed Product",
        deliveryInfo: {
          pccNeeded: false,
        },
        items: [
          {
            vendorItemId: "V-500",
            itemName: "Registered Option",
            pccNeeded: false,
          },
        ],
      },
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "INSTRUCT",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.productName).toBe("Registered Product");
    expect(result.items[0]?.optionName).toBe("Registered Option");
    expect(result.items[0]?.exposedProductName).toBe("Registered Product, Registered Option");
    expect(result.items[0]?.coupangDisplayProductName).toBe("Exposed Product");
  });

  it("stores the total order price in the worksheet when quantity is greater than one", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "550:V-550",
          shipmentBoxId: "550",
          orderId: "O-550",
          vendorItemId: "V-550",
          status: "INSTRUCT",
          productName: "Two Pack",
          availableActions: ["uploadInvoice"],
          quantity: 2,
          salesPrice: 10000,
          orderPrice: 20000,
        }),
      ],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "INSTRUCT",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "550",
      quantity: 2,
      salePrice: 20000,
    });
  });

  it("marks newly collected rows as customer-service unknown", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "560:V-560",
          shipmentBoxId: "560",
          orderId: "O-560",
          vendorItemId: "V-560",
          status: "INSTRUCT",
          productName: "Unknown CS Order",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "INSTRUCT",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "560",
      customerServiceIssueCount: 0,
      customerServiceIssueSummary: null,
      customerServiceState: "unknown",
      customerServiceFetchedAt: null,
    });
  });

  it("adds a new worksheet row when quick collect finds a return-only claim", async () => {
    listOrdersMock.mockResolvedValue({
      items: [],
      source: "live",
      message: null,
    });
    listReturnsMock.mockResolvedValue({
      items: [buildReturnRow()],
      source: "live",
      message: null,
    });
    getOrderDetailMock.mockResolvedValue({
      item: null,
      source: "fallback",
      message: "order fallback",
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(listReturnsMock).toHaveBeenCalledWith({
      storeId: "store-1",
      cancelType: "ALL",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "700",
      orderId: "O-700",
      customerServiceIssueCount: 1,
      customerServiceState: "ready",
    });
    expect(result.items[0]?.customerServiceIssueBreakdown).toEqual([
      expect.objectContaining({ type: "return", count: 1 }),
    ]);
    expect(result.message).toContain("클레임");
    expect(result.message).toContain("신규 1건");
  });

  it("classifies claim-only cancel completion rows as shipment-stop handled during quick collect", async () => {
    listOrdersMock.mockResolvedValue({
      items: [],
      source: "live",
      message: null,
    });
    listReturnsMock.mockResolvedValue({
      items: [
        buildReturnRow({
          id: "cancel-1",
          receiptId: "50000112",
          orderId: "O-701",
          shipmentBoxId: "701",
          vendorItemId: "V-701",
          sellerProductId: "P-V-701",
          cancelType: "CANCEL",
          status: "UC",
          releaseStatus: "Y",
          releaseStatusName: "COMPLETE",
          completeConfirmDate: "2026-03-26T10:20:00+09:00",
        }),
      ],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.customerServiceIssueBreakdown).toEqual([
      expect.objectContaining({ type: "shipment_stop_handled", count: 1 }),
    ]);
    expect(result.items[0]?.customerServiceState).toBe("ready");
  });

  it("merges matching quick-collect claims into the active order row without duplication", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "702:V-702",
          shipmentBoxId: "702",
          orderId: "O-702",
          vendorItemId: "V-702",
          status: "INSTRUCT",
          productName: "Matched Claim Product",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });
    listReturnsMock.mockResolvedValue({
      items: [
        buildReturnRow({
          id: "return-702",
          receiptId: "50000113",
          orderId: "O-702",
          shipmentBoxId: "702",
          vendorItemId: "V-702",
          sellerProductId: "P-V-702",
        }),
      ],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "INSTRUCT",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.shipmentBoxId).toBe("702");
    expect(result.items[0]?.customerServiceIssueBreakdown).toEqual([
      expect.objectContaining({ type: "return", count: 1 }),
    ]);
    expect(result.syncSummary).toMatchObject({
      fetchedCount: 1,
      insertedCount: 1,
      updatedCount: 0,
    });
  });

  it("keeps recent stored customer-service data as ready during collection", async () => {
    getStoreSheetMock.mockResolvedValue({
      ...buildEmptySheet(),
      items: [
        buildWorksheetRow({
          shipmentBoxId: "561",
          orderId: "O-561",
          vendorItemId: "V-561",
          customerServiceIssueCount: 1,
          customerServiceIssueSummary: "Return 1",
          customerServiceState: "ready",
          customerServiceFetchedAt: "2026-03-26T10:25:00.000Z",
        }),
      ],
    });
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "561:V-561",
          shipmentBoxId: "561",
          orderId: "O-561",
          vendorItemId: "V-561",
          status: "INSTRUCT",
          productName: "Ready CS Order",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "INSTRUCT",
      maxPerPage: 20,
    });

    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "561",
      customerServiceIssueCount: 1,
      customerServiceIssueSummary: "Return 1",
      customerServiceState: "ready",
      customerServiceFetchedAt: "2026-03-26T10:25:00.000Z",
    });
  });

  it("marks older stored customer-service data as stale during collection", async () => {
    getStoreSheetMock.mockResolvedValue({
      ...buildEmptySheet(),
      items: [
        buildWorksheetRow({
          shipmentBoxId: "562",
          orderId: "O-562",
          vendorItemId: "V-562",
          customerServiceIssueCount: 2,
          customerServiceIssueSummary: "Cancel 1 / Return 1",
          customerServiceState: "ready",
          customerServiceFetchedAt: "2026-03-26T10:15:00.000Z",
        }),
      ],
    });
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "562:V-562",
          shipmentBoxId: "562",
          orderId: "O-562",
          vendorItemId: "V-562",
          status: "INSTRUCT",
          productName: "Stale CS Order",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "INSTRUCT",
      maxPerPage: 20,
    });

    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "562",
      customerServiceIssueCount: 2,
      customerServiceIssueSummary: "Cancel 1 / Return 1",
      customerServiceState: "stale",
      customerServiceFetchedAt: "2026-03-26T10:15:00.000Z",
    });
  });

  it("refreshes worksheet customer-service rows with a forced live lookup when reading the worksheet", async () => {
    getStoreSheetMock.mockResolvedValue({
      ...buildEmptySheet(),
      items: [
        buildWorksheetRow({
          shipmentBoxId: "563",
          orderId: "O-563",
          vendorItemId: "V-563",
          customerServiceIssueCount: 1,
          customerServiceIssueSummary: "Old claim",
          customerServiceIssueBreakdown: [{ type: "cancel", count: 1, label: "Cancel 1" }],
          customerServiceState: "ready",
          customerServiceFetchedAt: "2026-03-26T10:15:00.000Z",
        }),
      ],
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-25",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: "INSTRUCT",
      },
      syncSummary: {
        mode: "incremental",
        fetchedCount: 1,
        insertedCount: 0,
        updatedCount: 0,
        skippedHydrationCount: 0,
        autoExpanded: false,
        fetchCreatedAtFrom: "2026-03-25",
        fetchCreatedAtTo: "2026-03-26",
        statusFilter: "INSTRUCT",
      },
    });
    getOrderCustomerServiceSummaryMock.mockResolvedValue({
      items: [
        {
          rowKey: "563:V-563",
          customerServiceIssueCount: 1,
          customerServiceIssueSummary: "Shipment stop requested 1",
          customerServiceIssueBreakdown: [
            { type: "shipment_stop_requested", count: 1, label: "Shipment stop requested 1" },
          ],
          customerServiceState: "ready",
          customerServiceFetchedAt: "2026-03-26T10:30:00.000Z",
        },
      ],
      source: "live",
      message: null,
    });

    const result = await getShipmentWorksheet("store-1");

    expect(getOrderCustomerServiceSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        createdAtFrom: "2026-02-24",
        createdAtTo: "2026-03-26",
        forceRefresh: true,
      }),
    );
    expect(setStoreSheetMock).toHaveBeenCalledTimes(1);
    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "563",
      customerServiceIssueSummary: "Shipment stop requested 1",
      customerServiceState: "ready",
      customerServiceFetchedAt: "2026-03-26T10:30:00.000Z",
    });
  });

  it("refreshes even recently ready customer-service rows when reading the worksheet", async () => {
    getStoreSheetMock.mockResolvedValue({
      ...buildEmptySheet(),
      items: [
        buildWorksheetRow({
          shipmentBoxId: "564",
          orderId: "O-564",
          vendorItemId: "V-564",
          customerServiceIssueCount: 0,
          customerServiceIssueSummary: null,
          customerServiceIssueBreakdown: [],
          customerServiceState: "ready",
          customerServiceFetchedAt: "2026-03-26T10:28:00.000Z",
        }),
      ],
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-25",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: "INSTRUCT",
      },
      syncSummary: {
        mode: "incremental",
        fetchedCount: 1,
        insertedCount: 0,
        updatedCount: 0,
        skippedHydrationCount: 0,
        autoExpanded: false,
        fetchCreatedAtFrom: "2026-03-25",
        fetchCreatedAtTo: "2026-03-26",
        statusFilter: "INSTRUCT",
      },
    });
    getOrderCustomerServiceSummaryMock.mockResolvedValue({
      items: [
        {
          rowKey: "564:V-564",
          customerServiceIssueCount: 1,
          customerServiceIssueSummary: "Return 1",
          customerServiceIssueBreakdown: [
            { type: "return", count: 1, label: "Return 1" },
          ],
          customerServiceState: "ready",
          customerServiceFetchedAt: "2026-03-26T10:30:00.000Z",
        },
      ],
      source: "live",
      message: null,
    });

    const result = await getShipmentWorksheet("store-1");

    expect(getOrderCustomerServiceSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        forceRefresh: true,
      }),
    );
    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "564",
      customerServiceIssueSummary: "Return 1",
      customerServiceState: "ready",
      customerServiceFetchedAt: "2026-03-26T10:30:00.000Z",
    });
  });

  it("ignores fallback product detail and keeps the live order product name", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "600:V-600",
          shipmentBoxId: "600",
          orderId: "O-600",
          vendorItemId: "V-600",
          status: "INSTRUCT",
          productName: "Displayed Product, Red",
          sellerProductName: "Deleted But Ordered Product",
          optionName: "Red",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });
    getProductDetailMock.mockResolvedValue({
      item: {
        sellerProductId: "P-V-600",
        sellerProductName: "Fallback Sample Product",
        displayProductName: "Fallback Sample Product",
        items: [],
      },
      source: "fallback",
      message: "fallback detail",
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.productName).toBe("Deleted But Ordered Product");
    expect(result.items[0]?.optionName).toBe("Red");
    expect(result.message).toContain("쿠팡 주문 원본값으로 보완");
  });

  it("merges incrementally and preserves manual invoice fields", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "ACCEPT",
          selpickOrderNumber: "O20260326T0001",
          deliveryCompanyCode: "CJ",
          invoiceNumber: "INV-1",
          invoiceTransmissionStatus: "failed",
          invoiceTransmissionMessage: "previous failure",
          invoiceTransmissionAt: "2026-03-26T09:50:00.000Z",
        }),
      ],
      collectedAt: "2026-03-26T10:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-25",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: null,
      },
      syncSummary: null,
      updatedAt: "2026-03-26T10:00:00.000Z",
    });
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "100:V-100",
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "INSTRUCT",
          productName: "Stored Product",
          availableActions: ["uploadInvoice"],
        }),
        buildOrderRow({
          id: "200:V-200",
          shipmentBoxId: "200",
          orderId: "O-200",
          vendorItemId: "V-200",
          status: "INSTRUCT",
          productName: "New Product",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(listOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        createdAtFrom: "2026-03-25",
        createdAtTo: "2026-03-26",
        fetchAllPages: true,
        includeCustomerService: false,
      }),
    );
    expect(markPreparingMock).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(2);
    const preservedRow = result.items.find((item) => item.shipmentBoxId === "100");
    expect(preservedRow?.selpickOrderNumber).toBe("O20260326T0001");
    expect(preservedRow?.deliveryCompanyCode).toBe("CJ");
    expect(preservedRow?.invoiceNumber).toBe("INV-1");
    expect(preservedRow?.invoiceTransmissionStatus).toBe("failed");
    expect(preservedRow?.invoiceTransmissionMessage).toBe("previous failure");
    expect(preservedRow?.invoiceTransmissionAt).toBe("2026-03-26T09:50:00.000Z");
    expect(result.syncSummary).toMatchObject({
      mode: "incremental",
      insertedCount: 1,
      updatedCount: 1,
      autoExpanded: false,
    });
  });

  it("adds only unseen ACCEPT or INSTRUCT rows during new-only quick collect", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "ACCEPT",
          selpickOrderNumber: "O20260326T0001",
          deliveryCompanyCode: "CJ",
          invoiceNumber: "INV-1",
        }),
      ],
      collectedAt: "2026-03-26T10:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-25",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: null,
      },
      syncSummary: null,
      updatedAt: "2026-03-26T10:00:00.000Z",
    });
    listOrdersMock.mockImplementation(
      async (input: { status?: string; maxPerPage?: number; maxPages?: number }) => {
        if (input.status === "INSTRUCT") {
          return {
            items: [
              buildOrderRow({
                id: "200:V-200",
                shipmentBoxId: "200",
                orderId: "O-200",
                vendorItemId: "V-200",
                status: "INSTRUCT",
                productName: "New Product",
                availableActions: ["uploadInvoice"],
              }),
            ],
            source: "live" as const,
            message: null,
          };
        }

        return {
          items: [
            buildOrderRow({
              id: "100:V-100",
              shipmentBoxId: "100",
              orderId: "O-100",
              vendorItemId: "V-100",
              status: "ACCEPT",
              productName: "Stored Product Updated",
              availableActions: ["markPreparing", "cancelOrderItem"],
            }),
          ],
          source: "live" as const,
          message: null,
        };
      },
    );

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
      syncMode: "new_only",
    });

    expect(listOrdersMock).toHaveBeenCalledTimes(2);
    expect(listOrdersMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        storeId: "store-1",
        createdAtFrom: "2026-03-25",
        createdAtTo: "2026-03-26",
        status: "INSTRUCT",
        maxPerPage: 50,
        maxPages: 10,
        fetchAllPages: true,
        includeCustomerService: false,
      }),
    );
    expect(listOrdersMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        storeId: "store-1",
        createdAtFrom: "2026-03-25",
        createdAtTo: "2026-03-26",
        status: "ACCEPT",
        maxPerPage: 50,
        maxPages: 10,
        fetchAllPages: true,
        includeCustomerService: false,
      }),
    );
    expect(markPreparingMock).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(2);
    expect(result.items.find((item) => item.shipmentBoxId === "100")).toMatchObject({
      orderStatus: "ACCEPT",
      deliveryCompanyCode: "CJ",
      invoiceNumber: "INV-1",
    });
    expect(result.items.find((item) => item.shipmentBoxId === "200")).toMatchObject({
      orderStatus: "INSTRUCT",
      productName: "New Product",
    });
    expect(result.syncSummary).toMatchObject({
      mode: "new_only",
      fetchedCount: 1,
      insertedCount: 1,
      updatedCount: 0,
      autoExpanded: false,
      fetchCreatedAtFrom: "2026-03-25",
    });
  });

  it("keeps successful INSTRUCT results when the ACCEPT quick-collect lookup fails", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "INSTRUCT",
        }),
      ],
      collectedAt: "2026-03-26T10:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-25",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: null,
      },
      syncSummary: null,
      updatedAt: "2026-03-26T10:00:00.000Z",
    });
    listOrdersMock.mockImplementation(async (input: { status?: string }) => {
      if (input.status === "INSTRUCT") {
        return {
          items: [
            buildOrderRow({
              id: "200:V-200",
              shipmentBoxId: "200",
              orderId: "O-200",
              vendorItemId: "V-200",
              status: "INSTRUCT",
              productName: "New Instruct Product",
              availableActions: ["uploadInvoice"],
            }),
          ],
          source: "live" as const,
          message: null,
        };
      }

      if (input.status === "ACCEPT") {
        throw new Error("rate limited");
      }

      return {
        items: [],
        source: "live" as const,
        message: null,
      };
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
      syncMode: "new_only",
    });

    expect(markPreparingMock).not.toHaveBeenCalled();
    expect(result.source).toBe("live");
    expect(result.items).toHaveLength(2);
    expect(result.items.find((item) => item.shipmentBoxId === "200")).toMatchObject({
      orderStatus: "INSTRUCT",
      productName: "New Instruct Product",
    });
    expect(result.message).toContain("ACCEPT 신규 주문 조회에 실패했습니다.");
    expect(recordSystemErrorEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "coupang.shipment.quick-collect.status",
        channel: "coupang",
        meta: expect.objectContaining({
          phase: "quick_collect",
          mode: "new_only",
          status: "ACCEPT",
          required: true,
          storeId: "store-1",
          createdAtFrom: "2026-03-25",
          createdAtTo: "2026-03-26",
        }),
      }),
    );
  });

  it("skips claim and detail hydration when quick collect finds no new rows", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "ACCEPT",
          productName: "Stored Product",
        }),
      ],
      collectedAt: "2026-03-26T10:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-25",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: null,
      },
      syncSummary: null,
      updatedAt: "2026-03-26T10:00:00.000Z",
    });
    listOrdersMock.mockImplementation(async (input: { status?: string }) => ({
      items:
        input.status === "ACCEPT"
          ? [
              buildOrderRow({
                id: "100:V-100",
                shipmentBoxId: "100",
                orderId: "O-100",
                vendorItemId: "V-100",
                status: "ACCEPT",
                productName: "Stored Product Updated",
                availableActions: ["markPreparing", "cancelOrderItem"],
              }),
            ]
          : [],
      source: "live" as const,
      message: null,
    }));

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
      syncMode: "new_only",
    });

    expect(result.source).toBe("live");
    expect(result.syncSummary).toMatchObject({
      mode: "new_only",
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
    });
    expect(listReturnsMock).not.toHaveBeenCalled();
    expect(listExchangesMock).not.toHaveBeenCalled();
    expect(getOrderDetailMock).not.toHaveBeenCalled();
    expect(getProductDetailMock).not.toHaveBeenCalled();
  });

  it("stores the invoice currently registered in Coupang separately from local edits", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "100:V-100",
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "INSTRUCT",
          productName: "Stored Product",
          availableActions: ["uploadInvoice"],
          deliveryCompanyCode: "CJ",
          invoiceNumber: "INV-100",
          invoiceNumberUploadDate: "2026-03-26T09:30:00.000Z",
        }),
      ],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "INSTRUCT",
      maxPerPage: 20,
    });

    expect(result.items[0]).toMatchObject({
      deliveryCompanyCode: "CJ",
      invoiceNumber: "INV-100",
      coupangDeliveryCompanyCode: null,
      coupangInvoiceNumber: null,
      coupangInvoiceUploadedAt: null,
    });
  });

  it("keeps same-day end-date orders in the worksheet collection result", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "409-A:V-409-A",
          shipmentBoxId: "409-A",
          orderId: "O-409-A",
          vendorItemId: "V-409-A",
          status: "INSTRUCT",
          orderedAt: "2026-04-09T09:10:00+09:00",
          productName: "Same Day Instruct",
          availableActions: ["uploadInvoice"],
        }),
        buildOrderRow({
          id: "409-B:V-409-B",
          shipmentBoxId: "409-B",
          orderId: "O-409-B",
          vendorItemId: "V-409-B",
          status: "ACCEPT",
          orderedAt: "2026-04-09T18:45:00+09:00",
          productName: "Same Day Accept",
          availableActions: ["markPreparing"],
        }),
      ],
      source: "live",
      message: null,
    });
    markPreparingMock.mockResolvedValue({
      items: [
        {
          shipmentBoxId: "409-B",
          status: "succeeded",
        },
      ],
      summary: {
        total: 1,
        succeededCount: 1,
        failedCount: 0,
        warningCount: 0,
        skippedCount: 0,
      },
      completedAt: "2026-04-09T18:50:00.000Z",
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-04-08",
      createdAtTo: "2026-04-09",
      status: "",
      maxPerPage: 20,
    });

    expect(listOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        createdAtFrom: "2026-04-08",
        createdAtTo: "2026-04-09",
        fetchAllPages: true,
        includeCustomerService: false,
      }),
    );
    expect(markPreparingMock).toHaveBeenCalledWith({
      storeId: "store-1",
      items: [
        {
          shipmentBoxId: "409-B",
          orderId: "O-409-B",
          productName: "Same Day Accept",
        },
      ],
    });
    expect(result.items.map((item) => item.shipmentBoxId)).toEqual(["409-A", "409-B"]);
    expect(result.items.find((item) => item.shipmentBoxId === "409-A")?.availableActions).toContain(
      "uploadInvoice",
    );
    expect(result.items.find((item) => item.shipmentBoxId === "409-B")?.availableActions).toContain(
      "uploadInvoice",
    );
  });

  it("auto expands to a full reconcile when the requested range goes further back", async () => {
    getStoreSheetMock.mockResolvedValue({
      ...buildEmptySheet(),
      collectedAt: "2026-03-26T10:00:00.000Z",
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T10:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-25",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: null,
      },
    });
    listOrdersMock.mockResolvedValue({
      items: [],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(result.syncSummary).toMatchObject({
      mode: "full",
      autoExpanded: true,
      fetchCreatedAtFrom: "2026-03-20",
    });
  });

  it("retries prepare calls for rows already seen as ACCEPT", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "ACCEPT",
        }),
      ],
      collectedAt: "2026-03-26T10:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T10:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-25",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: null,
      },
      syncSummary: null,
      updatedAt: "2026-03-26T10:00:00.000Z",
    });
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "100:V-100",
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "ACCEPT",
          productName: "Repeat Accept",
          availableActions: ["markPreparing", "cancelOrderItem"],
        }),
      ],
      source: "live",
      message: null,
    });
    markPreparingMock.mockResolvedValue({
      items: [
        {
          shipmentBoxId: "100",
          status: "succeeded",
        },
      ],
      summary: {
        total: 1,
        succeededCount: 1,
        failedCount: 0,
        warningCount: 0,
        skippedCount: 0,
      },
      completedAt: "2026-03-26T00:00:00.000Z",
    });

    await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(markPreparingMock).toHaveBeenCalledTimes(1);
    expect(markPreparingMock).toHaveBeenCalledWith({
      storeId: "store-1",
      items: [
        {
          shipmentBoxId: "100",
          orderId: "O-100",
          productName: "Repeat Accept",
        },
      ],
    });
  });

  it("does not reinsert rows whose sourceKey already exists in archive storage", async () => {
    getArchivedSourceKeysMock.mockResolvedValue(["store-1:700:V-700"]);
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "700:V-700",
          shipmentBoxId: "700",
          orderId: "O-700",
          vendorItemId: "V-700",
          status: "INSTRUCT",
          productName: "Archived Row",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(result.items).toEqual([]);
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [],
      }),
    );
  });
});

