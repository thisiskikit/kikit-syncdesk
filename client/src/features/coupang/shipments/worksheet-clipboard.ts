import type { CoupangShipmentWorksheetRow } from "@shared/coupang";
import { SELPICK_ORDER_NUMBER_PATTERN } from "./worksheet-config";
import { applyEditableCell } from "./worksheet-row-helpers";

export function looksLikeInvoiceClipboard(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const delimiter = line.includes("\t") ? "\t" : ",";
    const columns = line.split(delimiter).map((value) => value.trim());
    const normalizedHeader = columns.map((value) => value.replace(/\s+/g, ""));

    if (normalizedHeader.includes("셀픽주문번호")) {
      return true;
    }

    if (columns.length === 3 && SELPICK_ORDER_NUMBER_PATTERN.test(columns[0] ?? "")) {
      return true;
    }

    if (columns.length >= 4 && SELPICK_ORDER_NUMBER_PATTERN.test(columns[2] ?? "")) {
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
    const columns = line.split(delimiter).map((value) => value.trim());
    const normalizedHeader = columns.map((value) => value.replace(/\s+/g, ""));

    if (
      normalizedHeader.includes("셀픽주문번호") ||
      normalizedHeader.includes("송장번호") ||
      normalizedHeader.includes("택배사")
    ) {
      continue;
    }

    let selpickOrderNumber = "";
    let deliveryCompanyCode = "";
    let invoiceNumber = "";

    if (columns.length === 3) {
      [selpickOrderNumber, deliveryCompanyCode, invoiceNumber] = columns;
    } else if (columns.length >= 4) {
      [, deliveryCompanyCode, selpickOrderNumber, invoiceNumber] = columns;
    } else {
      issues.push(`열 수를 해석할 수 없습니다: ${line}`);
      continue;
    }

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
