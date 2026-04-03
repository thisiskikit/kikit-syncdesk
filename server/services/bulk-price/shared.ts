import "../../load-env";
import pg from "pg";
import { ApiRouteError } from "../shared/api-response";

export type BulkPriceSourceConfigBase = {
  storeId: string;
  schema: string;
  table: string;
  basePriceColumn: string;
  sourceMatchColumn: string;
  soldOutColumn?: string;
  workDateColumn: string;
  workDateFrom: string;
  workDateTo: string;
};

export type BulkPriceSerializableValue = string | number | boolean | null;

export type BulkPriceSourceTableRef = {
  schema: string;
  table: string;
};

export type BulkPriceSourceColumn = {
  name: string;
  dataType: string;
  isNullable: boolean;
};

export type BulkPriceSourceSampleRow = {
  index: number;
  values: Record<string, BulkPriceSerializableValue>;
};

export type BulkPriceSourceMetadataResult = {
  configured: boolean;
  databaseUrlAvailable: boolean;
  tables: BulkPriceSourceTableRef[];
  columns: BulkPriceSourceColumn[];
  sampleRows: BulkPriceSourceSampleRow[];
  requestedTable: BulkPriceSourceTableRef | null;
  fetchedAt: string;
};

export type BulkPricePreviewSourceRow = {
  matchedCode: string;
  basePrice: number | null;
  sourceSoldOut: boolean | null;
  soldOutValueError: string | null;
  raw: Record<string, BulkPriceSerializableValue>;
};

export type BulkPriceWorkDateFilterSummary = {
  enabled: boolean;
  column: string;
  startDate: string;
  endDate: string;
  excludedSourceRowCount: number;
  excludedPreviewRowCount: number;
};

export type BulkPriceRelevantSourceRowsResult = {
  rows: BulkPricePreviewSourceRow[];
  excludedSourceRowCount: number;
  excludedOnlyMatchCodes: Set<string>;
  workDateFilterSummary: BulkPriceWorkDateFilterSummary;
};

type SourceRowRecord = Record<string, unknown>;

let externalSourcePoolCache:
  | {
      url: string;
      pool: pg.Pool;
    }
  | null = null;

const SEOUL_TIME_ZONE = "Asia/Seoul";
const WORK_DATE_COLUMN_NAME_PATTERNS = [
  "작업일자",
  "작업일",
  "workdate",
  "work_date",
  "batchdate",
  "batch_date",
] as const;
const seoulDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SEOUL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toSerializableValue(value: unknown): BulkPriceSerializableValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf-8");
  }

  return String(value);
}

export function normalizeMatchCode(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value).trim() || null;
  }

  return null;
}

function normalizeColumnNameToken(value: string) {
  return value.replace(/[\s_-]+/g, "").trim().toLowerCase();
}

export function isWorkDateLikeColumnName(name: string) {
  const normalized = normalizeColumnNameToken(name);
  return WORK_DATE_COLUMN_NAME_PATTERNS.some((pattern) => {
    const normalizedPattern = normalizeColumnNameToken(pattern);
    return (
      normalized === normalizedPattern ||
      normalized.includes(normalizedPattern)
    );
  });
}

export function suggestWorkDateColumn(
  columns: Array<{ name: string }>,
) {
  return columns.find((column) => isWorkDateLikeColumnName(column.name))?.name ?? "";
}

export function getSeoulTodayDateString(date = new Date()) {
  return seoulDateFormatter.format(date);
}

export function getDefaultWorkDateRange(date = new Date()) {
  const today = getSeoulTodayDateString(date);
  return {
    startDate: today,
    endDate: today,
  };
}

function normalizeDatePartsToIso(
  year: string,
  month: string,
  day: string,
) {
  const normalizedYear = year.padStart(4, "0");
  const normalizedMonth = month.padStart(2, "0");
  const normalizedDay = day.padStart(2, "0");
  return `${normalizedYear}-${normalizedMonth}-${normalizedDay}`;
}

export function normalizeSourceWorkDateValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return getSeoulTodayDateString(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactMatch) {
      const [, year, month, day] = compactMatch;
      return normalizeDatePartsToIso(year, month, day);
    }

    const delimitedMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (delimitedMatch) {
      const [, year, month, day] = delimitedMatch;
      return normalizeDatePartsToIso(year, month, day);
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return getSeoulTodayDateString(parsed);
    }

    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return getSeoulTodayDateString(parsed);
    }
  }

  if (typeof value === "bigint") {
    const parsed = new Date(Number(value));
    if (!Number.isNaN(parsed.getTime())) {
      return getSeoulTodayDateString(parsed);
    }
  }

  return null;
}

export function normalizeWorkDateBoundaryValue(value: unknown): string | null {
  return normalizeSourceWorkDateValue(value);
}

export function parseNumericSourceValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const normalized = value.replaceAll(",", "").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

const SOLD_OUT_TRUE_VALUES = new Set([
  "true",
  "1",
  "y",
  "yes",
  "품절",
  "soldout",
  "outofstock",
  "suspended",
]);

const SOLD_OUT_FALSE_VALUES = new Set([
  "false",
  "0",
  "n",
  "no",
  "정상",
  "판매중",
  "sale",
  "onsale",
  "available",
  "instock",
]);

function normalizeSoldOutToken(value: string) {
  return value
    .replaceAll("_", "")
    .replaceAll("-", "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function isBlankSourceValue(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function parseSoldOutSourceValue(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }

  if (typeof value === "bigint") {
    if (value === BigInt(1)) {
      return true;
    }
    if (value === BigInt(0)) {
      return false;
    }
    return null;
  }

  if (typeof value === "string") {
    const normalized = normalizeSoldOutToken(value);
    if (!normalized) {
      return null;
    }
    if (SOLD_OUT_TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (SOLD_OUT_FALSE_VALUES.has(normalized)) {
      return false;
    }
  }

  return null;
}

export function quoteIdentifier(value: string) {
  if (!value.trim()) {
    throw new ApiRouteError({
      code: "INVALID_IDENTIFIER",
      message: "Identifier is required.",
      status: 400,
    });
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function parsePercentRatio(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: `${field} must be a finite number.`,
      status: 400,
    });
  }

  if (value < 0 || value >= 1) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: `${field} must be between 0 and 1.`,
      status: 400,
    });
  }
}

function isTextualSourceDataType(dataType: string | null | undefined) {
  return /char|text|uuid|citext/i.test(dataType ?? "");
}

export function validateBulkPriceRuleSet(rules: {
  feeRate: number;
  marginRate: number;
  discountRate: number;
  roundingUnit: number;
  roundingMode: string;
}) {
  parsePercentRatio(rules.feeRate, "feeRate");
  parsePercentRatio(rules.marginRate, "marginRate");
  parsePercentRatio(rules.discountRate, "discountRate");

  if (![1, 10, 100].includes(rules.roundingUnit)) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: "roundingUnit must be 1, 10, or 100.",
      status: 400,
    });
  }

  if (!["ceil", "round", "floor"].includes(rules.roundingMode)) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: "roundingMode must be ceil, round, or floor.",
      status: 400,
    });
  }

  if (rules.feeRate + rules.marginRate >= 1) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: "feeRate + marginRate must be less than 1.",
      status: 400,
    });
  }
}

