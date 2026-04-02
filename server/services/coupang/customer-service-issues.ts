import type {
  CoupangCustomerServiceIssueBreakdownItem,
  CoupangExchangeRow,
  CoupangReturnRow,
} from "@shared/coupang";

type CustomerServiceIssueInput = {
  relatedReturnRequests?: Array<Pick<CoupangReturnRow, "cancelType">>;
  relatedExchangeRequests?: Array<Pick<CoupangExchangeRow, "exchangeId">>;
};

export function buildCoupangCustomerServiceIssueBreakdown(
  input: CustomerServiceIssueInput,
): CoupangCustomerServiceIssueBreakdownItem[] {
  const cancelCount =
    input.relatedReturnRequests?.filter((row) => row.cancelType === "CANCEL").length ?? 0;
  const returnCount =
    input.relatedReturnRequests?.filter((row) => row.cancelType === "RETURN").length ?? 0;
  const exchangeCount = input.relatedExchangeRequests?.length ?? 0;

  const items: CoupangCustomerServiceIssueBreakdownItem[] = [];

  if (cancelCount > 0) {
    items.push({
      type: "cancel",
      count: cancelCount,
      label: `취소 ${cancelCount}건`,
    });
  }

  if (returnCount > 0) {
    items.push({
      type: "return",
      count: returnCount,
      label: `반품 ${returnCount}건`,
    });
  }

  if (exchangeCount > 0) {
    items.push({
      type: "exchange",
      count: exchangeCount,
      label: `교환 ${exchangeCount}건`,
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
