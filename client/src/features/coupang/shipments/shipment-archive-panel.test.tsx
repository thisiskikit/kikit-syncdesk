import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CoupangShipmentArchiveRow } from "@shared/coupang";

import ShipmentArchivePanel from "./shipment-archive-panel";

function buildArchiveRow(
  overrides: Partial<CoupangShipmentArchiveRow> = {},
): CoupangShipmentArchiveRow {
  return {
    id: overrides.id ?? "row-1",
    sourceKey: overrides.sourceKey ?? "store-1:shipment-1:vendor-1",
    storeId: "store-1",
    storeName: "Archive Store",
    orderDateText: "04/01",
    orderDateKey: "20260401",
    quantity: 1,
    productName: "Archive Product",
    optionName: "Option A",
    productOrderNumber: "PO-1",
    collectedPlatform: "coupang",
    ordererName: "Orderer",
    contact: "010-1111-2222",
    receiverName: "Receiver",
    receiverBaseName: "Receiver",
    personalClearanceCode: null,
    collectedAccountName: "Archive Store",
    deliveryCompanyCode: "CJ",
    selpickOrderNumber: "SEL-1",
    invoiceNumber: "1234567890",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "Seoul",
    deliveryRequest: "",
    buyerPhoneNumber: "010-9999-9999",
    productNumber: "P-1",
    exposedProductName: "Archive Product / Option A",
    coupangDisplayProductName: "Archive Product",
    productOptionNumber: "OPT-1",
    sellerProductCode: "SKU-1",
    isOverseas: false,
    shipmentBoxId: "shipment-1",
    orderId: "order-1",
    sellerProductId: "seller-1",
    vendorItemId: "vendor-1",
    availableActions: ["uploadInvoice"],
    orderStatus: "DELIVERING",
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceTerminalStatus: null,
    customerServiceState: "ready",
    customerServiceFetchedAt: "2026-04-01T00:00:00.000Z",
    orderedAtRaw: "2026-04-01T09:00:00+09:00",
    lastOrderHydratedAt: "2026-04-01T00:00:00.000Z",
    lastProductHydratedAt: "2026-04-01T00:00:00.000Z",
    estimatedShippingDate: "2026-04-02",
    splitShipping: false,
    invoiceTransmissionStatus: "succeeded",
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: "2026-04-01T01:00:00.000Z",
    invoiceAppliedAt: "2026-04-01T01:00:00.000Z",
    exportedAt: "2026-02-01T00:00:00.000Z",
    archivedAt: "2026-04-12T03:30:00.000Z",
    archiveReason: "retention_post_dispatch",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ShipmentArchivePanel", () => {
  it("renders the updated archive guidance and archive reason labels", () => {
    const rows = [
      buildArchiveRow({
        id: "retention-row",
        sourceKey: "store-1:shipment-1:vendor-1",
        archiveReason: "retention_post_dispatch",
      }),
      buildArchiveRow({
        id: "cancel-row",
        sourceKey: "store-1:shipment-2:vendor-2",
        shipmentBoxId: "shipment-2",
        orderId: "order-2",
        vendorItemId: "vendor-2",
        archiveReason: "cancel_completed",
      }),
      buildArchiveRow({
        id: "return-row",
        sourceKey: "store-1:shipment-3:vendor-3",
        shipmentBoxId: "shipment-3",
        orderId: "order-3",
        vendorItemId: "vendor-3",
        archiveReason: "return_completed",
      }),
    ];

    const markup = renderToStaticMarkup(
      <ShipmentArchivePanel
        detailGuideNotice="상세 확인 안내"
        isLoading={false}
        totalRowCount={rows.length}
        filteredRowCount={rows.length}
        rows={rows}
        archivePage={1}
        archiveTotalPages={1}
        worksheetPageSize={50}
        pageSizeOptions={[50, 100]}
        onPageSizeChange={vi.fn()}
        onPrevPage={vi.fn()}
        onNextPage={vi.fn()}
        getStatusPresentation={() => ({
          orderLabel: "상태",
          orderToneClassName: "info",
        })}
        getArchiveReasonLabel={(row) => {
          if (row.archiveReason === "cancel_completed") {
            return "취소완료 자동보관";
          }
          if (row.archiveReason === "return_completed") {
            return "반품완료 자동보관";
          }
          return "일반 보관";
        }}
        formatDateTimeLabel={(value) => value ?? "-"}
        formatInvoiceText={(row) => row.invoiceNumber || "-"}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(markup).toContain("완료된 취소/반품 주문");
    expect(markup).toContain("상세 확인 안내");
    expect(markup).toContain("일반 보관");
    expect(markup).toContain("취소완료 자동보관");
    expect(markup).toContain("반품완료 자동보관");
  });
});
