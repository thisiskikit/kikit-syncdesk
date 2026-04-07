import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getStoreMock,
  getOrderDetailMock,
  listReturnsMock,
  getReturnDetailMock,
  listExchangesMock,
  getExchangeDetailMock,
} = vi.hoisted(() => ({
  getStoreMock: vi.fn(),
  getOrderDetailMock: vi.fn(),
  listReturnsMock: vi.fn(),
  getReturnDetailMock: vi.fn(),
  listExchangesMock: vi.fn(),
  getExchangeDetailMock: vi.fn(),
}));

vi.mock("./settings-store", () => ({
  coupangSettingsStore: {
    getStore: getStoreMock,
  },
}));

vi.mock("./order-service", () => ({
  getOrderDetail: getOrderDetailMock,
  listReturns: listReturnsMock,
  getReturnDetail: getReturnDetailMock,
  listExchanges: listExchangesMock,
  getExchangeDetail: getExchangeDetailMock,
  listOrders: vi.fn(),
  markPreparing: vi.fn(),
}));

import { getShipmentWorksheetDetail } from "./shipment-worksheet-service";

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

function buildReturnRow() {
  return {
    id: "return-1",
    receiptId: "50000111",
    orderId: "O-100",
    status: "RETURNS_UNCHECKED",
    cancelType: "RETURN" as const,
    receiptType: "RETURN",
    returnDeliveryType: "SELLER",
    releaseStatus: "RELEASED",
    releaseStatusName: "출고 완료",
    productName: "Stored Product",
    sellerProductId: "P-100",
    sellerProductName: "Stored Product",
    vendorItemId: "V-100",
    vendorItemName: "Stored Product / Default",
    shipmentBoxId: "100",
    purchaseCount: 1,
    cancelCount: 1,
    createdAt: "2026-03-21T09:00:00+09:00",
    modifiedAt: "2026-03-21T10:00:00+09:00",
    completeConfirmDate: null,
    completeConfirmType: null,
    reasonCode: "BUYER_CHANGED_MIND",
    reason: "단순 변심",
    faultByType: "BUYER",
    preRefund: false,
    requesterName: "Kim",
    requesterPhone: "02-1234-5678",
    requesterMobile: "010-1111-2222",
    requesterAddress: "서울시 강남구",
    requesterPostCode: "06236",
    deliveryCompanyCode: "CJGLS",
    deliveryInvoiceNo: "RET-123456",
    retrievalChargeAmount: 3000,
    canMarkShipmentStopped: false,
    canMarkAlreadyShipped: false,
    canApproveReturn: true,
    canConfirmInbound: true,
    canUploadCollectionInvoice: true,
  };
}

function buildReturnDetail() {
  const summaryRow = buildReturnRow();
  return {
    receiptId: summaryRow.receiptId,
    orderId: summaryRow.orderId,
    status: summaryRow.status,
    cancelType: summaryRow.cancelType,
    receiptType: summaryRow.receiptType,
    returnDeliveryType: summaryRow.returnDeliveryType,
    completeConfirmDate: summaryRow.completeConfirmDate,
    completeConfirmType: summaryRow.completeConfirmType,
    createdAt: summaryRow.createdAt,
    modifiedAt: summaryRow.modifiedAt,
    reasonCode: summaryRow.reasonCode,
    reason: summaryRow.reason,
    faultByType: summaryRow.faultByType,
    preRefund: summaryRow.preRefund,
    requester: {
      name: summaryRow.requesterName,
      phone: summaryRow.requesterPhone,
      mobile: summaryRow.requesterMobile,
      postCode: summaryRow.requesterPostCode,
      address: summaryRow.requesterAddress,
      addressDetail: "101동 1201호",
    },
    returnCharge: {
      amount: summaryRow.retrievalChargeAmount,
      rawText: "3000",
    },
    items: [
      {
        vendorItemId: summaryRow.vendorItemId,
        vendorItemName: summaryRow.vendorItemName,
        sellerProductId: summaryRow.sellerProductId,
        sellerProductName: summaryRow.sellerProductName,
        shipmentBoxId: summaryRow.shipmentBoxId,
        purchaseCount: summaryRow.purchaseCount,
        cancelCount: summaryRow.cancelCount,
        releaseStatus: summaryRow.releaseStatus,
        releaseStatusName: "출고 완료",
      },
    ],
    deliveries: [
      {
        deliveryCompanyCode: summaryRow.deliveryCompanyCode,
        deliveryInvoiceNo: summaryRow.deliveryInvoiceNo,
        returnDeliveryId: "DELIVERY-1",
        returnExchangeDeliveryType: "RETURN",
        regNumber: null,
      },
    ],
    summaryRow,
  };
}

