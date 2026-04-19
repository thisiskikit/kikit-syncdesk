import { describe, expect, it } from "vitest";

import {
  formatShipmentColumnSourceOptionLabel,
  resolveShipmentColumnLabelForSourceChange,
} from "./worksheet-config";

describe("worksheet-config column source helpers", () => {
  it("formats source options with the raw key and Korean label", () => {
    expect(formatShipmentColumnSourceOptionLabel("productName")).toBe("productName · 상품명");
    expect(formatShipmentColumnSourceOptionLabel("invoiceNumber")).toBe("invoiceNumber · 송장번호");
  });

  it("keeps raw-key headers in sync when the source column changes", () => {
    expect(
      resolveShipmentColumnLabelForSourceChange({
        currentLabel: "productName",
        previousSourceKey: "productName",
        nextSourceKey: "invoiceNumber",
      }),
    ).toBe("invoiceNumber");
  });

  it("keeps Korean default headers in sync when the source column changes", () => {
    expect(
      resolveShipmentColumnLabelForSourceChange({
        currentLabel: "상품명",
        previousSourceKey: "productName",
        nextSourceKey: "invoiceNumber",
      }),
    ).toBe("송장번호");
  });

  it("preserves custom headers when the source column changes", () => {
    expect(
      resolveShipmentColumnLabelForSourceChange({
        currentLabel: "출고용 상품명",
        previousSourceKey: "productName",
        nextSourceKey: "invoiceNumber",
      }),
    ).toBe("출고용 상품명");
  });
});
