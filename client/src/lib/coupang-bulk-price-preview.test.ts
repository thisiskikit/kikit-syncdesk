import { describe, expect, it } from "vitest";
import { shouldSkipCoupangSamePriceRow } from "./coupang-bulk-price-preview";

describe("shouldSkipCoupangSamePriceRow", () => {
  it("skips rows when only the price stays the same", () => {
    expect(
      shouldSkipCoupangSamePriceRow({
        currentPrice: 12000,
        nextPrice: 12000,
        needsInventoryUpdate: false,
        needsSaleStatusUpdate: false,
      }),
    ).toBe(true);
  });

  it("keeps rows selectable when inventory still needs to change", () => {
    expect(
      shouldSkipCoupangSamePriceRow({
        currentPrice: 12000,
        nextPrice: 12000,
        needsInventoryUpdate: true,
        needsSaleStatusUpdate: false,
      }),
    ).toBe(false);
  });

  it("keeps rows selectable when sale status still needs to change", () => {
    expect(
      shouldSkipCoupangSamePriceRow({
        currentPrice: 12000,
        nextPrice: 12000,
        needsInventoryUpdate: false,
        needsSaleStatusUpdate: true,
      }),
    ).toBe(false);
  });

  it("does not skip rows when the target price changes", () => {
    expect(
      shouldSkipCoupangSamePriceRow({
        currentPrice: 12000,
        nextPrice: 12500,
        needsInventoryUpdate: false,
        needsSaleStatusUpdate: false,
      }),
    ).toBe(false);
  });
});