function buildExchangeRow() {
  return {
    exchangeId: "70000101",
    orderId: "O-100",
    status: "EXCHANGED",
    orderDeliveryStatusCode: "DELIVERING",
    collectStatus: "COLLECTED",
    collectCompleteDate: "2026-03-22T09:00:00+09:00",
    createdAt: "2026-03-22T08:00:00+09:00",
    modifiedAt: "2026-03-22T11:00:00+09:00",
    reasonCode: "SIZE",
    reason: "사이즈 교환",
    reasonDetail: "한 치수 크게 요청",
    productName: "Stored Product",
    vendorItemId: "V-100",
    vendorItemName: "Stored Product / Default",
    sellerProductId: "P-100",
    sellerProductName: "Stored Product",
    shipmentBoxId: "100",
    originalShipmentBoxId: "100",
    quantity: 1,
    returnCustomerName: "Kim",
    returnMobile: "010-1111-2222",
    returnAddress: "서울시 강남구",
    deliveryCustomerName: "Kim",
    deliveryMobile: "010-1111-2222",
    deliveryAddress: "서울시 강남구",
    deliverCode: "CJGLS",
    invoiceNumber: "EX-123456",
    canConfirmInbound: true,
    canReject: true,
    canUploadExchangeInvoice: true,
  };
}

function buildExchangeDetail() {
  const summaryRow = buildExchangeRow();
  return {
    exchangeId: summaryRow.exchangeId,
    orderId: summaryRow.orderId,
    status: summaryRow.status,
    orderDeliveryStatusCode: summaryRow.orderDeliveryStatusCode,
    collectStatus: summaryRow.collectStatus,
    collectCompleteDate: summaryRow.collectCompleteDate,
    createdAt: summaryRow.createdAt,
    modifiedAt: summaryRow.modifiedAt,
    reasonCode: summaryRow.reasonCode,
    reason: summaryRow.reason,
    reasonDetail: summaryRow.reasonDetail,
    requester: {
      name: summaryRow.returnCustomerName,
      phone: "02-1234-5678",
      mobile: summaryRow.returnMobile,
      postCode: "06236",
      address: summaryRow.returnAddress,
      addressDetail: "101동 1201호",
      memo: "오후 방문 요청",
    },
    recipient: {
      name: summaryRow.deliveryCustomerName,
      phone: "02-1234-5678",
      mobile: summaryRow.deliveryMobile,
      postCode: "06236",
      address: summaryRow.deliveryAddress,
      addressDetail: "101동 1201호",
      memo: "문 앞에 놓아주세요",
    },
    items: [
      {
        vendorItemId: summaryRow.vendorItemId,
        vendorItemName: summaryRow.vendorItemName,
        orderItemName: summaryRow.vendorItemName,
        targetItemName: `${summaryRow.vendorItemName} Large`,
        quantity: summaryRow.quantity,
        shipmentBoxId: summaryRow.shipmentBoxId,
        releaseStatus: "RELEASED",
        collectStatus: summaryRow.collectStatus,
      },
    ],
    invoices: [
      {
        shipmentBoxId: summaryRow.shipmentBoxId,
        orderId: summaryRow.orderId,
        orderType: "EXCHANGE",
        shippingDeliveryType: "EXCHANGE_DELIVERY",
        invoiceNumber: summaryRow.invoiceNumber,
        estimatedDeliveryDate: "2026-03-24",
        deliveredDate: null,
        statusCode: summaryRow.status,
        deliverCode: summaryRow.deliverCode,
        invoiceNumberUploadDate: "2026-03-22T11:30:00+09:00",
        invoiceModifiable: true,
      },
    ],
    summaryRow,
  };
}

