function normalizeHeaderCell(value: string) {
  return value.trim();
}

export function parseSpreadsheetClipboardMatrix(text: string) {
  const normalizedText = text.replace(/\r/g, "");
  const rows = normalizedText.split("\n");

  while (rows.length > 0 && rows[rows.length - 1] === "") {
    rows.pop();
  }

  return rows.map((row) => row.split("\t"));
}

export function stripMatchingHeaderRow(matrix: string[][], expectedHeaders: string[]) {
  if (!matrix.length || !expectedHeaders.length) {
    return matrix;
  }

  const firstRow = matrix[0] ?? [];
  if (firstRow.length !== expectedHeaders.length) {
    return matrix;
  }

  const matches = firstRow.every(
    (cell, index) => normalizeHeaderCell(cell) === normalizeHeaderCell(expectedHeaders[index] ?? ""),
  );

  return matches ? matrix.slice(1) : matrix;
}
