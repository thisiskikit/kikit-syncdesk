import { describe, expect, it } from "vitest";
import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import {
  buildShipmentQuickFilterResult,
  getInvoiceStatusCardKey,
  getOrderStatusCardKey,
  pruneShipmentSelectedRowIds,
} from "@/lib/coupang-shipment-quick-filters";

let rowSequence = 0;

function createRow(
  overrides: Partial<CoupangShipmentWorksheetRow> = {},
): CoupangShipmentWorksheetRow {
  rowSequence += 1;
  const id = overrides.id ?? `row-${String(rowSequence).padStart(2, "0")}`;

  return {
    id,
    sourceKey: overrides.sourceKey ?? id,
    storeId: "store-1",
    storeName: "Coupang",
    orderDateText: "2026-03-30 10:00",
    orderDateKey: "2026-03-30",
    quantity: 1,
    productName: "Alpha",
    optionName: null,
    productOrderNumber: `PO-${id}`,
    collectedPlatform: "selpick",
    ordererName: "Buyer",
    contact: "01012345678",
    receiverName: "Receiver",
    receiverBaseName: "Receiver",
    personalClearanceCode: null,
    collectedAccountName: "Account",
    deliveryCompanyCode: "",
    selpickOrderNumber: `O20260330A${id.replace(/[^0-9A-Z]/gi, "").slice(0, 4).padEnd(4, "0")}`,
    invoiceNumber: "",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "Seoul",
    deliveryRequest: null,
    buyerPhoneNumber: "01012345678",
    productNumber: "P-1",
    exposedProductName: "Alpha",
    productOptionNumber: null,
    sellerProductCode: "SELLER-1",
    isOverseas: false,
    shipmentBoxId: `BOX-${id}`,
    orderId: `ORDER-${id}`,
    sellerProductId: "SELLER-PRODUCT-1",
    vendorItemId: "VENDOR-ITEM-1",
    availableActions: ["uploadInvoice"],
    orderStatus: "ACCEPT",
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    orderedAtRaw: null,
    lastOrderHydratedAt: null,
    lastProductHydratedAt: null,
    estimatedShippingDate: null,
    splitShipping: false,
    invoiceTransmissionStatus: null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    exportedAt: null,
    invoiceAppliedAt: null,
    createdAt: "2026-03-30T10:00:00.000Z",
    updatedAt: "2026-03-30T10:00:00.000Z",
    ...overrides,
  };
}

describe("getInvoiceStatusCardKey", () => {
  it("matches the worksheet transmission presentation precedence", () => {
    expect(
      getInvoiceStatusCardKey(
        createRow({
          deliveryCompanyCode: "CJ",
          invoiceNumber: "10001",
          invoiceTransmissionStatus: "pending",
        }),
      ),
    ).toBe("pending");

    expect(
      getInvoiceStatusCardKey(
        createRow({
          deliveryCompanyCode: "CJ",
          invoiceNumber: "10002",
          invoiceTransmissionStatus: "succeeded",
        }),
      ),
    ).toBe("applied");

    expect(
      getInvoiceStatusCardKey(
        createRow({
          deliveryCompanyCode: "CJ",
          invoiceNumber: "10003",
          invoiceTransmissionStatus: "failed",
          invoiceTransmissionMessage: "duplicate invoice",
        }),
      ),
    ).toBe("applied");

    expect(
      getInvoiceStatusCardKey(
        createRow({
          deliveryCompanyCode: "CJ",
          invoiceNumber: "10004",
          invoiceTransmissionStatus: "failed",
        }),
      ),
    ).toBe("failed");

    expect(
      getInvoiceStatusCardKey(
        createRow({
          deliveryCompanyCode: "CJ",
          invoiceNumber: "10005",
          coupangDeliveryCompanyCode: "롯데",
          invoiceTransmissionMessage: "already processed",
        }),
      ),
    ).toBe("applied");

    expect(
      getInvoiceStatusCardKey(
        createRow({
          deliveryCompanyCode: "CJ",
          invoiceNumber: "10006",
        }),
      ),
    ).toBe("ready");

    expect(getInvoiceStatusCardKey(createRow())).toBe("idle");
  });
});

