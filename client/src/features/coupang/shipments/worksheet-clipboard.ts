import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import { SELPICK_ORDER_NUMBER_PATTERN } from "./worksheet-config";
import { applyEditableCell } from "./worksheet-row-helpers";

type InvoiceClipboardLookupMaps = {
  rowBySelpickOrderNumber: ReadonlyMap<string, CoupangShipmentWorksheetRow>;
  rowByProductOrderNumber: ReadonlyMap<string, CoupangShipmentWorksheetRow>;
  duplicateProductOrderNumbers?: ReadonlySet<string>;
};

type ResolvedInvoiceClipboardColumns = {
  deliveryCompanyCode: string;
  invoiceNumber: string;
  selpickOrderNumber?: string;
  productOrderNumber?: string;
};

const EMPTY_DUPLICATE_PRODUCT_ORDER_NUMBER_SET = new Set<string>();

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

function buildResolvedInvoiceClipboardColumns(input: ResolvedInvoiceClipboardColumns) {
  return {
    deliveryCompanyCode: input.deliveryCompanyCode,
    invoiceNumber: input.invoiceNumber,
    ...(input.selpickOrderNumber ? { selpickOrderNumber: input.selpickOrderNumber } : {}),
    ...(input.productOrderNumber ? { productOrderNumber: input.productOrderNumber } : {}),
  };
}

function isKnownProductOrderNumber(
  value: string,
  rowByProductOrderNumber: ReadonlyMap<string, CoupangShipmentWorksheetRow>,
) {
  const normalized = value.trim();
  return normalized.length > 0 && rowByProductOrderNumber.has(normalized);
}

function resolveInvoiceClipboardColumns(
  columns: string[],
  rowByProductOrderNumber: ReadonlyMap<string, CoupangShipmentWorksheetRow>,
) {
  const cells = trimOuterEmptyCells(columns).map((value) => value.trim());

  const resolveProductOrderColumns = (
    productOrderNumberIndex: number,
    deliveryCompanyIndex: number,
    invoiceNumberIndex: number,
  ) => {
    const productOrderNumber = cells[productOrderNumberIndex] ?? "";
    if (!isKnownProductOrderNumber(productOrderNumber, rowByProductOrderNumber)) {
      return null;
    }

    return buildResolvedInvoiceClipboardColumns({
      productOrderNumber,
      deliveryCompanyCode: cells[deliveryCompanyIndex] ?? "",
      invoiceNumber: cells[invoiceNumberIndex] ?? "",
    });
  };

  if (cells.length === 3) {
    if (SELPICK_ORDER_NUMBER_PATTERN.test(cells[0] ?? "")) {
      return buildResolvedInvoiceClipboardColumns({
        selpickOrderNumber: cells[0] ?? "",
        deliveryCompanyCode: cells[1] ?? "",
        invoiceNumber: cells[2] ?? "",
      });
    }

    if (SELPICK_ORDER_NUMBER_PATTERN.test(cells[2] ?? "")) {
      return buildResolvedInvoiceClipboardColumns({
        selpickOrderNumber: cells[2] ?? "",
        deliveryCompanyCode: cells[0] ?? "",
        invoiceNumber: cells[1] ?? "",
      });
    }

    return (
      resolveProductOrderColumns(0, 1, 2) ??
      resolveProductOrderColumns(2, 0, 1)
    );
  }

  if (cells.length >= 4) {
    if (SELPICK_ORDER_NUMBER_PATTERN.test(cells[1] ?? "")) {
      return buildResolvedInvoiceClipboardColumns({
        selpickOrderNumber: cells[1] ?? "",
        deliveryCompanyCode: cells[2] ?? "",
        invoiceNumber: cells[3] ?? "",
      });
    }

    if (SELPICK_ORDER_NUMBER_PATTERN.test(cells[2] ?? "")) {
      return buildResolvedInvoiceClipboardColumns({
        selpickOrderNumber: cells[2] ?? "",
        deliveryCompanyCode: cells[1] ?? "",
        invoiceNumber: cells[3] ?? "",
      });
    }

    return (
      resolveProductOrderColumns(1, 2, 3) ??
      resolveProductOrderColumns(2, 1, 3)
    );
  }

  return null;
}

