import type {
  CoupangShipmentWorksheetInvoiceInputApplyRow,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";

export function dedupeInvoiceInputApplyRows(
  rows: readonly CoupangShipmentWorksheetInvoiceInputApplyRow[],
) {
  const latestRowBySelpickOrderNumber = new Map<string, CoupangShipmentWorksheetInvoiceInputApplyRow>();

  for (const row of rows) {
    const selpickOrderNumber = row.selpickOrderNumber.trim();
    if (!selpickOrderNumber) {
      continue;
    }

    latestRowBySelpickOrderNumber.set(selpickOrderNumber, {
      selpickOrderNumber,
      deliveryCompanyCode: row.deliveryCompanyCode.trim(),
      invoiceNumber: row.invoiceNumber.trim(),
    });
  }

  return Array.from(latestRowBySelpickOrderNumber.values());
}

export function resolveSourceKeysForTouchedRowIds(
  rowIds: readonly string[],
  rowCollections: ReadonlyArray<ReadonlyArray<CoupangShipmentWorksheetRow>>,
) {
  if (!rowIds.length) {
    return [];
  }

  const rowIdSet = new Set(rowIds);
  const sourceKeys = new Set<string>();

  for (const rows of rowCollections) {
    for (const row of rows) {
      if (rowIdSet.has(row.id)) {
        sourceKeys.add(row.sourceKey);
      }
    }
  }

  return Array.from(sourceKeys);
}
