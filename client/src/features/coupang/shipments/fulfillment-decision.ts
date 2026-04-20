import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import {
  buildCoupangFulfillmentDecisionCounts,
  getCoupangFulfillmentDecision,
  getCoupangFulfillmentDecisionReasonLabel,
  getCoupangFulfillmentDecisionStatusLabel,
  matchesCoupangFulfillmentDecisionFilter,
} from "@shared/coupang-fulfillment";
import type {
  FulfillmentDecisionFilterValue,
  FulfillmentDecisionPresentation,
  FulfillmentDecisionReason,
  FulfillmentDecisionStatus,
} from "./types";

export function getFulfillmentDecisionStatusLabel(status: FulfillmentDecisionStatus) {
  return getCoupangFulfillmentDecisionStatusLabel(status);
}

export function getFulfillmentDecisionReasonLabel(reason: FulfillmentDecisionReason) {
  return getCoupangFulfillmentDecisionReasonLabel(reason);
}

export function getFulfillmentDecision(
  row: CoupangShipmentWorksheetRow,
): FulfillmentDecisionPresentation {
  return getCoupangFulfillmentDecision(row);
}

export function matchesFulfillmentDecisionFilter(
  row: CoupangShipmentWorksheetRow,
  filterValue: FulfillmentDecisionFilterValue,
) {
  return matchesCoupangFulfillmentDecisionFilter(row, filterValue);
}

export function buildFulfillmentDecisionCounts(rows: readonly CoupangShipmentWorksheetRow[]) {
  return buildCoupangFulfillmentDecisionCounts(rows);
}