export function validateBulkPriceSourceConfigBase(
  sourceConfig: BulkPriceSourceConfigBase,
) {
  if (!sourceConfig.storeId.trim()) {
    throw new ApiRouteError({
      code: "INVALID_SOURCE_CONFIG",
      message: "storeId is required.",
      status: 400,
    });
  }

  for (const [key, value] of Object.entries({
    schema: sourceConfig.schema,
    table: sourceConfig.table,
    basePriceColumn: sourceConfig.basePriceColumn,
    sourceMatchColumn: sourceConfig.sourceMatchColumn,
    workDateColumn: sourceConfig.workDateColumn,
    workDateFrom: sourceConfig.workDateFrom,
    workDateTo: sourceConfig.workDateTo,
  })) {
    if (!value.trim()) {
      throw new ApiRouteError({
        code: "INVALID_SOURCE_CONFIG",
        message: `${key} is required.`,
        status: 400,
      });
    }
  }

  const normalizedWorkDateFrom = normalizeWorkDateBoundaryValue(sourceConfig.workDateFrom);
  const normalizedWorkDateTo = normalizeWorkDateBoundaryValue(sourceConfig.workDateTo);
  if (!normalizedWorkDateFrom) {
    throw new ApiRouteError({
      code: "INVALID_SOURCE_CONFIG",
      message: "workDateFrom must be a valid date.",
      status: 400,
    });
  }
  if (!normalizedWorkDateTo) {
    throw new ApiRouteError({
      code: "INVALID_SOURCE_CONFIG",
      message: "workDateTo must be a valid date.",
      status: 400,
    });
  }
  if (normalizedWorkDateFrom > normalizedWorkDateTo) {
    throw new ApiRouteError({
      code: "INVALID_SOURCE_CONFIG",
      message: "workDateFrom must be on or before workDateTo.",
      status: 400,
    });
  }
}

function roundToUnit(value: number, unit: number, mode: string) {
  const normalizedUnit = Math.max(1, unit);
  const scaled = value / normalizedUnit;

  if (mode === "floor") {
    return Math.floor(scaled) * normalizedUnit;
  }

  if (mode === "round") {
    return Math.round(scaled) * normalizedUnit;
  }

  return Math.ceil(scaled) * normalizedUnit;
}

export function calculateBulkPriceValues(
  basePrice: number,
  rules: {
    fixedAdjustment: number;
    feeRate: number;
    marginRate: number;
    inboundShippingCost: number;
    discountRate: number;
    roundingUnit: number;
    roundingMode: string;
  },
) {
  validateBulkPriceRuleSet(rules);

  const discountedBaseCost = basePrice * (1 - rules.discountRate);
  const effectiveCost = discountedBaseCost + rules.inboundShippingCost;
  const denominator = 1 - rules.feeRate - rules.marginRate;

  if (denominator <= 0) {
    throw new ApiRouteError({
      code: "INVALID_RULE",
      message: "feeRate + marginRate must leave a positive denominator.",
      status: 400,
    });
  }

  const rawTargetPrice = effectiveCost / denominator;
  const adjustedTargetPrice = rawTargetPrice + rules.fixedAdjustment;
  const roundedTargetPrice = roundToUnit(
    adjustedTargetPrice,
    rules.roundingUnit,
    rules.roundingMode,
  );

  return {
    discountedBaseCost,
    effectiveCost,
    rawTargetPrice,
    adjustedTargetPrice,
    roundedTargetPrice,
    computedPrice: roundedTargetPrice,
  };
}

export function resolveMasterSkuDatabaseUrl(
  value = process.env.MASTER_SKU_DATABASE_URL,
) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ApiRouteError({
      code: "MASTER_SKU_DATABASE_URL_REQUIRED",
      message: "MASTER_SKU_DATABASE_URL is required.",
      status: 400,
    });
  }

  return normalized;
}

