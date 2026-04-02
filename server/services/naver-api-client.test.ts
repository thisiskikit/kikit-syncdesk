import { describe, expect, it } from "vitest";
import {
  asNumber,
  asObject,
  asString,
  firstNumber,
  firstString,
  getNestedValue,
  normalizeDateOnly,
  toSeoulDateTime,
  toSummedValue,
} from "./naver-api-client";

describe("naver api normalization helpers", () => {
  it("coerces primitive values safely", () => {
    expect(asString(12345)).toBe("12345");
    expect(asString(null)).toBeNull();
    expect(asNumber("42")).toBe(42);
    expect(asNumber("bad-number")).toBeNull();
  });

  it("reads nested values through prioritized lookup paths", () => {
    const payload = asObject({
      order: {
        id: "ORDER-1",
        quantity: "3",
      },
      fallback: {
        quantity: 5,
      },
    });

    expect(getNestedValue(payload, ["order", "id"])).toBe("ORDER-1");
    expect(
      firstString(payload, [
        ["missing", "id"],
        ["order", "id"],
      ]),
    ).toBe("ORDER-1");
    expect(
      firstNumber(payload, [
        ["missing", "quantity"],
        ["order", "quantity"],
      ]),
    ).toBe(3);
  });

  it("normalizes date strings for Seoul date range requests", () => {
    expect(normalizeDateOnly("2026-03-24")).toBe("2026-03-24");
    expect(normalizeDateOnly("2026-03-24T03:00:00.000Z")).toBe("2026-03-24");
    expect(toSeoulDateTime("2026-03-24", "start")).toBe("2026-03-24T00:00:00+09:00");
    expect(toSeoulDateTime("2026-03-24", "end")).toBe("2026-03-24T23:59:59+09:00");
  });

  it("sums only numeric values", () => {
    expect(toSummedValue([10, null, undefined, 5])).toBe(15);
  });
});
