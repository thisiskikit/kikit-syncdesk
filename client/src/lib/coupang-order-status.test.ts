import { describe, expect, it } from "vitest";

import {
  formatCoupangOrderStatusLabel,
  resolveCoupangDisplayOrderStatus,
} from "@/lib/coupang-order-status";

describe("resolveCoupangDisplayOrderStatus", () => {
  it("prioritizes shipment-stop handled claims over the base order status", () => {
    expect(
      resolveCoupangDisplayOrderStatus({
        orderStatus: "INSTRUCT",
        customerServiceIssueSummary: null,
        customerServiceIssueBreakdown: [{ type: "shipment_stop_handled" }],
      }),
    ).toBe("SHIPMENT_STOP_HANDLED");
  });

  it("recognizes legacy handled summaries and normalizes the display label", () => {
    expect(
      resolveCoupangDisplayOrderStatus({
        orderStatus: "INSTRUCT",
        customerServiceIssueSummary: "출고중지 처리됨 1건",
      }),
    ).toBe("SHIPMENT_STOP_HANDLED");
    expect(formatCoupangOrderStatusLabel("SHIPMENT_STOP_HANDLED")).toBe("출고중지처리완료");
  });
});
