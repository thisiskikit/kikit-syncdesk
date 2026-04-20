import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CoupangExchangeRow,
  CoupangReturnRow,
  CoupangSettlementRow,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";

const {
  getStoreMock,
  listOrdersMock,
  listReturnsMock,
  listExchangesMock,
  getOrderCustomerServiceSummaryMock,
  getOrderDetailMock,
  listSettlementSalesMock,
  markPreparingMock,
  getProductDetailMock,
  getStoreSheetMock,
  getArchivedSourceKeysMock,
  ensureSelpickIntegrityMock,
  materializeSelpickOrderNumbersMock,
  setStoreSheetMock,
  upsertStoreRowsMock,
  archiveRowsMock,
  recordSystemErrorEventMock,
} = vi.hoisted(() => ({
  getStoreMock: vi.fn(),
  listOrdersMock: vi.fn(),
  listReturnsMock: vi.fn(),
  listExchangesMock: vi.fn(),
  getOrderCustomerServiceSummaryMock: vi.fn(),
  getOrderDetailMock: vi.fn(),
  listSettlementSalesMock: vi.fn(),
  markPreparingMock: vi.fn(),
  getProductDetailMock: vi.fn(),
  getStoreSheetMock: vi.fn(),
  getArchivedSourceKeysMock: vi.fn(),
  ensureSelpickIntegrityMock: vi.fn(),
  materializeSelpickOrderNumbersMock: vi.fn(),
  setStoreSheetMock: vi.fn(),
  upsertStoreRowsMock: vi.fn(),
  archiveRowsMock: vi.fn(),
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
  listSettlementSales: listSettlementSalesMock,
  markPreparing: markPreparingMock,
}));

vi.mock("./product-service", () => ({
  getProductDetail: getProductDetailMock,
}));

vi.mock("./shipment-worksheet-store", () => ({
  WORKSHEET_ROW_WRITE_CHUNK_SIZE: 200,
  coupangShipmentWorksheetStore: {
    getStoreSheet: getStoreSheetMock,
    getArchivedSourceKeys: getArchivedSourceKeysMock,
    ensureSelpickIntegrity: ensureSelpickIntegrityMock,
    materializeSelpickOrderNumbers: materializeSelpickOrderNumbersMock,
    setStoreSheet: setStoreSheetMock,
    upsertStoreRows: upsertStoreRowsMock,
    archiveRows: archiveRowsMock,
  },
}));

vi.mock("../logs/service", () => ({
  recordSystemErrorEvent: recordSystemErrorEventMock,
}));

import {
  collectShipmentWorksheet,
  getShipmentWorksheet,
  reconcileShipmentWorksheetLive,
  refreshShipmentWorksheet,
} from "./shipment-worksheet-service";

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
  orderedAt?: string;
  paidAt?: string;
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
    orderedAt: input.orderedAt ?? "2026-03-26T09:00:00+09:00",
    paidAt: input.paidAt ?? input.orderedAt ?? "2026-03-26T09:00:00+09:00",
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
    customerServiceTerminalStatus: null,
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
  customerServiceTerminalStatus?: CoupangShipmentWorksheetRow["customerServiceTerminalStatus"];
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
  purchaseConfirmedAt?: string | null;
  purchaseConfirmedSyncedAt?: string | null;
  purchaseConfirmedFinalSettlementDate?: string | null;
  purchaseConfirmedSource?: string | null;
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
    customerServiceTerminalStatus: input.customerServiceTerminalStatus ?? null,
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
    purchaseConfirmedAt: input.purchaseConfirmedAt ?? null,
    purchaseConfirmedSyncedAt: input.purchaseConfirmedSyncedAt ?? null,
    purchaseConfirmedFinalSettlementDate: input.purchaseConfirmedFinalSettlementDate ?? null,
    purchaseConfirmedSource: input.purchaseConfirmedSource ?? null,
    exportedAt: null,
    invoiceAppliedAt: null,
    createdAt: input.createdAt ?? "2026-03-26T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-03-26T00:00:00.000Z",
  } satisfies CoupangShipmentWorksheetRow;
}

function buildSettlementRow(
  overrides: Partial<CoupangSettlementRow> = {},
): CoupangSettlementRow {
  return {
    settlementId: "settlement-1",
    orderId: "O-950",
    saleType: "SALE",
    saleDate: "2026-03-25",
    recognitionDate: "2026-03-26",
    settlementDate: "2026-03-27",
    finalSettlementDate: "2026-03-31",
    productName: "Confirmed Product",
    vendorItemName: "Confirmed Product, Default",
    vendorItemId: "V-950",
    externalSellerSkuCode: "SKU-V-950",
    quantity: 1,
    salesAmount: 10000,
    saleAmount: 10000,
    settlementAmount: 9500,
    serviceFee: 500,
    serviceFeeVat: 50,
    serviceFeeRatio: 5,
    sellerDiscountCoupon: 0,
    downloadableCoupon: 0,
    deliveryFeeAmount: 0,
    deliveryFeeSettlementAmount: 0,
    taxType: "TAX",
    status: "FINALIZED",
    settledAt: "2026-03-31T00:00:00+09:00",
    ...overrides,
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
      orderedAt: "2026-03-26T09:00:00+09:00",
      paidAt: "2026-03-26T09:00:00+09:00",
      status: input.status ?? "INSTRUCT",
      orderer: {
        name: "Kim",
        email: null,
        safeNumber: "050-1111-2222",
        ordererNumber: "010-1111-2222",
      },
      receiver: {
        name: "Lee",
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
        buildOrderRow({
          id: `${input.shipmentBoxId}:${input.vendorItemId}`,
          shipmentBoxId: input.shipmentBoxId,
          orderId: input.orderId,
          vendorItemId: input.vendorItemId,
          status: input.status ?? "INSTRUCT",
          productName: input.productName ?? "Detailed Product",
          optionName: input.optionName ?? "Detailed Option",
          availableActions: ["uploadInvoice"],
        }),
      ],
      relatedReturnRequests: [],
      relatedExchangeRequests: [],
    },
    source: "live" as const,
    message: null,
  };
}

