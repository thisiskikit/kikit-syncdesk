import { describe, expect, it } from "vitest";

import {
  buildShipmentWorksheetAuditDetails,
  buildShipmentWorksheetAuditRequest,
  formatShipmentWorksheetAuditHiddenReason,
  hasShipmentPrepareAuditWarnings,
  summarizeShipmentPrepareAuditWarning,
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
        priorityCard: "all",
        pipelineCard: "all",
        issueFilter: "all",
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
        priorityCard: "all",
        pipelineCard: "all",
        issueFilter: "all",
        invoiceStatusCard: "ready",
        orderStatusCard: "INSTRUCT",
        outputStatusCard: "notExported",
      },
    });
  });

  it("formats audit hidden reasons for dialog output", () => {
    expect(formatShipmentWorksheetAuditHiddenReason("out_of_scope")).toBe("현재 scope 바깥");
    expect(formatShipmentWorksheetAuditHiddenReason("filtered_out")).toBe(
      "현재 검색/카드 필터에서 숨김",
    );
  });

  it("summarizes the audit result for the feedback card", () => {
    expect(
      summarizeShipmentWorksheetAuditResult({
        auditedStatuses: ["INSTRUCT", "ACCEPT"],
        liveCount: 4,
        worksheetMatchedCount: 2,
        autoAppliedCount: 2,
        restoredCount: 1,
        exceptionCount: 1,
        hiddenInfoCount: 1,
        autoAppliedItems: [],
        exceptionItems: [],
        hiddenItems: [],
        message: null,
      }),
    ).toBe("자동 반영 2건 / 예외 1건 / 현재 뷰 숨김 1건");
  });

  it("builds audit details for feedback output", () => {
    expect(
      buildShipmentWorksheetAuditDetails(
        {
          auditedStatuses: ["INSTRUCT", "ACCEPT"],
          liveCount: 4,
          worksheetMatchedCount: 2,
          autoAppliedCount: 2,
          restoredCount: 1,
          exceptionCount: 1,
          hiddenInfoCount: 1,
          autoAppliedItems: [
            {
              sourceKey: "store-1:100:VI-100",
              shipmentBoxId: "100",
              orderId: "ORDER-100",
              vendorItemId: "VI-100",
              sellerProductId: "SP-100",
              status: "INSTRUCT",
              productName: "자동 반영 주문",
              orderedAt: "2026-04-12T09:00:00+09:00",
              action: "restored",
            },
          ],
          exceptionItems: [
            {
              sourceKey: "store-1:200:VI-200",
              shipmentBoxId: "200",
              orderId: "ORDER-200",
              vendorItemId: "VI-200",
              sellerProductId: "SP-200",
              status: "ACCEPT",
              productName: "예외 주문",
              orderedAt: "2026-04-12T09:30:00+09:00",
              reasonCode: "duplicate_source_key",
              message: "sourceKey 충돌",
            },
          ],
          hiddenItems: [
            {
              sourceKey: "store-1:300:VI-300",
              rowId: "row-300",
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
      "[예외:sourceKey 충돌] ACCEPT / 예외 주문 / 200",
      "[자동반영:보관함 자동 복구] INSTRUCT / 자동 반영 주문 / 100",
      "[숨김] ACCEPT / 숨김 주문 / 현재 검색/카드 필터에서 숨김",
    ]);
  });

  it("treats exception items as warnings for prepare flow", () => {
    expect(
      hasShipmentPrepareAuditWarnings({
        auditedStatuses: ["INSTRUCT", "ACCEPT"],
        liveCount: 2,
        worksheetMatchedCount: 1,
        autoAppliedCount: 1,
        restoredCount: 0,
        exceptionCount: 1,
        hiddenInfoCount: 0,
        autoAppliedItems: [],
        exceptionItems: [],
        hiddenItems: [],
        message: null,
      }),
    ).toBe(true);

    expect(
      hasShipmentPrepareAuditWarnings({
        auditedStatuses: ["INSTRUCT", "ACCEPT"],
        liveCount: 2,
        worksheetMatchedCount: 2,
        autoAppliedCount: 2,
        restoredCount: 0,
        exceptionCount: 0,
        hiddenInfoCount: 1,
        autoAppliedItems: [],
        exceptionItems: [],
        hiddenItems: [],
        message: null,
      }),
    ).toBe(false);
  });

  it("summarizes the prepare warning as exception-only guidance", () => {
    expect(
      summarizeShipmentPrepareAuditWarning({
        auditedStatuses: ["INSTRUCT", "ACCEPT"],
        liveCount: 4,
        worksheetMatchedCount: 2,
        autoAppliedCount: 2,
        restoredCount: 0,
        exceptionCount: 2,
        hiddenInfoCount: 1,
        autoAppliedItems: [],
        exceptionItems: [],
        hiddenItems: [],
        message: null,
      }),
    ).toBe(
      "예외 2건은 자동 반영하지 못해 확인이 필요합니다. 현재 처리 가능한 주문만 계속 진행했습니다.",
    );
  });
});
