import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import type { CoupangShipmentWorksheetStoreSheet } from "./shipment-worksheet-store";

const { getStoreMock, getStoreSheetMock, patchRowsMock } = vi.hoisted(() => ({
  getStoreMock: vi.fn(),
  getStoreSheetMock: vi.fn(),
  patchRowsMock: vi.fn(),
}));

vi.mock("./settings-store", () => ({
  coupangSettingsStore: {
    getStore: getStoreMock,
  },
}));

vi.mock("./shipment-worksheet-store", () => ({
  coupangShipmentWorksheetStore: {
    getStoreSheet: getStoreSheetMock,
    patchRows: patchRowsMock,
  },
}));

import { applyShipmentWorksheetInvoiceInput } from "./shipment-worksheet-service";

function buildStore() {
  return {
    id: "store-1",
    channel: "coupang" as const,
    storeName: "테스트 스토어",
    vendorId: "A0001",
    shipmentPlatformKey: "T",
    credentials: {
      accessKey: "access-key",
      secretKey: "secret-key",
    },
    baseUrl: "https://api-gateway.coupang.com",
    connectionTest: {
      status: "success" as const,
      testedAt: "2026-04-10T00:00:00.000Z",
      message: "ok",
    },
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

function buildRow(input: {
  id: string;
  sourceKey: string;
  selpickOrderNumber: string;
  deliveryCompanyCode?: string;
  invoiceNumber?: string;
}): CoupangShipmentWorksheetRow {
  return {
    id: input.id,
    sourceKey: input.sourceKey,
    storeId: "store-1",
    storeName: "테스트 스토어",
    orderDateText: "04/10",
    orderDateKey: "20260410",
    quantity: 1,
    productName: "상품",
    optionName: null,
    productOrderNumber: `PO-${input.id}`,
    collectedPlatform: "쿠팡",
    ordererName: "주문자",
    contact: "010-1111-2222",
    receiverName: "수령자",
    receiverBaseName: "수령자",
    personalClearanceCode: null,
    collectedAccountName: "테스트 스토어",
    deliveryCompanyCode: input.deliveryCompanyCode ?? "",
    selpickOrderNumber: input.selpickOrderNumber,
    invoiceNumber: input.invoiceNumber ?? "",
    coupangDeliveryCompanyCode: null,
    coupangInvoiceNumber: null,
    coupangInvoiceUploadedAt: null,
    salePrice: 10000,
    shippingFee: 0,
    receiverAddress: "서울",
    deliveryRequest: null,
    buyerPhoneNumber: null,
    productNumber: "P-1",
    exposedProductName: "상품",
    productOptionNumber: "V-1",
    sellerProductCode: "SKU-1",
    isOverseas: false,
    shipmentBoxId: `S-${input.id}`,
    orderId: `O-${input.id}`,
    sellerProductId: "P-1",
    vendorItemId: "V-1",
    availableActions: [],
    orderStatus: "ACCEPT",
    customerServiceIssueCount: 0,
    customerServiceIssueSummary: null,
    customerServiceIssueBreakdown: [],
    customerServiceState: "unknown",
    customerServiceFetchedAt: null,
    orderedAtRaw: "2026-04-10T09:00:00+09:00",
    lastOrderHydratedAt: "2026-04-10T00:00:00.000Z",
    lastProductHydratedAt: "2026-04-10T00:00:00.000Z",
    estimatedShippingDate: null,
    splitShipping: false,
    invoiceTransmissionStatus: null,
    invoiceTransmissionMessage: null,
    invoiceTransmissionAt: null,
    invoiceAppliedAt: null,
    exportedAt: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

function buildSheet(items: CoupangShipmentWorksheetRow[]): CoupangShipmentWorksheetStoreSheet {
  return {
    items,
    collectedAt: "2026-04-10T00:00:00.000Z",
    source: "live",
    message: null,
    syncState: {
      lastIncrementalCollectedAt: null,
      lastFullCollectedAt: null,
      coveredCreatedAtFrom: null,
      coveredCreatedAtTo: null,
      lastStatusFilter: null,
    },
    syncSummary: null,
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

describe("applyShipmentWorksheetInvoiceInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoreMock.mockResolvedValue(buildStore());
  });

  it("dedupes by selpick order number and applies the latest value", async () => {
    const firstRow = buildRow({
      id: "row-1",
      sourceKey: "source-1",
      selpickOrderNumber: "O20260410K0001",
    });
    const secondRow = buildRow({
      id: "row-2",
      sourceKey: "source-2",
      selpickOrderNumber: "O20260410K0002",
    });
    getStoreSheetMock.mockResolvedValue(buildSheet([firstRow, secondRow]));
    patchRowsMock.mockResolvedValue({
      sheet: buildSheet([
        {
          ...firstRow,
          deliveryCompanyCode: "롯데택배",
          invoiceNumber: "222222",
        },
        {
          ...secondRow,
          deliveryCompanyCode: "CJ대한통운",
          invoiceNumber: "333333",
        },
      ]),
      missingKeys: [],
      touchedSourceKeys: ["source-1", "source-2"],
    });

    const result = await applyShipmentWorksheetInvoiceInput({
      storeId: "store-1",
      rows: [
        {
          selpickOrderNumber: "O20260410K0001",
          deliveryCompanyCode: "한진택배",
          invoiceNumber: "111111",
        },
        {
          selpickOrderNumber: "O20260410K0001",
          deliveryCompanyCode: "롯데택배",
          invoiceNumber: "222222",
        },
        {
          selpickOrderNumber: "O20260410K0002",
          deliveryCompanyCode: "CJ대한통운",
          invoiceNumber: "333333",
        },
      ],
    });

    expect(patchRowsMock).toHaveBeenCalledWith({
      storeId: "store-1",
      items: expect.arrayContaining([
        expect.objectContaining({
          sourceKey: "source-1",
          selpickOrderNumber: "O20260410K0001",
          deliveryCompanyCode: "롯데택배",
          invoiceNumber: "222222",
        }),
        expect.objectContaining({
          sourceKey: "source-2",
          selpickOrderNumber: "O20260410K0002",
          deliveryCompanyCode: "CJ대한통운",
          invoiceNumber: "333333",
        }),
      ]),
    });
    expect(result).toMatchObject({
      matchedCount: 2,
      updatedCount: 2,
      ignoredCount: 0,
      touchedRowIds: ["row-1", "row-2"],
      issues: [],
      message: null,
    });
  });

  it("records issues for unknown selpick order numbers without failing matched rows", async () => {
    const existingRow = buildRow({
      id: "row-1",
      sourceKey: "source-1",
      selpickOrderNumber: "O20260410K0001",
    });
    getStoreSheetMock.mockResolvedValue(buildSheet([existingRow]));
    patchRowsMock.mockResolvedValue({
      sheet: buildSheet([
        {
          ...existingRow,
          deliveryCompanyCode: "CJ대한통운",
          invoiceNumber: "123456789",
        },
      ]),
      missingKeys: [],
      touchedSourceKeys: ["source-1"],
    });

    const result = await applyShipmentWorksheetInvoiceInput({
      storeId: "store-1",
      rows: [
        {
          selpickOrderNumber: "O20260410K0001",
          deliveryCompanyCode: "CJ대한통운",
          invoiceNumber: "123456789",
        },
        {
          selpickOrderNumber: "O20260410K9999",
          deliveryCompanyCode: "롯데택배",
          invoiceNumber: "999999999",
        },
      ],
    });

    expect(result).toMatchObject({
      matchedCount: 1,
      updatedCount: 1,
      ignoredCount: 1,
      touchedRowIds: ["row-1"],
    });
    expect(result.issues).toEqual([
      "현재 워크시트에 없는 셀픽주문번호입니다: O20260410K9999",
    ]);
  });
});