describe("buildShipmentQuickFilterResult", () => {
  it("treats CS breakdown-only rows as cancel/return/exchange status cards", () => {
    expect(
      getOrderStatusCardKey(
        createRow({
          orderStatus: "ACCEPT",
          customerServiceIssueSummary: null,
          customerServiceIssueBreakdown: [{ type: "return", count: 1, label: "반품 1건" }],
        }),
      ),
    ).toBe("RETURN");
  });

  it("uses opposite-group facet rows for each card count", () => {
    const rows = [
      createRow({
        id: "ready-accept",
        productName: "Alpha Ready",
        orderStatus: "ACCEPT",
        deliveryCompanyCode: "CJ",
        invoiceNumber: "111",
      }),
      createRow({
        id: "failed-instruct",
        productName: "Alpha Failed",
        orderStatus: "INSTRUCT",
        deliveryCompanyCode: "CJ",
        invoiceNumber: "222",
        invoiceTransmissionStatus: "failed",
      }),
      createRow({
        id: "applied-departure",
        productName: "Beta Applied",
        orderStatus: "DEPARTURE",
        deliveryCompanyCode: "CJ",
        invoiceNumber: "333",
        invoiceTransmissionStatus: "succeeded",
      }),
    ];

    const result = buildShipmentQuickFilterResult(rows, {
      invoiceStatusCard: "ready",
      orderStatusCard: "INSTRUCT",
      outputStatusCard: "all",
    });

    expect(result.invoiceCounts).toMatchObject({
      all: 1,
      failed: 1,
      ready: 0,
    });
    expect(result.orderCounts).toMatchObject({
      all: 1,
      ACCEPT: 1,
      INSTRUCT: 0,
    });
    expect(result.visibleRows).toEqual([]);
  });

  it("keeps visible rows and ready-to-send rows aligned after search-like prefiltering", () => {
    const rows = [
      createRow({
        id: "alpha-ready",
        productName: "Alpha Ready",
        orderStatus: "ACCEPT",
        deliveryCompanyCode: "CJ",
        invoiceNumber: "111",
      }),
      createRow({
        id: "alpha-failed",
        productName: "Alpha Failed",
        orderStatus: "INSTRUCT",
        deliveryCompanyCode: "CJ",
        invoiceNumber: "222",
        invoiceTransmissionStatus: "failed",
      }),
      createRow({
        id: "beta-ready",
        productName: "Beta Ready",
        orderStatus: "ACCEPT",
        deliveryCompanyCode: "CJ",
        invoiceNumber: "333",
      }),
    ];
    const searchFilteredRows = rows.filter((row) => row.productName.includes("Alpha"));
    const result = buildShipmentQuickFilterResult(searchFilteredRows, {
      invoiceStatusCard: "failed",
      orderStatusCard: "all",
      outputStatusCard: "all",
    });

    expect(result.visibleRows.map((row) => row.id)).toEqual(["alpha-failed"]);
    expect(result.invoiceReadyRows.map((row) => row.id)).toEqual(["alpha-failed"]);

    const selectedRowIds = new Set(["alpha-ready", "alpha-failed", "beta-ready"]);
    expect(Array.from(pruneShipmentSelectedRowIds(selectedRowIds, result.visibleRows))).toEqual([
      "alpha-failed",
    ]);
  });

  it("filters rows by export status while keeping opposite-group counts stable", () => {
    const rows = [
      createRow({
        id: "not-exported",
        orderStatus: "ACCEPT",
        deliveryCompanyCode: "CJ",
        invoiceNumber: "111",
      }),
      createRow({
        id: "exported",
        orderStatus: "ACCEPT",
        deliveryCompanyCode: "CJ",
        invoiceNumber: "222",
        exportedAt: "2026-03-30T11:00:00.000Z",
      }),
    ];

    const result = buildShipmentQuickFilterResult(rows, {
      invoiceStatusCard: "ready",
      orderStatusCard: "all",
      outputStatusCard: "exported",
    });

    expect(result.visibleRows.map((row) => row.id)).toEqual(["exported"]);
    expect(result.outputCounts).toMatchObject({
      all: 2,
      notExported: 1,
      exported: 1,
    });
    expect(result.invoiceCounts).toMatchObject({
      all: 1,
      ready: 1,
    });
  });
});
