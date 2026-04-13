import { describe, expect, it } from "vitest";
import type { OperationLogRecord } from "@shared/logs";
import {
  buildCsHubWorkspaceHref,
  buildFulfillmentWorkspaceHref,
  buildWorkCenterWorkspaceHref,
  extractOperationHandoffContext,
  parseCsHubWorkspaceSearch,
  parseFulfillmentWorkspaceSearch,
  parseWorkCenterWorkspaceSearch,
} from "./ops-handoff-links";

function createOperationLogRecord(
  overrides?: Partial<OperationLogRecord["operation"]>,
): OperationLogRecord {
  return {
    id: "log-1",
    kind: "operation",
    channel: "coupang",
    menuKey: "coupang.shipments",
    actionKey: "collect",
    level: "error",
    status: "error",
    startedAt: "2026-04-13T00:00:00.000Z",
    finishedAt: "2026-04-13T00:01:00.000Z",
    durationMs: 60_000,
    message: "error",
    meta: null,
    createdAt: "2026-04-13T00:00:00.000Z",
    updatedAt: "2026-04-13T00:01:00.000Z",
    eventType: null,
    operation: {
      id: "op-1",
      channel: "coupang",
      menuKey: "coupang.shipments",
      actionKey: "collect",
      status: "error",
      mode: "foreground",
      targetType: "order",
      targetCount: 1,
      targetIds: [],
      requestPayload: null,
      normalizedPayload: null,
      resultSummary: null,
      errorCode: "E_FAIL",
      errorMessage: "failed",
      retryable: true,
      retryOfOperationId: null,
      startedAt: "2026-04-13T00:00:00.000Z",
      finishedAt: "2026-04-13T00:01:00.000Z",
      createdAt: "2026-04-13T00:00:00.000Z",
      updatedAt: "2026-04-13T00:01:00.000Z",
      ...overrides,
    },
  };
}

describe("ops-handoff-links", () => {
  it("builds and parses fulfillment workspace links", () => {
    const href = buildFulfillmentWorkspaceHref({
      tab: "archive",
      storeId: "store-1",
      scope: "claims",
      decisionStatus: "blocked",
      query: "box-1",
    });

    expect(href).toBe(
      "/fulfillment?tab=archive&storeId=store-1&scope=claims&decisionStatus=blocked&query=box-1",
    );
    expect(parseFulfillmentWorkspaceSearch(href.split("?")[1] ?? "")).toEqual({
      activeTab: "archive",
      filterPatch: {
        selectedStoreId: "store-1",
        scope: "claims",
        decisionStatus: "blocked",
        query: "box-1",
      },
    });
  });

  it("builds and parses work-center links with full filters", () => {
    const href = buildWorkCenterWorkspaceHref({
      tab: "events",
      channel: "coupang",
      status: "error",
      level: "warning",
      query: "shipmentBoxId:123",
      slowOnly: true,
      logId: "log-1",
    });

    expect(href).toBe(
      "/work-center?tab=events&channel=coupang&status=error&level=warning&q=shipmentBoxId%3A123&slowOnly=true&logId=log-1",
    );
    expect(parseWorkCenterWorkspaceSearch(href.split("?")[1] ?? "")).toEqual({
      tab: "events",
      channel: "coupang",
      status: "error",
      level: "warning",
      query: "shipmentBoxId:123",
      slowOnly: true,
      logId: "log-1",
    });
  });

  it("builds and parses cs hub links", () => {
    const href = buildCsHubWorkspaceHref({
      focus: "recovery",
      source: "work-center",
    });

    expect(href).toBe("/cs?focus=recovery&source=work-center");
    expect(parseCsHubWorkspaceSearch(href.split("?")[1] ?? "")).toEqual({
      focus: "recovery",
      source: "work-center",
    });
  });

  it("extracts fulfillment handoff context from normalized payload first", () => {
    const entry = createOperationLogRecord({
      normalizedPayload: {
        storeId: "store-1",
        items: [{ shipmentBoxId: "box-1" }],
      },
      requestPayload: {
        storeId: "store-2",
        items: [{ invoiceNumber: "invoice-2" }],
      },
    });

    expect(extractOperationHandoffContext(entry)).toEqual({
      storeId: "store-1",
      query: "box-1",
    });
  });

  it("falls back to request payload when normalized payload has no identifier", () => {
    const entry = createOperationLogRecord({
      normalizedPayload: {
        storeId: "store-1",
        items: [{}],
      },
      requestPayload: {
        rows: [{ productOrderNumber: "product-order-1" }],
      },
    });

    expect(extractOperationHandoffContext(entry)).toEqual({
      storeId: "store-1",
      query: "product-order-1",
    });
  });
});
