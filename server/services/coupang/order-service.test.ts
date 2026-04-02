import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestCoupangJsonMock, getStoreMock } = vi.hoisted(() => ({
  requestCoupangJsonMock: vi.fn(),
  getStoreMock: vi.fn(),
}));

vi.mock("./api-client", () => ({
  requestCoupangJson: requestCoupangJsonMock,
}));

vi.mock("./settings-store", () => ({
  coupangSettingsStore: {
    getStore: getStoreMock,
  },
}));

import { getOrderCustomerServiceSummary, listOrders, markPreparing, uploadInvoice } from "./order-service";

const ALL_ORDER_STATUSES = [
  "ACCEPT",
  "INSTRUCT",
  "DEPARTURE",
  "DELIVERING",
  "FINAL_DELIVERY",
  "NONE_TRACKING",
];

type MockApiInput = {
  path: string;
  query: URLSearchParams;
  body?: string;
};

function buildStore() {
  return {
    id: "store-1",
    channel: "coupang" as const,
    storeName: "Test Store",
    vendorId: "A0001",
    credentials: {
      accessKey: "test-access",
      secretKey: "test-secret",
    },
    baseUrl: "https://api-gateway.coupang.com",
    connectionTest: {
      status: "success" as const,
      testedAt: "2026-03-25T00:00:00.000Z",
      message: "ok",
    },
    createdAt: "2026-03-25T00:00:00.000Z",
    updatedAt: "2026-03-25T00:00:00.000Z",
  };
}

function buildOrderSheet(input: {
  shipmentBoxId: string;
  orderId: string;
  vendorItemId: string;
  status: string;
  orderedAt: string;
  productName: string;
  sellerProductName?: string;
  itemName?: string;
  quantity?: number;
  salesPrice?: number;
  orderPrice?: number | null;
}) {
  return {
    shipmentBoxId: input.shipmentBoxId,
    orderId: input.orderId,
    orderedAt: input.orderedAt,
    paidAt: input.orderedAt,
    status: input.status,
    orderer: {
      name: "Kim",
    },
    receiver: {
      name: "Lee",
      safeNumber: "050-1234-5678",
      addr1: "Seoul",
      postCode: "05510",
    },
    orderItems: [
      {
        vendorItemId: input.vendorItemId,
        vendorItemName: input.productName,
        itemName: input.itemName,
        sellerProductId: `P-${input.vendorItemId}`,
        sellerProductName: input.sellerProductName,
        externalVendorSkuCode: `SKU-${input.vendorItemId}`,
        shippingCount: input.quantity ?? 1,
        salesPrice: input.salesPrice ?? 10000,
        orderPrice: input.orderPrice ?? undefined,
      },
    ],
  };
}

function buildReturnReceipt(input: {
  receiptId: string;
  orderId: string;
  shipmentBoxId: string;
  vendorItemId: string;
  cancelType: "RETURN" | "CANCEL";
  productName: string;
}) {
  return {
    receiptId: input.receiptId,
    orderId: input.orderId,
    status: "RECEIPT",
    cancelType: input.cancelType,
    createdAt: "2026-03-26T09:00:00+09:00",
    returnItems: [
      {
        sellerProductName: input.productName,
        vendorItemId: input.vendorItemId,
        shipmentBoxId: input.shipmentBoxId,
        cancelCount: 1,
      },
    ],
  };
}

function buildExchangeRequest(input: {
  exchangeId: string;
  orderId: string;
  shipmentBoxId: string;
  vendorItemId: string;
  productName: string;
}) {
  return {
    exchangeId: input.exchangeId,
    orderId: input.orderId,
    exchangeStatus: "RECEIPT",
    createdAt: "2026-03-27T09:00:00+09:00",
    exchangeItems: [
      {
        vendorItemId: input.vendorItemId,
        shipmentBoxId: input.shipmentBoxId,
        orderItemName: input.productName,
        exchangeCount: 1,
      },
    ],
    deliveryInvoiceGroupDtos: [
      {
        shipmentBoxId: input.shipmentBoxId,
      },
    ],
  };
}

function getOrderSheetCalls() {
  return requestCoupangJsonMock.mock.calls.filter(([input]) =>
    (input as MockApiInput).path.includes("/ordersheets"),
  );
}

function getClaimLookupCalls() {
  return requestCoupangJsonMock.mock.calls.filter(([input]) => {
    const path = (input as MockApiInput).path;
    return path.includes("/returnRequests") || path.includes("/exchangeRequests");
  });
}

