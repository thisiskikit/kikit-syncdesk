import { describe, expect, it } from "vitest";

import {
  buildShipmentFilterSummaryTokens,
  countActiveShipmentDetailFilters,
  getFulfillmentDecisionFilterLabel,
  getShipmentScopeLabel,
} from "./fulfillment-filter-summary";

describe("fulfillment filter summary helpers", () => {
  it("returns operator-facing labels for scope and decision filters", () => {
    expect(getShipmentScopeLabel("dispatch_active")).toBe("�۾� ���");
    expect(getShipmentScopeLabel("claims")).toBe("���ܡ�Ŭ����");
    expect(getFulfillmentDecisionFilterLabel("invoice_waiting")).toBe("���� ���");
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
        storeName: "����_�ÿ�����",
        filters: {
          createdAtFrom: "2026-04-08",
          createdAtTo: "2026-04-13",
          query: "ȫ�浿",
          scope: "dispatch_active",
          decisionStatus: "recheck",
          invoiceStatusCard: "failed",
          outputStatusCard: "notExported",
          orderStatusCard: "INSTRUCT",
        },
      }),
    ).toEqual([
      "����_�ÿ�����",
      "2026-04-08 ~ 2026-04-13",
      "�۾� ���",
      "��Ȯ�� �ʿ�",
      "���� ���� ����",
      "��� �����",
      "�ֹ� ��ǰ�غ���",
      "�˻�: ȫ�浿",
    ]);
  });
});
