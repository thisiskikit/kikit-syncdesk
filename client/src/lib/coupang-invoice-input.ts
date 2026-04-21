import { parseSpreadsheetClipboardMatrix } from "@/lib/spreadsheet-grid";

export interface ParsedCoupangInvoicePopupRow {
  deliveryCompanyCode: string;
  invoiceNumber: string;
  selpickOrderNumber?: string;
  productOrderNumber?: string;
}

export interface ParsedCoupangInvoicePopupResult {
  rows: ParsedCoupangInvoicePopupRow[];
  issues: string[];
}

type ParseCoupangInvoicePopupInputOptions = {
  knownProductOrderNumbers?: ReadonlySet<string>;
};

const EMPTY_PRODUCT_ORDER_NUMBER_SET = new Set<string>();

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

function isKnownProductOrderNumber(value: string, knownProductOrderNumbers: ReadonlySet<string>) {
  const normalized = value.trim();
  return normalized.length > 0 && knownProductOrderNumbers.has(normalized);
}

function buildParsedRow(input: {
  deliveryCompanyCode: string;
  invoiceNumber: string;
  selpickOrderNumber?: string;
  productOrderNumber?: string;
}): ParsedCoupangInvoicePopupRow {
  return {
    deliveryCompanyCode: input.deliveryCompanyCode,
    invoiceNumber: input.invoiceNumber,
    ...(input.selpickOrderNumber ? { selpickOrderNumber: input.selpickOrderNumber } : {}),
    ...(input.productOrderNumber ? { productOrderNumber: input.productOrderNumber } : {}),
  };
}

function resolveNoHeaderRowValues(
  row: string[],
  options: ParseCoupangInvoicePopupInputOptions,
) {
  const cells = trimOuterEmptyCells(row).map((cell) => cell.trim());
  const knownProductOrderNumbers =
    options.knownProductOrderNumbers ?? EMPTY_PRODUCT_ORDER_NUMBER_SET;

  const resolveProductOrderRow = (
    productOrderNumberIndex: number,
    deliveryCompanyIndex: number,
    invoiceNumberIndex: number,
  ) => {
    const productOrderNumber = cells[productOrderNumberIndex] ?? "";
    if (!isKnownProductOrderNumber(productOrderNumber, knownProductOrderNumbers)) {
      return null;
    }

    return buildParsedRow({
      deliveryCompanyCode: cells[deliveryCompanyIndex] ?? "",
      invoiceNumber: cells[invoiceNumberIndex] ?? "",
      productOrderNumber,
    });
  };

  if (cells.length >= 4) {
    if (looksLikeSelpickOrderNumber(cells[1] ?? "") && !looksLikeSelpickOrderNumber(cells[2] ?? "")) {
      return buildParsedRow({
        deliveryCompanyCode: cells[2] ?? "",
        invoiceNumber: cells[3] ?? "",
        selpickOrderNumber: cells[1] ?? "",
      });
    }

    if (looksLikeSelpickOrderNumber(cells[2] ?? "") && !looksLikeSelpickOrderNumber(cells[1] ?? "")) {
      return buildParsedRow({
        deliveryCompanyCode: cells[1] ?? "",
        invoiceNumber: cells[3] ?? "",
        selpickOrderNumber: cells[2] ?? "",
      });
    }

    return (
      resolveProductOrderRow(1, 2, 3) ??
      resolveProductOrderRow(2, 1, 3)
    );
  }

  if (cells.length >= 3) {
    if (looksLikeSelpickOrderNumber(cells[0] ?? "") && !looksLikeSelpickOrderNumber(cells[1] ?? "")) {
      return buildParsedRow({
        deliveryCompanyCode: cells[1] ?? "",
        invoiceNumber: cells[2] ?? "",
        selpickOrderNumber: cells[0] ?? "",
      });
    }

    if (looksLikeSelpickOrderNumber(cells[2] ?? "") && !looksLikeSelpickOrderNumber(cells[0] ?? "")) {
      return buildParsedRow({
        deliveryCompanyCode: cells[0] ?? "",
        invoiceNumber: cells[1] ?? "",
        selpickOrderNumber: cells[2] ?? "",
      });
    }

    return (
      resolveProductOrderRow(0, 1, 2) ??
      resolveProductOrderRow(2, 0, 1)
    );
  }

  return null;
}

function resolveRowValues(
  row: string[],
  indexes: {
    deliveryCompanyIndex: number;
    invoiceNumberIndex: number;
    selpickOrderNumberIndex: number;
    productOrderNumberIndex: number;
    hasDetectedHeader: boolean;
  },
  options: ParseCoupangInvoicePopupInputOptions,
) {
  if (!indexes.hasDetectedHeader) {
    return resolveNoHeaderRowValues(row, options);
  }

  return buildParsedRow({
    deliveryCompanyCode: row[indexes.deliveryCompanyIndex]?.trim() ?? "",
    invoiceNumber: row[indexes.invoiceNumberIndex]?.trim() ?? "",
    selpickOrderNumber:
      indexes.selpickOrderNumberIndex >= 0
        ? (row[indexes.selpickOrderNumberIndex]?.trim() ?? "")
        : undefined,
    productOrderNumber:
      indexes.productOrderNumberIndex >= 0
        ? (row[indexes.productOrderNumberIndex]?.trim() ?? "")
        : undefined,
  });
}

export function parseCoupangInvoicePopupInput(
  text: string,
  options: ParseCoupangInvoicePopupInputOptions = {},
): ParsedCoupangInvoicePopupResult {
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
  let productOrderNumberIndex = -1;

  const firstRow = matrix[0] ?? [];
  const normalizedHeaders = firstRow.map(normalizeHeader);
  const detectedDeliveryCompanyIndex = normalizedHeaders.indexOf("택배사");
  const detectedInvoiceNumberIndex = normalizedHeaders.findIndex(
    (value) => value === "운송장번호" || value === "송장번호",
  );
  const detectedSelpickOrderNumberIndex = normalizedHeaders.indexOf("셀픽주문번호");
  const detectedProductOrderNumberIndex = normalizedHeaders.indexOf("상품주문번호");
  const hasDetectedHeader =
    detectedDeliveryCompanyIndex >= 0 &&
    detectedInvoiceNumberIndex >= 0 &&
    (detectedSelpickOrderNumberIndex >= 0 || detectedProductOrderNumberIndex >= 0);

  if (hasDetectedHeader) {
    rows = matrix.slice(1);
    deliveryCompanyIndex = detectedDeliveryCompanyIndex;
    invoiceNumberIndex = detectedInvoiceNumberIndex;
    selpickOrderNumberIndex = detectedSelpickOrderNumberIndex;
    productOrderNumberIndex = detectedProductOrderNumberIndex;
  }

  const parsedRows: ParsedCoupangInvoicePopupRow[] = [];

  rows.forEach((row, index) => {
    if (!row.some((cell) => cell.length > 0)) {
      return;
    }

    const resolved = resolveRowValues(
      row,
      {
        deliveryCompanyIndex,
        invoiceNumberIndex,
        selpickOrderNumberIndex,
        productOrderNumberIndex,
        hasDetectedHeader,
      },
      options,
    );

    if (!resolved) {
      issues.push(`${index + 1}행을 해석할 수 없습니다.`);
      return;
    }

    if (!resolved.selpickOrderNumber && !resolved.productOrderNumber) {
      issues.push(`${index + 1}행에 셀픽주문번호 또는 상품주문번호가 없습니다.`);
      return;
    }

    parsedRows.push(resolved);
  });

  return {
    rows: parsedRows,
    issues,
  };
}
