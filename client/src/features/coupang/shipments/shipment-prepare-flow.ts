import type {
  CoupangBatchActionResponse,
  CoupangShipmentWorksheetAuditMissingResponse,
  CoupangShipmentWorksheetBulkResolveResponse,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";
import { canAttemptInvoiceRow } from "@/lib/coupang-shipment-quick-filters";
import { formatShipmentWorksheetCustomerServiceLabel } from "@/lib/coupang-customer-service";
import {
  formatCoupangOrderStatusLabel,
  resolveCoupangDisplayOrderStatus,
} from "@/lib/coupang-order-status";
import { buildFailureDetails, buildResultSummary } from "./shipment-actions";
import {
  buildShipmentWorksheetAuditDetails,
  hasShipmentPrepareAuditWarnings,
  summarizeShipmentPrepareAuditWarning,
} from "./shipment-audit-missing";

type PrepareBlockedRow = Pick<
  CoupangShipmentWorksheetRow,
  | "orderId"
  | "shipmentBoxId"
  | "orderStatus"
  | "customerServiceIssueSummary"
  | "customerServiceIssueCount"
  | "customerServiceIssueBreakdown"
>;

function getShipmentClaimSummary(row: PrepareBlockedRow) {
  return (
    formatShipmentWorksheetCustomerServiceLabel({
      summary: row.customerServiceIssueSummary,
      count: row.customerServiceIssueCount,
      state: "ready",
      breakdown: row.customerServiceIssueBreakdown,
    }) ??
    formatCoupangOrderStatusLabel(
      resolveCoupangDisplayOrderStatus({
        orderStatus: row.orderStatus,
        customerServiceIssueSummary: row.customerServiceIssueSummary,
        customerServiceIssueBreakdown: row.customerServiceIssueBreakdown,
      }),
    )
  );
}

export function buildPrepareClaimBlockedDetails(rows: PrepareBlockedRow[]) {
  return rows.map(
    (row) => `주문 ${row.orderId} / 배송 ${row.shipmentBoxId} / ${getShipmentClaimSummary(row)}`,
  );
}

export function resolvePrepareAcceptedOrdersPlan(input: {
  auditResponse: CoupangShipmentWorksheetAuditMissingResponse | null;
  resolvedRows: Pick<CoupangShipmentWorksheetBulkResolveResponse, "items" | "blockedItems"> | null;
  auditFailureMessage?: string | null;
}) {
  const targetRows = input.resolvedRows?.items ?? [];
  const blockedClaimDetails = buildPrepareClaimBlockedDetails(input.resolvedRows?.blockedItems ?? []);
  const auditFailureDetails = input.auditFailureMessage
    ? [`누락 검수 실패: ${input.auditFailureMessage}`]
    : [];
  const hasAuditWarnings =
    Boolean(input.auditFailureMessage) ||
    (input.auditResponse ? hasShipmentPrepareAuditWarnings(input.auditResponse) : false);
  const auditWarningDetails = [
    ...auditFailureDetails,
    ...(input.auditResponse && hasShipmentPrepareAuditWarnings(input.auditResponse)
      ? buildShipmentWorksheetAuditDetails(input.auditResponse, {
          limit: 8,
          includeHidden: false,
        })
      : []),
  ].slice(0, 8);

  return {
    targetRows,
    blockedClaimDetails,
    auditWarningDetails,
    hasAuditWarnings,
    shouldSubmitPrepare: targetRows.length > 0,
  };
}

export function buildPrepareAcceptedOrdersFeedback(input: {
  auditResponse: CoupangShipmentWorksheetAuditMissingResponse | null;
  blockedClaimDetails: string[];
  result: CoupangBatchActionResponse;
  targetRowCount: number;
  auditFailureMessage?: string | null;
}) {
  const auditFailureDetails = input.auditFailureMessage
    ? [`누락 검수 실패: ${input.auditFailureMessage}`]
    : [];
  const hasAuditWarnings =
    Boolean(input.auditFailureMessage) ||
    (input.auditResponse ? hasShipmentPrepareAuditWarnings(input.auditResponse) : false);
  const details = [
    ...auditFailureDetails,
    ...buildFailureDetails(input.result),
    ...input.blockedClaimDetails,
    ...(input.auditResponse && hasShipmentPrepareAuditWarnings(input.auditResponse)
      ? buildShipmentWorksheetAuditDetails(input.auditResponse, {
          limit: 8,
          includeHidden: false,
        })
      : []),
  ].slice(0, 8);
  const warning =
    hasAuditWarnings ||
    input.blockedClaimDetails.length > 0 ||
    input.result.summary.failedCount > 0 ||
    input.result.summary.warningCount > 0 ||
    input.result.summary.skippedCount > 0;
  const baseMessage = `${buildResultSummary(input.result)} / 결제완료 ${input.targetRowCount}건 처리`;

  return {
    type: warning ? ("warning" as const) : ("success" as const),
    title: "상품준비중 처리 결과",
    message: input.auditFailureMessage
      ? `${baseMessage} / 누락 검수 실패로 현재 worksheet 기준 처리만 진행했습니다.`
      : hasAuditWarnings && input.auditResponse
      ? `${baseMessage} / ${summarizeShipmentPrepareAuditWarning(input.auditResponse)}`
      : baseMessage,
    details,
  };
}

export function getSucceededPrepareShipmentBoxIds(result: CoupangBatchActionResponse) {
  return Array.from(
    new Set(
      result.items
        .filter(
          (item): item is typeof item & { shipmentBoxId: string } =>
            item.status === "succeeded" && Boolean(item.shipmentBoxId),
        )
        .map((item) => item.shipmentBoxId),
    ),
  );
}

export function resolveInvoiceAutoPrepareRows(rows: readonly CoupangShipmentWorksheetRow[]) {
  return rows.filter(
    (row) => row.availableActions.includes("markPreparing") && canAttemptInvoiceRow(row),
  );
}

function updateWorksheetActionsAfterPrepare(actions: CoupangShipmentWorksheetRow["availableActions"]) {
  const nextActions = actions.filter((action) => action !== "markPreparing");

  if (!nextActions.includes("uploadInvoice")) {
    nextActions.unshift("uploadInvoice");
  }

  return nextActions;
}

export function buildOptimisticPrepareRowUpdates(input: {
  rows: CoupangShipmentWorksheetRow[];
  shipmentBoxIds: readonly string[];
  updatedAt: string;
}) {
  const shipmentBoxIdSet = new Set(input.shipmentBoxIds);
  const updates = new Map<string, CoupangShipmentWorksheetRow>();

  for (const row of input.rows) {
    if (!shipmentBoxIdSet.has(row.shipmentBoxId)) {
      continue;
    }

    updates.set(row.id, {
      ...row,
      orderStatus: "INSTRUCT",
      availableActions: updateWorksheetActionsAfterPrepare(row.availableActions),
      updatedAt: input.updatedAt,
    });
  }

  return updates;
}
