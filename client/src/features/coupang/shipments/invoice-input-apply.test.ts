import { describe, expect, it } from "vitest";

import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

import {
  dedupeInvoiceInputApplyRows,
  resolveSourceKeysForTouchedRowIds,
} from "./invoice-input-apply";

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
    orderDateText: "04/10",
    orderDateKey: "20260410",
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
    customerServiceIssueBreakdown: [],
    customerServiceState: "unknown",
    customerServiceFetchedAt: null,
    orderedAtRaw: "2026-04-10T09:00:00+09:00",
    lastOrderHydratedAt: "2026-04-10T00:00:00.000Z",
    lastProductHydratedAt: "2026-04-10T00:00:00.000Z",
    estimatedShippingDate: null,
    splitShipping: false,
    invoiceTransmissionStatus: null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    exportedAt: null,
    invoiceAppliedAt: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

describe("invoice-input-apply helpers", () => {
  it("dedupes invoice rows by selpick order number with last value winning", () => {
    const result = dedupeInvoiceInputApplyRows([
      {
        selpickOrderNumber: " O20260410K0001 ",
        deliveryCompanyCode: " 한진택배 ",
        invoiceNumber: " 111111 ",
      },
      {
        selpickOrderNumber: "O20260410K0001",
        deliveryCompanyCode: "롯데택배",
        invoiceNumber: "222222",
      },
      {
        selpickOrderNumber: "   ",
        deliveryCompanyCode: "무시",
        invoiceNumber: "000000",
      },
    ]);

    expect(result).toEqual([
      {
        selpickOrderNumber: "O20260410K0001",
        deliveryCompanyCode: "롯데택배",
        invoiceNumber: "222222",
      },
    ]);
  });

  it("maps touched row ids back to unique source keys across row collections", () => {
    const first = buildRow({
      id: "row-1",
      sourceKey: "source-1",
      selpickOrderNumber: "O20260410K0001",
    });
    const duplicateSource = buildRow({
      id: "row-1-copy",
      sourceKey: "source-1",
      selpickOrderNumber: "O20260410K0001",
    });
    const second = buildRow({
      id: "row-2",
      sourceKey: "source-2",
      selpickOrderNumber: "O20260410K0002",
    });

    const result = resolveSourceKeysForTouchedRowIds(
      ["row-1", "row-2"],
      [[first], [duplicateSource, second]],
    );

    expect(result).toEqual(["source-1", "source-2"]);
  });
});
