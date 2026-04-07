import { describe, expect, it } from "vitest";
import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

import { looksLikeInvoiceClipboard, parseInvoiceClipboardRows } from "./worksheet-clipboard";

function buildRow(input: {
  id: string;
  sourceKey: string;
  selpickOrderNumber: string;
}): CoupangShipmentWorksheetRow {
  return {
    id: input.id,
    sourceKey: input.sourceKey,
    storeId: "store-1",
    storeName: "store",
    orderDateText: "04/03",
    orderDateKey: "20260403",
    quantity: 1,
    productName: "상품",
    optionName: null,
    productOrderNumber: input.id,
    collectedPlatform: "쿠팡",
    ordererName: null,
    contact: null,
    receiverName: "수령자",
    receiverBaseName: "수령자",
    personalClearanceCode: null,
    collectedAccountName: "store",
    deliveryCompanyCode: "",
    selpickOrderNumber: input.selpickOrderNumber,
    invoiceNumber: "",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: null,
    deliveryRequest: null,
    buyerPhoneNumber: null,
    productNumber: "P-1",
    exposedProductName: "상품",
    productOptionNumber: "V-1",
    sellerProductCode: "SKU-1",
    isOverseas: false,
    shipmentBoxId: input.id,
    orderId: input.id,
    sellerProductId: "P-1",
    vendorItemId: "V-1",
    availableActions: [],
    orderStatus: "INSTRUCT",
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceState: "unknown",
    customerServiceFetchedAt: null,
    orderedAtRaw: "2026-04-03T09:00:00+09:00",
    lastOrderHydratedAt: "2026-04-03T00:00:00.000Z",
    lastProductHydratedAt: "2026-04-03T00:00:00.000Z",
    estimatedShippingDate: null,
    splitShipping: false,
    invoiceTransmissionStatus: null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    exportedAt: null,
    invoiceAppliedAt: null,
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
  };
}

describe("worksheet invoice clipboard", () => {
  it("detects selpick-first rows with trailing empty columns", () => {
    expect(looksLikeInvoiceClipboard("O20260403K0001\tCJ대한통운\t123456789\t")).toBe(true);
  });

  it("parses four-column rows where the selpick order number appears before the company", () => {
    const row = buildRow({
      id: "row-1",
      sourceKey: "source-1",
      selpickOrderNumber: "O20260403K0001",
    });
    const { updates, issues } = parseInvoiceClipboardRows(
      "1\tO20260403K0001\tCJ대한통운\t123456789",
      new Map([[row.selpickOrderNumber, row]]),
    );

    expect(issues).toEqual([]);
    expect(updates.get("row-1")).toMatchObject({
      deliveryCompanyCode: "CJ대한통운",
      invoiceNumber: "123456789",
    });
  });
});
