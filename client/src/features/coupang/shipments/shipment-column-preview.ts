import type { CoupangShipmentWorksheetRow } from "@shared/coupang";

import type { ShipmentColumnSourceKey } from "./types";

const PREVIEW_CURRENCY_FORMATTER = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const PREVIEW_NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");

function normalizePreviewText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

export function formatShipmentColumnPreviewValue(
  row: CoupangShipmentWorksheetRow | null,
  sourceKey: ShipmentColumnSourceKey,
) {
  if (!row) {
    return "미리보기 없음";
  }

  switch (sourceKey) {
    case "blank":
      return "(빈 칸)";
    case "quantity": {
      const quantity = row.quantity;
      return typeof quantity === "number" && Number.isFinite(quantity)
        ? PREVIEW_NUMBER_FORMATTER.format(quantity)
        : "값 없음";
    }
    case "salePrice": {
      const salePrice = row.salePrice;
      return typeof salePrice === "number" && Number.isFinite(salePrice)
        ? PREVIEW_CURRENCY_FORMATTER.format(salePrice)
        : "값 없음";
    }
    case "shippingFee": {
      const shippingFee = row.shippingFee;
      return typeof shippingFee === "number" && Number.isFinite(shippingFee)
        ? PREVIEW_CURRENCY_FORMATTER.format(shippingFee)
        : "값 없음";
    }
    default:
      return normalizePreviewText(row[sourceKey] as string | null | undefined) ?? "값 없음";
  }
}
