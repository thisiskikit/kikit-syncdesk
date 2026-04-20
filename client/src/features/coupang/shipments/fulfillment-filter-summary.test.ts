import { describe, expect, it } from "vitest";

import {
  buildShipmentFilterSummaryTokens,
  countActiveShipmentDetailFilters,
  getFulfillmentDecisionFilterLabel,
  getShipmentScopeLabel,
} from "./fulfillment-filter-summary";

describe("fulfillment filter summary helpers", () => {
  it("returns operator-facing labels for scope and decision filters", () => {
    expect(getShipmentScopeLabel("dispatch_active")).toBe("작업 대상");
    expect(getShipmentScopeLabel("claims")).toBe("예외·클레임");
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
    expect(
      buildShipmentFilterSummaryTokens({
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
      }),
    ).toEqual([
      "쿠팡_테스트",
      "2026-04-08 ~ 2026-04-13",
      "작업 대상",
      "우선 당일출고필요",
      "배송 상품준비중",
      "이슈 출고중지처리완료",
      "재확인 필요",
      "송장 전송 실패",
      "출력 미출력",
      "주문 상품준비중",
      "검색: 홍길동",
    ]);
  });
});
