import type {
  CoupangCustomerServiceIssueBreakdownItem,
  CoupangCustomerServiceTerminalStatus,
  CoupangExchangeRow,
  CoupangReturnRow,
} from "@shared/coupang";

type CustomerServiceIssueInput = {
  relatedReturnRequests?: Array<
    Pick<
      CoupangReturnRow,
      | "cancelType"
      | "status"
      | "releaseStatus"
      | "releaseStatusName"
      | "completeConfirmDate"
      | "completeConfirmType"
    >
  >;
  relatedExchangeRequests?: Array<Pick<CoupangExchangeRow, "exchangeId">>;
};

const SHIPMENT_STOP_REQUEST_STATUSES = new Set([
  "RU",
  "UC",
  "RELEASE_STOP_UNCHECKED",
  "RETURNS_UNCHECKED",
]);

const SHIPMENT_STOP_COMPLETION_STATUSES = new Set([
  "COMPLETE",
  "COMPLETED",
  "DONE",
  "FINISHED",
  "RELEASE_STOP_COMPLETE",
  "RELEASE_STOP_COMPLETED",
  "RELEASE_STOP_HANDLED",
  "SHIPMENT_STOP_COMPLETE",
  "SHIPMENT_STOP_COMPLETED",
  "SHIPMENT_STOP_HANDLED",
]);

const RETURN_COMPLETION_STATUSES = new Set([
  "COMPLETE",
  "COMPLETED",
  "DONE",
  "FINISHED",
  "RETURN_COMPLETE",
  "RETURN_COMPLETED",
  "RETURN_DONE",
  "RETURN_FINISHED",
  "RETURN_HANDLED",
  "RETURN_RELEASE_COMPLETE",
  "RETURN_RELEASE_COMPLETED",
  "REFUND_COMPLETE",
  "REFUND_COMPLETED",
]);

const ISSUE_LABELS: Record<CoupangCustomerServiceIssueBreakdownItem["type"], string> = {
  shipment_stop_requested: "출고중지 요청",
  shipment_stop_handled: "출고중지완료",
  cancel: "취소",
  return: "반품",
  exchange: "교환",
};

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function hasShipmentStopCompletionSignal(
  row: Pick<
    CoupangReturnRow,
    | "cancelType"
    | "status"
    | "releaseStatus"
    | "releaseStatusName"
    | "completeConfirmDate"
    | "completeConfirmType"
  >,
) {
  if (row.cancelType !== "CANCEL") {
    return false;
  }

  if ((row.completeConfirmDate ?? "").trim() || (row.completeConfirmType ?? "").trim()) {
    return true;
  }

  const normalizedStatus = normalizeToken(row.status);
  const normalizedReleaseStatus = normalizeToken(row.releaseStatus);
  const normalizedReleaseStatusName = normalizeText(row.releaseStatusName);
  const canManageShipmentStop = SHIPMENT_STOP_REQUEST_STATUSES.has(normalizedStatus);

  if (SHIPMENT_STOP_COMPLETION_STATUSES.has(normalizedStatus)) {
    return true;
  }

  if (
    normalizedReleaseStatusName &&
    [
      "출고완료",
      "출고 완료",
      "출고중지완료",
      "출고중지 완료",
      "처리완료",
      "처리 완료",
      "완료",
      "complete",
      "completed",
      "done",
      "handled",
      "processed",
      "shipped",
    ].some((token) => normalizedReleaseStatusName.includes(token))
  ) {
    return true;
  }

  return false;
}

function hasShipmentStopHandledSignal(
  row: Pick<
    CoupangReturnRow,
    | "cancelType"
    | "status"
    | "releaseStatus"
    | "releaseStatusName"
    | "completeConfirmDate"
    | "completeConfirmType"
  >,
) {
  if (row.cancelType !== "CANCEL") {
    return false;
  }

  if (hasShipmentStopCompletionSignal(row)) {
    return true;
  }

  const normalizedStatus = normalizeToken(row.status);
  const normalizedReleaseStatus = normalizeToken(row.releaseStatus);
  return SHIPMENT_STOP_REQUEST_STATUSES.has(normalizedStatus) && normalizedReleaseStatus !== "N";
}

