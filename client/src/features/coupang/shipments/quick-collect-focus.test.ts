import { describe, expect, it } from "vitest";

import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import {
  buildQuickCollectFocusSignature,
  resolveQuickCollectFocusRows,
} from "./quick-collect-focus";

function buildRow(input: Partial<CoupangShipmentWorksheetRow> & Pick<CoupangShipmentWorksheetRow, "id" | "sourceKey">) {
  return {
    id: input.id,
    sourceKey: input.sourceKey,
    storeId: "store-1",
    storeName: "쿠팡_올웨이팜",
    orderDateText: "2026-04-12",
    orderDateKey: "20260412",
    quantity: 1,
    productName: "테스트 상품",
    optionName: null,
    productOrderNumber: input.productOrderNumber ?? input.id,
    collectedPlatform: "쿠팡",
    ordererName: null,
    contact: null,
    receiverName: "홍길동",
    receiverBaseName: "홍길동",
    personalClearanceCode: null,
    collectedAccountName: "쿠팡_올웨이팜",
    deliveryCompanyCode: input.deliveryCompanyCode ?? "",
    selpickOrderNumber: input.selpickOrderNumber ?? input.id,
    invoiceNumber: input.invoiceNumber ?? "",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "서울시 테스트구 테스트로 1",
    deliveryRequest: null,
    buyerPhoneNumber: null,
    productNumber: null,
    exposedProductName: "테스트 상품",
    coupangDisplayProductName: null,
    productOptionNumber: null,
    sellerProductCode: null,
    isOverseas: false,
    shipmentBoxId: input.shipmentBoxId ?? input.id,
    orderId: input.orderId ?? input.id,
    sellerProductId: null,
    vendorItemId: null,
    availableActions: input.availableActions ?? ["uploadInvoice"],
    orderStatus: input.orderStatus ?? "ACCEPT",
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: "ready",
    customerServiceFetchedAt: null,
    orderedAtRaw: "2026-04-12T09:00:00+09:00",
    lastOrderHydratedAt: null,
    lastProductHydratedAt: null,
    estimatedShippingDate: null,
    splitShipping: null,
    invoiceTransmissionStatus: input.invoiceTransmissionStatus ?? null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    exportedAt: input.exportedAt ?? null,
    invoiceAppliedAt: null,
    createdAt: "2026-04-12T09:00:00+09:00",
    updatedAt: "2026-04-12T09:00:00+09:00",
  } satisfies CoupangShipmentWorksheetRow;
}

describe("quick collect focus helpers", () => {
  it("builds a stable signature from the temporary focus reset conditions", () => {
    const first = buildQuickCollectFocusSignature({
      selectedStoreId: "store-1",
      createdAtFrom: "2026-04-08",
      createdAtTo: "2026-04-13",
      query: "  신규  ",
      scope: "dispatch_active",
      decisionStatus: "all",
      priorityCard: "all",
      pipelineCard: "all",
      issueFilter: "all",
      invoiceStatusCard: "all",
      orderStatusCard: "all",
      outputStatusCard: "all",
    });
    const second = buildQuickCollectFocusSignature({
      selectedStoreId: "store-1",
      createdAtFrom: "2026-04-08",
      createdAtTo: "2026-04-13",
      query: "신규",
      scope: "dispatch_active",
      decisionStatus: "all",
      priorityCard: "all",
      pipelineCard: "all",
      issueFilter: "all",
      invoiceStatusCard: "all",
      orderStatusCard: "all",
      outputStatusCard: "all",
    });
    const changed = buildQuickCollectFocusSignature({
      selectedStoreId: "store-1",
      createdAtFrom: "2026-04-08",
      createdAtTo: "2026-04-13",
      query: "신규",
      scope: "claims",
      decisionStatus: "all",
      priorityCard: "all",
      pipelineCard: "all",
      issueFilter: "all",
      invoiceStatusCard: "all",
      orderStatusCard: "all",
      outputStatusCard: "all",
    });

    expect(first).toBe(second);
    expect(changed).not.toBe(second);
  });

  it("returns only inserted source keys and paginates them before the decision tab is applied", () => {
    const rows = [
      buildRow({ id: "row-1", sourceKey: "A", orderStatus: "ACCEPT" }),
      buildRow({ id: "row-2", sourceKey: "B", orderStatus: "INSTRUCT", invoiceNumber: "INV-2" }),
      buildRow({ id: "row-3", sourceKey: "C", orderStatus: "ACCEPT" }),
    ];

    const result = resolveQuickCollectFocusRows({
      rows,
      sourceKeys: ["A", "C"],
      decisionStatus: "all",
      page: 1,
      pageSize: 1,
    });

    expect(result.focusedRows.map((row) => row.sourceKey)).toEqual(["A", "C"]);
    expect(result.pageRows.map((row) => row.sourceKey)).toEqual(["A"]);
    expect(result.visibleRows.map((row) => row.sourceKey)).toEqual(["A"]);
    expect(result.totalPages).toBe(2);
  });

  it("keeps the decision tab available on top of the focused rows", () => {
    const rows = [
      buildRow({
        id: "row-1",
        sourceKey: "A",
        orderStatus: "ACCEPT",
        deliveryCompanyCode: "CJ",
        invoiceNumber: "INV-1",
      }),
      buildRow({
        id: "row-2",
        sourceKey: "B",
        orderStatus: "ACCEPT",
        invoiceTransmissionStatus: "failed",
      }),
    ];

    const result = resolveQuickCollectFocusRows({
      rows,
      sourceKeys: ["A", "B"],
      decisionStatus: "recheck",
      page: 1,
      pageSize: 50,
    });

    expect(result.pageRows).toHaveLength(2);
    expect(result.visibleRows.map((row) => row.sourceKey)).toEqual(["B"]);
    expect(result.decisionCounts.recheck).toBe(1);
  });
});
