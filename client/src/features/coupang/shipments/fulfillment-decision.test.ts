import { describe, expect, it } from "vitest";
import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

import {
  buildFulfillmentDecisionCounts,
  getFulfillmentDecision,
  matchesFulfillmentDecisionFilter,
} from "./fulfillment-decision";

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
    receiverName: "수령인",
    receiverBaseName: "수령인",
    personalClearanceCode: null,
    collectedAccountName: "쿠팡",
    deliveryCompanyCode: "",
    selpickOrderNumber: `O20260412${id.replace(/[^0-9A-Z]/gi, "").slice(0, 4).padEnd(4, "0")}`,
    invoiceNumber: "",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "서울시 어딘가",
    deliveryRequest: null,
    buyerPhoneNumber: "01012345678",
    productNumber: "P-1",
    exposedProductName: "테스트 상품",
    coupangDisplayProductName: "쿠팡 노출 상품명",
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

describe("getFulfillmentDecision", () => {
  it("treats shipment-stop issues as blocked with the highest priority", () => {
    const decision = getFulfillmentDecision(
      createRow({
        invoiceTransmissionStatus: "failed",
        customerServiceIssueBreakdown: [
          { type: "shipment_stop_requested", count: 1, label: "출고중지 요청 1건" },
        ],
      }),
    );

    expect(decision.status).toBe("blocked");
    expect(decision.reason).toBe("shipment_stop");
    expect(decision.shouldBlockBatchActions).toBe(true);
  });

  it("blocks cancel, return, and exchange-like orders", () => {
    const cancelDecision = getFulfillmentDecision(
      createRow({
        orderStatus: "CANCEL",
      }),
    );
    const returnDecision = getFulfillmentDecision(
      createRow({
        customerServiceIssueBreakdown: [{ type: "return", count: 1, label: "반품 1건" }],
      }),
    );

    expect(cancelDecision.status).toBe("blocked");
    expect(cancelDecision.reason).toBe("cancel_request");
    expect(returnDecision.status).toBe("blocked");
    expect(returnDecision.reason).toBe("return_exchange");
  });

  it("promotes invoice failures to recheck", () => {
    const decision = getFulfillmentDecision(
      createRow({
        invoiceTransmissionStatus: "failed",
      }),
    );

    expect(decision.status).toBe("recheck");
    expect(decision.reason).toBe("invoice_failure");
  });

  it("treats stale or unknown customer service snapshots as recheck", () => {
    const staleDecision = getFulfillmentDecision(
      createRow({
        customerServiceState: "stale",
      }),
    );
    const unknownDecision = getFulfillmentDecision(
      createRow({
        customerServiceState: "unknown",
      }),
    );

    expect(staleDecision.status).toBe("recheck");
    expect(staleDecision.reason).toBe("sync_failure");
    expect(unknownDecision.status).toBe("recheck");
    expect(unknownDecision.reason).toBe("sync_failure");
  });

  it("treats missing core fulfillment data as recheck", () => {
    const decision = getFulfillmentDecision(
      createRow({
        receiverAddress: null,
      }),
    );

    expect(decision.status).toBe("recheck");
    expect(decision.reason).toBe("missing_data");
  });

  it("keeps non-blocking CS impact in hold", () => {
    const decision = getFulfillmentDecision(
      createRow({
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "문의 확인 필요",
        customerServiceIssueBreakdown: [{ type: "inquiry", count: 1, label: "문의 1건" }],
      }),
    );

    expect(decision.status).toBe("hold");
    expect(decision.reason).toBe("inquiry_check");
  });

  it("treats pending invoice transmission as invoice waiting", () => {
    const decision = getFulfillmentDecision(
      createRow({
        deliveryCompanyCode: "CJ",
        invoiceNumber: "12345",
        invoiceTransmissionStatus: "pending",
      }),
    );

    expect(decision.status).toBe("invoice_waiting");
    expect(decision.reason).toBe("invoice_transmitting");
  });

  it("treats shipment-phase rows without invoice as invoice waiting", () => {
    const decision = getFulfillmentDecision(
      createRow({
        orderStatus: "DEPARTURE",
        availableActions: ["uploadInvoice"],
      }),
    );

    expect(decision.status).toBe("invoice_waiting");
    expect(decision.reason).toBe("invoice_required");
  });

  it("treats markPreparing-capable rows as ready", () => {
    const decision = getFulfillmentDecision(
      createRow({
        availableActions: ["markPreparing"],
      }),
    );

    expect(decision.status).toBe("ready");
    expect(decision.reason).toBe("ready_now");
    expect(decision.allowedActions).toContain("prepare");
  });
});

describe("fulfillment decision helpers", () => {
  it("filters rows by decision status", () => {
    const readyRow = createRow({ id: "ready-row" });
    const blockedRow = createRow({
      id: "blocked-row",
      customerServiceIssueBreakdown: [{ type: "shipment_stop_handled", count: 1, label: "출고중지완료 1건" }],
    });

    expect(matchesFulfillmentDecisionFilter(readyRow, "ready")).toBe(true);
    expect(matchesFulfillmentDecisionFilter(readyRow, "blocked")).toBe(false);
    expect(matchesFulfillmentDecisionFilter(blockedRow, "blocked")).toBe(true);
    expect(matchesFulfillmentDecisionFilter(blockedRow, "all")).toBe(true);
  });

  it("builds counts for each decision group", () => {
    const rows = [
      createRow({ id: "ready-row" }),
      createRow({
        id: "invoice-row",
        orderStatus: "DEPARTURE",
        availableActions: ["uploadInvoice"],
      }),
      createRow({
        id: "hold-row",
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "문의 확인 필요",
        customerServiceIssueBreakdown: [{ type: "inquiry", count: 1, label: "문의 1건" }],
      }),
      createRow({
        id: "blocked-row",
        customerServiceIssueBreakdown: [{ type: "exchange", count: 1, label: "교환 1건" }],
      }),
      createRow({
        id: "recheck-row",
        invoiceTransmissionStatus: "failed",
      }),
    ];

    expect(buildFulfillmentDecisionCounts(rows)).toEqual({
      all: 5,
      ready: 1,
      invoice_waiting: 1,
      hold: 1,
      blocked: 1,
      recheck: 1,
    });
  });
});
