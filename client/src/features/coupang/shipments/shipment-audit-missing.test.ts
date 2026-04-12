import { describe, expect, it } from "vitest";

import {
  buildShipmentWorksheetAuditDetails,
  buildShipmentWorksheetAuditRequest,
  formatShipmentWorksheetAuditHiddenReason,
  shouldBlockPrepareForShipmentAudit,
  summarizeShipmentPrepareAuditBlock,
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

  it("builds audit details for feedback output", () => {
    expect(
      buildShipmentWorksheetAuditDetails(
        {
          auditedStatuses: ["INSTRUCT", "ACCEPT"],
          liveCount: 4,
          worksheetMatchedCount: 2,
          missingCount: 1,
          hiddenCount: 1,
          missingItems: [
            {
              sourceKey: "store-1:100:VI-100",
              shipmentBoxId: "100",
              orderId: "ORDER-100",
              vendorItemId: "VI-100",
              sellerProductId: "SP-100",
              status: "INSTRUCT",
              productName: "누락 주문",
              orderedAt: "2026-04-12T09:00:00+09:00",
            },
          ],
          hiddenItems: [
            {
              sourceKey: "store-1:200:VI-200",
              rowId: "row-200",
              status: "ACCEPT",
              productName: "숨김 주문",
              hiddenReason: "filtered_out",
            },
          ],
          message: null,
        },
        {
          limit: 4,
        },
      ),
    ).toEqual([
      "[누락] INSTRUCT / 누락 주문 / 100",
      "[숨김] ACCEPT / 숨김 주문 / filtered_out",
    ]);
  });

  it("blocks prepare only when missing worksheet rows exist", () => {
    expect(
      shouldBlockPrepareForShipmentAudit({
        auditedStatuses: ["INSTRUCT", "ACCEPT"],
        liveCount: 2,
        worksheetMatchedCount: 1,
        missingCount: 1,
        hiddenCount: 0,
        missingItems: [],
        hiddenItems: [],
        message: null,
      }),
    ).toBe(true);

    expect(
      shouldBlockPrepareForShipmentAudit({
        auditedStatuses: ["INSTRUCT", "ACCEPT"],
        liveCount: 2,
        worksheetMatchedCount: 2,
        missingCount: 0,
        hiddenCount: 1,
        missingItems: [],
        hiddenItems: [],
        message: null,
      }),
    ).toBe(false);
  });

  it("summarizes the prepare block warning", () => {
    expect(
      summarizeShipmentPrepareAuditBlock({
        auditedStatuses: ["INSTRUCT", "ACCEPT"],
        liveCount: 4,
        worksheetMatchedCount: 2,
        missingCount: 2,
        hiddenCount: 1,
        missingItems: [],
        hiddenItems: [],
        message: null,
      }),
    ).toBe(
      "수집 누락 2건이 있어 상품준비중 처리를 차단했습니다. 먼저 누락 주문을 수집한 뒤 다시 시도해 주세요.",
    );
  });
});
