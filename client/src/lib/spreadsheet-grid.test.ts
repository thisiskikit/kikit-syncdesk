import { describe, expect, it } from "vitest";
import { parseSpreadsheetClipboardMatrix, stripMatchingHeaderRow } from "@/lib/spreadsheet-grid";

describe("parseSpreadsheetClipboardMatrix", () => {
  it("keeps two-dimensional clipboard structure and trims trailing empty lines", () => {
    expect(parseSpreadsheetClipboardMatrix("택배사\t송장번호\nCJ\t1234\n롯데\t5678\n")).toEqual([
      ["택배사", "송장번호"],
      ["CJ", "1234"],
      ["롯데", "5678"],
    ]);
  });

  it("preserves empty rows inside the pasted range", () => {
    expect(parseSpreadsheetClipboardMatrix("CJ\t1234\n\n롯데\t5678")).toEqual([
      ["CJ", "1234"],
      [""],
      ["롯데", "5678"],
    ]);
  });
});

describe("stripMatchingHeaderRow", () => {
  it("removes the first row when it exactly matches the expected headers", () => {
    expect(
      stripMatchingHeaderRow(
        [
          ["택배사", "송장번호"],
          ["CJ", "1234"],
        ],
        ["택배사", "송장번호"],
      ),
    ).toEqual([["CJ", "1234"]]);
  });

  it("keeps the first row when the headers do not match", () => {
    const matrix = [
      ["셀픽주문번호", "택배사", "송장번호"],
      ["O20260326K0001", "CJ", "1234"],
    ];
    expect(stripMatchingHeaderRow(matrix, ["택배사", "송장번호"])).toEqual(matrix);
  });
});