function formatInvoiceIdentifier(input: Pick<ResolvedInvoiceClipboardColumns, "selpickOrderNumber" | "productOrderNumber">) {
  if (input.selpickOrderNumber) {
    return {
      kind: "selpick" as const,
      value: input.selpickOrderNumber,
      label: `셀픽주문번호 ${input.selpickOrderNumber}`,
    };
  }

  if (input.productOrderNumber) {
    return {
      kind: "product" as const,
      value: input.productOrderNumber,
      label: `상품주문번호 ${input.productOrderNumber}`,
    };
  }

  return null;
}

export function looksLikeInvoiceClipboard(
  text: string,
  rowByProductOrderNumber: ReadonlyMap<string, CoupangShipmentWorksheetRow> = new Map(),
) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const delimiter = line.includes("\t") ? "\t" : ",";
    const columns = trimOuterEmptyCells(line.split(delimiter).map((value) => value.trim()));
    const normalizedHeader = columns.map((value) => value.replace(/\s+/g, ""));

    if (normalizedHeader.includes("셀픽주문번호") || normalizedHeader.includes("상품주문번호")) {
      return true;
    }

    if (resolveInvoiceClipboardColumns(columns, rowByProductOrderNumber)) {
      return true;
    }
  }

  return false;
}

export function parseInvoiceClipboardRows(text: string, lookupMaps: InvoiceClipboardLookupMaps) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const updates = new Map<string, CoupangShipmentWorksheetRow>();
  const issues: string[] = [];
  const duplicateProductOrderNumbers =
    lookupMaps.duplicateProductOrderNumbers ?? EMPTY_DUPLICATE_PRODUCT_ORDER_NUMBER_SET;

  for (const line of lines) {
    const delimiter = line.includes("\t") ? "\t" : ",";
    const columns = trimOuterEmptyCells(line.split(delimiter).map((value) => value.trim()));
    const normalizedHeader = columns.map((value) => value.replace(/\s+/g, ""));

    if (
      normalizedHeader.includes("셀픽주문번호") ||
      normalizedHeader.includes("상품주문번호") ||
      normalizedHeader.includes("송장번호") ||
      normalizedHeader.includes("운송장번호") ||
      normalizedHeader.includes("택배사")
    ) {
      continue;
    }

    const resolved = resolveInvoiceClipboardColumns(columns, lookupMaps.rowByProductOrderNumber);
    if (!resolved) {
      issues.push(`행을 해석할 수 없습니다: ${line}`);
      continue;
    }

    const identifier = formatInvoiceIdentifier(resolved);
    if (!identifier) {
      issues.push(`행을 해석할 수 없습니다: ${line}`);
      continue;
    }

    if (identifier.kind === "product" && duplicateProductOrderNumbers.has(identifier.value)) {
      issues.push(`현재 시트에 중복 상품주문번호가 있어 자동 반영할 수 없습니다: ${identifier.value}`);
      continue;
    }

    const row =
      identifier.kind === "selpick"
        ? lookupMaps.rowBySelpickOrderNumber.get(identifier.value)
        : lookupMaps.rowByProductOrderNumber.get(identifier.value);
    if (!row) {
      issues.push(`현재 시트에 없는 ${identifier.label}입니다.`);
      continue;
    }

    const nextRow = applyEditableCell(
      applyEditableCell(row, "deliveryCompanyCode", resolved.deliveryCompanyCode.trim()),
      "invoiceNumber",
      resolved.invoiceNumber.trim(),
    );
    if (nextRow === row) {
      continue;
    }

    updates.set(row.id, { ...nextRow });
  }

  return {
    updates,
    issues,
  };
}
