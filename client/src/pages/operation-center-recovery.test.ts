import { describe, expect, it } from "vitest";

import type { LogEntry, OperationLogRecord } from "@shared/logs";
import type {
  OperationLogEntry,
  OperationResultSummary,
  OperationTicketDetail,
} from "@shared/operations";
import {
  buildOperationTicketResultCounts,
  buildRecoveryDescriptor,
  buildRecoveryGroups,
  getEntryPriority,
} from "./operation-center-recovery";

function buildTicketDetails(items: OperationTicketDetail[]): OperationResultSummary {
  return {
    headline: "처리 결과",
    detail: null,
    preview: null,
    stats: {
      ticketDetails: items,
      ticketDetailsRecorded: items.length,
      ticketDetailsTotalCount: items.length,
      ticketDetailsTruncated: false,
    },
  };
}

function buildOperation(input: Partial<OperationLogEntry>): OperationLogEntry {
  return {
    id: input.id ?? "operation-1",
    channel: input.channel ?? "coupang",
    menuKey: input.menuKey ?? "orders",
    actionKey: input.actionKey ?? "upload-invoice",
    status: input.status ?? "error",
    mode: input.mode ?? "foreground",
    targetType: input.targetType ?? "order",
    targetCount: input.targetCount ?? 1,
    targetIds: input.targetIds ?? ["target-1"],
    requestPayload: input.requestPayload ?? { orderId: "target-1" },
    normalizedPayload: input.normalizedPayload ?? { orderId: "target-1" },
    resultSummary: input.resultSummary ?? null,
    errorCode: input.errorCode ?? "UPLOAD_FAILED",
    errorMessage: input.errorMessage ?? "송장 업로드 실패",
    retryable: input.retryable ?? true,
    retryOfOperationId: input.retryOfOperationId ?? null,
    startedAt: input.startedAt ?? "2026-04-13T10:00:00+09:00",
    finishedAt: input.finishedAt ?? "2026-04-13T10:00:05+09:00",
    createdAt: input.createdAt ?? "2026-04-13T10:00:00+09:00",
    updatedAt: input.updatedAt ?? "2026-04-13T10:00:05+09:00",
  };
}

function buildOperationEntry(input: {
  id: string;
  status?: OperationLogEntry["status"];
  level?: LogEntry["level"];
  retryable?: boolean;
  actionKey?: OperationLogEntry["actionKey"];
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string;
  resultSummary?: OperationResultSummary | null;
}): OperationLogRecord {
  const operation = buildOperation({
    id: input.id,
    status: input.status,
    retryable: input.retryable,
    actionKey: input.actionKey,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    startedAt: input.startedAt,
    resultSummary: input.resultSummary,
  });

  return {
    id: input.id,
    kind: "operation",
    eventType: null,
    channel: operation.channel,
    menuKey: operation.menuKey,
    actionKey: operation.actionKey,
    level: input.level ?? (operation.status === "error" ? "error" : "warning"),
    status: operation.status,
    startedAt: operation.startedAt,
    finishedAt: operation.finishedAt,
    durationMs: 5_000,
    message: operation.errorMessage,
    meta: null,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    operation,
  };
}

describe("operation center recovery helpers", () => {
  it("retryable 실패를 일반 실패보다 먼저 우선순위화한다", () => {
    const retryableError = buildOperationEntry({
      id: "retryable-error",
      status: "error",
      retryable: true,
    });
    const manualError = buildOperationEntry({
      id: "manual-error",
      status: "error",
      retryable: false,
    });
    const success = buildOperationEntry({
      id: "success",
      status: "success",
      level: "info",
      retryable: false,
      errorCode: null,
      errorMessage: null,
    });

    expect(getEntryPriority(retryableError)).toBeGreaterThan(getEntryPriority(manualError));
    expect(getEntryPriority(manualError)).toBeGreaterThan(getEntryPriority(success));
    expect(buildRecoveryDescriptor(retryableError).label).toBe("즉시 재시도");
  });

  it("같은 성격 실패를 복구 묶음으로 합친다", () => {
    const ticketDetails: OperationTicketDetail[] = [
      {
        result: "error",
        label: null,
        message: "송장 업로드 실패",
        targetId: "target-1",
        sourceKey: "source-1",
        selpickOrderNumber: null,
        productOrderNumber: null,
        shipmentBoxId: null,
        orderId: null,
        receiptId: null,
        vendorItemId: null,
        productName: null,
        receiverName: null,
        deliveryCompanyCode: null,
        invoiceNumber: null,
      },
    ];
    const first = buildOperationEntry({
      id: "group-1",
      actionKey: "upload-invoice",
      resultSummary: buildTicketDetails(ticketDetails),
      startedAt: "2026-04-13T10:00:00+09:00",
    });
    const second = buildOperationEntry({
      id: "group-2",
      actionKey: "upload-invoice",
      resultSummary: buildTicketDetails(ticketDetails),
      startedAt: "2026-04-13T10:05:00+09:00",
    });

    const groups = buildRecoveryGroups([first, second]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("송장 업로드 재시도");
    expect(groups[0]?.count).toBe(2);
    expect(groups[0]?.retryableCount).toBe(2);
    expect(groups[0]?.affectedCount).toBe(2);
    expect(groups[0]?.latestStartedAt).toBe("2026-04-13T10:05:00+09:00");
  });

  it("티켓 결과를 actionability 기준으로 다시 합산한다", () => {
    const counts = buildOperationTicketResultCounts({
      totalCount: 4,
      recordedCount: 4,
      truncated: false,
      items: [
        {
          result: "error",
          label: null,
          message: null,
          targetId: "1",
          sourceKey: null,
          selpickOrderNumber: null,
          productOrderNumber: null,
          shipmentBoxId: null,
          orderId: null,
          receiptId: null,
          vendorItemId: null,
          productName: null,
          receiverName: null,
          deliveryCompanyCode: null,
          invoiceNumber: null,
        },
        {
          result: "warning",
          label: null,
          message: null,
          targetId: "2",
          sourceKey: null,
          selpickOrderNumber: null,
          productOrderNumber: null,
          shipmentBoxId: null,
          orderId: null,
          receiptId: null,
          vendorItemId: null,
          productName: null,
          receiverName: null,
          deliveryCompanyCode: null,
          invoiceNumber: null,
        },
        {
          result: "skipped",
          label: null,
          message: null,
          targetId: "3",
          sourceKey: null,
          selpickOrderNumber: null,
          productOrderNumber: null,
          shipmentBoxId: null,
          orderId: null,
          receiptId: null,
          vendorItemId: null,
          productName: null,
          receiverName: null,
          deliveryCompanyCode: null,
          invoiceNumber: null,
        },
        {
          result: "success",
          label: null,
          message: null,
          targetId: "4",
          sourceKey: null,
          selpickOrderNumber: null,
          productOrderNumber: null,
          shipmentBoxId: null,
          orderId: null,
          receiptId: null,
          vendorItemId: null,
          productName: null,
          receiverName: null,
          deliveryCompanyCode: null,
          invoiceNumber: null,
        },
      ],
    });

    expect(counts).toEqual({
      success: 1,
      warning: 1,
      error: 1,
      skipped: 1,
      actionable: 2,
    });
  });
});
