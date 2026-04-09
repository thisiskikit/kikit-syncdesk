import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  collectShipmentWorksheetMock,
  runTrackedOperationMock,
  sendDataMock,
  sendErrorMock,
} = vi.hoisted(() => ({
  collectShipmentWorksheetMock: vi.fn(),
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
  runTrackedOperation: runTrackedOperationMock,
  summarizeResult: (input: unknown) => input,
}));

import { collectShipmentWorksheetHandler } from "./shipments";

describe("collectShipmentWorksheetHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runTrackedOperationMock.mockImplementation(async (input: { execute: () => Promise<unknown> }) => {
      const executed = (await input.execute()) as { data: unknown; status?: string };
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
  });

  it("marks fallback collection results as warning operations", async () => {
    let executedStatus: string | undefined;
    runTrackedOperationMock.mockImplementationOnce(async (input: { execute: () => Promise<unknown> }) => {
      const executed = (await input.execute()) as { data: unknown; status?: string };
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
});
