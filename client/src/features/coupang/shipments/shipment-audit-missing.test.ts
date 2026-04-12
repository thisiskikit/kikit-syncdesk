import { describe, expect, it } from "vitest";

import {
  buildShipmentWorksheetAuditRequest,
  formatShipmentWorksheetAuditHiddenReason,
  summarizeShipmentWorksheetAuditResult,
} from "./shipment-audit-missing";

describe("shipment-audit-missing helpers", () => {
  it("builds the audit request payload from the current worksheet filters", () => {
    expect(
      buildShipmentWorksheetAuditRequest({
        storeId: "store-1",
        createdAtFrom: "2026-04-10",
        createdAtTo: "2026-04-12",
        scope: "dispatch_active",
        query: "김",
        invoiceStatusCard: "ready",
        orderStatusCard: "INSTRUCT",
        outputStatusCard: "notExported",
      }),
    ).toEqual({
      storeId: "store-1",
      createdAtFrom: "2026-04-10",
      createdAtTo: "2026-04-12",
      viewQuery: {
        scope: "dispatch_active",
        query: "김",
        invoiceStatusCard: "ready",
        orderStatusCard: "INSTRUCT",
        outputStatusCard: "notExported",
      },
    });
  });

  it("formats audit hidden reasons for dialog output", () => {
    expect(formatShipmentWorksheetAuditHiddenReason("out_of_scope")).toBe("현재 scope 바깥");
    expect(formatShipmentWorksheetAuditHiddenReason("filtered_out")).toBe(
      "현재 검색/카드 필터로 숨김",
    );
  });

  it("summarizes the audit result for the feedback card", () => {
    expect(
      summarizeShipmentWorksheetAuditResult({
        auditedStatuses: ["INSTRUCT", "ACCEPT"],
        liveCount: 4,
        worksheetMatchedCount: 2,
        missingCount: 1,
        hiddenCount: 1,
        missingItems: [],
        hiddenItems: [],
        message: null,
      }),
    ).toBe("live 4건 중 누락 1건, 현재 뷰 숨김 1건입니다.");
  });
});
