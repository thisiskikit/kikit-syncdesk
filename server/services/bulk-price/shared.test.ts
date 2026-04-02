import { describe, expect, it } from "vitest";
import {
  normalizeSourceWorkDateValue,
  parseSoldOutSourceValue,
  suggestWorkDateColumn,
} from "./shared";

describe("parseSoldOutSourceValue", () => {
  it("accepts NAVER-style sale status strings for in-stock values", () => {
    expect(parseSoldOutSourceValue("SALE")).toBe(false);
    expect(parseSoldOutSourceValue("IN STOCK")).toBe(false);
    expect(parseSoldOutSourceValue("판매 중")).toBe(false);
  });

  it("accepts out-of-stock strings with separators and whitespace", () => {
    expect(parseSoldOutSourceValue("OUT_OF_STOCK")).toBe(true);
    expect(parseSoldOutSourceValue("out of stock")).toBe(true);
    expect(parseSoldOutSourceValue("품절")).toBe(true);
  });
});

describe("work date helpers", () => {
  it("suggests work date columns from common names", () => {
    expect(
      suggestWorkDateColumn([
        { name: "base_price" },
        { name: "work_date" },
      ]),
    ).toBe("work_date");
    expect(
      suggestWorkDateColumn([
        { name: "상품코드" },
        { name: "작업일자" },
      ]),
    ).toBe("작업일자");
  });

  it("normalizes common date string formats", () => {
    expect(normalizeSourceWorkDateValue("2026-04-01")).toBe("2026-04-01");
    expect(normalizeSourceWorkDateValue("2026/04/01")).toBe("2026-04-01");
    expect(normalizeSourceWorkDateValue("20260401")).toBe("2026-04-01");
    expect(normalizeSourceWorkDateValue("2026-04-01T13:45:00+09:00")).toBe(
      "2026-04-01",
    );
  });

  it("returns null for blank or unparseable work dates", () => {
    expect(normalizeSourceWorkDateValue("")).toBeNull();
    expect(normalizeSourceWorkDateValue("not-a-date")).toBeNull();
    expect(normalizeSourceWorkDateValue(null)).toBeNull();
  });
});
