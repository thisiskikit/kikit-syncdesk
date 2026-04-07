import type { CoupangCustomerServiceIssueType } from "@shared/coupang";
import { formatCoupangCustomerServiceLabel as formatCoupangCustomerServiceLabelValue } from "./coupang-customer-service";

export function formatTicketText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || "-";
}

export function formatTicketTextOrNull(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

export function formatCoupangCustomerServiceLabel(input: {
  summary: string | null | undefined;
  count: number | null | undefined;
  state?: "unknown" | "ready" | "stale" | null | undefined;
  breakdown?: { type: CoupangCustomerServiceIssueType }[] | null | undefined;
}) {
  return formatCoupangCustomerServiceLabelValue(input);
}

export function formatNaverClaimLabel(input: {
  claimTypeLabel: string | null | undefined;
  claimStatusLabel: string | null | undefined;
}) {
  const parts = [
    formatTicketTextOrNull(input.claimTypeLabel),
    formatTicketTextOrNull(input.claimStatusLabel),
  ].filter(Boolean);

  return parts.length ? `CS ${parts.join(" ")}` : null;
}
