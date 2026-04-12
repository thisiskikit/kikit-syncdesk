import { describe, expect, it } from "vitest";
import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

import {
  buildShipmentBlockedDecisionDetails,
  summarizeShipmentBlockedDecisionRows,
} from "./shipment-selection-summary";

let rowSequence = 0;

function createRow(
  overrides: Partial<CoupangShipmentWorksheetRow> = {},
): CoupangShipmentWorksheetRow {
  rowSequence += 1;
  const id = overrides.id ?? `row-${rowSequence}`;

  return {
    id,
    sourceKey: overrides.sourceKey ?? id,
    storeId: "store-1",
    storeName: "쿠팡",
    orderDateText: "2026-04-12 10:00",
    orderDateKey: "2026-04-12",
    quantity: 1,
    productName: "테스트 상품",
    optionName: null,
    productOrderNumber: `PO-${id}`,
    collectedPlatform: "selpick",
    ordererName: "구매자",
    contact: "01012345678",
    receiverName: "수령자",
    receiverBaseName: "수령자",
    personalClearanceCode: null,
    collectedAccountName: "쿠팡",
    deliveryCompanyCode: "",
    selpickOrderNumber: `O20260412${String(rowSequence).padStart(5, "0")}`,
    invoiceNumber: "",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "서울시 강남구",
    deliveryRequest: null,
    buyerPhoneNumber: "01012345678",
    productNumber: "P-1",
    exposedProductName: "테스트 상품",
    coupangDisplayProductName: "쿠팡 테스트 상품",
    productOptionNumber: null,
    sellerProductCode: "SELLER-1",
    isOverseas: false,
    shipmentBoxId: `BOX-${id}`,
    orderId: `ORDER-${id}`,
    sellerProductId: "SELLER-PRODUCT-1",
    vendorItemId: "VENDOR-ITEM-1",
    availableActions: ["markPreparing"],
    orderStatus: "ACCEPT",
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: "ready",
    customerServiceFetchedAt: "2026-04-12T01:00:00.000Z",
    orderedAtRaw: "2026-04-12T10:00:00+09:00",
    lastOrderHydratedAt: "2026-04-12T01:00:00.000Z",
    lastProductHydratedAt: "2026-04-12T01:00:00.000Z",
    estimatedShippingDate: null,
    splitShipping: false,
    invoiceTransmissionStatus: null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    exportedAt: null,
    invoiceAppliedAt: null,
    createdAt: "2026-04-12T01:00:00.000Z",
    updatedAt: "2026-04-12T01:00:00.000Z",
    ...overrides,
  };
}

describe("shipment selection summary helpers", () => {
  it("summarizes blocked rows by decision status", () => {
    const summary = summarizeShipmentBlockedDecisionRows([
      createRow({ customerServiceIssueBreakdown: [{ type: "shipment_stop_requested", count: 1, label: "출고중지" }] }),
      createRow({ invoiceTransmissionStatus: "failed" }),
      createRow({ customerServiceState: "stale" }),
    ]);

    expect(summary).toContain("차단");
    expect(summary).toContain("재확인 필요");
    expect(summary).toContain("1건");
    expect(summary).toContain("2건");
  });

  it("builds exclusion detail lines by status and reason", () => {
    const details = buildShipmentBlockedDecisionDetails([
      createRow({ customerServiceIssueBreakdown: [{ type: "shipment_stop_requested", count: 1, label: "출고중지" }] }),
      createRow({ customerServiceIssueBreakdown: [{ type: "shipment_stop_requested", count: 1, label: "출고중지" }] }),
      createRow({ invoiceTransmissionStatus: "failed" }),
    ]);

    expect(details).toHaveLength(2);
    expect(details[0]).toContain("차단");
    expect(details[0]).toContain("출고중지");
    expect(details[0]).toContain("2건");
    expect(details[1]).toContain("재확인 필요");
    expect(details[1]).toContain("송장 반영 실패");
    expect(details[1]).toContain("1건");
  });
});