function getExternalSourcePool(databaseUrl = resolveMasterSkuDatabaseUrl()) {
  if (externalSourcePoolCache && externalSourcePoolCache.url === databaseUrl) {
    return externalSourcePoolCache.pool;
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  externalSourcePoolCache = {
    url: databaseUrl,
    pool,
  };

  return pool;
}

export async function fetchBulkPriceSourceMetadata(input: {
  schema?: string | null;
  table?: string | null;
}): Promise<BulkPriceSourceMetadataResult> {
  const pool = getExternalSourcePool();
  const tablesResult = await pool.query<{
    table_schema: string;
    table_name: string;
  }>(
    `
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('pg_catalog', 'information_schema')
      order by table_schema, table_name
    `,
  );

  const tables = tablesResult.rows.map<BulkPriceSourceTableRef>((row) => ({
    schema: row.table_schema,
    table: row.table_name,
  }));

  const schema = input.schema?.trim() ?? "";
  const table = input.table?.trim() ?? "";
  let columns: BulkPriceSourceColumn[] = [];
  let sampleRows: BulkPriceSourceSampleRow[] = [];
  let requestedTable: BulkPriceSourceTableRef | null = null;

  if (schema && table) {
    requestedTable = { schema, table };
    const tableExists = tables.some(
      (item) => item.schema === schema && item.table === table,
    );

    if (!tableExists) {
      throw new ApiRouteError({
        code: "SOURCE_TABLE_NOT_FOUND",
        message: `Table ${schema}.${table} was not found.`,
        status: 404,
      });
    }

    const columnResult = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = $1
          and table_name = $2
        order by ordinal_position
      `,
      [schema, table],
    );

    columns = columnResult.rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === "YES",
    }));

    const sampleResult = await pool.query<SourceRowRecord>(
      `select * from ${quoteIdentifier(schema)}.${quoteIdentifier(table)} limit 5`,
    );

    sampleRows = sampleResult.rows.map((row, index) => ({
      index,
      values: Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, toSerializableValue(value)]),
      ),
    }));
  }

  return {
    configured: true,
    databaseUrlAvailable: true,
    tables,
    columns,
    sampleRows,
    requestedTable,
    fetchedAt: new Date().toISOString(),
  };
}

export async function loadRelevantSourceRows(input: {
  sourceConfig: BulkPriceSourceConfigBase;
  matchCodes: string[];
  sourceMatchColumnDataType?: string | null;
  workDateFrom?: string;
  workDateTo?: string;
  batchSize?: number;
  onBatchComplete?: (progress: {
    completedBatchCount: number;
    totalBatchCount: number;
    processedMatchCodes: number;
    totalMatchCodes: number;
  }) => void;
}) {
  const pool = getExternalSourcePool();
  const fallbackRange = getDefaultWorkDateRange();
  const workDateFrom =
    input.workDateFrom ??
    normalizeWorkDateBoundaryValue(input.sourceConfig.workDateFrom) ??
    fallbackRange.startDate;
  const workDateTo =
    input.workDateTo ??
    normalizeWorkDateBoundaryValue(input.sourceConfig.workDateTo) ??
    fallbackRange.endDate;
  if (!input.matchCodes.length) {
    return {
      rows: [] as BulkPricePreviewSourceRow[],
      excludedSourceRowCount: 0,
      excludedOnlyMatchCodes: new Set<string>(),
      workDateFilterSummary: {
        enabled: true,
        column: input.sourceConfig.workDateColumn,
        startDate: workDateFrom,
        endDate: workDateTo,
        excludedSourceRowCount: 0,
        excludedPreviewRowCount: 0,
      },
    } satisfies BulkPriceRelevantSourceRowsResult;
  }

  const includedRows: BulkPricePreviewSourceRow[] = [];
  const includedMatchCodes = new Set<string>();
  const excludedMatchCodes = new Set<string>();
  let excludedSourceRowCount = 0;
  const batchSize = Math.max(1, Math.min(input.batchSize ?? input.matchCodes.length, input.matchCodes.length));
  const matchCodeBatches = Array.from(
    { length: Math.ceil(input.matchCodes.length / batchSize) },
    (_, index) => input.matchCodes.slice(index * batchSize, index * batchSize + batchSize),
  ).filter((batch) => batch.length > 0);

  const consumeRows = (rows: SourceRowRecord[]) => {
    for (const row of rows) {
      const matchedCode = normalizeMatchCode(
        row[input.sourceConfig.sourceMatchColumn],
      );

      if (!matchedCode) {
        continue;
      }

      const normalizedWorkDate = normalizeSourceWorkDateValue(
        row[input.sourceConfig.workDateColumn],
      );

      if (
        normalizedWorkDate === null ||
        normalizedWorkDate < workDateFrom ||
        normalizedWorkDate > workDateTo
      ) {
        excludedSourceRowCount += 1;
        excludedMatchCodes.add(matchedCode);
        continue;
      }

      includedMatchCodes.add(matchedCode);
      includedRows.push({
        matchedCode,
        basePrice: parseNumericSourceValue(row[input.sourceConfig.basePriceColumn]),
        sourceSoldOut: input.sourceConfig.soldOutColumn
          ? parseSoldOutSourceValue(row[input.sourceConfig.soldOutColumn])
          : null,
        soldOutValueError: input.sourceConfig.soldOutColumn
          ? isBlankSourceValue(row[input.sourceConfig.soldOutColumn])
            ? "Sold-out value is missing."
            : parseSoldOutSourceValue(row[input.sourceConfig.soldOutColumn]) === null
              ? "Sold-out value is invalid."
              : null
          : null,
        raw: Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, toSerializableValue(value)]),
        ),
      });
    }
  };

  const normalizedQuery = `
    select *
    from ${quoteIdentifier(input.sourceConfig.schema)}.${quoteIdentifier(
      input.sourceConfig.table,
    )}
    where btrim(cast(${quoteIdentifier(input.sourceConfig.sourceMatchColumn)} as text)) = any($1::text[])
  `;

  const exactQuery = `
    select *
    from ${quoteIdentifier(input.sourceConfig.schema)}.${quoteIdentifier(
      input.sourceConfig.table,
    )}
    where ${quoteIdentifier(input.sourceConfig.sourceMatchColumn)} = any($1::text[])
  `;

  for (let index = 0; index < matchCodeBatches.length; index += 1) {
    const batchMatchCodes = matchCodeBatches[index] ?? [];
    if (!isTextualSourceDataType(input.sourceMatchColumnDataType)) {
      const result = await pool.query<SourceRowRecord>(normalizedQuery, [batchMatchCodes]);
      consumeRows(result.rows);
    } else {
      const exactResult = await pool.query<SourceRowRecord>(exactQuery, [batchMatchCodes]);
      consumeRows(exactResult.rows);
      const exactMatchedCodes = new Set(
        exactResult.rows
          .map((row) => normalizeMatchCode(row[input.sourceConfig.sourceMatchColumn]))
          .filter((value): value is string => Boolean(value)),
      );
      const remainingMatchCodes = batchMatchCodes.filter(
        (code: string) => !exactMatchedCodes.has(code),
      );

      if (remainingMatchCodes.length) {
        const fallbackResult = await pool.query<SourceRowRecord>(normalizedQuery, [remainingMatchCodes]);
        consumeRows(fallbackResult.rows);
      }
    }

    input.onBatchComplete?.({
      completedBatchCount: index + 1,
      totalBatchCount: matchCodeBatches.length,
      processedMatchCodes: Math.min((index + 1) * batchSize, input.matchCodes.length),
      totalMatchCodes: input.matchCodes.length,
    });
  }

  const excludedOnlyMatchCodes = new Set(
    Array.from(excludedMatchCodes).filter((code) => !includedMatchCodes.has(code)),
  );

  return {
    rows: includedRows,
    excludedSourceRowCount,
    excludedOnlyMatchCodes,
    workDateFilterSummary: {
      enabled: true,
      column: input.sourceConfig.workDateColumn,
      startDate: workDateFrom,
      endDate: workDateTo,
      excludedSourceRowCount,
      excludedPreviewRowCount: 0,
    },
  } satisfies BulkPriceRelevantSourceRowsResult;
}
