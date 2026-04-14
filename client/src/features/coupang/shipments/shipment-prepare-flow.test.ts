import { describe, expect, it } from "vitest";
import type {
  CoupangBatchActionResponse,
  CoupangShipmentWorksheetAuditMissingResponse,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";

import {
  buildPrepareAcceptedOrdersFeedback,
  resolvePrepareAcceptedOrdersPlan,
} from "./shipment-prepare-flow";

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
    receiverName: "수령인",
    receiverBaseName: "수령인",
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

function createAuditResponse(
  overrides: Partial<CoupangShipmentWorksheetAuditMissingResponse> = {},
): CoupangShipmentWorksheetAuditMissingResponse {
  return {
    auditedStatuses: ["INSTRUCT", "ACCEPT"],
    liveCount: 2,
    worksheetMatchedCount: 1,
    missingCount: 1,
    hiddenCount: 0,
    missingItems: [
      {
        sourceKey: "store-1:100:VI-100",
        shipmentBoxId: "100",
        orderId: "ORDER-100",
        vendorItemId: "VI-100",
        sellerProductId: "SP-100",
        status: "ACCEPT",
        productName: "누락 주문",
        orderedAt: "2026-04-12T09:00:00+09:00",
      },
    ],
    hiddenItems: [],
    message: null,
    ...overrides,
  };
}

function createBatchResponse(
  overrides: Partial<CoupangBatchActionResponse> = {},
): CoupangBatchActionResponse {
  return {
    items: [
      {
        targetId: "BOX-row-1",
        action: "markPreparing",
        shipmentBoxId: "BOX-row-1",
        orderId: "ORDER-row-1",
        receiptId: null,
        vendorItemId: null,
        status: "failed",
        resultCode: null,
        retryRequired: false,
        message: "아직 수집되지 않은 주문입니다.",
        appliedAt: null,
      },
    ],
    summary: {
      total: 1,
      succeededCount: 0,
      failedCount: 1,
      warningCount: 0,
      skippedCount: 0,
    },
    completedAt: "2026-04-12T01:00:00.000Z",
    ...overrides,
  };
}

describe("shipment prepare flow helpers", () => {
  it("keeps prepare submission available when audit reports missing orders", () => {
    const plan = resolvePrepareAcceptedOrdersPlan({
      auditResponse: createAuditResponse(),
      resolvedRows: {
        items: [createRow()],
        blockedItems: [],
      },
    });

    expect(plan.hasAuditWarnings).toBe(true);
    expect(plan.shouldSubmitPrepare).toBe(true);
    expect(plan.targetRows).toHaveLength(1);
    expect(plan.auditWarningDetails).toEqual(["[누락] ACCEPT / 누락 주문 / 100"]);
  });

  it("combines failed action details with audit warnings in the result feedback", () => {
    const feedback = buildPrepareAcceptedOrdersFeedback({
      auditResponse: createAuditResponse(),
      blockedClaimDetails: ["주문 ORDER-2 / 배송 BOX-2 / 출고중지"],
      result: createBatchResponse(),
      targetRowCount: 1,
    });

    expect(feedback.type).toBe("warning");
    expect(feedback.message).toContain("결제완료 1건 처리");
    expect(feedback.message).toContain("수집 누락 1건");
    expect(feedback.details).toEqual(
      expect.arrayContaining([
        "BOX-row-1: 아직 수집되지 않은 주문입니다.",
        "주문 ORDER-2 / 배송 BOX-2 / 출고중지",
        "[누락] ACCEPT / 누락 주문 / 100",
      ]),
    );
  });
});
