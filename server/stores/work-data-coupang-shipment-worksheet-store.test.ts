import { describe, expect, it } from "vitest";

import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import type { CoupangShipmentRowRow } from "@shared/schema";

import {
  buildCompactWorksheetRowData,
  restoreWorksheetRowFromDatabaseRow,
} from "./work-data-coupang-shipment-worksheet-store";

function buildWorksheetRow(): CoupangShipmentWorksheetRow {
  return {
    id: "row-1",
    sourceKey: "source-1",
    storeId: "store-1",
    storeName: "테스트 스토어",
    orderDateText: "04/10",
    orderDateKey: "20260410",
    quantity: 2,
    productName: "테스트 상품",
    optionName: "옵션 A",
    productOrderNumber: "PO-1",
    collectedPlatform: "쿠팡",
    ordererName: "주문자",
    contact: "010-1111-2222",
    receiverName: "수령자",
    receiverBaseName: "수령자",
    personalClearanceCode: null,
    collectedAccountName: "테스트 스토어",
    deliveryCompanyCode: "CJ대한통운",
    selpickOrderNumber: "O20260410K0001",
    invoiceNumber: "123456789",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 12000,
    shippingFee: 3000,
    receiverAddress: "서울 어딘가",
    deliveryRequest: "문 앞",
    buyerPhoneNumber: "010-9999-9999",
    productNumber: "P-1",
    exposedProductName: "노출 상품명",
    coupangDisplayProductName: "쿠팡 원본 노출 상품명",
    productOptionNumber: "V-1",
    sellerProductCode: "SKU-1",
    isOverseas: false,
    shipmentBoxId: "S-1",
    orderId: "O-1",
    sellerProductId: "SP-1",
    vendorItemId: "VI-1",
    availableActions: ["markPreparing"],
    orderStatus: "ACCEPT",
    customerServiceIssueCount: 1,
    customerServiceIssueSummary: "교환 1건",
    customerServiceIssueBreakdown: [{ type: "exchange", count: 1, label: "교환" }],
    customerServiceState: "ready",
    customerServiceFetchedAt: "2026-04-10T01:00:00.000Z",
    orderedAtRaw: "2026-04-10T09:00:00+09:00",
    lastOrderHydratedAt: "2026-04-10T01:00:00.000Z",
    lastProductHydratedAt: "2026-04-10T01:00:00.000Z",
    estimatedShippingDate: "2026-04-11",
    splitShipping: false,
    invoiceTransmissionStatus: "succeeded",
    invoiceTransmissionMessage: "전송 완료",
    invoiceTransmissionAt: "2026-04-10T02:00:00.000Z",
    invoiceAppliedAt: "2026-04-10T02:00:00.000Z",
    exportedAt: "2026-04-10T03:00:00.000Z",
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T03:00:00.000Z",
  };
}

function buildDatabaseRow(
  row: CoupangShipmentWorksheetRow,
  rowDataJson: unknown,
): CoupangShipmentRowRow {
  return {
    id: row.id,
    sheetId: "sheet-1",
    storeId: row.storeId,
    sourceKey: row.sourceKey,
    sortOrder: 0,
    selpickOrderNumber: row.selpickOrderNumber,
    orderDateKey: row.orderDateKey,
    orderStatus: row.orderStatus,
    orderedAtRaw: row.orderedAtRaw,
    lastOrderHydratedAt: row.lastOrderHydratedAt ? new Date(row.lastOrderHydratedAt) : null,
    lastProductHydratedAt: row.lastProductHydratedAt ? new Date(row.lastProductHydratedAt) : null,
    shipmentBoxId: row.shipmentBoxId,
    orderId: row.orderId,
    sellerProductId: row.sellerProductId,
    vendorItemId: row.vendorItemId,
    receiverName: row.receiverName,
    receiverBaseName: row.receiverBaseName,
    personalClearanceCode: row.personalClearanceCode,
    deliveryCompanyCode: row.deliveryCompanyCode,
    invoiceNumber: row.invoiceNumber,
    invoiceTransmissionStatus: row.invoiceTransmissionStatus,
    invoiceTransmissionMessage: row.invoiceTransmissionMessage,
    invoiceTransmissionAt: row.invoiceTransmissionAt ? new Date(row.invoiceTransmissionAt) : null,
    invoiceAppliedAt: row.invoiceAppliedAt ? new Date(row.invoiceAppliedAt) : null,
    exportedAt: row.exportedAt ? new Date(row.exportedAt) : null,
    rowDataJson,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

describe("work-data coupang shipment worksheet row persistence", () => {
  it("stores only non-column payload fields in compact rowDataJson", () => {
    const row = buildWorksheetRow();

    const compact = buildCompactWorksheetRowData(row);

    expect(compact).toMatchObject({
      __compact: true,
      storeName: "테스트 스토어",
      productName: "테스트 상품",
      coupangDisplayProductName: "쿠팡 원본 노출 상품명",
      availableActions: ["markPreparing"],
      customerServiceIssueBreakdown: [{ type: "exchange", count: 1, label: "교환" }],
    });
    expect(compact.sourceKey).toBeUndefined();
    expect(compact.shipmentBoxId).toBeUndefined();
    expect(compact.invoiceNumber).toBeUndefined();
  });

  it("restores the worksheet row shape from compact payload plus DB columns", () => {
    const row = buildWorksheetRow();
    const compact = buildCompactWorksheetRowData(row);

    const restored = restoreWorksheetRowFromDatabaseRow(buildDatabaseRow(row, compact));

    expect(restored).toEqual(row);
  });
});
