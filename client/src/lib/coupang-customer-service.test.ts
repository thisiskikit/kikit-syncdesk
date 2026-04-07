import { describe, expect, it } from "vitest";
import type { CoupangOrderRow } from "@shared/coupang";
import {
  formatCoupangCustomerServiceLabel,
  formatShipmentWorksheetCustomerServiceLabel,
  getShipmentWorksheetCustomerServiceSearchText,
  mergeCoupangOrderCustomerServiceSummary,
} from "@/lib/coupang-customer-service";

function buildOrderRow(overrides: Partial<CoupangOrderRow> = {}): CoupangOrderRow {
  return {
    id: overrides.id ?? "row-1",
    shipmentBoxId: overrides.shipmentBoxId ?? "100",
    orderId: overrides.orderId ?? "O-100",
    orderedAt: "2026-03-30T10:00:00.000Z",
    paidAt: "2026-03-30T10:00:00.000Z",
    status: "INSTRUCT",
    ordererName: "Kim",
    receiverName: "Lee",
    receiverSafeNumber: "050-1234-5678",
    receiverAddress: "Seoul",
    receiverPostCode: "12345",
    productName: "Product",
    optionName: "Option",
    sellerProductId: "P-100",
    sellerProductName: "Product",
    vendorItemId: "V-100",
    externalVendorSku: "SKU-100",
    quantity: 1,
    salesPrice: 10000,
    orderPrice: 10000,
    discountPrice: 0,
    cancelCount: 0,
    holdCountForCancel: 0,
    deliveryCompanyName: null,
    deliveryCompanyCode: null,
    invoiceNumber: null,
    invoiceNumberUploadDate: null,
    estimatedShippingDate: null,
    inTransitDateTime: null,
    deliveredDate: null,
    shipmentType: null,
    splitShipping: false,
    ableSplitShipping: false,
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: "unknown",
    customerServiceFetchedAt: null,
    availableActions: [],
    ...overrides,
  };
}

describe("formatCoupangCustomerServiceLabel", () => {
  it("distinguishes unknown, stale, and ready states", () => {
    expect(
      formatCoupangCustomerServiceLabel({
        summary: null,
        count: 0,
        state: "unknown",
      }),
    ).toBe("CS 미조회");

    expect(
      formatCoupangCustomerServiceLabel({
        summary: null,
        count: 2,
        state: "stale",
      }),
    ).toBe("CS 2건 (오래됨)");

    expect(
      formatCoupangCustomerServiceLabel({
        summary: null,
        count: 0,
        state: "ready",
      }),
    ).toBeNull();
  });

  it("normalizes shipment-stop handled labels to 출고중지완료", () => {
    expect(
      formatCoupangCustomerServiceLabel({
        summary: "출고중지 처리됨 1건",
        count: 1,
        state: "ready",
      }),
    ).toBe("CS 출고중지완료 1건");

    expect(
      formatCoupangCustomerServiceLabel({
        summary: null,
        count: 1,
        state: "ready",
        breakdown: [{ type: "shipment_stop_handled", count: 1 }],
      }),
    ).toBe("CS 출고중지완료 1건");
  });
});

describe("formatShipmentWorksheetCustomerServiceLabel", () => {
  it("only returns a label when the worksheet row has a confirmed issue", () => {
    expect(
      formatShipmentWorksheetCustomerServiceLabel({
        summary: null,
        count: 0,
        state: "stale",
      }),
    ).toBeNull();

    expect(
      formatShipmentWorksheetCustomerServiceLabel({
        summary: "issue",
        count: 1,
        state: "unknown",
      }),
    ).toBe(formatCoupangCustomerServiceLabel({ summary: "issue", count: 1, state: "ready" }));
  });
});

describe("getShipmentWorksheetCustomerServiceSearchText", () => {
  it("excludes stale or unknown rows without confirmed issues from CS search text", () => {
    expect(
      getShipmentWorksheetCustomerServiceSearchText({
        customerServiceIssueCount: 0,
        customerServiceIssueSummary: null,
        customerServiceIssueBreakdown: [],
        customerServiceState: "stale",
      }),
    ).toBe("");

    expect(
      getShipmentWorksheetCustomerServiceSearchText({
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: null,
        customerServiceIssueBreakdown: [{ type: "shipment_stop_handled", count: 1, label: "" }],
        customerServiceState: "ready",
      }),
    ).toContain("출고중지완료");
  });
});

describe("mergeCoupangOrderCustomerServiceSummary", () => {
  it("merges CS summary rows by rowKey", () => {
    const rows = [
      buildOrderRow({ id: "row-1", orderId: "O-100", shipmentBoxId: "100", vendorItemId: "V-100" }),
      buildOrderRow({ id: "row-2", orderId: "O-200", shipmentBoxId: "200", vendorItemId: "V-200" }),
    ];

    const merged = mergeCoupangOrderCustomerServiceSummary(rows, [
      {
        rowKey: "row-2",
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "반품 1건",
        customerServiceIssueBreakdown: [{ type: "return", count: 1, label: "반품 1건" }],
        customerServiceState: "ready",
        customerServiceFetchedAt: "2026-03-30T10:05:00.000Z",
      },
    ]);

    expect(merged[0]).toMatchObject({
      id: "row-1",
      customerServiceIssueCount: 0,
      customerServiceState: "unknown",
    });
    expect(merged[1]).toMatchObject({
      id: "row-2",
      customerServiceIssueCount: 1,
      customerServiceIssueSummary: "반품 1건",
      customerServiceState: "ready",
      customerServiceFetchedAt: "2026-03-30T10:05:00.000Z",
    });
  });
});
