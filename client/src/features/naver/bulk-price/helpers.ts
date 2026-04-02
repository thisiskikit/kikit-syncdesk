import type {
  NaverBulkPriceMatchField,
  NaverBulkPriceRuleSet,
  NaverBulkPriceRunDetail,
  NaverBulkPriceRunStatus,
  NaverBulkPriceSourceConfig,
} from "@shared/naver-bulk-price";
import type { NaverProductOptionType } from "@shared/naver-products";
import { formatNumber } from "@/lib/utils";
import type { MenuState } from "./state";

const NAVER_BULK_PRICE_MATCH_FIELD_LABELS: Record<NaverBulkPriceMatchField, string> = {
  sellerManagementCode: "sellerManagementCode",
  sellerBarcode: "sellerBarcode",
  originProductNo: "originProductNo",
  channelProductNo: "channelProductNo",
};

const NAVER_BULK_PRICE_ROUNDING_MODE_LABELS: Record<MenuState["roundingMode"], string> = {
  ceil: "Ceil",
  round: "Round",
  floor: "Floor",
};

const NAVER_BULK_PRICE_OPTION_TYPE_LABELS: Record<NaverProductOptionType, string> = {
  none: "None",
  combination: "Combination",
  standard: "Standard",
  simple: "Simple",
  custom: "Custom",
  unknown: "Unknown",
};

const NAVER_SALE_STATUS_LABELS: Record<string, string> = {
  WAIT: "Waiting",
  SALE: "On sale",
  OUTOFSTOCK: "Out of stock",
  UNADMISSION: "Pending review",
  REJECTION: "Rejected",
  SUSPENSION: "Suspended",
  CLOSE: "Closed",
  PROHIBITION: "Prohibited",
  DELETE: "Deleted",
};

const NAVER_BULK_PRICE_INTERNAL_MESSAGE_LABELS: Record<string, string> = {
  "Preview row is no longer available.": "유효한 미리보기 행을 더 이상 찾을 수 없습니다.",
  "Preview row is in conflict.": "미리보기 행이 충돌 상태입니다.",
  "Stopped before execution.": "실행 전에 중지되었습니다.",
  "Paused before execution.": "실행 전에 일시중지되었습니다.",
  "Server restarted during execution.": "실행 중 서버가 재시작되었습니다.",
  "Run paused after server restart.": "서버 재시작 후 실행이 일시중지되었습니다.",
  "Target price is missing.": "적용 대상 가격이 없습니다.",
  "Sold-out value is missing.": "소진 여부 값이 비어 있습니다.",
  "Sold-out value is invalid.": "소진 여부 값을 해석할 수 없습니다.",
  "Base price is missing or invalid.": "기준 가격이 비어 있거나 유효하지 않습니다.",
  "Base price is missing or invalid. Price update will be skipped.":
    "기준 가격이 비어 있거나 유효하지 않아 가격 변경을 건너뜁니다.",
  "Current sale price could not be confirmed. Price update will be skipped.":
    "현재 판매가를 확인할 수 없어 가격 변경을 건너뜁니다.",
  "Current stock quantity is 0. NAVER cannot switch OUTOFSTOCK to SALE without stock quantity.":
    "현재 재고가 0이므로 NAVER에서 재고 없이 OUTOFSTOCK을 SALE로 바꿀 수 없습니다.",
  "Current price and sale status already match target.": "현재 가격과 판매상태가 목표와 같습니다.",
  "Current price already matches target price.": "현재 가격이 목표 가격과 같습니다.",
};

const NAVER_BULK_PRICE_MESSAGE_OVERRIDES: Record<string, string> = {
  "Sold-out value is missing.": "소진 여부 값이 비어 있습니다.",
  "Sold-out value is invalid.": "소진 여부 값을 해석할 수 없습니다.",
  "Base price is missing or invalid.": "기준 가격이 비어 있거나 유효하지 않습니다.",
  "Base price is missing or invalid. Price update will be skipped.":
    "기준 가격이 비어 있거나 유효하지 않아 가격 변경을 건너뜁니다.",
  "Current sale price could not be confirmed. Price update will be skipped.":
    "현재 판매가를 확인할 수 없어 가격 변경을 건너뜁니다.",
  "Current stock quantity is 0. NAVER cannot switch OUTOFSTOCK to SALE without stock quantity.":
    "현재 재고가 0개이므로 NAVER에서 재고 없이 OUTOFSTOCK을 SALE로 바꿀 수 없습니다.",
  "Current price and sale status already match target.": "현재 가격과 판매상태가 목표와 같습니다.",
  "Current price already matches target price.": "현재 가격이 목표 가격과 같습니다.",
};

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

export function buildStatusTone(status: string | null) {
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

export function buildRunLogPriority(status: string | null) {
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

export function buildMatchFieldLabel(value: NaverBulkPriceMatchField) {
  return NAVER_BULK_PRICE_MATCH_FIELD_LABELS[value];
}

export function buildRoundingModeLabel(value: MenuState["roundingMode"]) {
  return NAVER_BULK_PRICE_ROUNDING_MODE_LABELS[value];
}

export function buildOptionTypeLabel(value: NaverProductOptionType) {
  return NAVER_BULK_PRICE_OPTION_TYPE_LABELS[value];
}

export function buildSaleStatusLabel(label: string | null | undefined, code: string | null | undefined) {
  if (code && NAVER_SALE_STATUS_LABELS[code]) {
    return NAVER_SALE_STATUS_LABELS[code];
  }

  return label?.trim() || "-";
}

export function translateBulkPriceMessage(message: string) {
  return (
    NAVER_BULK_PRICE_MESSAGE_OVERRIDES[message] ??
    NAVER_BULK_PRICE_INTERNAL_MESSAGE_LABELS[message] ??
    message
  );
}

export function buildSourceConfigFromState(state: MenuState): NaverBulkPriceSourceConfig {
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
    naverMatchField: state.naverMatchField,
  };
}

export function buildRuleSetFromState(state: MenuState): NaverBulkPriceRuleSet {
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

export function formatWon(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${formatNumber(value)}원`;
}

export function isFinalRunStatus(status: NaverBulkPriceRunStatus | null) {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "partially_succeeded" ||
    status === "stopped"
  );
}

export function buildRunSummaryText(run: NaverBulkPriceRunDetail["run"] | null) {
  if (!run) {
    return "No run selected.";
  }

  return [
    `Total ${run.summary.total}`,
    `Queued ${run.summary.queued}`,
    `Running ${run.summary.running}`,
    `Succeeded ${run.summary.succeeded}`,
    `Failed ${run.summary.failed}`,
    `Paused ${run.summary.paused}`,
    `Stopped ${run.summary.stopped}`,
  ].join(" / ");
}
