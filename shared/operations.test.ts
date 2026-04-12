import { describe, expect, it } from "vitest";

import { getOperationTicketDetailState } from "./operations";

describe("getOperationTicketDetailState", () => {
  it("reads capped ticket detail metadata from result summary stats", () => {
    const state = getOperationTicketDetailState({
      headline: "송장 업로드 3건 성공 / 1건 실패",
      detail: null,
      preview: null,
      stats: {
        ticketDetailsTotalCount: 9,
        ticketDetailsRecorded: 4,
        ticketDetailsTruncated: true,
        ticketDetails: [
          {
            result: "error",
            label: "송장 업로드 실패",
            message: "쿠팡 API 오류",
            shipmentBoxId: "100",
            orderId: "ORDER-100",
            sourceKey: "store-1:100:V-100",
          },
          {
            result: "success",
            label: "송장 업로드 성공",
            message: "정상 반영",
            shipmentBoxId: "101",
          },
          {
            result: "unknown",
          },
        ],
      },
    });

    expect(state.totalCount).toBe(9);
    expect(state.recordedCount).toBe(4);
    expect(state.truncated).toBe(true);
    expect(state.items).toHaveLength(2);
    expect(state.items[0]).toEqual(
      expect.objectContaining({
        result: "error",
        shipmentBoxId: "100",
        sourceKey: "store-1:100:V-100",
      }),
    );
  });
});