function mockOrderApi(input: {
  orders?: unknown[];
  ordersByStatus?: Record<string, unknown[]>;
  orderErrorsByStatus?: Record<string, Error>;
  orderPageResolver?: (request: MockApiInput) => { data?: unknown[]; nextToken?: string | null };
  returns?: unknown[];
  cancels?: unknown[];
  exchanges?: unknown[];
  returnError?: Error;
  cancelError?: Error;
  exchangeError?: Error;
}) {
  requestCoupangJsonMock.mockImplementation(async (request: MockApiInput) => {
    if (request.path.includes("/ordersheets")) {
      if (input.orderPageResolver) {
        return input.orderPageResolver(request);
      }

      const status = request.query.get("status") ?? "";
      const statusError = input.orderErrorsByStatus?.[status];
      if (statusError) {
        throw statusError;
      }

      return {
        data: input.ordersByStatus?.[status] ?? input.orders ?? [],
        nextToken: null,
      };
    }

    if (request.path.includes("/returnRequests")) {
      const cancelType = request.query.get("cancelType") ?? "RETURN";

      if (cancelType === "CANCEL") {
        if (input.cancelError) {
          throw input.cancelError;
        }

        return {
          data: input.cancels ?? [],
        };
      }

      if (input.returnError) {
        throw input.returnError;
      }

      return {
        data: input.returns ?? [],
      };
    }

    if (request.path.includes("/exchangeRequests")) {
      if (input.exchangeError) {
        throw input.exchangeError;
      }

      return {
        data: input.exchanges ?? [],
      };
    }

    throw new Error(`Unexpected path: ${request.path}`);
  });
}

