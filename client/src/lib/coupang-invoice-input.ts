import { parseSpreadsheetClipboardMatrix } from "@/lib/spreadsheet-grid";

export interface ParsedCoupangInvoicePopupRow {
  deliveryCompanyCode: string;
  invoiceNumber: string;
  selpickOrderNumber: string;
}

export interface ParsedCoupangInvoicePopupResult {
  rows: ParsedCoupangInvoicePopupRow[];
  issues: string[];
}

function parseFallbackCommaMatrix(text: string) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.split(","));
}

function normalizeMatrix(text: string) {
  const matrix = text.includes("\t")
    ? parseSpreadsheetClipboardMatrix(text)
    : parseFallbackCommaMatrix(text);

  return matrix
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function trimOuterEmptyCells(row: string[]) {
  let start = 0;
  let end = row.length;

  while (start < end && !row[start]?.trim()) {
    start += 1;
  }

  while (end > start && !row[end - 1]?.trim()) {
    end -= 1;
  }

  return row.slice(start, end);
}

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, "");
}

function looksLikeSelpickOrderNumber(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  return /^[A-Z]\d{8}[A-Z]\d{4,}$/.test(normalized) || /^[A-Z0-9-]{12,}$/.test(normalized);
}

function resolveNoHeaderRowValues(row: string[]) {
  const cells = trimOuterEmptyCells(row).map((cell) => cell.trim());

  if (cells.length >= 4) {
    if (looksLikeSelpickOrderNumber(cells[1] ?? "") && !looksLikeSelpickOrderNumber(cells[2] ?? "")) {
      return {
        deliveryCompanyCode: cells[2] ?? "",
        invoiceNumber: cells[3] ?? "",
        selpickOrderNumber: cells[1] ?? "",
      };
    }

    if (looksLikeSelpickOrderNumber(cells[2] ?? "") && !looksLikeSelpickOrderNumber(cells[1] ?? "")) {
      return {
        deliveryCompanyCode: cells[1] ?? "",
        invoiceNumber: cells[3] ?? "",
        selpickOrderNumber: cells[2] ?? "",
      };
    }
  }

  if (cells.length >= 3) {
    if (looksLikeSelpickOrderNumber(cells[0] ?? "") && !looksLikeSelpickOrderNumber(cells[1] ?? "")) {
      return {
        deliveryCompanyCode: cells[1] ?? "",
        invoiceNumber: cells[2] ?? "",
        selpickOrderNumber: cells[0] ?? "",
      };
    }

    if (looksLikeSelpickOrderNumber(cells[2] ?? "") && !looksLikeSelpickOrderNumber(cells[0] ?? "")) {
      return {
        deliveryCompanyCode: cells[0] ?? "",
        invoiceNumber: cells[1] ?? "",
        selpickOrderNumber: cells[2] ?? "",
      };
    }
  }

  return null;
}

function resolveRowValues(
  row: string[],
  indexes: {
    deliveryCompanyIndex: number;
    invoiceNumberIndex: number;
    selpickOrderNumberIndex: number;
    hasDetectedHeader: boolean;
  },
) {
  let deliveryCompanyCode = row[indexes.deliveryCompanyIndex]?.trim() ?? "";
  let invoiceNumber = row[indexes.invoiceNumberIndex]?.trim() ?? "";
  let selpickOrderNumber = row[indexes.selpickOrderNumberIndex]?.trim() ?? "";

  if (!indexes.hasDetectedHeader) {
    const resolved = resolveNoHeaderRowValues(row);
    if (resolved) {
      ({ deliveryCompanyCode, invoiceNumber, selpickOrderNumber } = resolved);
    }
  }

  return {
    deliveryCompanyCode,
    invoiceNumber,
    selpickOrderNumber,
  };
}

export function parseCoupangInvoicePopupInput(text: string): ParsedCoupangInvoicePopupResult {
  const matrix = normalizeMatrix(text);
  const issues: string[] = [];

  if (!matrix.length) {
    return {
      rows: [],
      issues: ["입력된 송장 데이터가 없습니다."],
    };
  }

  let rows = matrix;
  let deliveryCompanyIndex = 0;
  let invoiceNumberIndex = 1;
  let selpickOrderNumberIndex = 2;

  const firstRow = matrix[0] ?? [];
  const normalizedHeaders = firstRow.map(normalizeHeader);
  const detectedDeliveryCompanyIndex = normalizedHeaders.indexOf("택배사");
  const detectedInvoiceNumberIndex = normalizedHeaders.findIndex(
    (value) => value === "운송장번호" || value === "송장번호",
  );
  const detectedSelpickOrderNumberIndex = normalizedHeaders.indexOf("셀픽주문번호");
  const hasDetectedHeader =
    detectedDeliveryCompanyIndex >= 0 &&
    detectedInvoiceNumberIndex >= 0 &&
    detectedSelpickOrderNumberIndex >= 0;

  if (hasDetectedHeader) {
    rows = matrix.slice(1);
    deliveryCompanyIndex = detectedDeliveryCompanyIndex;
    invoiceNumberIndex = detectedInvoiceNumberIndex;
    selpickOrderNumberIndex = detectedSelpickOrderNumberIndex;
  }

  const parsedRows: ParsedCoupangInvoicePopupRow[] = [];

  rows.forEach((row, index) => {
    if (!row.some((cell) => cell.length > 0)) {
      return;
    }

    const { deliveryCompanyCode, invoiceNumber, selpickOrderNumber } = resolveRowValues(row, {
      deliveryCompanyIndex,
      invoiceNumberIndex,
      selpickOrderNumberIndex,
      hasDetectedHeader,
    });

    if (!selpickOrderNumber) {
      issues.push(`${index + 1}행에 셀픽주문번호가 없습니다.`);
      return;
    }

    parsedRows.push({
      deliveryCompanyCode,
      invoiceNumber,
      selpickOrderNumber,
    });
  });

  return {
    rows: parsedRows,
    issues,
  };
}
