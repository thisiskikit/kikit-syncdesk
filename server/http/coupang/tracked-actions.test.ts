import { describe, expect, it } from "vitest";

import type { CoupangBatchActionResponse } from "@shared/coupang";

import { buildBatchTicketDetailState } from "./tracked-actions";

describe("buildBatchTicketDetailState", () => {
  it("keeps only five items and prioritizes error, warning, and skipped results", () => {
    const result = {
      items: [
        {
          targetId: "success-2",
          action: "uploadInvoice",
          shipmentBoxId: "success-2",
          orderId: "ORDER-2",
          receiptId: null,
          vendorItemId: "V-2",
          status: "succeeded",
          resultCode: null,
          retryRequired: false,
          message: "업로드 성공",
          appliedAt: "2026-04-12T09:00:00.000Z",
        },
        {
          targetId: "error-1",
          action: "uploadInvoice",
          shipmentBoxId: "error-1",
          orderId: "ORDER-1",
          receiptId: null,
          vendorItemId: "V-1",
          status: "failed",
          resultCode: "FAIL",
          retryRequired: true,
          message: "업로드 실패",
          appliedAt: null,
        },
        {
          targetId: "warning-1",
          action: "uploadInvoice",
          shipmentBoxId: "warning-1",
          orderId: "ORDER-3",
          receiptId: null,
          vendorItemId: "V-3",
          status: "warning",
          resultCode: "WARN",
          retryRequired: false,
          message: "재확인 필요",
          appliedAt: "2026-04-12T09:01:00.000Z",
        },
        {
          targetId: "skipped-1",
          action: "uploadInvoice",
          shipmentBoxId: "skipped-1",
          orderId: "ORDER-4",
          receiptId: null,
          vendorItemId: "V-4",
          status: "skipped",
          resultCode: "SKIP",
          retryRequired: false,
          message: "이미 전송됨",
          appliedAt: null,
        },
        {
          targetId: "success-1",
          action: "uploadInvoice",
          shipmentBoxId: "success-1",
          orderId: "ORDER-5",
          receiptId: null,
          vendorItemId: "V-5",
          status: "succeeded",
          resultCode: null,
          retryRequired: false,
          message: "업로드 성공",
          appliedAt: "2026-04-12T09:02:00.000Z",
        },
        {
          targetId: "success-3",
          action: "uploadInvoice",
          shipmentBoxId: "success-3",
          orderId: "ORDER-6",
          receiptId: null,
          vendorItemId: "V-6",
          status: "succeeded",
          resultCode: null,
          retryRequired: false,
          message: "업로드 성공",
          appliedAt: "2026-04-12T09:03:00.000Z",
        },
      ],
      summary: {
        total: 6,
        succeededCount: 3,
        failedCount: 1,
        warningCount: 1,
        skippedCount: 1,
      },
      completedAt: "2026-04-12T09:04:00.000Z",
    } satisfies CoupangBatchActionResponse;

    const sourceItems = [
      { shipmentBoxId: "success-1", invoiceNumber: "1001", deliveryCompanyCode: "CJ" },
      { shipmentBoxId: "success-2", invoiceNumber: "1002", deliveryCompanyCode: "CJ" },
      { shipmentBoxId: "warning-1", invoiceNumber: "1003", deliveryCompanyCode: "CJ" },
      { shipmentBoxId: "error-1", invoiceNumber: "1004", deliveryCompanyCode: "CJ" },
      { shipmentBoxId: "skipped-1", invoiceNumber: "1005", deliveryCompanyCode: "CJ" },
      { shipmentBoxId: "success-3", invoiceNumber: "1006", deliveryCompanyCode: "CJ" },
    ];

    const ticketState = buildBatchTicketDetailState(result, sourceItems, {
      resolveTargetId: (item) => item.shipmentBoxId,
      buildTicketDetail: ({ sourceItem }) =>
        sourceItem
          ? {
              shipmentBoxId: sourceItem.shipmentBoxId,
              deliveryCompanyCode: sourceItem.deliveryCompanyCode,
              invoiceNumber: sourceItem.invoiceNumber,
            }
          : null,
    });

    expect(ticketState.truncated).toBe(true);
    expect(ticketState.items).toHaveLength(5);
    expect(ticketState.items.map((item) => item.result)).toEqual([
      "error",
      "warning",
      "skipped",
      "success",
      "success",
    ]);
    expect(ticketState.items[0]).toEqual(
      expect.objectContaining({
        shipmentBoxId: "error-1",
        invoiceNumber: "1004",
      }),
    );
    expect(ticketState.items).toHaveLength(5);
    expect(ticketState.items[4]).toEqual(
      expect.objectContaining({
        shipmentBoxId: "success-2",
        invoiceNumber: "1002",
      }),
    );
  });
});
