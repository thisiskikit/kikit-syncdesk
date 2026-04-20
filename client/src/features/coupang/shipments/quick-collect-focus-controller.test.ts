import { describe, expect, it } from "vitest";

import type {
  CoupangShipmentWorksheetRow,
  CoupangShipmentWorksheetViewResponse,
  CoupangShipmentWorksheetViewScope,
} from "@shared/coupang";
import { resolveQuickCollectFocusViewState } from "./quick-collect-focus-controller";

function buildRow(
  input: Partial<CoupangShipmentWorksheetRow> &
    Pick<CoupangShipmentWorksheetRow, "id" | "sourceKey">,
) {
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

function buildViewResponse(
  items: CoupangShipmentWorksheetRow[],
  scopeCounts: Record<CoupangShipmentWorksheetViewScope, number>,
) {
  return {
    store: {
      id: "store-1",
      name: "쿠팡_올웨이팜",
      vendorId: "vendor-1",
    },
    items,
    rawFieldCatalog: [],
    fetchedAt: "2026-04-12T09:00:00+09:00",
    collectedAt: "2026-04-12T09:00:00+09:00",
    message: null,
    source: "live",
    syncSummary: null,
    scope: "dispatch_active",
    page: 1,
    pageSize: 50,
    totalPages: 1,
    totalRowCount: items.length,
    scopeRowCount: items.length,
    filteredRowCount: items.length,
    invoiceReadyCount: 0,
    decisionCounts: {
      all: items.length,
      ready: 0,
      invoice_waiting: 0,
      hold: 0,
      blocked: 0,
      recheck: 0,
    },
    decisionPreviewGroups: {
      ready: {
        status: "ready",
        statusLabel: "즉시 출고",
        count: 0,
        topReasonLabels: [],
        previewItems: [],
        nextHandoffLinks: [],
      },
      invoice_waiting: {
        status: "invoice_waiting",
        statusLabel: "송장 입력",
        count: 0,
        topReasonLabels: [],
        previewItems: [],
        nextHandoffLinks: [],
      },
      hold: {
        status: "hold",
        statusLabel: "보류",
        count: 0,
        topReasonLabels: [],
        previewItems: [],
        nextHandoffLinks: [],
      },
      blocked: {
        status: "blocked",
        statusLabel: "차단",
        count: 0,
        topReasonLabels: [],
        previewItems: [],
        nextHandoffLinks: [],
      },
      recheck: {
        status: "recheck",
        statusLabel: "재확인 필요",
        count: 0,
        topReasonLabels: [],
        previewItems: [],
        nextHandoffLinks: [],
      },
    },
    priorityCounts: {
      all: items.length,
      shipment_stop_requested: 0,
      same_day_dispatch: 0,
      dispatch_delayed: 0,
      long_in_transit: 0,
    },
    pipelineCounts: {
      all: items.length,
      payment_completed: items.length,
      preparing_product: 0,
      shipping_instruction: 0,
      in_delivery: 0,
      delivered: 0,
    },
    issueCounts: {
      all: items.length,
      shipment_stop_requested: 0,
      shipment_stop_resolved: 0,
      cancel: 0,
      return: 0,
      exchange: 0,
      cs_open: 0,
      direct_delivery: 0,
    },
    directDeliveryCount: 0,
    staleSyncCount: 0,
    scopeCounts,
    invoiceCounts: {
      all: items.length,
      idle: items.length,
      ready: 0,
      pending: 0,
      failed: 0,
      applied: 0,
    },
    orderCounts: {
      all: items.length,
      ACCEPT: items.length,
      INSTRUCT: 0,
      DEPARTURE: 0,
      DELIVERING: 0,
      FINAL_DELIVERY: 0,
      NONE_TRACKING: 0,
      SHIPMENT_STOP_REQUESTED: 0,
      SHIPMENT_STOP_HANDLED: 0,
      CANCEL: 0,
      RETURN: 0,
      EXCHANGE: 0,
    },
    outputCounts: {
      all: items.length,
      notExported: items.length,
      exported: 0,
    },
  } satisfies CoupangShipmentWorksheetViewResponse;
}

describe("quick collect focus view state", () => {
  it("focus signature가 바뀌면 기존 시트 기준으로 안전하게 복귀한다", () => {
    const draftRows = [
      buildRow({ id: "row-1", sourceKey: "A", orderStatus: "ACCEPT" }),
      buildRow({ id: "row-2", sourceKey: "B", orderStatus: "ACCEPT", invoiceTransmissionStatus: "failed" }),
    ];
    const baseActiveSheet = buildViewResponse(draftRows, {
      dispatch_active: 12,
      post_dispatch: 3,
      claims: 2,
      all: 17,
    });

    const state = resolveQuickCollectFocusViewState({
      activeTab: "worksheet",
      quickCollectFocus: {
        active: true,
        sourceKeys: ["A"],
        rows: draftRows,
        filterSignature: "before",
      },
      filterSignature: "after",
      rows: draftRows,
      draftRows,
      decisionStatus: "recheck",
      page: 1,
      pageSize: 50,
      baseActiveSheet,
      selectedStore: {
        id: "store-1",
        storeName: "쿠팡_올웨이팜",
        vendorId: "vendor-1",
      },
      scope: "dispatch_active",
    });

    expect(state.isActive).toBe(false);
    expect(state.result).toBeNull();
    expect(state.activeSheet).toBe(baseActiveSheet);
    expect(state.effectiveDraftRows.map((row) => row.sourceKey)).toEqual(["A", "B"]);
    expect(state.visibleRows.map((row) => row.sourceKey)).toEqual(["B"]);
    expect(state.scopeCounts).toEqual(baseActiveSheet.scopeCounts);
  });

  it("focus가 활성화되면 focused rows로 시트를 재구성하되 scope count는 유지한다", () => {
    const rows = [
      buildRow({ id: "row-1", sourceKey: "A", orderStatus: "ACCEPT" }),
      buildRow({ id: "row-2", sourceKey: "B", orderStatus: "ACCEPT", invoiceNumber: "INV-2" }),
      buildRow({ id: "row-3", sourceKey: "C", orderStatus: "ACCEPT" }),
    ];
    const baseActiveSheet = buildViewResponse(rows, {
      dispatch_active: 10,
      post_dispatch: 4,
      claims: 1,
      all: 15,
    });

    const state = resolveQuickCollectFocusViewState({
      activeTab: "worksheet",
      quickCollectFocus: {
        active: true,
        sourceKeys: ["A", "B"],
        rows,
        filterSignature: "same",
      },
      filterSignature: "same",
      rows,
      draftRows: rows,
      decisionStatus: "all",
      page: 1,
      pageSize: 1,
      baseActiveSheet,
      selectedStore: {
        id: "store-1",
        storeName: "쿠팡_올웨이팜",
        vendorId: "vendor-1",
      },
      scope: "dispatch_active",
    });

    expect(state.isActive).toBe(true);
    expect(state.result?.focusedRows.map((row) => row.sourceKey)).toEqual(["A", "B"]);
    expect(state.effectiveDraftRows.map((row) => row.sourceKey)).toEqual(["A"]);
    expect(state.visibleRows.map((row) => row.sourceKey)).toEqual(["A"]);
    expect(state.activeSheet?.items.map((row) => row.sourceKey)).toEqual(["A", "B"]);
    expect(state.activeSheet?.totalRowCount).toBe(2);
    expect(state.scopeCounts).toEqual(baseActiveSheet.scopeCounts);
  });

  it("base 시트가 없어도 focus 결과로 fallback sheet를 구성한다", () => {
    const rows = [buildRow({ id: "row-1", sourceKey: "A", orderStatus: "ACCEPT" })];

    const state = resolveQuickCollectFocusViewState({
      activeTab: "worksheet",
      quickCollectFocus: {
        active: true,
        sourceKeys: ["A"],
        rows,
        filterSignature: "same",
      },
      filterSignature: "same",
      rows,
      draftRows: rows,
      decisionStatus: "all",
      page: 1,
      pageSize: 50,
      baseActiveSheet: null,
      selectedStore: {
        id: "store-1",
        storeName: "쿠팡_올웨이팜",
        vendorId: "vendor-1",
      },
      scope: "dispatch_active",
    });

    expect(state.isActive).toBe(true);
    expect(state.activeSheet?.store.name).toBe("쿠팡_올웨이팜");
    expect(state.activeSheet?.source).toBe("live");
    expect(state.activeSheet?.scopeCounts).toEqual({
      dispatch_active: 0,
      post_dispatch: 0,
      confirmed: 0,
      claims: 0,
      all: 0,
    });
  });
});
