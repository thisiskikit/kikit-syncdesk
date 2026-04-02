import type {
  BulkPricePreviewResponse,
  BulkPriceRuleSet,
  BulkPriceSourceConfig,
} from "@shared/coupang-bulk-price";
import type { MenuState } from "./state";

export function formatDurationMs(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "-";
  }

  if (value < 1_000) {
    return `${Math.round(value)}ms`;
  }

  if (value < 10_000) {
    return `${(value / 1_000).toFixed(1)}s`;
  }

  return `${Math.round(value / 100) / 10}s`;
}

export function formatPreviewExplorerState(metrics: BulkPricePreviewResponse["buildMetrics"]) {
  const sourceLabel =
    metrics.coupangExplorerSource === "fallback" ? "fallback explorer" : "live explorer";

  return metrics.coupangExplorerServedFromCache ? `${sourceLabel} cache` : sourceLabel;
}

export function formatSoldOutState(value: boolean | null) {
  if (value === true) {
    return "Sold out";
  }

  if (value === false) {
    return "On sale";
  }

  return "-";
}

export function buildStatusLabel(status: string | null) {
  switch (status) {
    case "ready":
      return "Ready";
    case "conflict":
      return "Conflict";
    case "unmatched":
      return "Unmatched";
    case "invalid_source":
      return "Invalid source";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "succeeded":
      return "Succeeded";
    case "partially_succeeded":
      return "Partially succeeded";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "skipped_conflict":
      return "Skipped conflict";
    case "skipped_unmatched":
      return "Skipped unmatched";
    default:
      return status ?? "-";
  }
}

export function buildStatusTone(status: string) {
  if (status === "ready" || status === "succeeded") return "success";
  if (status === "running" || status === "queued" || status === "paused") return "pending";
  if (status === "stopped") return "warning";
  if (
    status === "conflict" ||
    status === "failed" ||
    status === "invalid_source" ||
    status === "skipped_conflict" ||
    status === "skipped_unmatched"
  ) {
    return "failed";
  }

  return "draft";
}

export function buildRunLogPriority(status: string) {
  switch (status) {
    case "running":
      return 0;
    case "failed":
      return 1;
    case "succeeded":
      return 2;
    case "paused":
      return 3;
    case "stopped":
      return 4;
    case "skipped_conflict":
      return 5;
    case "skipped_unmatched":
      return 6;
    case "queued":
      return 7;
    default:
      return 8;
  }
}

export function buildPriceDirection(currentPrice: number | null, nextPrice: number | null) {
  if (currentPrice === null || nextPrice === null) return "same";
  if (nextPrice > currentPrice) return "up";
  if (nextPrice < currentPrice) return "down";
  return "same";
}

export function buildSourceConfigFromState(state: MenuState): BulkPriceSourceConfig {
  return {
    storeId: state.storeId,
    schema: state.schema,
    table: state.table,
    basePriceColumn: state.basePriceColumn,
    sourceMatchColumn: state.sourceMatchColumn,
    soldOutColumn: state.soldOutColumn,
    workDateColumn: state.workDateColumn,
    workDateFrom: state.workDateFrom,
    workDateTo: state.workDateTo,
    coupangMatchField: state.coupangMatchField,
  };
}

export function buildRuleSetFromState(state: MenuState): BulkPriceRuleSet {
  return {
    fixedAdjustment: state.fixedAdjustment,
    feeRate: state.feeRate,
    marginRate: state.marginRate,
    inboundShippingCost: state.inboundShippingCost,
    discountRate: state.discountRate,
    roundingUnit: state.roundingUnit,
    roundingMode: state.roundingMode,
  };
}
