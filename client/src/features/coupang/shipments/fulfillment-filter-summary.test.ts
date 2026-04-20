import { describe, expect, it } from "vitest";

import {
  buildShipmentFilterSummaryTokens,
  countActiveShipmentDetailFilters,
  getFulfillmentDecisionFilterLabel,
  getShipmentScopeLabel,
} from "./fulfillment-filter-summary";

describe("fulfillment filter summary helpers", () => {
  it("returns operator-facing labels for scope and decision filters", () => {
    expect(getShipmentScopeLabel("dispatch_active")).toBe("내부 작업 대상");
    expect(getShipmentScopeLabel("claims")).toBe("이슈·클레임");
    expect(getShipmentScopeLabel("all")).toBe("전체 배송관리");
    expect(getFulfillmentDecisionFilterLabel("invoice_waiting")).toBe("송장 대기");
  });

  it("counts only detail filters that are actively narrowed", () => {
    expect(
      countActiveShipmentDetailFilters({
        invoiceStatusCard: "all",
        orderStatusCard: "all",
        outputStatusCard: "all",
      }),
    ).toBe(0);

    expect(
      countActiveShipmentDetailFilters({
        invoiceStatusCard: "failed",
        orderStatusCard: "INSTRUCT",
        outputStatusCard: "all",
      }),
    ).toBe(2);
  });

  it("builds readable filter tokens in operator reading order", () => {
    const tokens = buildShipmentFilterSummaryTokens({
      storeName: "쿠팡_테스트",
      filters: {
        createdAtFrom: "2026-04-08",
        createdAtTo: "2026-04-13",
        query: "홍길동",
        scope: "dispatch_active",
        decisionStatus: "recheck",
        priorityCard: "same_day_dispatch",
        pipelineCard: "preparing_product",
        issueFilter: "shipment_stop_resolved",
        invoiceStatusCard: "failed",
        outputStatusCard: "notExported",
        orderStatusCard: "INSTRUCT",
      },
    });

    expect(tokens[0]).toBe("쿠팡_테스트");
    expect(tokens[1]).toBe("2026-04-08 ~ 2026-04-13");
    expect(tokens[2]).toBe("내부 작업 대상");
    expect(tokens.some((token) => token.includes("홍길동"))).toBe(true);
    expect(tokens).toHaveLength(11);
  });
});
