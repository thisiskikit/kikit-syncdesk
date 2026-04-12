import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

import { getFulfillmentDecision } from "./fulfillment-decision";

export function summarizeShipmentBlockedDecisionRows(rows: readonly CoupangShipmentWorksheetRow[]) {
  if (!rows.length) {
    return null;
  }

  const counts = new Map<string, number>();

  for (const row of rows) {
    const label = getFulfillmentDecision(row).statusLabel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => `${label} ${count}건`)
    .join(" · ");
}

export function buildShipmentBlockedDecisionDetails(rows: readonly CoupangShipmentWorksheetRow[]) {
  if (!rows.length) {
    return [] as string[];
  }

  const grouped = new Map<string, number>();

  for (const row of rows) {
    const decision = getFulfillmentDecision(row);
    const key = `${decision.statusLabel} / ${decision.reasonLabel}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  return Array.from(grouped.entries()).map(([label, count]) => `${label}: ${count}건 자동 제외`);
}
