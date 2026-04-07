import { describe, expect, it } from "vitest";
import { parseCoupangInvoicePopupInput } from "@/lib/coupang-invoice-input";

describe("parseCoupangInvoicePopupInput", () => {
  it("parses company, invoice number, selpick order number rows without a header", () => {
    expect(
      parseCoupangInvoicePopupInput(
        "CJGLS\t123456789\tO20260326K0001\nLOGEN\t987654321\tO20260326K0002",
      ),
    ).toEqual({
      rows: [
        {
          deliveryCompanyCode: "CJGLS",
          invoiceNumber: "123456789",
          selpickOrderNumber: "O20260326K0001",
        },
        {
          deliveryCompanyCode: "LOGEN",
          invoiceNumber: "987654321",
          selpickOrderNumber: "O20260326K0002",
        },
      ],
      issues: [],
    });
  });

  it("supports a header row with Korean column labels", () => {
    expect(
      parseCoupangInvoicePopupInput(
        "택배사\t운송장번호\t셀픽주문번호\nCJGLS\t123456789\tO20260326K0001",
      ),
    ).toEqual({
      rows: [
        {
          deliveryCompanyCode: "CJGLS",
          invoiceNumber: "123456789",
          selpickOrderNumber: "O20260326K0001",
        },
      ],
      issues: [],
    });
  });

  it("supports a header row with 송장번호 alias", () => {
    expect(
      parseCoupangInvoicePopupInput(
        "택배사,송장번호,셀픽주문번호\nCJGLS,123456789,O20260326K0001",
      ),
    ).toEqual({
      rows: [
        {
          deliveryCompanyCode: "CJGLS",
          invoiceNumber: "123456789",
          selpickOrderNumber: "O20260326K0001",
        },
      ],
      issues: [],
    });
  });

  it("supports selpick-first rows without a header", () => {
    expect(
      parseCoupangInvoicePopupInput(
        "O20260326K0001\tCJGLS\t123456789\nO20260326K0002\tLOGEN\t987654321",
      ),
    ).toEqual({
      rows: [
        {
          deliveryCompanyCode: "CJGLS",
          invoiceNumber: "123456789",
          selpickOrderNumber: "O20260326K0001",
        },
        {
          deliveryCompanyCode: "LOGEN",
          invoiceNumber: "987654321",
          selpickOrderNumber: "O20260326K0002",
        },
      ],
      issues: [],
    });
  });

  it("supports four-column rows copied from worksheet-like exports", () => {
    expect(
      parseCoupangInvoicePopupInput(
        "1\tCJGLS\tO20260326K0001\t123456789\n2\tLOGEN\tO20260326K0002\t987654321",
      ),
    ).toEqual({
      rows: [
        {
          deliveryCompanyCode: "CJGLS",
          invoiceNumber: "123456789",
          selpickOrderNumber: "O20260326K0001",
        },
        {
          deliveryCompanyCode: "LOGEN",
          invoiceNumber: "987654321",
          selpickOrderNumber: "O20260326K0002",
        },
      ],
      issues: [],
    });
  });

  it("supports four-column rows where the selpick order number appears before the company", () => {
    expect(
      parseCoupangInvoicePopupInput(
        "1\tO20260326K0001\tCJGLS\t123456789\n2\tO20260326K0002\tLOGEN\t987654321",
      ),
    ).toEqual({
      rows: [
        {
          deliveryCompanyCode: "CJGLS",
          invoiceNumber: "123456789",
          selpickOrderNumber: "O20260326K0001",
        },
        {
          deliveryCompanyCode: "LOGEN",
          invoiceNumber: "987654321",
          selpickOrderNumber: "O20260326K0002",
        },
      ],
      issues: [],
    });
  });

  it("ignores trailing empty columns in three-column rows", () => {
    expect(
      parseCoupangInvoicePopupInput(
        "CJGLS\t123456789\tO20260326K0001\t\nLOGEN\t987654321\tO20260326K0002\t",
      ),
    ).toEqual({
      rows: [
        {
          deliveryCompanyCode: "CJGLS",
          invoiceNumber: "123456789",
          selpickOrderNumber: "O20260326K0001",
        },
        {
          deliveryCompanyCode: "LOGEN",
          invoiceNumber: "987654321",
          selpickOrderNumber: "O20260326K0002",
        },
      ],
      issues: [],
    });
  });

  it("collects row-level issues when the selpick order number is missing", () => {
    expect(
      parseCoupangInvoicePopupInput("택배사\t운송장번호\t셀픽주문번호\nCJGLS\t123456789\t"),
    ).toEqual({
      rows: [],
      issues: ["1행에 셀픽주문번호가 없습니다."],
    });
  });
});
