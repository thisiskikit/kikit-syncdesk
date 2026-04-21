import type {
  CoupangShipmentWorksheetInvoiceInputApplyRow,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";

function normalizeInvoiceInputIdentifier(
  row: Readonly<Pick<CoupangShipmentWorksheetInvoiceInputApplyRow, "selpickOrderNumber" | "productOrderNumber">>,
) {
  const selpickOrderNumber = row.selpickOrderNumber?.trim();
  if (selpickOrderNumber) {
    return {
      key: `selpick:${selpickOrderNumber}`,
      identifier: { selpickOrderNumber },
    } as const;
  }

  const productOrderNumber = row.productOrderNumber?.trim();
  if (productOrderNumber) {
    return {
      key: `product:${productOrderNumber}`,
      identifier: { productOrderNumber },
    } as const;
  }

  return null;
}

export function dedupeInvoiceInputApplyRows(
  rows: readonly CoupangShipmentWorksheetInvoiceInputApplyRow[],
) {
  const latestRowByIdentifier = new Map<string, CoupangShipmentWorksheetInvoiceInputApplyRow>();

  for (const row of rows) {
    const normalizedIdentifier = normalizeInvoiceInputIdentifier(row);
    if (!normalizedIdentifier) {
      continue;
    }

    latestRowByIdentifier.set(normalizedIdentifier.key, {
      ...normalizedIdentifier.identifier,
      deliveryCompanyCode: row.deliveryCompanyCode.trim(),
      invoiceNumber: row.invoiceNumber.trim(),
    });
  }

  return Array.from(latestRowByIdentifier.values());
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