function buildEmptySheet(items: CoupangShipmentWorksheetRow[] = []) {
  return {
    items,
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
    ensureSelpickIntegrityMock.mockResolvedValue(undefined);
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
    listSettlementSalesMock.mockResolvedValue({
      items: [],
      source: "live",
      message: null,
      nextToken: null,
      pageCount: 1,
      hitSafeCap: false,
    });
    getProductDetailMock.mockResolvedValue(null);
    let materializeInitialized = false;
    const materializedRegistry = new Set<string>();
    const materializedCounters = new Map<string, number>();
    const parseSelpickOrderNumber = (value: string) => {
      const matched = value.trim().toUpperCase().match(/^O\d{8}([A-Z0-9])(\d{4,})$/);
      if (!matched) {
        return null;
      }

      const sequence = Number(matched[2]);
      return Number.isFinite(sequence)
        ? {
            platformKey: matched[1],
            sequence,
          }
        : null;
    };
    materializeSelpickOrderNumbersMock.mockImplementation(
      async (input: { items: CoupangShipmentWorksheetRow[]; platformKey: string }) => {
        if (!materializeInitialized) {
          const latestSheetPromise = getStoreSheetMock.mock.results.at(-1)?.value;
          const latestSheet =
            latestSheetPromise && typeof latestSheetPromise.then === "function"
              ? await latestSheetPromise
              : buildEmptySheet();
          for (const row of latestSheet.items ?? []) {
            const normalized = row.selpickOrderNumber?.trim().toUpperCase();
            if (!normalized) {
              continue;
            }

            materializedRegistry.add(normalized);
            const parsed = parseSelpickOrderNumber(normalized);
            if (!parsed) {
              continue;
            }

            materializedCounters.set(
              parsed.platformKey,
              Math.max(materializedCounters.get(parsed.platformKey) ?? 0, parsed.sequence),
            );
          }
          materializeInitialized = true;
        }

        const platformKey = input.platformKey.trim().toUpperCase();
        return input.items.map((row) => {
          const existingSelpickOrderNumber = row.selpickOrderNumber?.trim().toUpperCase();
          if (existingSelpickOrderNumber) {
            materializedRegistry.add(existingSelpickOrderNumber);
            const parsed = parseSelpickOrderNumber(existingSelpickOrderNumber);
            if (parsed) {
              materializedCounters.set(
                parsed.platformKey,
                Math.max(materializedCounters.get(parsed.platformKey) ?? 0, parsed.sequence),
              );
            }
            return {
              ...row,
              selpickOrderNumber: existingSelpickOrderNumber,
            };
          }

          let nextSequence = (materializedCounters.get(platformKey) ?? 0) + 1;
          let nextSelpickOrderNumber = `O${row.orderDateKey}${platformKey}${String(nextSequence).padStart(4, "0")}`;
          while (materializedRegistry.has(nextSelpickOrderNumber)) {
            nextSequence += 1;
            nextSelpickOrderNumber = `O${row.orderDateKey}${platformKey}${String(nextSequence).padStart(4, "0")}`;
          }

          materializedRegistry.add(nextSelpickOrderNumber);
          materializedCounters.set(platformKey, nextSequence);
          return {
            ...row,
            selpickOrderNumber: nextSelpickOrderNumber,
          };
        });
      },
    );
    archiveRowsMock.mockImplementation(async (input: { items: Array<{ sourceKey: string }>; dryRun?: boolean }) => ({
      archivedCount: input.dryRun ? 0 : input.items.length,
      skippedCount: 0,
      archivedSourceKeys: input.items.map((item) => item.sourceKey),
      dryRun: input.dryRun === true,
    }));
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
    upsertStoreRowsMock.mockImplementation(
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

  it("collects ACCEPT orders without auto prepare and leaves follow-up phases pending", async () => {
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
    expect(getOrderDetailMock).toHaveBeenCalledTimes(2);
    expect(markPreparingMock).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(3);
    const preparedRows = result.items.filter((item) => item.shipmentBoxId === "100");
    expect(preparedRows).toHaveLength(2);
    expect(preparedRows.every((item) => item.availableActions.includes("markPreparing"))).toBe(true);
    expect(result.syncSummary).toMatchObject({
      mode: "incremental",
      insertedCount: 3,
      insertedSourceKeys: [],
      updatedCount: 0,
      autoExpanded: false,
      completedPhases: ["worksheet_collect"],
      pendingPhases: [
        "order_detail_hydration",
        "product_detail_hydration",
        "customer_service_refresh",
      ],
    });
  });

  it("keeps collection working without blocking on the old prepare step", async () => {
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
    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.availableActions).toContain("markPreparing");
    expect(markPreparingMock).not.toHaveBeenCalled();
    expect(result.message).toContain("워크시트 반영 후 주문 상세, 상품 상세, CS 상태 보강을 이어서 진행합니다.");
  });

  it("hydrates registered option names during collect so the worksheet stays consistent immediately", async () => {
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
        displayProductName: "Displayed Product",
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
    expect(getProductDetailMock).toHaveBeenCalledTimes(1);
    expect(result.items[0]?.productName).toBe("Registered Product");
    expect(result.items[0]?.optionName).toBe("Registered Option");
    expect(result.syncSummary?.pendingPhases).toContain("product_detail_hydration");
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

    expect(result.items).toEqual([]);
    expect(archiveRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        items: [
          expect.objectContaining({
            sourceKey: "store-1:701:V-701",
            customerServiceTerminalStatus: "cancel_completed",
            customerServiceIssueBreakdown: [
              expect.objectContaining({ type: "shipment_stop_handled", count: 1 }),
            ],
            archiveReason: "cancel_completed",
          }),
        ],
      }),
    );
  });

  it("auto-archives completed cancel claims during collect", async () => {
    listOrdersMock.mockResolvedValue({
      items: [],
      source: "live",
      message: null,
    });
    listReturnsMock.mockResolvedValue({
      items: [
        buildReturnRow({
          id: "cancel-archive-1",
          receiptId: "50000999",
          orderId: "O-799",
          shipmentBoxId: "799",
          vendorItemId: "V-799",
          sellerProductId: "P-V-799",
          cancelType: "CANCEL",
          status: "CANCEL_COMPLETE",
          releaseStatusName: "출고중지 완료",
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

    expect(archiveRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        items: [
          expect.objectContaining({
            sourceKey: "store-1:799:V-799",
            archiveReason: "cancel_completed",
          }),
        ],
      }),
    );
    expect(result.items).toEqual([]);
    expect(result.message).toContain("완료된 취소/반품 1건을 보관함으로 이동했습니다.");
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [],
      }),
    );
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
        insertedSourceKeys: [],
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
        createdAtFrom: "2026-02-25",
        createdAtTo: "2026-03-26",
        forceRefresh: false,
      }),
    );
    expect(setStoreSheetMock).not.toHaveBeenCalled();
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
        forceRefresh: false,
      }),
    );
    expect(setStoreSheetMock).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "564",
      customerServiceIssueSummary: "Return 1",
      customerServiceState: "ready",
      customerServiceFetchedAt: "2026-03-26T10:30:00.000Z",
    });
  });

  it("leaves optionName empty instead of reusing exposed option text when collect-time option hydrate fails", async () => {
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
    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.productName).toBe("Displayed Product, Red");
    expect(result.items[0]?.optionName).toBe("Red");
    expect(getOrderDetailMock).toHaveBeenCalledTimes(1);
    expect(getProductDetailMock).toHaveBeenCalledTimes(1);
    expect(result.syncSummary?.pendingPhases).toContain("product_detail_hydration");
  });

  it("repairs mixed worksheet option values during collect when registered option data is available", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "610",
          orderId: "O-610",
          vendorItemId: "V-610",
          status: "INSTRUCT",
          productName: "Worksheet Product",
          optionName: "Worksheet Product, Exposed Option",
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
          id: "610:V-610",
          shipmentBoxId: "610",
          orderId: "O-610",
          vendorItemId: "V-610",
          status: "INSTRUCT",
          productName: "Worksheet Product, Exposed Option",
          optionName: "Exposed Option",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });
    getProductDetailMock.mockResolvedValue({
      item: {
        sellerProductId: "P-V-610",
        sellerProductName: "Registered Product",
        displayProductName: "Displayed Product",
        deliveryInfo: {
          pccNeeded: false,
        },
        items: [
          {
            vendorItemId: "V-610",
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
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
      status: "INSTRUCT",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      productName: "Registered Product",
      optionName: "Registered Option",
      exposedProductName: "Registered Product, Registered Option",
    });
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
    expect(listReturnsMock).not.toHaveBeenCalled();
    expect(listExchangesMock).not.toHaveBeenCalled();
    expect(getOrderDetailMock).not.toHaveBeenCalled();
    expect(getProductDetailMock).not.toHaveBeenCalled();
    expect(result.syncSummary).toMatchObject({
      mode: "new_only",
      fetchedCount: 1,
      insertedCount: 1,
      insertedSourceKeys: ["store-1:200:V-200"],
      updatedCount: 0,
      autoExpanded: false,
      fetchCreatedAtFrom: "2026-03-25",
      pendingPhases: [
        "order_detail_hydration",
        "product_detail_hydration",
        "customer_service_refresh",
      ],
    });
  });

  it("persists new-only checkpoints in 100-row batches before the final metadata update", async () => {
    listOrdersMock.mockImplementation(async (input: { status?: string }) => {
      if (input.status === "INSTRUCT") {
        return {
          items: Array.from({ length: 120 }, (_, index) =>
            buildOrderRow({
              id: `${200 + index}:V-${200 + index}`,
              shipmentBoxId: String(200 + index),
              orderId: `O-${200 + index}`,
              vendorItemId: `V-${200 + index}`,
              status: "INSTRUCT",
              productName: `Checkpoint Product ${index + 1}`,
              availableActions: ["uploadInvoice"],
            }),
          ),
          source: "live" as const,
          message: null,
        };
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

    expect(upsertStoreRowsMock).toHaveBeenCalledTimes(3);
    expect(
      (upsertStoreRowsMock.mock.calls[0]?.[0] as { items: unknown[] } | undefined)?.items,
    ).toHaveLength(100);
    expect(
      (upsertStoreRowsMock.mock.calls[1]?.[0] as { items: unknown[] } | undefined)?.items,
    ).toHaveLength(20);
    expect(
      (upsertStoreRowsMock.mock.calls[2]?.[0] as { items: unknown[] } | undefined)?.items,
    ).toHaveLength(0);
    expect(result.syncSummary).toMatchObject({
      mode: "new_only",
      insertedCount: 120,
      checkpointCount: 2,
      checkpointPersistedCount: 120,
    });
    expect(result.syncSummary?.lastCheckpointAt).toBeTypeOf("string");
  });

  it("narrows new-only quick collect to the recent overlap window", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "ACCEPT",
          selpickOrderNumber: "O20260328T0001",
        }),
      ],
      collectedAt: "2026-03-28T10:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-03-28T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-28T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-20",
        coveredCreatedAtTo: "2026-03-28",
        lastStatusFilter: null,
      },
      syncSummary: null,
      updatedAt: "2026-03-28T10:00:00.000Z",
    });
    listOrdersMock.mockResolvedValue({
      items: [],
      source: "live" as const,
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-28",
      status: "",
      maxPerPage: 20,
      syncMode: "new_only",
    });

    expect(listOrdersMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        storeId: "store-1",
        createdAtFrom: "2026-03-27",
        createdAtTo: "2026-03-28",
        status: "INSTRUCT",
      }),
    );
    expect(listOrdersMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        storeId: "store-1",
        createdAtFrom: "2026-03-27",
        createdAtTo: "2026-03-28",
        status: "ACCEPT",
      }),
    );
    expect(result.syncSummary).toMatchObject({
      mode: "new_only",
      fetchCreatedAtFrom: "2026-03-27",
      fetchCreatedAtTo: "2026-03-28",
    });
  });

  it("keeps increasing selpick order numbers across additional collects without resetting the sequence", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "100",
          orderId: "O-100",
          vendorItemId: "V-100",
          status: "ACCEPT",
          selpickOrderNumber: "O20260326T0009",
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
          id: "200:V-200",
          shipmentBoxId: "200",
          orderId: "O-200",
          vendorItemId: "V-200",
          status: "INSTRUCT",
          productName: "Next Day Product",
          orderedAt: "2026-03-27T09:00:00+09:00",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live" as const,
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-27",
      status: "",
      maxPerPage: 20,
      syncMode: "new_only",
    });

    expect(result.items.find((item) => item.shipmentBoxId === "200")).toMatchObject({
      orderDateKey: "20260327",
      selpickOrderNumber: "O20260327T0010",
    });
  });

  it("checks selpick integrity first and materializes new selpick numbers through the store helper", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "210:V-210",
          shipmentBoxId: "210",
          orderId: "O-210",
          vendorItemId: "V-210",
          status: "INSTRUCT",
          productName: "Integrity Product",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live" as const,
      message: null,
    });

    await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
      syncMode: "new_only",
    });

    expect(ensureSelpickIntegrityMock).toHaveBeenCalledWith({
      storeId: "store-1",
      platformKey: "T",
    });
    expect(materializeSelpickOrderNumbersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        platformKey: "T",
      }),
    );
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
      insertedSourceKeys: [],
      updatedCount: 0,
    });
    expect(listReturnsMock).not.toHaveBeenCalled();
    expect(listExchangesMock).not.toHaveBeenCalled();
    expect(getOrderDetailMock).not.toHaveBeenCalled();
    expect(getProductDetailMock).not.toHaveBeenCalled();
  });

  it("normalizes duplicate key persistence errors with constraint details", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "300:V-300",
          shipmentBoxId: "300",
          orderId: "O-300",
          vendorItemId: "V-300",
          status: "INSTRUCT",
          productName: "Duplicate Row",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });
    setStoreSheetMock.mockRejectedValueOnce({
      code: "23505",
      constraint: "coupang_shipment_rows_source_key_uidx",
      message: "duplicate key value violates unique constraint",
    });

    await expect(
      collectShipmentWorksheet({
        storeId: "store-1",
        createdAtFrom: "2026-03-25",
        createdAtTo: "2026-03-26",
        status: "",
        maxPerPage: 20,
      }),
    ).rejects.toThrow(
        "배송 시트 저장 중 중복 키 충돌이 발생했습니다. 제약=coupang_shipment_rows_source_key_uidx, mode=incremental, storeId=store-1",
    );
    expect(recordSystemErrorEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "coupang.shipment.collect.persist",
        meta: expect.objectContaining({
          operation: "set",
          storeId: "store-1",
          mode: "incremental",
          dbCode: "23505",
          constraint: "coupang_shipment_rows_source_key_uidx",
        }),
      }),
    );
  });

  it("normalizes not-null persistence errors with column details during checkpoint upsert", async () => {
    listOrdersMock.mockImplementation(async (input: { status?: string }) => ({
      items:
        input.status === "INSTRUCT"
          ? [
              buildOrderRow({
                id: "400:V-400",
                shipmentBoxId: "400",
                orderId: "O-400",
                vendorItemId: "V-400",
                status: "INSTRUCT",
                productName: "Null Column Row",
                availableActions: ["uploadInvoice"],
              }),
            ]
          : [],
      source: "live" as const,
      message: null,
    }));
    upsertStoreRowsMock.mockRejectedValueOnce({
      code: "23502",
      column: "order_id",
      message: "null value in column",
    });

    await expect(
      collectShipmentWorksheet({
        storeId: "store-1",
        createdAtFrom: "2026-03-25",
        createdAtTo: "2026-03-26",
        status: "",
        maxPerPage: 20,
        syncMode: "new_only",
      }),
    ).rejects.toThrow(
      "배송 시트 저장 중 필수 컬럼 누락이 발생했습니다. 컬럼=order_id, mode=new_only, storeId=store-1",
    );
    expect(recordSystemErrorEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "coupang.shipment.collect.persist",
        meta: expect.objectContaining({
          operation: "upsert",
          storeId: "store-1",
          mode: "new_only",
          dbCode: "23502",
          column: "order_id",
        }),
      }),
    );
  });

  it("normalizes generic persistence errors with row and chunk metadata", async () => {
    listOrdersMock.mockResolvedValue({
      items: [
        buildOrderRow({
          id: "500:V-500",
          shipmentBoxId: "500",
          orderId: "O-500",
          vendorItemId: "V-500",
          status: "INSTRUCT",
          productName: "Socket Failure Row",
          availableActions: ["uploadInvoice"],
        }),
      ],
      source: "live",
      message: null,
    });
    setStoreSheetMock.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(
      collectShipmentWorksheet({
        storeId: "store-1",
        createdAtFrom: "2026-03-25",
        createdAtTo: "2026-03-26",
        status: "",
        maxPerPage: 20,
      }),
    ).rejects.toThrow(
        "배송 시트 저장 중 DB 쓰기 오류가 발생했습니다. rows=1, chunks=1, mode=incremental, storeId=store-1",
    );
    expect(recordSystemErrorEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "coupang.shipment.collect.persist",
        meta: expect.objectContaining({
          operation: "set",
          storeId: "store-1",
          mode: "incremental",
          persistRowCount: 1,
          chunkCount: 1,
        }),
      }),
    );
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
    expect(markPreparingMock).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.shipmentBoxId)).toEqual(["409-A", "409-B"]);
    expect(result.items.find((item) => item.shipmentBoxId === "409-A")?.availableActions).toContain(
      "uploadInvoice",
    );
    expect(result.items.find((item) => item.shipmentBoxId === "409-B")?.availableActions).toContain(
      "markPreparing",
    );
  });

  it("keeps incremental sync as overlap refresh even when the requested range goes further back", async () => {
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
      mode: "incremental",
      autoExpanded: false,
      fetchCreatedAtFrom: "2026-03-25",
    });
  });

  it("forces full sync requests to the server-side recent 30-day whole-status mirror range", async () => {
    getStoreSheetMock.mockResolvedValue({
      ...buildEmptySheet(),
      collectedAt: "2026-03-26T10:00:00.000Z",
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T10:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-01",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: "INSTRUCT",
      },
    });
    listOrdersMock.mockResolvedValue({
      items: [],
      source: "live",
      message: null,
    });

    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "INSTRUCT",
      maxPerPage: 20,
      syncMode: "full",
    });

    expect(listOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        createdAtFrom: "2026-02-25",
        createdAtTo: "2026-03-26",
        status: undefined,
        fetchAllPages: true,
        includeCustomerService: false,
      }),
    );
    expect(result.syncSummary).toMatchObject({
      mode: "full",
      autoExpanded: false,
      fetchCreatedAtFrom: "2026-02-25",
      fetchCreatedAtTo: "2026-03-26",
      statusFilter: null,
    });
    expect(result.coverageCreatedAtFrom).toBe("2026-02-25");
    expect(result.coverageCreatedAtTo).toBe("2026-03-26");
    expect(result.isAuthoritativeMirror).toBe(true);
    expect(result.lastFullSyncedAt).toBe("2026-03-26T10:30:00.000Z");
  });

  it("keeps already-seen ACCEPT rows pending prepare instead of retrying during collect", async () => {
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
    const result = await collectShipmentWorksheet({
      storeId: "store-1",
      createdAtFrom: "2026-03-25",
      createdAtTo: "2026-03-26",
      status: "",
      maxPerPage: 20,
    });

    expect(markPreparingMock).not.toHaveBeenCalled();
    expect(result.items[0]?.availableActions).toContain("uploadInvoice");
    expect(result.syncSummary?.pendingPhases).toContain("order_detail_hydration");
  });

  it("refreshes pending collect phases and moves them into completed phases", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "910",
          orderId: "O-910",
          vendorItemId: "V-910",
          status: "INSTRUCT",
          productName: "Worksheet Product",
          optionName: "Worksheet Option",
          customerServiceState: "stale",
          customerServiceFetchedAt: null,
          lastOrderHydratedAt: null,
          lastProductHydratedAt: null,
          updatedAt: "2026-03-26T10:00:00.000Z",
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
      syncSummary: {
        mode: "incremental",
        fetchedCount: 1,
        insertedCount: 0,
        insertedSourceKeys: [],
        updatedCount: 1,
        skippedHydrationCount: 0,
        autoExpanded: false,
        fetchCreatedAtFrom: "2026-03-25",
        fetchCreatedAtTo: "2026-03-26",
        statusFilter: null,
        completedPhases: ["worksheet_collect"],
        pendingPhases: [
          "order_detail_hydration",
          "product_detail_hydration",
          "customer_service_refresh",
        ],
        warningPhases: [],
      },
      updatedAt: "2026-03-26T10:00:00.000Z",
    });
    getOrderDetailMock.mockResolvedValue({
      item: {
        orderer: {
          name: "Kim",
          safeNumber: "050-9999-0000",
          ordererNumber: "010-1111-2222",
        },
        receiver: {
          name: "Lee",
          safeNumber: "050-1111-2222",
          receiverNumber: "010-3333-4444",
          addr1: "Seoul",
          addr2: "101",
        },
        parcelPrintMessage: "문 앞",
        items: [
          {
            orderId: "O-910",
            shipmentBoxId: "910",
            vendorItemId: "V-910",
            sellerProductName: "Detailed Product",
            productName: "Detailed Product",
            optionName: "Detailed Option",
          },
        ],
      },
      source: "live",
      message: null,
    });
    getProductDetailMock.mockResolvedValue({
      item: {
        sellerProductId: "P-V-910",
        sellerProductName: "Registered Product",
        displayProductName: "Display Product",
        deliveryInfo: {
          pccNeeded: false,
        },
        items: [
          {
            vendorItemId: "V-910",
            itemName: "Registered Option",
            pccNeeded: false,
          },
        ],
      },
      source: "live",
      message: null,
    });
    getOrderCustomerServiceSummaryMock.mockResolvedValue({
      items: [
        {
          rowKey: "910:V-910",
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

    const result = await refreshShipmentWorksheet({
      storeId: "store-1",
      scope: "pending_after_collect",
    });

    expect(getOrderDetailMock).toHaveBeenCalledTimes(1);
    expect(getProductDetailMock).toHaveBeenCalledTimes(1);
    expect(getOrderCustomerServiceSummaryMock).toHaveBeenCalledTimes(1);
    expect(result.items[0]?.productName).toBe("Registered Product");
    expect(result.items[0]?.optionName).toBe("Registered Option");
    expect(result.items[0]?.customerServiceIssueSummary).toBe("Shipment stop requested 1");
    expect(result.completedPhases).toEqual([
      "worksheet_collect",
      "order_detail_hydration",
      "product_detail_hydration",
      "customer_service_refresh",
    ]);
    expect(result.pendingPhases).toEqual([]);
    expect(result.warningPhases).toEqual([]);
  });

  it("refreshes only targeted shipment boxes for shipment-box scoped follow-up", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "920-A",
          orderId: "O-920-A",
          vendorItemId: "V-920-A",
          status: "INSTRUCT",
          productName: "Before A",
          lastOrderHydratedAt: null,
          lastProductHydratedAt: null,
          customerServiceFetchedAt: null,
        }),
        buildWorksheetRow({
          shipmentBoxId: "920-B",
          orderId: "O-920-B",
          vendorItemId: "V-920-B",
          status: "INSTRUCT",
          productName: "Before B",
          lastOrderHydratedAt: "2026-03-26T10:00:00.000Z",
          lastProductHydratedAt: "2026-03-26T10:00:00.000Z",
          customerServiceFetchedAt: "2026-03-26T10:00:00.000Z",
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
    getOrderDetailMock.mockResolvedValue({
      item: null,
      source: "live",
      message: null,
    });
    getProductDetailMock.mockResolvedValue({
      item: {
        sellerProductId: "P-V-920-A",
        sellerProductName: "After A",
        displayProductName: "After A",
        deliveryInfo: {
          pccNeeded: false,
        },
        items: [
          {
            vendorItemId: "V-920-A",
            itemName: "Option A",
            pccNeeded: false,
          },
        ],
      },
      source: "live",
      message: null,
    });

    const result = await refreshShipmentWorksheet({
      storeId: "store-1",
      scope: "shipment_boxes",
      shipmentBoxIds: ["920-A"],
    });

    expect(getOrderDetailMock).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.shipmentBoxId).toBe("920-A");
    expect(result.refreshedCount).toBe(1);
  });

  it("patches purchase-confirmed fields from settlement SALE rows matched by orderId and vendorItemId", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildEmptySheet([
        buildWorksheetRow({
          shipmentBoxId: "950",
          orderId: "O-950",
          vendorItemId: "V-950",
          status: "FINAL_DELIVERY",
          productName: "Confirmed Product",
        }),
      ]),
    );
    listSettlementSalesMock.mockResolvedValue({
      items: [
        buildSettlementRow({
          orderId: "O-950",
          vendorItemId: "V-950",
          productName: "Confirmed Product",
          vendorItemName: "Confirmed Product, Default",
          recognitionDate: "2026-03-26",
          finalSettlementDate: "2026-03-31",
        }),
      ],
      source: "live",
      message: null,
      nextToken: null,
      pageCount: 1,
      hitSafeCap: false,
    });

    const result = await refreshShipmentWorksheet({
      storeId: "store-1",
      scope: "purchase_confirmed",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
    });

    expect(listSettlementSalesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        recognitionDateFrom: "2026-03-26",
        recognitionDateTo: "2026-03-26",
      }),
    );
    expect(result.refreshedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.completedPhases).toEqual(["purchase_confirm_refresh"]);
    expect(result.warningPhases).toEqual([]);
    expect(result.items).toEqual([
      expect.objectContaining({
        shipmentBoxId: "950",
        purchaseConfirmedAt: "2026-03-26",
        purchaseConfirmedFinalSettlementDate: "2026-03-31",
        purchaseConfirmedSource: "revenue_history_sale",
      }),
    ]);
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            sourceKey: "store-1:950:V-950",
            purchaseConfirmedAt: "2026-03-26",
            purchaseConfirmedSource: "revenue_history_sale",
          }),
        ],
      }),
    );
  });

  it("allows single-candidate fallback matching when settlement vendorItemId is missing", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildEmptySheet([
        buildWorksheetRow({
          shipmentBoxId: "951",
          orderId: "O-951",
          vendorItemId: "V-951",
          status: "DELIVERING",
          productName: "Fallback Product",
          optionName: "Blue",
        }),
      ]),
    );
    listSettlementSalesMock.mockResolvedValue({
      items: [
        buildSettlementRow({
          settlementId: "settlement-951",
          orderId: "O-951",
          vendorItemId: null,
          productName: "Fallback Product",
          vendorItemName: "Fallback Product, Blue",
          recognitionDate: "2026-03-26",
          finalSettlementDate: "2026-03-30",
        }),
      ],
      source: "live",
      message: null,
      nextToken: null,
      pageCount: 1,
      hitSafeCap: false,
    });

    const result = await refreshShipmentWorksheet({
      storeId: "store-1",
      scope: "purchase_confirmed",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
    });

    expect(result.updatedCount).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        shipmentBoxId: "951",
        purchaseConfirmedAt: "2026-03-26",
        purchaseConfirmedSource: "revenue_history_sale",
      }),
    );
  });

  it("skips ambiguous fallback purchase-confirm matches and records a warning", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildEmptySheet([
        buildWorksheetRow({
          shipmentBoxId: "952-A",
          orderId: "O-952",
          vendorItemId: "V-952-A",
          status: "FINAL_DELIVERY",
          productName: "Duplicate Product",
          optionName: "Default",
        }),
        buildWorksheetRow({
          shipmentBoxId: "952-B",
          orderId: "O-952",
          vendorItemId: "V-952-B",
          status: "FINAL_DELIVERY",
          productName: "Duplicate Product",
          optionName: "Default",
        }),
      ]),
    );
    listSettlementSalesMock.mockResolvedValue({
      items: [
        buildSettlementRow({
          settlementId: "settlement-952",
          orderId: "O-952",
          vendorItemId: null,
          productName: "Duplicate Product",
          vendorItemName: "Duplicate Product, Default",
        }),
      ],
      source: "live",
      message: null,
      nextToken: null,
      pageCount: 1,
      hitSafeCap: false,
    });

    const result = await refreshShipmentWorksheet({
      storeId: "store-1",
      scope: "purchase_confirmed",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
    });

    expect(result.refreshedCount).toBe(2);
    expect(result.updatedCount).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.completedPhases).toEqual([]);
    expect(result.warningPhases).toEqual(["purchase_confirm_refresh"]);
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            sourceKey: "store-1:952-A:V-952-A",
            purchaseConfirmedAt: null,
          }),
          expect.objectContaining({
            sourceKey: "store-1:952-B:V-952-B",
            purchaseConfirmedAt: null,
          }),
        ],
      }),
    );
  });

  it("keeps already purchase-confirmed rows unchanged when re-sync runs again", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildEmptySheet([
        buildWorksheetRow({
          shipmentBoxId: "953-A",
          orderId: "O-953-A",
          vendorItemId: "V-953-A",
          status: "FINAL_DELIVERY",
          productName: "Already Confirmed",
          purchaseConfirmedAt: "2026-03-25",
          purchaseConfirmedSyncedAt: "2026-03-25T12:00:00.000Z",
          purchaseConfirmedFinalSettlementDate: "2026-03-30",
          purchaseConfirmedSource: "revenue_history_sale",
        }),
        buildWorksheetRow({
          shipmentBoxId: "953-B",
          orderId: "O-953-B",
          vendorItemId: "V-953-B",
          status: "FINAL_DELIVERY",
          productName: "Still Pending",
        }),
      ]),
    );

    const result = await refreshShipmentWorksheet({
      storeId: "store-1",
      scope: "purchase_confirmed",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
    });

    expect(result.refreshedCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            sourceKey: "store-1:953-A:V-953-A",
            purchaseConfirmedAt: "2026-03-25",
            purchaseConfirmedFinalSettlementDate: "2026-03-30",
            purchaseConfirmedSource: "revenue_history_sale",
          }),
          expect.objectContaining({
            sourceKey: "store-1:953-B:V-953-B",
            purchaseConfirmedAt: null,
          }),
        ],
      }),
    );
  });

  it("keeps worksheet rows and records warning phases when follow-up refresh has warnings", async () => {
    getStoreSheetMock.mockResolvedValue({
      items: [
        buildWorksheetRow({
          shipmentBoxId: "930",
          orderId: "O-930",
          vendorItemId: "V-930",
          status: "INSTRUCT",
          productName: "Before Warning",
          lastOrderHydratedAt: "2026-03-26T10:00:00.000Z",
          lastProductHydratedAt: null,
          customerServiceFetchedAt: "2026-03-26T10:00:00.000Z",
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
    getOrderCustomerServiceSummaryMock.mockResolvedValue({
      items: [],
      source: "live",
      message: "customer service refresh warning",
    });

    const result = await refreshShipmentWorksheet({
      storeId: "store-1",
      scope: "shipment_boxes",
      shipmentBoxIds: ["930"],
    });

    expect(result.items[0]?.productName).toBe("Before Warning");
    expect(result.warningPhases).toContain("customer_service_refresh");
    expect(result.message).toContain("customer service refresh warning");
    expect(setStoreSheetMock).toHaveBeenCalled();
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

  it("archives live not-found rows and refreshes only the remaining worksheet rows", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildEmptySheet([
        buildWorksheetRow({
          shipmentBoxId: "930",
          orderId: "O-930",
          vendorItemId: "V-930",
          status: "INSTRUCT",
          productName: "Missing In Coupang",
        }),
        buildWorksheetRow({
          shipmentBoxId: "931",
          orderId: "O-931",
          vendorItemId: "V-931",
          status: "INSTRUCT",
          productName: "Still Active",
        }),
      ]),
    );
    getOrderDetailMock.mockImplementation(async (input: { shipmentBoxId?: string }) => {
      if (input.shipmentBoxId === "930") {
        return {
          item: null,
          source: "live" as const,
          message: null,
        };
      }

      return buildOrderDetailResponse({
        shipmentBoxId: "931",
        orderId: "O-931",
        vendorItemId: "V-931",
        status: "INSTRUCT",
        productName: "Still Active",
      });
    });

    const result = await reconcileShipmentWorksheetLive({
      storeId: "store-1",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
      viewQuery: {
        scope: "all",
      },
    });

    expect(result.archivedCount).toBe(1);
    expect(result.refreshedCount).toBe(1);
    expect(result.warningCount).toBe(0);
    expect(archiveRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        items: [
          expect.objectContaining({
            sourceKey: "store-1:930:V-930",
            archiveReason: "not_found_in_coupang",
          }),
        ],
      }),
    );
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ sourceKey: "store-1:931:V-931" })],
      }),
    );
    expect(getProductDetailMock).not.toHaveBeenCalled();
  });

  it("keeps fallback or error rows in the worksheet and reports them as warnings", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildEmptySheet([
        buildWorksheetRow({
          shipmentBoxId: "932",
          orderId: "O-932",
          vendorItemId: "V-932",
          status: "INSTRUCT",
          productName: "Fallback Row",
        }),
        buildWorksheetRow({
          shipmentBoxId: "933",
          orderId: "O-933",
          vendorItemId: "V-933",
          status: "INSTRUCT",
          productName: "Error Row",
        }),
      ]),
    );
    getOrderDetailMock.mockImplementation(async (input: { shipmentBoxId?: string }) => {
      if (input.shipmentBoxId === "932") {
        return {
          item: null,
          source: "fallback" as const,
          message: "live unavailable",
        };
      }

      throw new Error("timeout");
    });

    const result = await reconcileShipmentWorksheetLive({
      storeId: "store-1",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
      viewQuery: {
        scope: "all",
      },
    });

    expect(result.archivedCount).toBe(0);
    expect(result.refreshedCount).toBe(2);
    expect(result.warningCount).toBe(2);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("live unavailable"),
        expect.stringContaining("timeout"),
      ]),
    );
    expect(archiveRowsMock).not.toHaveBeenCalled();
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ sourceKey: "store-1:932:V-932" }),
          expect.objectContaining({ sourceKey: "store-1:933:V-933" }),
        ]),
      }),
    );
  });

  it("keeps completed claim auto-archive behavior after live reconcile refresh", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildEmptySheet([
        buildWorksheetRow({
          shipmentBoxId: "934",
          orderId: "O-934",
          vendorItemId: "V-934",
          status: "INSTRUCT",
          productName: "Missing Before Refresh",
        }),
        buildWorksheetRow({
          shipmentBoxId: "935",
          orderId: "O-935",
          vendorItemId: "V-935",
          status: "INSTRUCT",
          productName: "Completed Return After Refresh",
        }),
      ]),
    );
    getOrderDetailMock.mockImplementation(async (input: { shipmentBoxId?: string }) => {
      if (input.shipmentBoxId === "934") {
        return {
          item: null,
          source: "live" as const,
          message: null,
        };
      }

      return buildOrderDetailResponse({
        shipmentBoxId: "935",
        orderId: "O-935",
        vendorItemId: "V-935",
        status: "INSTRUCT",
        productName: "Completed Return After Refresh",
      });
    });
    getOrderCustomerServiceSummaryMock.mockResolvedValue({
      items: [
        {
          rowKey: "935:V-935",
          customerServiceIssueCount: 1,
          customerServiceIssueSummary: "반품 1건",
          customerServiceIssueBreakdown: [{ type: "return", count: 1, label: "반품 1건" }],
          customerServiceTerminalStatus: "return_completed",
          customerServiceState: "ready",
          customerServiceFetchedAt: "2026-03-26T10:30:00.000Z",
        },
      ],
      source: "live",
      message: null,
    });

    const result = await reconcileShipmentWorksheetLive({
      storeId: "store-1",
      createdAtFrom: "2026-03-26",
      createdAtTo: "2026-03-26",
      viewQuery: {
        scope: "all",
      },
    });

    expect(result.archivedCount).toBe(1);
    expect(result.refreshedCount).toBe(1);
    expect(archiveRowsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        items: [
          expect.objectContaining({
            sourceKey: "store-1:934:V-934",
            archiveReason: "not_found_in_coupang",
          }),
        ],
      }),
    );
    expect(archiveRowsMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        items: [
          expect.objectContaining({
            sourceKey: "store-1:935:V-935",
            archiveReason: "return_completed",
          }),
        ],
      }),
    );
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [],
      }),
    );
  });

  it("auto-archives completed return rows during refresh", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildEmptySheet([
        buildWorksheetRow({
          shipmentBoxId: "940",
          orderId: "O-940",
          vendorItemId: "V-940",
          status: "INSTRUCT",
          productName: "Return Refresh",
          customerServiceState: "unknown",
          customerServiceFetchedAt: null,
        }),
      ]),
    );
    getOrderCustomerServiceSummaryMock.mockResolvedValue({
      items: [
        {
          rowKey: "940:V-940",
          customerServiceIssueCount: 1,
          customerServiceIssueSummary: "반품 1건",
          customerServiceIssueBreakdown: [{ type: "return", count: 1, label: "반품 1건" }],
          customerServiceTerminalStatus: "return_completed",
          customerServiceState: "ready",
          customerServiceFetchedAt: "2026-03-26T10:30:00.000Z",
        },
      ],
      source: "live",
      message: null,
    });

    const result = await refreshShipmentWorksheet({
      storeId: "store-1",
      scope: "customer_service",
    });

    expect(archiveRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        items: [
          expect.objectContaining({
            sourceKey: "store-1:940:V-940",
            archiveReason: "return_completed",
          }),
        ],
      }),
    );
    expect(result.items).toEqual([]);
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [],
      }),
    );
  });

  it("keeps rows in the worksheet when auto-archive fails during refresh", async () => {
    getStoreSheetMock.mockResolvedValue(
      buildEmptySheet([
        buildWorksheetRow({
          shipmentBoxId: "941",
          orderId: "O-941",
          vendorItemId: "V-941",
          status: "INSTRUCT",
          productName: "Archive Failure",
        }),
      ]),
    );
    getOrderCustomerServiceSummaryMock.mockResolvedValue({
      items: [
        {
          rowKey: "941:V-941",
          customerServiceIssueCount: 1,
          customerServiceIssueSummary: "출고중지완료 1건",
          customerServiceIssueBreakdown: [
            { type: "shipment_stop_handled", count: 1, label: "출고중지완료 1건" },
          ],
          customerServiceTerminalStatus: "cancel_completed",
          customerServiceState: "ready",
          customerServiceFetchedAt: "2026-03-26T10:30:00.000Z",
        },
      ],
      source: "live",
      message: null,
    });
    archiveRowsMock.mockRejectedValueOnce(new Error("archive failed"));

    const result = await refreshShipmentWorksheet({
      storeId: "store-1",
      scope: "customer_service",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.customerServiceTerminalStatus).toBe("cancel_completed");
    expect(result.message).toContain("자동 보관 1건에 실패해 워크시트에 그대로 유지했습니다.");
    expect(setStoreSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ sourceKey: "store-1:941:V-941" })],
      }),
    );
  });
});

