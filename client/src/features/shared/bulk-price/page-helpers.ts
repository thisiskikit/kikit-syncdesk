export type PreviewSortDirection = "asc" | "desc";

export type PreviewSelectionState = {
  mode: "all_selectable" | "all_ready" | "explicit";
  selectedRowKeys: Record<string, true>;
  deselectedRowKeys: Record<string, true>;
  manualOverrides: Record<string, string>;
};

export type FixedAdjustmentMode = "add" | "subtract";

const SEOUL_TIME_ZONE = "Asia/Seoul";
const INLINE_SAMPLE_ROW_MAX_LENGTH = 36;

export function getDefaultWorkDateRangeInput(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(date);
  return {
    workDateFrom: today,
    workDateTo: today,
  };
}

export function formatInlineSampleRowValue(value: unknown) {
  const normalized = String(value ?? "-");
  if (normalized.length <= INLINE_SAMPLE_ROW_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, INLINE_SAMPLE_ROW_MAX_LENGTH - 1)}…`;
}

export function createDefaultPreviewSelectionState(): PreviewSelectionState {
  return {
    mode: "all_selectable",
    selectedRowKeys: {},
    deselectedRowKeys: {},
    manualOverrides: {},
  };
}

export function hasPreviewSelectionChanges(selection: PreviewSelectionState) {
  return (
    Object.keys(selection.selectedRowKeys).length > 0 ||
    Object.keys(selection.deselectedRowKeys).length > 0 ||
    Object.values(selection.manualOverrides).some((value) => value.trim().length > 0)
  );
}

export function buildManualOverridePayload(manualOverrides: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(manualOverrides)
      .filter(([, value]) => value.trim().length > 0)
      .map(([rowKey, value]) => [rowKey, Number(value)]),
  );
}

export function formatPercentInput(value: number) {
  return Number.isFinite(value) ? String(Number((value * 100).toFixed(2))) : "0";
}

export function parsePercentInput(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

export function isUnsignedIntegerInput(value: string) {
  return /^\d*$/.test(value);
}

export function parseUnsignedIntegerInput(value: string) {
  if (value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function resolveFixedAdjustmentMode(value: number): FixedAdjustmentMode {
  return value >= 0 ? "add" : "subtract";
}

export function resolveFixedAdjustmentAmount(value: number) {
  return Math.abs(value);
}

export function applyFixedAdjustment(mode: FixedAdjustmentMode, amount: number) {
  return mode === "subtract" ? -amount : amount;
}

export function compareNullableNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
) {
  if (left === right) {
    return 0;
  }

  if (left === null || left === undefined) {
    return 1;
  }

  if (right === null || right === undefined) {
    return -1;
  }

  return left - right;
}

export function compareNullableStrings(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (left === right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return left.localeCompare(right, "ko-KR");
}

export function compareNullableDates(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const leftValue = left ? new Date(left).getTime() : Number.NaN;
  const rightValue = right ? new Date(right).getTime() : Number.NaN;

  if (Number.isNaN(leftValue) && Number.isNaN(rightValue)) {
    return 0;
  }

  if (Number.isNaN(leftValue)) {
    return 1;
  }

  if (Number.isNaN(rightValue)) {
    return -1;
  }

  return leftValue - rightValue;
}

export function isNumericLike(dataType: string) {
  return /(int|numeric|decimal|double|float|real)/i.test(dataType);
}

export function isSoldOutLikeColumnName(name: string) {
  return /(품절|재고없음|sold[_-]?out|stock[_-]?out|is[_-]?sold[_-]?out)/i.test(name);
}

export function isWorkDateLikeColumnName(name: string) {
  return /(작업일자|작업일|work[_-]?date|batch[_-]?date)/i.test(name);
}

export function buildSourceTableValue(schema: string, table: string) {
  return `${encodeURIComponent(schema)}|${encodeURIComponent(table)}`;
}

export function parseSourceTableValue(value: string) {
  const [rawSchema = "", rawTable = ""] = value.split("|");
  return {
    schema: decodeURIComponent(rawSchema),
    table: decodeURIComponent(rawTable),
  };
}