function buildOrderDetail() {
  return {
    shipmentBoxId: "100",
    orderId: "O-100",
    orderedAt: "2026-03-20T09:00:00+09:00",
    paidAt: "2026-03-20T09:05:00+09:00",
    status: "INSTRUCT",
    orderer: {
      name: "Kim",
      email: "kim@example.com",
      safeNumber: "050-1111-2222",
      ordererNumber: "010-1111-2222",
    },
    receiver: {
      name: "Lee",
      safeNumber: "050-3333-4444",
      receiverNumber: "010-3333-4444",
      addr1: "서울시 강남구",
      addr2: "101동 1201호",
      postCode: "06236",
    },
    deliveryCompanyName: "CJ대한통운",
    deliveryCompanyCode: "CJGLS",
    invoiceNumber: "1234567890",
    inTransitDateTime: null,
    deliveredDate: null,
    parcelPrintMessage: "부재 시 문 앞에 놓아주세요.",
    shipmentType: "SEQUENTIAL",
    splitShipping: false,
    ableSplitShipping: false,
    items: [],
    relatedReturnRequests: [buildReturnRow()],
    relatedExchangeRequests: [buildExchangeRow()],
  };
}

describe("getShipmentWorksheetDetail", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T10:30:00.000Z"));
    vi.clearAllMocks();
    getStoreMock.mockResolvedValue(buildStore());
  });

  it("loads order detail with return and exchange claims for the selected row", async () => {
    const returnRow = buildReturnRow();
    const exchangeRow = buildExchangeRow();

    getOrderDetailMock.mockResolvedValue({
      item: buildOrderDetail(),
      source: "live",
      message: null,
    });
    listReturnsMock.mockResolvedValue({
      items: [returnRow],
      source: "live",
      message: null,
    });
    getReturnDetailMock.mockResolvedValue({
      item: buildReturnDetail(),
      source: "live",
      message: null,
    });
    listExchangesMock.mockResolvedValue({
      items: [exchangeRow],
      source: "live",
      message: null,
    });
    getExchangeDetailMock.mockResolvedValue({
      item: buildExchangeDetail(),
      source: "live",
      message: null,
    });

    const result = await getShipmentWorksheetDetail({
      storeId: "store-1",
      shipmentBoxId: "100",
      orderId: "O-100",
      orderedAtRaw: "2026-03-20T09:00:00+09:00",
    });

    expect(listReturnsMock).toHaveBeenCalledWith({
      storeId: "store-1",
      orderId: "O-100",
      cancelType: "ALL",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-26",
    });
    expect(listExchangesMock).toHaveBeenCalledWith({
      storeId: "store-1",
      orderId: "O-100",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-26",
      maxPerPage: 50,
    });
    expect(getReturnDetailMock).toHaveBeenCalledWith({
      storeId: "store-1",
      receiptId: "50000111",
    });
    expect(getExchangeDetailMock).toHaveBeenCalledWith({
      storeId: "store-1",
      exchangeId: "70000101",
      orderId: "O-100",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-26",
    });
    expect(result.source).toBe("live");
    expect(result.item.orderDetail?.orderId).toBe("O-100");
    expect(result.item.returns).toHaveLength(1);
    expect(result.item.returnDetails).toHaveLength(1);
    expect(result.item.exchanges).toHaveLength(1);
    expect(result.item.exchangeDetails).toHaveLength(1);
  });

  it("filters claims to the selected worksheet row instead of returning the whole order CS history", async () => {
    const matchingReturn = buildReturnRow();
    const unrelatedReturn = {
      ...buildReturnRow(),
      id: "return-2",
      receiptId: "50000999",
      shipmentBoxId: "999",
      vendorItemId: "V-999",
    };
    const matchingExchange = buildExchangeRow();
    const unrelatedExchange = {
      ...buildExchangeRow(),
      exchangeId: "70000999",
      shipmentBoxId: "999",
      originalShipmentBoxId: "999",
      vendorItemId: "V-999",
      sellerProductId: "P-999",
    };

    getOrderDetailMock.mockResolvedValue({
      item: {
        ...buildOrderDetail(),
        relatedReturnRequests: [matchingReturn, unrelatedReturn],
        relatedExchangeRequests: [matchingExchange, unrelatedExchange],
      },
      source: "live",
      message: null,
    });
    listReturnsMock.mockResolvedValue({
      items: [matchingReturn, unrelatedReturn],
      source: "live",
      message: null,
    });
    getReturnDetailMock.mockResolvedValue({
      item: buildReturnDetail(),
      source: "live",
      message: null,
    });
    listExchangesMock.mockResolvedValue({
      items: [matchingExchange, unrelatedExchange],
      source: "live",
      message: null,
    });
    getExchangeDetailMock.mockResolvedValue({
      item: buildExchangeDetail(),
      source: "live",
      message: null,
    });

    const result = await getShipmentWorksheetDetail({
      storeId: "store-1",
      shipmentBoxId: "100",
      orderId: "O-100",
      vendorItemId: "V-100",
      sellerProductId: "P-100",
      orderedAtRaw: "2026-03-20T09:00:00+09:00",
    });

    expect(result.item.orderDetail?.relatedReturnRequests).toHaveLength(1);
    expect(result.item.orderDetail?.relatedReturnRequests[0]?.receiptId).toBe("50000111");
    expect(result.item.orderDetail?.relatedExchangeRequests).toHaveLength(1);
    expect(result.item.orderDetail?.relatedExchangeRequests[0]?.exchangeId).toBe("70000101");
    expect(result.item.returns).toHaveLength(1);
    expect(result.item.returns[0]?.receiptId).toBe("50000111");
    expect(result.item.exchanges).toHaveLength(1);
    expect(result.item.exchanges[0]?.exchangeId).toBe("70000101");
    expect(getReturnDetailMock).toHaveBeenCalledTimes(1);
    expect(getExchangeDetailMock).toHaveBeenCalledTimes(1);
  });

  it("does not surface fallback sample claims in the detail popup", async () => {
    getOrderDetailMock.mockResolvedValue({
      item: buildOrderDetail(),
      source: "fallback",
      message: "order fallback",
    });
    listReturnsMock.mockResolvedValue({
      items: [buildReturnRow()],
      source: "fallback",
      message: "returns fallback",
    });
    listExchangesMock.mockResolvedValue({
      items: [buildExchangeRow()],
      source: "fallback",
      message: "exchanges fallback",
    });

    const result = await getShipmentWorksheetDetail({
      storeId: "store-1",
      shipmentBoxId: "100",
      orderId: "O-100",
      orderedAtRaw: "2026-03-20T09:00:00+09:00",
    });

    expect(result.source).toBe("fallback");
    expect(result.item.orderDetail).toBeNull();
    expect(result.item.returns).toEqual([]);
    expect(result.item.returnDetails).toEqual([]);
    expect(result.item.exchanges).toEqual([]);
    expect(result.item.exchangeDetails).toEqual([]);
    expect(result.message).toContain("order fallback");
    expect(result.message).toContain("returns fallback");
    expect(result.message).toContain("exchanges fallback");
    expect(getReturnDetailMock).not.toHaveBeenCalled();
    expect(getExchangeDetailMock).not.toHaveBeenCalled();
  });
});
