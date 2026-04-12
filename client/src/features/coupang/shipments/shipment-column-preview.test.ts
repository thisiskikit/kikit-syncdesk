import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import { describe, expect, it } from "vitest";

import { formatShipmentColumnPreviewValue } from "./shipment-column-preview";

const SAMPLE_ROW = {
  quantity: 3,
  salePrice: 12000,
  shippingFee: 3000,
  productName: "테스트 상품",
  optionName: "레드 / L",
  exposedProductName: "테스트 상품, 레드 / L",
  coupangDisplayProductName: "쿠팡 실노출 상품명",
  deliveryRequest: null,
} as unknown as CoupangShipmentWorksheetRow;

describe("shipment-column-preview helpers", () => {
  it("formats preview values from the current worksheet row", () => {
    expect(formatShipmentColumnPreviewValue(SAMPLE_ROW, "quantity")).toBe("3");
    expect(formatShipmentColumnPreviewValue(SAMPLE_ROW, "salePrice")).toBe("₩12,000");
    expect(formatShipmentColumnPreviewValue(SAMPLE_ROW, "exposedProductName")).toBe(
      "테스트 상품, 레드 / L",
    );
    expect(formatShipmentColumnPreviewValue(SAMPLE_ROW, "coupangDisplayProductName")).toBe(
      "쿠팡 실노출 상품명",
    );
  });

  it("returns fallback labels for blank and missing values", () => {
    expect(formatShipmentColumnPreviewValue(SAMPLE_ROW, "blank")).toBe("(빈 칸)");
    expect(formatShipmentColumnPreviewValue(SAMPLE_ROW, "deliveryRequest")).toBe("값 없음");
    expect(formatShipmentColumnPreviewValue(null, "productName")).toBe("미리보기 없음");
  });
});