describe("coupang order service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoreMock.mockResolvedValue(buildStore());
  });

  it("keeps the single-status lookup path when a status filter is provided", async () => {
    mockOrderApi({
      ordersByStatus: {
        ACCEPT: [
          buildOrderSheet({
            shipmentBoxId: "100",
            orderId: "O-100",
            vendorItemId: "V-100",
            status: "ACCEPT",
            orderedAt: "2026-03-24T09:00:00+09:00",
            productName: "Accepted Item",
          }),
        ],
      },
    });

    const result = await listOrders({
      storeId: "store-1",
      status: "ACCEPT",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
      maxPerPage: 20,
    });

    expect(getOrderSheetCalls()).toHaveLength(1);
    expect(getClaimLookupCalls()).toHaveLength(0);
    expect(getOrderSheetCalls()[0]?.[0].query.get("status")).toBe("ACCEPT");
    expect(result.source).toBe("live");
    expect(result.servedFromFallback).toBe(false);
    expect(result.nextToken).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "100",
      id: "100:V-100",
      optionName: "Accepted Item",
      customerServiceIssueCount: 0,
      customerServiceIssueSummary: null,
      customerServiceState: "unknown",
      customerServiceFetchedAt: null,
    });
  });

  it("merges per-status live order results when no status filter is provided", async () => {
    mockOrderApi({
      ordersByStatus: {
        ACCEPT: [
          buildOrderSheet({
            shipmentBoxId: "100",
            orderId: "O-100",
            vendorItemId: "V-100",
            status: "ACCEPT",
            orderedAt: "2026-03-24T09:00:00+09:00",
            productName: "Shared Item",
          }),
          buildOrderSheet({
            shipmentBoxId: "050",
            orderId: "O-050",
            vendorItemId: "V-050",
            status: "ACCEPT",
            orderedAt: "2026-03-20T09:00:00+09:00",
            productName: "Old Item",
          }),
        ],
        INSTRUCT: [
          buildOrderSheet({
            shipmentBoxId: "200",
            orderId: "O-200",
            vendorItemId: "V-200",
            status: "INSTRUCT",
            orderedAt: "2026-03-25T09:00:00+09:00",
            productName: "Newest Item",
          }),
          buildOrderSheet({
            shipmentBoxId: "100",
            orderId: "O-100",
            vendorItemId: "V-100",
            status: "INSTRUCT",
            orderedAt: "2026-03-24T09:00:00+09:00",
            productName: "Shared Item",
          }),
        ],
      },
      orderErrorsByStatus: {
        DELIVERING: new Error("temporary failure"),
      },
    });

    const result = await listOrders({
      storeId: "store-1",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
      maxPerPage: 2,
    });

    expect(getOrderSheetCalls()).toHaveLength(ALL_ORDER_STATUSES.length);
    expect(getClaimLookupCalls()).toHaveLength(0);
    expect(getOrderSheetCalls().map(([input]) => input.query.get("status"))).toEqual(
      ALL_ORDER_STATUSES,
    );
    expect(result.source).toBe("live");
    expect(result.servedFromFallback).toBe(false);
    expect(result.nextToken).toBeNull();
    expect(result.items.map((item) => item.shipmentBoxId)).toEqual(["200", "100"]);
    expect(result.message).toContain("temporary failure");
  });

  it("returns a live guidance message for unsupported cancel filters", async () => {
    const result = await listOrders({
      storeId: "store-1",
      status: "CANCEL",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
    });

    expect(requestCoupangJsonMock).not.toHaveBeenCalled();
    expect(result.source).toBe("live");
    expect(result.servedFromFallback).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.message).toBeTruthy();
  });

  it("keeps item-level rows unique when a shipment box contains multiple order items", async () => {
    mockOrderApi({
      ordersByStatus: {
        INSTRUCT: [
          {
            shipmentBoxId: "100",
            orderId: "O-100",
            orderedAt: "2026-03-24T09:00:00+09:00",
            paidAt: "2026-03-24T09:00:00+09:00",
            status: "INSTRUCT",
            receiver: {
              name: "Lee",
              safeNumber: "050-1234-5678",
              addr1: "Seoul",
              postCode: "05510",
            },
            orderItems: [
              {
                vendorItemId: "V-100-A",
                vendorItemName: "Option A",
                sellerProductId: "P-100",
                sellerProductName: "Shared Product",
                shippingCount: 1,
              },
              {
                vendorItemId: "V-100-B",
                vendorItemName: "Option B",
                sellerProductId: "P-100",
                sellerProductName: "Shared Product",
                shippingCount: 2,
              },
            ],
          },
        ],
      },
    });

    const result = await listOrders({
      storeId: "store-1",
      status: "INSTRUCT",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.id)).toEqual(["100:V-100-A", "100:V-100-B"]);
    expect(result.items.map((item) => item.optionName)).toEqual(["Option A", "Option B"]);
  });

  it("keeps only the option value when vendorItemName includes the exposed product name", async () => {
    mockOrderApi({
      ordersByStatus: {
        INSTRUCT: [
          buildOrderSheet({
            shipmentBoxId: "300",
            orderId: "O-300",
            vendorItemId: "V-300",
            status: "INSTRUCT",
            orderedAt: "2026-03-24T09:00:00+09:00",
            productName: "Shared Product, Blue / Large",
            sellerProductName: "Shared Product",
            itemName: "Blue / Large",
          }),
        ],
      },
    });

    const result = await listOrders({
      storeId: "store-1",
      status: "INSTRUCT",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.optionName).toBe("Blue / Large");
    expect(result.items[0]?.sellerProductName).toBe("Shared Product");
  });

  it("strips the seller product name from vendorItemName when itemName is missing", async () => {
    mockOrderApi({
      ordersByStatus: {
        INSTRUCT: [
          buildOrderSheet({
            shipmentBoxId: "400",
            orderId: "O-400",
            vendorItemId: "V-400",
            status: "INSTRUCT",
            orderedAt: "2026-03-24T09:00:00+09:00",
            productName: "Shared Product, Blue / Large",
            sellerProductName: "Shared Product",
          }),
        ],
      },
    });

    const result = await listOrders({
      storeId: "store-1",
      status: "INSTRUCT",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.optionName).toBe("Blue / Large");
  });

  it("follows every nextToken page when fetchAllPages is enabled", async () => {
    mockOrderApi({
      orderPageResolver: (request) => {
        const nextToken = request.query.get("nextToken");

        if (!nextToken) {
          return {
            data: [
              buildOrderSheet({
                shipmentBoxId: "100",
                orderId: "O-100",
                vendorItemId: "V-100",
                status: "INSTRUCT",
                orderedAt: "2026-03-24T09:00:00+09:00",
                productName: "Page One",
              }),
            ],
            nextToken: "token-2",
          };
        }

        expect(nextToken).toBe("token-2");
        return {
          data: [
            buildOrderSheet({
              shipmentBoxId: "200",
              orderId: "O-200",
              vendorItemId: "V-200",
              status: "INSTRUCT",
              orderedAt: "2026-03-25T09:00:00+09:00",
              productName: "Page Two",
            }),
          ],
          nextToken: null,
        };
      },
    });

    const result = await listOrders({
      storeId: "store-1",
      status: "INSTRUCT",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
      maxPerPage: 20,
      fetchAllPages: true,
    });

    expect(getOrderSheetCalls()).toHaveLength(2);
    expect(result.items.map((item) => item.shipmentBoxId)).toEqual(["200", "100"]);
    expect(result.nextToken).toBeNull();
  });

  it("preserves item orderPrice as the displayed total when quantity is greater than one", async () => {
    mockOrderApi({
      ordersByStatus: {
        INSTRUCT: [
          buildOrderSheet({
            shipmentBoxId: "500",
            orderId: "O-500",
            vendorItemId: "V-500",
            status: "INSTRUCT",
            orderedAt: "2026-03-24T09:00:00+09:00",
            productName: "Bundle Item",
            quantity: 2,
            salesPrice: 10000,
            orderPrice: 20000,
          }),
        ],
      },
    });

    const result = await listOrders({
      storeId: "store-1",
      status: "INSTRUCT",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      quantity: 2,
      salesPrice: 10000,
      orderPrice: 20000,
    });
  });

  it("backfills orderPrice from salesPrice and quantity when the API omits it", async () => {
    mockOrderApi({
      ordersByStatus: {
        INSTRUCT: [
          buildOrderSheet({
            shipmentBoxId: "600",
            orderId: "O-600",
            vendorItemId: "V-600",
            status: "INSTRUCT",
            orderedAt: "2026-03-24T09:00:00+09:00",
            productName: "Missing Total Price",
            quantity: 2,
            salesPrice: 10000,
            orderPrice: null,
          }),
          buildOrderSheet({
            shipmentBoxId: "601",
            orderId: "O-601",
            vendorItemId: "V-601",
            status: "INSTRUCT",
            orderedAt: "2026-03-24T09:00:00+09:00",
            productName: "Single Quantity",
            quantity: 1,
            salesPrice: 10000,
            orderPrice: null,
          }),
        ],
      },
    });

    const result = await listOrders({
      storeId: "store-1",
      status: "INSTRUCT",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
      maxPerPage: 20,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "600",
      quantity: 2,
      salesPrice: 10000,
      orderPrice: 20000,
    });
    expect(result.items[1]).toMatchObject({
      shipmentBoxId: "601",
      quantity: 1,
      salesPrice: 10000,
      orderPrice: 10000,
    });
  });

  it("returns CS summary fields for cancel, return, and exchange issues", async () => {
    mockOrderApi({
      returns: [
        buildReturnReceipt({
          receiptId: "R-RETURN",
          orderId: "O-700",
          shipmentBoxId: "700",
          vendorItemId: "V-700",
          cancelType: "RETURN",
          productName: "Claimed Item",
        }),
      ],
      cancels: [
        buildReturnReceipt({
          receiptId: "R-CANCEL",
          orderId: "O-700",
          shipmentBoxId: "700",
          vendorItemId: "V-700",
          cancelType: "CANCEL",
          productName: "Claimed Item",
        }),
      ],
      exchanges: [
        buildExchangeRequest({
          exchangeId: "E-700",
          orderId: "O-700",
          shipmentBoxId: "700",
          vendorItemId: "V-700",
          productName: "Claimed Item",
        }),
      ],
    });

    const result = await getOrderCustomerServiceSummary({
      storeId: "store-1",
      createdAtFrom: "2026-03-20",
      createdAtTo: "2026-03-25",
      items: [
        {
          rowKey: "700:V-700",
          orderId: "O-700",
          shipmentBoxId: "700",
          vendorItemId: "V-700",
          sellerProductId: "P-V-700",
        },
      ],
    });

    expect(result.source).toBe("live");
    expect(result.servedFromFallback).toBe(false);
    expect(result.items[0]).toMatchObject({
      rowKey: "700:V-700",
      customerServiceIssueCount: 3,
      customerServiceState: "ready",
    });
    expect(result.items[0]?.customerServiceIssueSummary).toContain("1");
    expect(result.items[0]?.customerServiceIssueBreakdown).toEqual([
      expect.objectContaining({ type: "cancel", count: 1 }),
      expect.objectContaining({ type: "return", count: 1 }),
      expect.objectContaining({ type: "exchange", count: 1 }),
    ]);
    expect(getClaimLookupCalls()).toHaveLength(3);
  });

  it("reuses the 10-minute cache for repeated CS summary lookups", async () => {
    mockOrderApi({
      returns: [
        buildReturnReceipt({
          receiptId: "R-CACHE",
          orderId: "O-720",
          shipmentBoxId: "720",
          vendorItemId: "V-720",
          cancelType: "RETURN",
          productName: "Cache Item",
        }),
      ],
      cancels: [],
      exchanges: [],
    });

    const input = {
      storeId: "store-1",
      createdAtFrom: "2026-03-21",
      createdAtTo: "2026-03-26",
      items: [
        {
          rowKey: "720:V-720",
          orderId: "O-720",
          shipmentBoxId: "720",
          vendorItemId: "V-720",
          sellerProductId: "P-V-720",
        },
      ],
    } as const;

    const first = await getOrderCustomerServiceSummary(input);
    const second = await getOrderCustomerServiceSummary(input);

    expect(first.source).toBe("live");
    expect(second.source).toBe("live");
    expect(second.servedFromCache).toBe(true);
    expect(second.cacheState).toBe("fresh-cache");
    expect(getClaimLookupCalls()).toHaveLength(3);
  });

  it("deduplicates concurrent CS summary lookups for the same range", async () => {
    let releaseExchangeLookup: (() => void) | null = null;

    requestCoupangJsonMock.mockImplementation(async (request: MockApiInput) => {
      if (request.path.includes("/returnRequests")) {
        return { data: [] };
      }

      if (request.path.includes("/exchangeRequests")) {
        await new Promise<void>((resolve) => {
          releaseExchangeLookup = resolve;
        });

        return { data: [] };
      }

      throw new Error(`Unexpected path: ${request.path}`);
    });

    const input = {
      storeId: "store-1",
      createdAtFrom: "2026-03-22",
      createdAtTo: "2026-03-26",
      items: [
        {
          rowKey: "730:V-730",
          orderId: "O-730",
          shipmentBoxId: "730",
          vendorItemId: "V-730",
          sellerProductId: "P-V-730",
        },
      ],
    } as const;

    const pendingResults = Promise.all([
      getOrderCustomerServiceSummary(input),
      getOrderCustomerServiceSummary(input),
    ]);

    await vi.waitFor(() => {
      expect(releaseExchangeLookup).toBeTypeOf("function");
      expect(getClaimLookupCalls()).toHaveLength(3);
    });

    releaseExchangeLookup?.();
    const [first, second] = await pendingResults;

    expect(first.source).toBe("live");
    expect(second.source).toBe("live");
    expect(getClaimLookupCalls()).toHaveLength(3);
  });

  it("does not poison the CS cache when a lookup fails", async () => {
    mockOrderApi({
      exchangeError: new Error("claim lookup down"),
    });

    const input = {
      storeId: "store-1",
      createdAtFrom: "2026-03-23",
      createdAtTo: "2026-03-26",
      items: [
        {
          rowKey: "740:V-740",
          orderId: "O-740",
          shipmentBoxId: "740",
          vendorItemId: "V-740",
          sellerProductId: "P-V-740",
        },
      ],
    } as const;

    const first = await getOrderCustomerServiceSummary(input);

    expect(first.source).toBe("fallback");
    expect(first.servedFromFallback).toBe(true);
    expect(first.items[0]).toMatchObject({
      customerServiceIssueCount: 0,
      customerServiceIssueSummary: null,
      customerServiceState: "unknown",
      customerServiceFetchedAt: null,
    });

    vi.clearAllMocks();
    getStoreMock.mockResolvedValue(buildStore());
    mockOrderApi({
      returns: [
        buildReturnReceipt({
          receiptId: "R-RECOVER",
          orderId: "O-740",
          shipmentBoxId: "740",
          vendorItemId: "V-740",
          cancelType: "RETURN",
          productName: "Recovered Item",
        }),
      ],
      cancels: [],
      exchanges: [],
    });

    const second = await getOrderCustomerServiceSummary(input);

    expect(second.source).toBe("live");
    expect(second.servedFromFallback).toBe(false);
    expect(second.items[0]).toMatchObject({
      customerServiceIssueCount: 1,
      customerServiceState: "ready",
    });
    expect(getClaimLookupCalls()).toHaveLength(3);
  });

  it("treats duplicate invoice uploads as succeeded", async () => {
    requestCoupangJsonMock.mockResolvedValue({
      data: {
        responseList: [
          {
            shipmentBoxId: "101",
            resultCode: "ALREADY_REGISTERED",
            retryRequired: false,
            succeed: false,
            resultMessage: "duplicate invoice",
          },
        ],
      },
    });

    const result = await uploadInvoice({
      storeId: "store-1",
      items: [
        {
          shipmentBoxId: "101",
          orderId: "202",
          vendorItemId: "303",
          deliveryCompanyCode: "CJ",
          invoiceNumber: "INV-100",
        },
      ],
    });

    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "101",
      orderId: "202",
      vendorItemId: "303",
      status: "succeeded",
      retryRequired: false,
      message: "\uC774\uBBF8 \uC804\uC1A1\uB41C \uC1A1\uC7A5\uC785\uB2C8\uB2E4.",
    });
    expect(result.summary.succeededCount).toBe(1);
    expect(result.summary.failedCount).toBe(0);
  });

  it("skips only failing invoice items by retrying individually after a batch error", async () => {
    requestCoupangJsonMock
      .mockRejectedValueOnce(new Error("batch failed"))
      .mockResolvedValueOnce({
        data: {
          responseList: [
            {
              shipmentBoxId: "101",
              succeed: true,
              retryRequired: false,
              resultCode: "OK",
              resultMessage: "uploaded",
            },
          ],
        },
      })
      .mockRejectedValueOnce(new Error("invalid invoice"));

    const result = await uploadInvoice({
      storeId: "store-1",
      items: [
        {
          shipmentBoxId: "101",
          orderId: "202",
          vendorItemId: "303",
          deliveryCompanyCode: "CJ",
          invoiceNumber: "INV-100",
        },
        {
          shipmentBoxId: "102",
          orderId: "203",
          vendorItemId: "304",
          deliveryCompanyCode: "CJ",
          invoiceNumber: "INV-101",
        },
      ],
    });

    expect(requestCoupangJsonMock).toHaveBeenCalledTimes(3);
    expect(result.summary.total).toBe(2);
    expect(result.summary.succeededCount).toBe(1);
    expect(result.summary.failedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      shipmentBoxId: "101",
      orderId: "202",
      vendorItemId: "303",
      status: "succeeded",
    });
    expect(result.items[1]).toMatchObject({
      shipmentBoxId: "102",
      orderId: "203",
      vendorItemId: "304",
      status: "failed",
      message: "invalid invoice",
    });
    expect((requestCoupangJsonMock.mock.calls[0]?.[0] as MockApiInput).body).toContain('"shipmentBoxId":101');
    expect((requestCoupangJsonMock.mock.calls[0]?.[0] as MockApiInput).body).toContain('"shipmentBoxId":102');
    expect((requestCoupangJsonMock.mock.calls[1]?.[0] as MockApiInput).body).toContain('"shipmentBoxId":101');
    expect((requestCoupangJsonMock.mock.calls[2]?.[0] as MockApiInput).body).toContain('"shipmentBoxId":102');
  });

  it("splits prepare requests into 50-item batches", async () => {
    requestCoupangJsonMock
      .mockResolvedValueOnce({
        data: {
          responseList: Array.from({ length: 50 }, (_, index) => ({
            shipmentBoxId: String(index + 1),
            succeed: true,
            retryRequired: false,
            resultCode: "OK",
            resultMessage: "prepared",
          })),
        },
      })
      .mockResolvedValueOnce({
        data: {
          responseList: [
            {
              shipmentBoxId: "51",
              succeed: true,
              retryRequired: false,
              resultCode: "OK",
              resultMessage: "prepared",
            },
            {
              shipmentBoxId: "52",
              succeed: true,
              retryRequired: false,
              resultCode: "OK",
              resultMessage: "prepared",
            },
          ],
        },
      });

    const result = await markPreparing({
      storeId: "store-1",
      items: Array.from({ length: 52 }, (_, index) => ({
        shipmentBoxId: String(index + 1),
        orderId: `O-${index + 1}`,
        productName: `Item ${index + 1}`,
      })),
    });

    expect(requestCoupangJsonMock).toHaveBeenCalledTimes(2);
    expect((requestCoupangJsonMock.mock.calls[0]?.[0] as MockApiInput).body).toContain(
      '"shipmentBoxIds":[1,2,3,4,5',
    );
    expect((requestCoupangJsonMock.mock.calls[0]?.[0] as MockApiInput).body).toContain(",50]");
    expect((requestCoupangJsonMock.mock.calls[1]?.[0] as MockApiInput).body).toContain(
      '"shipmentBoxIds":[51,52]',
    );
    expect(result.summary.total).toBe(52);
    expect(result.summary.succeededCount).toBe(52);
    expect(result.items.map((item) => item.shipmentBoxId)).toEqual(
      Array.from({ length: 52 }, (_, index) => String(index + 1)),
    );
  });
});
