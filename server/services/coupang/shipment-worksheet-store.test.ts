import { mkdtemp, rm } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it } from "vitest";

import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import { CoupangShipmentWorksheetStore } from "./shipment-worksheet-store";

function buildRow(input: {
  id: string;
  sourceKey: string;
  orderDateKey: string;
  orderDateText: string;
  selpickOrderNumber: string;
  updatedAt: string;
}) {
  return {
    id: input.id,
    sourceKey: input.sourceKey,
    storeId: "store-1",
    storeName: "테스트스토어",
    orderDateText: input.orderDateText,
    orderDateKey: input.orderDateKey,
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
    collectedAccountName: "테스트스토어",
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
    customerServiceState: "unknown",
    customerServiceFetchedAt: null,
    orderedAtRaw: `${input.orderDateKey.slice(0, 4)}-${input.orderDateKey.slice(4, 6)}-${input.orderDateKey.slice(6, 8)}T09:00:00+09:00`,
    lastOrderHydratedAt: "2026-03-26T00:00:00.000Z",
    lastProductHydratedAt: "2026-03-26T00:00:00.000Z",
    estimatedShippingDate: null,
    splitShipping: false,
    invoiceTransmissionStatus: null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    exportedAt: null,
    invoiceAppliedAt: null,
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: input.updatedAt,
  } satisfies CoupangShipmentWorksheetRow;
}

