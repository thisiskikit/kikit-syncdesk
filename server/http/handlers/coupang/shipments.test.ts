import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  collectShipmentWorksheetMock,
  findActiveCoupangShipmentCollectOperationMock,
  runTrackedOperationMock,
  sendDataMock,
  sendErrorMock,
} = vi.hoisted(() => ({
  collectShipmentWorksheetMock: vi.fn(),
  findActiveCoupangShipmentCollectOperationMock: vi.fn(),
  runTrackedOperationMock: vi.fn(),
  sendDataMock: vi.fn(),
  sendErrorMock: vi.fn(),
}));

vi.mock("../../../services/coupang/shipment-worksheet-service", () => ({
  collectShipmentWorksheet: collectShipmentWorksheetMock,
  getShipmentWorksheet: vi.fn(),
  getShipmentWorksheetView: vi.fn(),
  getShipmentWorksheetDetail: vi.fn(),
  patchShipmentWorksheet: vi.fn(),
  resolveShipmentWorksheetBulkRows: vi.fn(),
}));

vi.mock("../../../services/coupang/order-service", () => ({
  uploadInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));

vi.mock("../../../services/shared/api-response", () => ({
  sendData: sendDataMock,
  sendError: sendErrorMock,
}));

vi.mock("../../../services/operations/service", () => ({
  findActiveCoupangShipmentCollectOperation: findActiveCoupangShipmentCollectOperationMock,
  runTrackedOperation: runTrackedOperationMock,
  summarizeResult: (input: unknown) => input,
}));

import { collectShipmentWorksheetHandler } from "./shipments";

describe("collectShipmentWorksheetHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findActiveCoupangShipmentCollectOperationMock.mockResolvedValue(null);
    runTrackedOperationMock.mockImplementation(async (input: {
      execute: (context: {
        operationId: string;
        isCancellationRequested: () => boolean;
      }) => Promise<unknown>;
    }) => {
      const executed = (await input.execute({
        operationId: "operation-1",
        isCancellationRequested: () => false,
      })) as { data: unknown; status?: string };
      return {
        operation: {
          id: "operation-1",
          status: executed.status ?? "success",
        },
        data: executed.data,
      };
    });
  });

  it("records shipment collection as a tracked coupang operation", async () => {
    collectShipmentWorksheetMock.mockResolvedValue({
      store: { id: "store-1", name: "쿠팡 스토어" },
      items: [],
      fetchedAt: "2026-04-09T01:00:00.000Z",
      collectedAt: "2026-04-09T01:00:00.000Z",
      message: null,
      source: "live",
      syncSummary: {
        mode: "new_only",
        fetchedCount: 2,
        insertedCount: 1,
        insertedSourceKeys: ["store-1:100:V-100"],
        updatedCount: 0,
        skippedHydrationCount: 0,
        autoExpanded: false,
        fetchCreatedAtFrom: "2026-04-08",
        fetchCreatedAtTo: "2026-04-09",
        statusFilter: null,
      },
    });

    const res = { json: vi.fn(), status: vi.fn() } as unknown as Parameters<
      typeof collectShipmentWorksheetHandler
    >[1];

    await collectShipmentWorksheetHandler(
      {
        body: {
          storeId: "store-1",
          createdAtFrom: "2026-04-08",
          createdAtTo: "2026-04-09",
          syncMode: "new_only",
        },
      } as Parameters<typeof collectShipmentWorksheetHandler>[0],
      res,
      vi.fn(),
    );

    expect(runTrackedOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "coupang",
        menuKey: "coupang.shipments",
        actionKey: "collect-worksheet",
        targetType: "store",
        targetCount: 1,
        targetIds: ["store-1"],
        retryable: false,
        normalizedPayload: expect.objectContaining({
          storeId: "store-1",
          createdAtFrom: "2026-04-08",
          createdAtTo: "2026-04-09",
          syncMode: "new_only",
        }),
      }),
    );
    expect(sendDataMock).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        operation: expect.objectContaining({ id: "operation-1" }),
        syncSummary: expect.objectContaining({ mode: "new_only", insertedCount: 1 }),
      }),
    );
    expect(runTrackedOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        execute: expect.any(Function),
      }),
    );
  });

  it("marks fallback collection results as warning operations", async () => {
    let executedStatus: string | undefined;
    runTrackedOperationMock.mockImplementationOnce(async (input: {
      execute: (context: {
        operationId: string;
        isCancellationRequested: () => boolean;
      }) => Promise<unknown>;
    }) => {
      const executed = (await input.execute({
        operationId: "operation-2",
        isCancellationRequested: () => false,
      })) as { data: unknown; status?: string };
      executedStatus = executed.status;
      return {
        operation: {
          id: "operation-2",
          status: executed.status ?? "success",
        },
        data: executed.data,
      };
    });
    collectShipmentWorksheetMock.mockResolvedValue({
      store: { id: "store-1", name: "쿠팡 스토어" },
      items: [],
      fetchedAt: "2026-04-09T01:00:00.000Z",
      collectedAt: null,
      message: "필수 신규 주문 상태를 확인하지 못했습니다.",
      source: "fallback",
      syncSummary: {
        mode: "new_only",
        fetchedCount: 0,
        insertedCount: 0,
        insertedSourceKeys: [],
        updatedCount: 0,
        skippedHydrationCount: 0,
        autoExpanded: false,
        fetchCreatedAtFrom: "2026-04-08",
        fetchCreatedAtTo: "2026-04-09",
        statusFilter: null,
      },
    });

    const res = { json: vi.fn(), status: vi.fn() } as unknown as Parameters<
      typeof collectShipmentWorksheetHandler
    >[1];

    await collectShipmentWorksheetHandler(
      {
        body: {
          storeId: "store-1",
          createdAtFrom: "2026-04-08",
          createdAtTo: "2026-04-09",
          syncMode: "new_only",
        },
      } as Parameters<typeof collectShipmentWorksheetHandler>[0],
      res,
      vi.fn(),
    );

    expect(executedStatus).toBe("warning");
  });

  it("blocks quick collect when the same store already has an active full sync", async () => {
    findActiveCoupangShipmentCollectOperationMock.mockResolvedValue({
      id: "active-full-sync",
      status: "running",
    });

    const res = { json: vi.fn(), status: vi.fn() } as unknown as Parameters<
      typeof collectShipmentWorksheetHandler
    >[1];

    await collectShipmentWorksheetHandler(
      {
        body: {
          storeId: "store-1",
          createdAtFrom: "2026-04-08",
          createdAtTo: "2026-04-09",
          syncMode: "new_only",
        },
      } as Parameters<typeof collectShipmentWorksheetHandler>[0],
      res,
      vi.fn(),
    );

    expect(runTrackedOperationMock).not.toHaveBeenCalled();
    expect(sendErrorMock).toHaveBeenCalledWith(
      res,
      409,
      expect.objectContaining({
        code: "COUPANG_SHIPMENT_FULL_SYNC_IN_PROGRESS",
      }),
    );
  });

  it("stores up to five collected order ticket details in the tracked result summary", async () => {
    let executedSummary: Record<string, unknown> | null | undefined;
    runTrackedOperationMock.mockImplementationOnce(async (input: {
      execute: (context: {
        operationId: string;
        isCancellationRequested: () => boolean;
      }) => Promise<unknown>;
    }) => {
      const executed = (await input.execute({
        operationId: "operation-3",
        isCancellationRequested: () => false,
      })) as { data: unknown; resultSummary?: { stats?: Record<string, unknown> | null } };
      executedSummary = executed.resultSummary?.stats;
      return {
        operation: {
          id: "operation-3",
          status: "success",
        },
        data: executed.data,
      };
    });
    collectShipmentWorksheetMock.mockResolvedValue({
      store: { id: "store-1", name: "쿠팡 스토어" },
      items: Array.from({ length: 6 }, (_, index) => ({
        sourceKey: `store-1:10${index}:V-${index}`,
        shipmentBoxId: `10${index}`,
        orderId: `ORDER-${index}`,
        vendorItemId: `V-${index}`,
        productName: `상품 ${index}`,
        receiverName: `수령인 ${index}`,
        deliveryCompanyCode: "",
        invoiceNumber: "",
        selpickOrderNumber: `SP-${index}`,
        productOrderNumber: `PO-${index}`,
      })),
      fetchedAt: "2026-04-09T01:00:00.000Z",
      collectedAt: "2026-04-09T01:00:00.000Z",
      message: "신규 주문을 반영했습니다.",
      source: "live",
      syncSummary: {
        mode: "new_only",
        fetchedCount: 6,
        insertedCount: 6,
        insertedSourceKeys: Array.from({ length: 6 }, (_, index) => `store-1:10${index}:V-${index}`),
        updatedCount: 0,
        skippedHydrationCount: 0,
        autoExpanded: false,
        fetchCreatedAtFrom: "2026-04-08",
        fetchCreatedAtTo: "2026-04-09",
        statusFilter: null,
      },
    });

    const res = { json: vi.fn(), status: vi.fn() } as unknown as Parameters<
      typeof collectShipmentWorksheetHandler
    >[1];

    await collectShipmentWorksheetHandler(
      {
        body: {
          storeId: "store-1",
          createdAtFrom: "2026-04-08",
          createdAtTo: "2026-04-09",
          syncMode: "new_only",
        },
      } as Parameters<typeof collectShipmentWorksheetHandler>[0],
      res,
      vi.fn(),
    );

    expect(executedSummary).toEqual(
      expect.objectContaining({
        ticketDetailsTotalCount: 6,
        ticketDetailsRecorded: 5,
        ticketDetailsTruncated: true,
        ticketDetails: expect.arrayContaining([
          expect.objectContaining({
            label: "신규 주문 추가",
            sourceKey: "store-1:100:V-0",
            selpickOrderNumber: "SP-0",
          }),
        ]),
      }),
    );
  });
});
