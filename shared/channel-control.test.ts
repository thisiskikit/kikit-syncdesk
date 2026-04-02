import { describe, expect, it } from "vitest";
import { applyPatchToSnapshot, hasControlPatchValues } from "./channel-control";

describe("channel-control helpers", () => {
  it("applies only provided patch fields", () => {
    const result = applyPatchToSnapshot(
      {
        price: 10000,
        stockQuantity: 8,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
      },
      {
        price: 12000,
        soldOutStatus: "sold_out",
      },
    );

    expect(result).toEqual({
      price: 12000,
      stockQuantity: 8,
      saleStatus: "on_sale",
      soldOutStatus: "sold_out",
    });
  });

  it("detects whether a patch contains any actionable field", () => {
    expect(hasControlPatchValues({})).toBe(false);
    expect(hasControlPatchValues({ stockQuantity: 0 })).toBe(true);
  });
});

