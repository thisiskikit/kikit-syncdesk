import type {
  CoupangProductDetail,
  CoupangProductExplorerExposureCard,
  CoupangProductExplorerOperationCard,
  CoupangProductExplorerRow,
  CoupangProductExposureState,
  CoupangProductViolationType,
} from "@shared/coupang";

export const PRODUCT_EXPOSURE_FILTER_CARDS: Array<{
  key: CoupangProductExplorerExposureCard;
  label: string;
  tone: string;
}> = [
  { key: "all", label: "전체", tone: "neutral" },
  { key: "restricted", label: "노출제한", tone: "danger" },
  { key: "low", label: "노출낮음", tone: "attention" },
  { key: "normal", label: "노출정상", tone: "success" },
  { key: "unknown", label: "상태 미확인", tone: "progress" },
];

export const PRODUCT_OPERATION_FILTER_CARDS: Array<{
  key: CoupangProductExplorerOperationCard;
  label: string;
  tone: string;
}> = [
  { key: "all", label: "전체", tone: "neutral" },
  { key: "suspended", label: "판매중지 옵션", tone: "danger" },
  { key: "zeroInventory", label: "재고 0 옵션", tone: "progress" },
  { key: "bestPriceGuaranteed", label: "최저가보장 옵션", tone: "attention" },
];

export function getCoupangExposureStateLabel(exposureState: CoupangProductExposureState) {
  if (exposureState === "restricted") {
    return "노출제한";
  }

  if (exposureState === "low") {
    return "노출낮음";
  }

  if (exposureState === "normal") {
    return "노출정상";
  }

  return "상태 미확인";
}

export function getCoupangViolationTypeLabel(violationType: CoupangProductViolationType) {
  if (violationType === "NO_VA_V2") {
    return "상품정보 검증 필요";
  }

  if (violationType === "MOTA_V2") {
    return "필수옵션 누락";
  }

  return "옵션 수정 필요";
}

export function buildCoupangExposureBadges(input: {
  violationTypes: ReadonlyArray<CoupangProductViolationType>;
  exposureState: CoupangProductExposureState;
}) {
  if (input.violationTypes.length) {
    return input.violationTypes.map((violationType) => ({
      key: violationType,
      label: getCoupangViolationTypeLabel(violationType),
      className: violationType === "ATTR" ? "attention" : "invalid",
    }));
  }

  if (input.exposureState === "normal") {
    return [{ key: "normal", label: "노출정상", className: "success" }];
  }

  if (input.exposureState === "low") {
    return [{ key: "low", label: "노출낮음", className: "attention" }];
  }

  if (input.exposureState === "restricted") {
    return [{ key: "restricted", label: "노출제한", className: "invalid" }];
  }

  return [{ key: "unknown", label: "상태 미확인", className: "draft" }];
}

export function resolveCoupangExposureInput(
  detail: CoupangProductDetail | null | undefined,
  summary: CoupangProductExplorerRow | null | undefined,
) {
  const detailHasViolationTypes = Boolean(detail?.violationTypes.length);

  return {
    violationTypes: detailHasViolationTypes
      ? detail?.violationTypes ?? []
      : summary?.violationTypes ?? detail?.violationTypes ?? [],
    exposureState: detailHasViolationTypes
      ? detail?.exposureState ?? "unknown"
      : summary?.exposureState ?? detail?.exposureState ?? "unknown",
  };
}

export function buildCoupangOperationSummary(
  row:
    | Pick<
        CoupangProductExplorerRow,
        | "suspendedOptionCount"
        | "zeroInventoryOptionCount"
        | "bestPriceGuaranteedOptionCount"
        | "onSaleOptionCount"
      >
    | null
    | undefined,
) {
  if (!row) {
    return null;
  }

  const segments = [
    row.suspendedOptionCount > 0 ? `판매중지 ${row.suspendedOptionCount}` : null,
    row.zeroInventoryOptionCount > 0 ? `재고 0 ${row.zeroInventoryOptionCount}` : null,
    row.bestPriceGuaranteedOptionCount > 0
      ? `최저가보장 ${row.bestPriceGuaranteedOptionCount}`
      : null,
    row.onSaleOptionCount > 0 ? `판매중 ${row.onSaleOptionCount}` : null,
  ].filter((value): value is string => Boolean(value));

  return segments.length ? segments.join(" / ") : null;
}
