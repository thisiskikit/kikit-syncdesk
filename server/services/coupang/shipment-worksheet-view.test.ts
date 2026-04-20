import { afterEach, describe, expect, it, vi } from "vitest";

import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import {
  buildShipmentWorksheetViewData,
  getShipmentWorksheetRowHiddenReason,
  resolveShipmentWorksheetRows,
} from "./shipment-worksheet-view";

function buildRow(input: {
  id: string;
  status: string;
  storeName?: string;
  exportedAt?: string | null;
  invoiceNumber?: string;
  deliveryCompanyCode?: string;
  invoiceTransmissionStatus?: "pending" | "succeeded" | "failed" | null;
  invoiceAppliedAt?: string | null;
  coupangInvoiceUploadedAt?: string | null;
  customerServiceIssueSummary?: string | null;
  customerServiceIssueCount?: number;
  customerServiceIssueBreakdown?: CoupangShipmentWorksheetRow["customerServiceIssueBreakdown"];
  customerServiceState?: CoupangShipmentWorksheetRow["customerServiceState"];
  customerServiceFetchedAt?: string | null;
  availableActions?: CoupangShipmentWorksheetRow["availableActions"];
  purchaseConfirmedAt?: string | null;
  estimatedShippingDate?: string | null;
  orderDateKey?: string;
  orderedAtRaw?: string | null;
  shippingStage?: CoupangShipmentWorksheetRow["shippingStage"];
  issueStage?: CoupangShipmentWorksheetRow["issueStage"];
  priorityBucket?: CoupangShipmentWorksheetRow["priorityBucket"];
  pipelineBucket?: CoupangShipmentWorksheetRow["pipelineBucket"];
}) {
  const invoiceNumber = input.invoiceNumber ?? "";
  const deliveryCompanyCode = input.deliveryCompanyCode ?? "";

  return {
    id: input.id,
    sourceKey: `store-1:${input.id}`,
    storeId: "store-1",
    storeName: input.storeName ?? "Test Store",
    orderDateText: "04/09",
    orderDateKey: input.orderDateKey ?? "20260409",
    quantity: 1,
    productName: `Product ${input.id}`,
    optionName: "Default",
    productOrderNumber: `PO-${input.id}`,
    collectedPlatform: "coupang",
    ordererName: "Kim",
    contact: "010-1111-2222",
    receiverName: "Lee",
    receiverBaseName: "Lee",
    personalClearanceCode: null,
    collectedAccountName: "Store Account",
    deliveryCompanyCode,
    selpickOrderNumber: `O20260409A${input.id.padStart(4, "0")}`,
    invoiceNumber,
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: input.coupangInvoiceUploadedAt ?? null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "Seoul",
    deliveryRequest: null,
    buyerPhoneNumber: "010-2222-3333",
    productNumber: "P-1",
    exposedProductName: `Product ${input.id}, Default`,
    productOptionNumber: "OPT-1",
    sellerProductCode: "SELLER-1",
    isOverseas: false,
    shipmentBoxId: `SHIP-${input.id}`,
    orderId: `ORDER-${input.id}`,
    sellerProductId: `SP-${input.id}`,
    vendorItemId: `VI-${input.id}`,
    availableActions: input.availableActions ?? ["uploadInvoice"],
    orderStatus: input.status,
    shippingStage: input.shippingStage ?? null,
    issueStage: input.issueStage ?? null,
    priorityBucket: input.priorityBucket ?? null,
    pipelineBucket: input.pipelineBucket ?? null,
    customerServiceIssueCount: input.customerServiceIssueCount ?? 0,
    customerServiceIssueSummary: input.customerServiceIssueSummary ?? null,
    customerServiceIssueBreakdown: input.customerServiceIssueBreakdown ?? [],
    customerServiceState: input.customerServiceState ?? "ready",
    customerServiceFetchedAt: input.customerServiceFetchedAt ?? "2026-04-09T09:00:00.000Z",
    orderedAtRaw: input.orderedAtRaw ?? "2026-04-09T09:00:00+09:00",
    lastOrderHydratedAt: null,
    lastProductHydratedAt: null,
    estimatedShippingDate: input.estimatedShippingDate ?? null,
    splitShipping: false,
    invoiceTransmissionStatus: input.invoiceTransmissionStatus ?? null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    purchaseConfirmedAt: input.purchaseConfirmedAt ?? null,
    purchaseConfirmedSyncedAt: null,
    purchaseConfirmedFinalSettlementDate: null,
    purchaseConfirmedSource: null,
    exportedAt: input.exportedAt ?? null,
    invoiceAppliedAt: input.invoiceAppliedAt ?? null,
    createdAt: "2026-04-09T09:00:00.000Z",
    updatedAt: "2026-04-09T09:00:00.000Z",
  } satisfies CoupangShipmentWorksheetRow;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("shipment worksheet view", () => {
  it("defaults to all scope when no explicit scope is provided", () => {
    const rows = [
      buildRow({ id: "1", status: "ACCEPT" }),
      buildRow({ id: "2", status: "DELIVERING", exportedAt: "2026-04-09T11:00:00.000Z" }),
    ];

    const view = buildShipmentWorksheetViewData(rows, {
      page: 1,
      pageSize: 50,
    });

    expect(view.scope).toBe("all");
    expect(view.items.map((row) => row.id)).toEqual(["1", "2"]);
    expect(view.scopeCounts.all).toBe(2);
  });

  it("returns only non-claim ACCEPT/INSTRUCT rows for dispatch_active scope", () => {
    const rows = [
      buildRow({ id: "1", status: "ACCEPT" }),
      buildRow({ id: "2", status: "INSTRUCT" }),
      buildRow({ id: "5", status: "DELIVERING" }),
      buildRow({
        id: "3",
        status: "INSTRUCT",
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "반품 1건",
        customerServiceIssueBreakdown: [{ type: "return", count: 1 }],
      }),
      buildRow({ id: "4", status: "DELIVERING", exportedAt: "2026-04-09T11:00:00.000Z" }),
    ];

    const view = buildShipmentWorksheetViewData(rows, {
      scope: "dispatch_active",
      page: 1,
      pageSize: 50,
    });

    expect(view.items.map((row) => row.id)).toEqual(["1", "2", "5"]);
    expect(view.scopeCounts.dispatch_active).toBe(3);
    expect(view.scopeCounts.claims).toBe(1);
    expect(view.scopeCounts.post_dispatch).toBe(1);
    expect(view.orderCounts.ACCEPT).toBe(1);
    expect(view.orderCounts.INSTRUCT).toBe(1);
    expect(view.orderCounts.DELIVERING).toBe(1);
  });

  it("returns only claim rows for claims scope", () => {
    const rows = [
      buildRow({ id: "1", status: "ACCEPT" }),
      buildRow({
        id: "2",
        status: "INSTRUCT",
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "출고중지완료 1건",
        customerServiceIssueBreakdown: [{ type: "shipment_stop_handled", count: 1 }],
      }),
      buildRow({
        id: "3",
        status: "DELIVERING",
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "반품 1건",
        customerServiceIssueBreakdown: [{ type: "return", count: 1 }],
      }),
    ];

    const view = buildShipmentWorksheetViewData(rows, {
      scope: "claims",
      page: 1,
      pageSize: 50,
    });

    expect(view.items.map((row) => row.id)).toEqual(["2", "3"]);
    expect(view.filteredRowCount).toBe(2);
    expect(view.orderCounts.SHIPMENT_STOP_HANDLED).toBe(1);
    expect(view.orderCounts.RETURN).toBe(1);
  });

  it("moves purchase-confirmed rows into the confirmed scope while keeping claim rows claim-first", () => {
    const rows = [
      buildRow({
        id: "confirmed",
        status: "FINAL_DELIVERY",
        exportedAt: "2026-04-09T11:00:00.000Z",
        purchaseConfirmedAt: "2026-04-10T09:00:00.000Z",
      }),
      buildRow({
        id: "confirmed-claim",
        status: "FINAL_DELIVERY",
        exportedAt: "2026-04-09T11:00:00.000Z",
        purchaseConfirmedAt: "2026-04-10T09:00:00.000Z",
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "Return 1",
        customerServiceIssueBreakdown: [{ type: "return", count: 1, label: "Return 1" }],
      }),
      buildRow({
        id: "post-dispatch",
        status: "DELIVERING",
        exportedAt: "2026-04-09T11:00:00.000Z",
      }),
      buildRow({
        id: "dispatch-active",
        status: "ACCEPT",
      }),
    ];

    const confirmedView = buildShipmentWorksheetViewData(rows, {
      scope: "confirmed",
      page: 1,
      pageSize: 50,
    });
    const claimsView = buildShipmentWorksheetViewData(rows, {
      scope: "claims",
      page: 1,
      pageSize: 50,
    });
    const postDispatchView = buildShipmentWorksheetViewData(rows, {
      scope: "post_dispatch",
      page: 1,
      pageSize: 50,
    });
    const dispatchActiveView = buildShipmentWorksheetViewData(rows, {
      scope: "dispatch_active",
      page: 1,
      pageSize: 50,
    });

    expect(confirmedView.items.map((row) => row.id)).toEqual(["confirmed"]);
    expect(confirmedView.scopeCounts.confirmed).toBe(1);
    expect(confirmedView.scopeCounts.claims).toBe(1);
    expect(confirmedView.scopeCounts.post_dispatch).toBe(1);
    expect(confirmedView.scopeCounts.dispatch_active).toBe(1);
    expect(claimsView.items.map((row) => row.id)).toEqual(["confirmed-claim"]);
    expect(postDispatchView.items.map((row) => row.id)).toEqual(["post-dispatch"]);
    expect(dispatchActiveView.items.map((row) => row.id)).toEqual(["dispatch-active"]);
  });

  it("keeps raw shipping and issue axes separate while exposing Coupang-first counts and filters", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00+09:00"));

    const rows = [
      buildRow({
        id: "stop",
        status: "ACCEPT",
        estimatedShippingDate: "2026-04-20T00:00:00+09:00",
        customerServiceIssueCount: 1,
        customerServiceIssueBreakdown: [
          { type: "shipment_stop_requested", count: 1, label: "Shipment stop requested" },
        ],
      }),
      buildRow({
        id: "same-day",
        status: "ACCEPT",
        estimatedShippingDate: "2026-04-20T00:00:00+09:00",
        availableActions: ["markPreparing"],
      }),
      buildRow({
        id: "direct",
        status: "NONE_TRACKING",
        exportedAt: "2026-04-10T12:00:00.000Z",
        invoiceAppliedAt: "2026-04-10T12:00:00.000Z",
        customerServiceState: "stale",
        customerServiceFetchedAt: null,
      }),
      buildRow({
        id: "delivered",
        status: "FINAL_DELIVERY",
        exportedAt: "2026-04-18T11:00:00.000Z",
      }),
    ];

    const view = buildShipmentWorksheetViewData(rows, {
      scope: "all",
      page: 1,
      pageSize: 50,
    });

    expect(view.priorityCounts).toMatchObject({
      all: 4,
      shipment_stop_requested: 1,
      same_day_dispatch: 1,
      dispatch_delayed: 0,
      long_in_transit: 0,
    });
    expect(view.pipelineCounts).toMatchObject({
      all: 4,
      payment_completed: 2,
      in_delivery: 1,
      delivered: 1,
    });
    expect(view.issueCounts).toMatchObject({
      all: 4,
      shipment_stop_requested: 1,
      direct_delivery: 1,
    });
    expect(view.directDeliveryCount).toBe(1);
    expect(view.staleSyncCount).toBe(1);
    expect(view.items.find((row) => row.id === "stop")).toMatchObject({
      rawOrderStatus: "ACCEPT",
      shippingStage: "payment_completed",
      issueStage: "shipment_stop_requested",
      priorityBucket: "shipment_stop_requested",
      pipelineBucket: "payment_completed",
    });
    expect(view.items.find((row) => row.id === "direct")).toMatchObject({
      rawOrderStatus: "NONE_TRACKING",
      shippingStage: "in_delivery",
      isDirectDelivery: true,
      syncSource: "worksheet_cache",
    });

    const directDeliveryView = buildShipmentWorksheetViewData(rows, {
      scope: "all",
      issueFilter: "direct_delivery",
      page: 1,
      pageSize: 50,
    });
    const priorityView = buildShipmentWorksheetViewData(rows, {
      scope: "all",
      priorityCard: "same_day_dispatch",
      page: 1,
      pageSize: 50,
    });

    expect(directDeliveryView.items.map((row) => row.id)).toEqual(["direct"]);
    expect(priorityView.items.map((row) => row.id)).toEqual(["same-day"]);
  });

  it("applies createdAt range to cards, scope counts, and table rows together", () => {
    const rows = [
      buildRow({
        id: "in-range-ready",
        status: "ACCEPT",
        orderDateKey: "20260418",
        orderedAtRaw: "2026-04-18T09:00:00+09:00",
      }),
      buildRow({
        id: "in-range-delivered",
        status: "FINAL_DELIVERY",
        orderDateKey: "20260419",
        orderedAtRaw: "2026-04-19T09:00:00+09:00",
        exportedAt: "2026-04-19T12:00:00.000Z",
      }),
      buildRow({
        id: "out-of-range",
        status: "INSTRUCT",
        orderDateKey: "20260410",
        orderedAtRaw: "2026-04-10T09:00:00+09:00",
      }),
    ];

    const view = buildShipmentWorksheetViewData(rows, {
      scope: "all",
      createdAtFrom: "2026-04-18",
      createdAtTo: "2026-04-19",
      page: 1,
      pageSize: 50,
    });

    expect(view.items.map((row) => row.id)).toEqual(["in-range-ready", "in-range-delivered"]);
    expect(view.totalRowCount).toBe(2);
    expect(view.scopeCounts.all).toBe(2);
    expect(view.scopeCounts.dispatch_active).toBe(1);
    expect(view.scopeCounts.post_dispatch).toBe(1);
    expect(view.pipelineCounts.all).toBe(2);
    expect(view.pipelineCounts.payment_completed).toBe(1);
    expect(view.pipelineCounts.delivered).toBe(1);
  });

  it("fills mismatch reason when stored normalized fields differ from the current mapping", () => {
    const rows = [
      buildRow({
        id: "mismatch",
        status: "ACCEPT",
        shippingStage: "delivered",
        issueStage: "shipment_stop_resolved",
        priorityBucket: "long_in_transit",
        pipelineBucket: "delivered",
      }),
    ];

    const view = buildShipmentWorksheetViewData(rows, {
      scope: "all",
      page: 1,
      pageSize: 50,
    });

    expect(view.items[0]).toMatchObject({
      shippingStage: "payment_completed",
      issueStage: "none",
      pipelineBucket: "payment_completed",
    });
    expect(view.items[0]?.statusMismatchReason).toContain("저장된 워크시트 배송 상태");
  });

  it("resolves not-exported download rows without claims", () => {
    const rows = [
      buildRow({ id: "1", status: "ACCEPT" }),
      buildRow({
        id: "2",
        status: "ACCEPT",
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "취소 1건",
        customerServiceIssueBreakdown: [{ type: "cancel", count: 1 }],
      }),
      buildRow({ id: "3", status: "ACCEPT", exportedAt: "2026-04-09T11:00:00.000Z" }),
    ];

    const resolved = resolveShipmentWorksheetRows(
      rows,
      {
        scope: "all",
        page: 1,
        pageSize: 50,
      },
      "not_exported_download",
    );

    expect(resolved.items.map((row) => row.id)).toEqual(["1"]);
    expect(resolved.blockedItems.map((row) => row.id)).toEqual(["2"]);
    expect(resolved.matchedCount).toBe(2);
    expect(resolved.resolvedCount).toBe(1);
  });

  it("resolves invoice-ready rows from the current view query", () => {
    const rows = [
      buildRow({
        id: "1",
        status: "INSTRUCT",
        invoiceNumber: "1111",
        deliveryCompanyCode: "CJ",
        availableActions: ["uploadInvoice"],
      }),
      buildRow({
        id: "2",
        status: "INSTRUCT",
        invoiceNumber: "2222",
        deliveryCompanyCode: "CJ",
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "반품 1건",
        customerServiceIssueBreakdown: [{ type: "return", count: 1 }],
        availableActions: ["uploadInvoice"],
      }),
      buildRow({
        id: "3",
        status: "INSTRUCT",
        invoiceNumber: "3333",
        deliveryCompanyCode: "CJ",
        invoiceAppliedAt: "2026-04-09T12:00:00.000Z",
        availableActions: ["uploadInvoice"],
      }),
    ];

    const resolved = resolveShipmentWorksheetRows(
      rows,
      {
        scope: "all",
        page: 1,
        pageSize: 50,
      },
      "invoice_ready",
    );

    expect(resolved.items.map((row) => row.id)).toEqual(["1"]);
    expect(resolved.blockedItems.map((row) => row.id)).toEqual(["2"]);
    expect(resolved.matchedCount).toBe(2);
    expect(resolved.resolvedCount).toBe(1);
  });

  it("excludes placeholder invoice rows from invoice-ready resolution", () => {
    const rows = [
      buildRow({
        id: "placeholder",
        status: "INSTRUCT",
        storeName: "쿠팡_올케이팝",
        deliveryCompanyCode: "쿠팡_올케이팝",
        invoiceNumber: "CS이관",
        availableActions: ["uploadInvoice"],
      }),
      buildRow({
        id: "valid",
        status: "INSTRUCT",
        deliveryCompanyCode: "HYUNDAI",
        invoiceNumber: "257645330736",
        availableActions: ["uploadInvoice"],
      }),
    ];

    const resolved = resolveShipmentWorksheetRows(
      rows,
      {
        scope: "all",
        page: 1,
        pageSize: 50,
      },
      "invoice_ready",
    );

    expect(resolved.items.map((row) => row.id)).toEqual(["valid"]);
    expect(resolved.blockedItems).toHaveLength(0);
    expect(resolved.matchedCount).toBe(2);
    expect(resolved.resolvedCount).toBe(1);
  });

  it("resolves prepare-ready rows from the current view query", () => {
    const rows = [
      buildRow({
        id: "1",
        status: "ACCEPT",
        availableActions: ["markPreparing"],
      }),
      buildRow({
        id: "2",
        status: "ACCEPT",
        customerServiceIssueCount: 1,
        customerServiceIssueSummary: "반품 1건",
        customerServiceIssueBreakdown: [{ type: "return", count: 1 }],
        availableActions: ["markPreparing"],
      }),
      buildRow({
        id: "3",
        status: "INSTRUCT",
        availableActions: ["uploadInvoice"],
      }),
    ];

    const resolved = resolveShipmentWorksheetRows(
      rows,
      {
        scope: "all",
        page: 1,
        pageSize: 50,
      },
      "prepare_ready",
    );

    expect(resolved.items.map((row) => row.id)).toEqual(["1"]);
    expect(resolved.blockedItems.map((row) => row.id)).toEqual(["2"]);
    expect(resolved.matchedCount).toBe(2);
    expect(resolved.resolvedCount).toBe(1);
  });

  it("classifies whether a worksheet row is out of scope or filtered out", () => {
    const acceptRow = buildRow({ id: "1", status: "ACCEPT" });
    const deliveringRow = buildRow({ id: "2", status: "DELIVERING", exportedAt: "2026-04-09T11:00:00.000Z" });

    expect(
      getShipmentWorksheetRowHiddenReason(acceptRow, {
        scope: "dispatch_active",
        query: "Product 1",
      }),
    ).toBeNull();

    expect(
      getShipmentWorksheetRowHiddenReason(acceptRow, {
        scope: "dispatch_active",
        query: "no-match",
      }),
    ).toBe("filtered_out");

    expect(
      getShipmentWorksheetRowHiddenReason(deliveringRow, {
        scope: "dispatch_active",
      }),
    ).toBe("out_of_scope");
  });

  it("applies decisionStatus to table rows while keeping queue counts on the full filtered set", () => {
    const rows = [
      buildRow({
        id: "ready-1",
        status: "ACCEPT",
        availableActions: ["markPreparing"],
      }),
      buildRow({
        id: "ready-2",
        status: "ACCEPT",
        availableActions: ["markPreparing"],
      }),
      buildRow({
        id: "invoice",
        status: "INSTRUCT",
        availableActions: ["uploadInvoice"],
      }),
      buildRow({
        id: "recheck",
        status: "INSTRUCT",
        invoiceTransmissionStatus: "failed",
        availableActions: ["uploadInvoice"],
      }),
    ];

    const view = buildShipmentWorksheetViewData(rows, {
      scope: "all",
      decisionStatus: "ready",
      page: 1,
      pageSize: 1,
    });

    expect(view.items.map((row) => row.id)).toEqual(["ready-1"]);
    expect(view.filteredRowCount).toBe(2);
    expect(view.totalPages).toBe(2);
    expect(view.decisionCounts).toEqual({
      all: 4,
      ready: 2,
      invoice_waiting: 1,
      hold: 0,
      blocked: 0,
      recheck: 1,
    });
    expect(view.decisionPreviewGroups.ready.count).toBe(2);
    expect(view.decisionPreviewGroups.ready.previewItems.map((item) => item.rowId)).toEqual([
      "ready-1",
      "ready-2",
    ]);
    expect(view.items[0]?.primaryDecision?.status).toBe("ready");
    expect(view.items[0]?.secondaryStatus?.orderStatusLabel).toBe("주문접수");
    expect(view.items[0]?.nextHandoffLinks?.[0]?.decisionStatus).toBe("ready");
  });

  it("treats decisionStatus mismatch as filtered_out", () => {
    const invoiceRow = buildRow({
      id: "invoice",
      status: "INSTRUCT",
      availableActions: ["uploadInvoice"],
    });

    expect(
      getShipmentWorksheetRowHiddenReason(invoiceRow, {
        scope: "all",
        decisionStatus: "ready",
      }),
    ).toBe("filtered_out");
  });
});
