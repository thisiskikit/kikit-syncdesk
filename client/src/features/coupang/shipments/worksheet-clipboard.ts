import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import { SELPICK_ORDER_NUMBER_PATTERN } from "./worksheet-config";
import { applyEditableCell } from "./worksheet-row-helpers";

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

function resolveInvoiceClipboardColumns(columns: string[]) {
  const cells = trimOuterEmptyCells(columns).map((value) => value.trim());

  if (cells.length === 3) {
    if (SELPICK_ORDER_NUMBER_PATTERN.test(cells[0] ?? "")) {
      return {
        selpickOrderNumber: cells[0] ?? "",
        deliveryCompanyCode: cells[1] ?? "",
        invoiceNumber: cells[2] ?? "",
      };
    }

    if (SELPICK_ORDER_NUMBER_PATTERN.test(cells[2] ?? "")) {
      return {
        selpickOrderNumber: cells[2] ?? "",
        deliveryCompanyCode: cells[0] ?? "",
        invoiceNumber: cells[1] ?? "",
      };
    }
  }

  if (cells.length >= 4) {
    if (SELPICK_ORDER_NUMBER_PATTERN.test(cells[1] ?? "")) {
      return {
        selpickOrderNumber: cells[1] ?? "",
        deliveryCompanyCode: cells[2] ?? "",
        invoiceNumber: cells[3] ?? "",
      };
    }

    if (SELPICK_ORDER_NUMBER_PATTERN.test(cells[2] ?? "")) {
      return {
        selpickOrderNumber: cells[2] ?? "",
        deliveryCompanyCode: cells[1] ?? "",
        invoiceNumber: cells[3] ?? "",
      };
    }
  }

  return null;
}

export function looksLikeInvoiceClipboard(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const delimiter = line.includes("\t") ? "\t" : ",";
    const columns = trimOuterEmptyCells(line.split(delimiter).map((value) => value.trim()));
    const normalizedHeader = columns.map((value) => value.replace(/\s+/g, ""));

    if (normalizedHeader.includes("셀픽주문번호")) {
      return true;
    }

    if (resolveInvoiceClipboardColumns(columns)) {
      return true;
    }
  }

  return false;
}

export function parseInvoiceClipboardRows(
  text: string,
  rowBySelpickOrderNumber: Map<string, CoupangShipmentWorksheetRow>,
) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const updates = new Map<string, CoupangShipmentWorksheetRow>();
  const issues: string[] = [];

  for (const line of lines) {
    const delimiter = line.includes("\t") ? "\t" : ",";
    const columns = trimOuterEmptyCells(line.split(delimiter).map((value) => value.trim()));
    const normalizedHeader = columns.map((value) => value.replace(/\s+/g, ""));

    if (
      normalizedHeader.includes("셀픽주문번호") ||
      normalizedHeader.includes("송장번호") ||
      normalizedHeader.includes("택배사")
    ) {
      continue;
    }

    const resolved = resolveInvoiceClipboardColumns(columns);
    if (!resolved) {
      issues.push(`행을 해석할 수 없습니다: ${line}`);
      continue;
    }

    const { selpickOrderNumber, deliveryCompanyCode, invoiceNumber } = resolved;
    const row = rowBySelpickOrderNumber.get(selpickOrderNumber);
    if (!row) {
      issues.push(`현재 시트에 없는 셀픽주문번호입니다: ${selpickOrderNumber}`);
      continue;
    }

    const nextRow = applyEditableCell(
      applyEditableCell(row, "deliveryCompanyCode", deliveryCompanyCode.trim()),
      "invoiceNumber",
      invoiceNumber.trim(),
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