function hasReturnCompletionSignal(
  row: Pick<
    CoupangReturnRow,
    | "cancelType"
    | "status"
    | "releaseStatus"
    | "releaseStatusName"
    | "completeConfirmDate"
    | "completeConfirmType"
  >,
) {
  if (row.cancelType !== "RETURN") {
    return false;
  }

  if ((row.completeConfirmDate ?? "").trim() || (row.completeConfirmType ?? "").trim()) {
    return true;
  }

  const normalizedStatus = normalizeToken(row.status);
  const normalizedReleaseStatus = normalizeToken(row.releaseStatus);
  const normalizedReleaseStatusName = normalizeText(row.releaseStatusName);

  if (
    RETURN_COMPLETION_STATUSES.has(normalizedStatus) ||
    RETURN_COMPLETION_STATUSES.has(normalizedReleaseStatus)
  ) {
    return true;
  }

  if (
    normalizedReleaseStatusName &&
    [
      "반품완료",
      "반품 완료",
      "반품처리완료",
      "반품 처리 완료",
      "환불완료",
      "환불 완료",
      "return complete",
      "return completed",
      "return handled",
      "refund complete",
      "refund completed",
      "returned",
    ].some((token) => normalizedReleaseStatusName.includes(token))
  ) {
    return true;
  }

  return false;
}

function hasShipmentStopRequestSignal(
  row: Pick<CoupangReturnRow, "cancelType" | "status" | "releaseStatus">,
) {
  if (row.cancelType !== "CANCEL") {
    return false;
  }

  return (
    SHIPMENT_STOP_REQUEST_STATUSES.has(normalizeToken(row.status)) &&
    normalizeToken(row.releaseStatus) === "N"
  );
}

function classifyReturnIssueType(
  row: Pick<
    CoupangReturnRow,
    | "cancelType"
    | "status"
    | "releaseStatus"
    | "releaseStatusName"
    | "completeConfirmDate"
    | "completeConfirmType"
  >,
): CoupangCustomerServiceIssueBreakdownItem["type"] {
  if (row.cancelType === "RETURN") {
    return "return";
  }

  if (hasShipmentStopHandledSignal(row)) {
    return "shipment_stop_handled";
  }

  if (hasShipmentStopRequestSignal(row)) {
    return "shipment_stop_requested";
  }

  return "cancel";
}

function resolveCustomerServiceTerminalStatus(
  input: CustomerServiceIssueInput,
): CoupangCustomerServiceTerminalStatus | null {
  let hasCompletedCancel = false;
  let hasCompletedReturn = false;

  for (const row of input.relatedReturnRequests ?? []) {
    if (!hasCompletedReturn && hasReturnCompletionSignal(row)) {
      hasCompletedReturn = true;
    }

    if (!hasCompletedCancel && hasShipmentStopCompletionSignal(row)) {
      hasCompletedCancel = true;
    }

    if (hasCompletedReturn && hasCompletedCancel) {
      break;
    }
  }

  if (hasCompletedReturn) {
    return "return_completed";
  }

  if (hasCompletedCancel) {
    return "cancel_completed";
  }

  return null;
}

function formatIssueLabel(
  type: CoupangCustomerServiceIssueBreakdownItem["type"],
  count: number,
) {
  return `${ISSUE_LABELS[type]} ${count}건`;
}

export function buildCoupangCustomerServiceIssueBreakdown(
  input: CustomerServiceIssueInput,
): CoupangCustomerServiceIssueBreakdownItem[] {
  const counts = {
    shipment_stop_requested: 0,
    shipment_stop_handled: 0,
    cancel: 0,
    return: 0,
    exchange: input.relatedExchangeRequests?.length ?? 0,
  } satisfies Record<CoupangCustomerServiceIssueBreakdownItem["type"], number>;

  for (const row of input.relatedReturnRequests ?? []) {
    counts[classifyReturnIssueType(row)] += 1;
  }

  const items: CoupangCustomerServiceIssueBreakdownItem[] = [];

  for (const type of [
    "shipment_stop_requested",
    "shipment_stop_handled",
    "cancel",
    "return",
    "exchange",
  ] as const satisfies readonly CoupangCustomerServiceIssueBreakdownItem["type"][]) {
    const count = counts[type];
    if (count <= 0) {
      continue;
    }

    items.push({
      type,
      count,
      label: formatIssueLabel(type, count),
    });
  }

  return items;
}

export function buildCoupangCustomerServiceIssueSummary(
  breakdown: CoupangCustomerServiceIssueBreakdownItem[],
) {
  return breakdown.map((item) => item.label).join(" / ") || null;
}

export function buildCoupangCustomerServiceIssueState(input: CustomerServiceIssueInput) {
  const breakdown = buildCoupangCustomerServiceIssueBreakdown(input);

  return {
    customerServiceIssueCount: breakdown.reduce((sum, item) => sum + item.count, 0),
    customerServiceIssueSummary: buildCoupangCustomerServiceIssueSummary(breakdown),
    customerServiceIssueBreakdown: breakdown,
    customerServiceTerminalStatus: resolveCustomerServiceTerminalStatus(input),
  };
}