describe("CoupangShipmentWorksheetStore", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("keeps the saved row order without re-sorting", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "coupang-shipment-worksheet-store-"));
    const filePath = path.join(tempDir, "coupang-shipment-worksheet.json");
    const store = new CoupangShipmentWorksheetStore(filePath);

    await store.setStoreSheet({
      storeId: "store-1",
      items: [
        buildRow({
          id: "row-1",
          sourceKey: "key-1",
          orderDateKey: "20260326",
          orderDateText: "03/26",
          selpickOrderNumber: "O20260326K0005",
          updatedAt: "2026-03-26T10:00:00.000Z",
        }),
        buildRow({
          id: "row-2",
          sourceKey: "key-2",
          orderDateKey: "20260324",
          orderDateText: "03/24",
          selpickOrderNumber: "O20260324K0001",
          updatedAt: "2026-03-24T10:00:00.000Z",
        }),
        buildRow({
          id: "row-3",
          sourceKey: "key-3",
          orderDateKey: "20260326",
          orderDateText: "03/26",
          selpickOrderNumber: "O20260326K0001",
          updatedAt: "2026-03-26T09:00:00.000Z",
        }),
      ],
      collectedAt: "2026-03-26T10:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T10:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-24",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: null,
      },
      syncSummary: {
        mode: "full",
        fetchedCount: 3,
        insertedCount: 3,
        updatedCount: 0,
        skippedHydrationCount: 0,
        autoExpanded: false,
        fetchCreatedAtFrom: "2026-03-24",
        fetchCreatedAtTo: "2026-03-26",
        statusFilter: null,
      },
    });

    const reloadedStore = new CoupangShipmentWorksheetStore(filePath);
    const sheet = await reloadedStore.getStoreSheet("store-1");

    expect(sheet.items.map((row) => row.selpickOrderNumber)).toEqual([
      "O20260326K0005",
      "O20260324K0001",
      "O20260326K0001",
    ]);
  });

  it("persists sync state and summary with the worksheet", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "coupang-shipment-worksheet-store-"));
    const filePath = path.join(tempDir, "coupang-shipment-worksheet.json");
    const store = new CoupangShipmentWorksheetStore(filePath);

    await store.setStoreSheet({
      storeId: "store-1",
      items: [
        buildRow({
          id: "row-1",
          sourceKey: "key-1",
          orderDateKey: "20260326",
          orderDateText: "03/26",
          selpickOrderNumber: "O20260326K0001",
          updatedAt: "2026-03-26T10:00:00.000Z",
        }),
      ],
      collectedAt: "2026-03-26T10:00:00.000Z",
      source: "live",
      message: "수집 완료",
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T09:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-24",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: "INSTRUCT",
      },
      syncSummary: {
        mode: "incremental",
        fetchedCount: 2,
        insertedCount: 1,
        updatedCount: 1,
        skippedHydrationCount: 0,
        autoExpanded: true,
        fetchCreatedAtFrom: "2026-03-25",
        fetchCreatedAtTo: "2026-03-26",
        statusFilter: "INSTRUCT",
      },
    });

    const reloadedStore = new CoupangShipmentWorksheetStore(filePath);
    const sheet = await reloadedStore.getStoreSheet("store-1");

    expect(sheet.syncState.lastIncrementalCollectedAt).toBe("2026-03-26T10:00:00.000Z");
    expect(sheet.syncState.coveredCreatedAtFrom).toBe("2026-03-24");
    expect(sheet.syncSummary).toMatchObject({
      mode: "incremental",
      insertedCount: 1,
      updatedCount: 1,
      statusFilter: "INSTRUCT",
    });
  });

  it("normalizes legacy duplicate invoice failures into transmitted rows", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "coupang-shipment-worksheet-store-"));
    const filePath = path.join(tempDir, "coupang-shipment-worksheet.json");
    const store = new CoupangShipmentWorksheetStore(filePath);

    await store.setStoreSheet({
      storeId: "store-1",
      items: [
        {
          ...buildRow({
            id: "row-legacy",
            sourceKey: "key-legacy",
            orderDateKey: "20260326",
            orderDateText: "03/26",
            selpickOrderNumber: "O20260326K0009",
            updatedAt: "2026-03-26T10:00:00.000Z",
          }),
          coupangDeliveryCompanyCode: "CJ",
          coupangInvoiceNumber: "INV-100",
          coupangInvoiceUploadedAt: "2026-03-26T10:00:00.000Z",
          invoiceTransmissionStatus: "failed",
          invoiceTransmissionMessage: "duplicate invoice",
          invoiceTransmissionAt: "2026-03-26T10:00:00.000Z",
          invoiceAppliedAt: null,
        },
      ],
      collectedAt: "2026-03-26T10:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T10:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-26",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: null,
      },
      syncSummary: null,
    });

    const sheet = await store.getStoreSheet("store-1");

    expect(sheet.items[0]).toMatchObject({
      coupangDeliveryCompanyCode: null,
      coupangInvoiceNumber: null,
      coupangInvoiceUploadedAt: null,
      invoiceTransmissionStatus: "succeeded",
      invoiceTransmissionMessage: "\uC774\uBBF8 \uC804\uC1A1\uB41C \uC1A1\uC7A5\uC785\uB2C8\uB2E4.",
      invoiceAppliedAt: "2026-03-26T10:00:00.000Z",
    });
  });

  it("recovers stale pending invoice transmissions so they can be retried", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "coupang-shipment-worksheet-store-"));
    const filePath = path.join(tempDir, "coupang-shipment-worksheet.json");
    const store = new CoupangShipmentWorksheetStore(filePath);

    await store.setStoreSheet({
      storeId: "store-1",
      items: [
        {
          ...buildRow({
            id: "row-pending",
            sourceKey: "key-pending",
            orderDateKey: "20260326",
            orderDateText: "03/26",
            selpickOrderNumber: "O20260326K0010",
            updatedAt: "2026-03-26T10:00:00.000Z",
          }),
          invoiceTransmissionStatus: "pending",
          invoiceTransmissionMessage: null,
          invoiceTransmissionAt: null,
          invoiceAppliedAt: null,
        },
      ],
      collectedAt: "2026-03-26T10:00:00.000Z",
      source: "live",
      message: null,
      syncState: {
        lastIncrementalCollectedAt: "2026-03-26T10:00:00.000Z",
        lastFullCollectedAt: "2026-03-26T10:00:00.000Z",
        coveredCreatedAtFrom: "2026-03-26",
        coveredCreatedAtTo: "2026-03-26",
        lastStatusFilter: null,
      },
      syncSummary: null,
    });

    const sheet = await store.getStoreSheet("store-1");

    expect(sheet.items[0]).toMatchObject({
      invoiceTransmissionStatus: "failed",
      invoiceTransmissionMessage:
        "\uC804\uC1A1 \uACB0\uACFC \uD655\uC778\uC774 \uC9C0\uC5F0\uB418\uC5B4 \uC2E4\uD328\uB85C \uC804\uD658\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC804\uC1A1\uD574 \uC8FC\uC138\uC694.",
      invoiceTransmissionAt: "2026-03-26T10:00:00.000Z",
      invoiceAppliedAt: null,
    });
  });
});
