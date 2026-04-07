import type {
  CoupangCustomerServiceIssueBreakdownItem,
  CoupangExchangeRow,
  CoupangReturnRow,
} from "@shared/coupang";

type CustomerServiceIssueInput = {
  relatedReturnRequests?: Array<
    Pick<CoupangReturnRow, "cancelType" | "status" | "releaseStatus">
  >;
  relatedExchangeRequests?: Array<Pick<CoupangExchangeRow, "exchangeId">>;
};

const SHIPMENT_STOP_REQUEST_STATUSES = new Set([
  "RU",
  "UC",
  "RELEASE_STOP_UNCHECKED",
  "RETURNS_UNCHECKED",
]);

function classifyReturnIssueType(
  row: Pick<CoupangReturnRow, "cancelType" | "status" | "releaseStatus">,
): CoupangCustomerServiceIssueBreakdownItem["type"] {
  if (row.cancelType === "RETURN") {
    return "return";
  }

  const normalizedStatus = (row.status ?? "").trim().toUpperCase();
  const normalizedReleaseStatus = (row.releaseStatus ?? "").trim().toUpperCase();
  const canManageShipmentStop =
    row.cancelType === "CANCEL" && SHIPMENT_STOP_REQUEST_STATUSES.has(normalizedStatus);

  if (canManageShipmentStop) {
    return normalizedReleaseStatus === "N"
      ? "shipment_stop_requested"
      : "shipment_stop_handled";
  }

  return "cancel";
}

function formatIssueLabel(
  type: CoupangCustomerServiceIssueBreakdownItem["type"],
  count: number,
) {
  switch (type) {
    case "shipment_stop_requested":
      return `출고중지 요청 ${count}건`;
    case "shipment_stop_handled":
      return `출고중지 처리됨 ${count}건`;
    case "cancel":
      return `취소 ${count}건`;
    case "return":
      return `반품 ${count}건`;
    case "exchange":
      return `교환 ${count}건`;
    default:
      return `${count}건`;
  }
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
  };
}
