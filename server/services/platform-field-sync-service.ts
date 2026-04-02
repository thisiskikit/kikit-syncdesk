import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import pg from "pg";
import type { NaverProductListItem } from "@shared/naver-products";
import type { CoupangProductExplorerRow } from "@shared/coupang";
import {
  type PlatformFieldSyncChannel,
  type PlatformFieldSyncMode,
  type PlatformFieldSyncPreview,
  type PlatformFieldSyncRule,
  type PlatformFieldSyncRuleInput,
  platformFieldSyncRuleInputSchema,
  type PlatformFieldSyncRun,
  type PlatformFieldSyncRunStatus,
  type PlatformFieldSyncRunSummary,
  type PlatformFieldSyncSerializableValue,
  type PlatformFieldSyncSourceField,
  type PlatformFieldSyncTargetColumn,
  type PlatformFieldSyncTargetMetadata,
  type PlatformFieldSyncTargetSampleRow,
  type PlatformFieldSyncTargetTableRef,
  type PlatformFieldSyncTriggerMode,
  type PlatformFieldSyncUpdateBehavior,
} from "@shared/platform-field-sync";
import {
  platformFieldSyncRules,
  platformFieldSyncRuns,
  type PlatformFieldSyncRuleRow,
  type PlatformFieldSyncRunRow,
} from "@shared/schema";
import { listProductExplorer } from "./coupang/product-service";
import { fetchNaverProducts } from "./naver-product-service";
import { ApiRouteError } from "./shared/api-response";
import {
  assertWorkDataDatabaseEnabled,
  ensureWorkDataTables,
  toIsoString,
} from "./shared/work-data-db";
import { quoteIdentifier, resolveMasterSkuDatabaseUrl } from "./bulk-price/shared";

type ScalarValue = string | number | boolean;

type NormalizedSourceValue = {
  raw: ScalarValue;
  text: string;
};

type MatchedSourceValue = {
  matchRaw: ScalarValue;
  matchText: string;
  valueRaw: ScalarValue;
  valueText: string;
};

type SourceSnapshot = {
  totalSourceRows: number;
  blankValueCount: number;
  duplicateValueCount: number;
  uniqueValues: NormalizedSourceValue[];
  blankMatchCount: number;
  duplicateMatchCount: number;
  conflictingMatchCount: number;
  uniqueMatches: MatchedSourceValue[];
};

let targetDatabasePoolCache:
  | {
      url: string;
      pool: pg.Pool;
    }
  | null = null;

function getTargetDatabasePool(databaseUrl = resolveMasterSkuDatabaseUrl()) {
  if (targetDatabasePoolCache && targetDatabasePoolCache.url === databaseUrl) {
    return targetDatabasePoolCache.pool;
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  targetDatabasePoolCache = {
    url: databaseUrl,
    pool,
  };

  return pool;
}

function createEmptyRunSummary(): PlatformFieldSyncRunSummary {
  return {
    totalSourceRows: 0,
    blankValueCount: 0,
    duplicateValueCount: 0,
    uniqueValueCount: 0,
    blankMatchCount: 0,
    duplicateMatchCount: 0,
    conflictingMatchCount: 0,
    uniqueMatchCount: 0,
    existingValueCount: 0,
    matchedRowCount: 0,
    missingMatchCount: 0,
    updatedCount: 0,
    insertedCount: 0,
    unchangedCount: 0,
  };
}

function normalizeSyncMode(value: unknown): PlatformFieldSyncMode {
  return value === "update_matched" || value === "upsert_matched"
    ? value
    : "append_distinct";
}

function normalizeUpdateBehavior(value: unknown): PlatformFieldSyncUpdateBehavior {
  return value === "fill_blank_only" ? value : "overwrite";
}

function createSummaryFromSourceSnapshot(snapshot: SourceSnapshot): PlatformFieldSyncRunSummary {
  return {
    totalSourceRows: snapshot.totalSourceRows,
    blankValueCount: snapshot.blankValueCount,
    duplicateValueCount: snapshot.duplicateValueCount,
    uniqueValueCount: snapshot.uniqueValues.length,
    blankMatchCount: snapshot.blankMatchCount,
    duplicateMatchCount: snapshot.duplicateMatchCount,
    conflictingMatchCount: snapshot.conflictingMatchCount,
    uniqueMatchCount: snapshot.uniqueMatches.length,
    existingValueCount: 0,
    matchedRowCount: 0,
    missingMatchCount: 0,
    updatedCount: 0,
    insertedCount: 0,
    unchangedCount: 0,
  };
}

function mapRuleRow(row: PlatformFieldSyncRuleRow): PlatformFieldSyncRule {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel as PlatformFieldSyncRule["channel"],
    storeId: row.storeId,
    syncMode: normalizeSyncMode(row.syncMode),
    sourceField: row.sourceField as PlatformFieldSyncRule["sourceField"],
    sourceMatchField:
      (row.sourceMatchField as PlatformFieldSyncRule["sourceMatchField"]) ?? null,
    targetSchema: row.targetSchema,
    targetTable: row.targetTable,
    targetColumn: row.targetColumn,
    targetMatchColumn: row.targetMatchColumn ?? null,
    updateBehavior: normalizeUpdateBehavior(row.updateBehavior),
    enabled: row.enabled,
    autoRunOnRefresh: row.autoRunOnRefresh,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

function mapRunSummary(value: unknown): PlatformFieldSyncRunSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyRunSummary();
  }

  const record = value as Record<string, unknown>;
  const numberOrZero = (input: unknown) =>
    typeof input === "number" && Number.isFinite(input) ? input : 0;

  return {
    totalSourceRows: numberOrZero(record.totalSourceRows),
    blankValueCount: numberOrZero(record.blankValueCount),
    duplicateValueCount: numberOrZero(record.duplicateValueCount),
    uniqueValueCount: numberOrZero(record.uniqueValueCount),
    blankMatchCount: numberOrZero(record.blankMatchCount),
    duplicateMatchCount: numberOrZero(record.duplicateMatchCount),
    conflictingMatchCount: numberOrZero(record.conflictingMatchCount),
    uniqueMatchCount: numberOrZero(record.uniqueMatchCount),
    existingValueCount: numberOrZero(record.existingValueCount),
    matchedRowCount: numberOrZero(record.matchedRowCount),
    missingMatchCount: numberOrZero(record.missingMatchCount),
    updatedCount: numberOrZero(record.updatedCount),
    insertedCount: numberOrZero(record.insertedCount),
    unchangedCount: numberOrZero(record.unchangedCount),
  };
}

function mapRunRow(row: PlatformFieldSyncRunRow): PlatformFieldSyncRun {
  return {
    id: row.id,
    ruleId: row.ruleId,
    ruleName: row.ruleName,
    channel: row.channel as PlatformFieldSyncRun["channel"],
    storeId: row.storeId,
    syncMode: normalizeSyncMode(row.syncMode),
    sourceField: row.sourceField as PlatformFieldSyncRun["sourceField"],
    sourceMatchField:
      (row.sourceMatchField as PlatformFieldSyncRun["sourceMatchField"]) ?? null,
    targetSchema: row.targetSchema,
    targetTable: row.targetTable,
    targetColumn: row.targetColumn,
    targetMatchColumn: row.targetMatchColumn ?? null,
    updateBehavior: normalizeUpdateBehavior(row.updateBehavior),
    triggerMode: row.triggerMode as PlatformFieldSyncRun["triggerMode"],
    status: row.status as PlatformFieldSyncRun["status"],
    summary: mapRunSummary(row.summaryJson),
    errorMessage: row.errorMessage ?? null,
    startedAt: toIsoString(row.startedAt) ?? new Date().toISOString(),
    finishedAt: toIsoString(row.finishedAt),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

function toSerializableValue(value: unknown): PlatformFieldSyncSerializableValue {
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

function normalizeSourceValue(value: unknown): NormalizedSourceValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? { raw: trimmed, text: trimmed } : null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    return { raw: value, text: String(value) };
  }

  if (typeof value === "boolean") {
    return { raw: value, text: value ? "true" : "false" };
  }

  if (typeof value === "bigint") {
    const normalized = String(value);
    return normalized ? { raw: normalized, text: normalized } : null;
  }

  if (value instanceof Date) {
    const normalized = value.toISOString();
    return normalized ? { raw: normalized, text: normalized } : null;
  }

  const normalized = String(value).trim();
  return normalized ? { raw: normalized, text: normalized } : null;
}

function resolveBlockingColumns(
  columns: PlatformFieldSyncTargetColumn[],
  requiredInsertColumns: string[],
) {
  const normalizedColumns = Array.from(
    new Set(
      requiredInsertColumns
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (!normalizedColumns.length) {
    return [] as string[];
  }

  return columns
    .filter((column) => !normalizedColumns.includes(column.name))
    .filter(
      (column) =>
        !column.isNullable &&
        !column.hasDefault &&
        !column.isIdentity &&
        !column.isGenerated,
    )
    .map((column) => column.name);
}

async function queryTargetTables() {
  const pool = getTargetDatabasePool();
  const result = await pool.query<{
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

  return result.rows.map<PlatformFieldSyncTargetTableRef>((row) => ({
    schema: row.table_schema,
    table: row.table_name,
  }));
}

async function queryTargetColumns(input: {
  schema: string;
  table: string;
}) {
  const pool = getTargetDatabasePool();
  const result = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
    is_identity: "YES" | "NO";
    is_generated: "ALWAYS" | "NEVER";
  }>(
    `
      select
        column_name,
        data_type,
        is_nullable,
        column_default,
        is_identity,
        is_generated
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
      order by ordinal_position
    `,
    [input.schema, input.table],
  );

  return result.rows.map<PlatformFieldSyncTargetColumn>((row) => ({
    name: row.column_name,
    dataType: row.data_type,
    isNullable: row.is_nullable === "YES",
    hasDefault: Boolean(row.column_default),
    isIdentity: row.is_identity === "YES",
    isGenerated: row.is_generated === "ALWAYS",
  }));
}

async function queryTargetSampleRows(input: {
  schema: string;
  table: string;
}) {
  const pool = getTargetDatabasePool();
  const result = await pool.query<Record<string, unknown>>(
    `select * from ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)} limit 5`,
  );

  return result.rows.map<PlatformFieldSyncTargetSampleRow>((row, index) => ({
    index,
    values: Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, toSerializableValue(value)]),
    ),
  }));
}

function resolveRequiredInsertColumns(rule: Pick<
  PlatformFieldSyncRuleInput,
  "syncMode" | "targetColumn" | "targetMatchColumn"
>) {
  if (rule.syncMode === "append_distinct") {
    return [rule.targetColumn];
  }

  if (rule.syncMode === "upsert_matched") {
    return [rule.targetMatchColumn ?? "", rule.targetColumn];
  }

  return [] as string[];
}

async function ensureTargetWriteSupported(rule: PlatformFieldSyncRuleInput) {
  const metadata = await getPlatformFieldSyncTargetMetadata({
    schema: rule.targetSchema,
    table: rule.targetTable,
    syncMode: rule.syncMode,
    targetColumn: rule.targetColumn,
    targetMatchColumn: rule.targetMatchColumn,
  });

  if (!metadata.databaseUrlAvailable) {
    throw new ApiRouteError({
      code: "FIELD_SYNC_TARGET_DATABASE_UNAVAILABLE",
      message: "MASTER_SKU_DATABASE_URL is required.",
      status: 503,
    });
  }

  if (!metadata.selectedTargetColumnExists) {
    throw new ApiRouteError({
      code: "FIELD_SYNC_TARGET_COLUMN_NOT_FOUND",
      message: `Column ${rule.targetColumn} was not found.`,
      status: 400,
    });
  }

  if (rule.syncMode !== "append_distinct" && !metadata.selectedMatchColumnExists) {
    throw new ApiRouteError({
      code: "FIELD_SYNC_TARGET_MATCH_COLUMN_NOT_FOUND",
      message: `Match column ${rule.targetMatchColumn} was not found.`,
      status: 400,
    });
  }

  if (!metadata.supportsConfiguredWrite) {
    throw new ApiRouteError({
      code: "FIELD_SYNC_TARGET_TABLE_NOT_INSERTABLE",
      message:
        metadata.blockingColumns.length > 0
          ? `Table ${rule.targetSchema}.${rule.targetTable} requires additional columns: ${metadata.blockingColumns.join(", ")}`
          : `Table ${rule.targetSchema}.${rule.targetTable} cannot accept the configured write mode.`,
      status: 400,
    });
  }
}

function extractNaverSourceValue(
  item: NaverProductListItem,
  field: PlatformFieldSyncSourceField,
) {
  switch (field) {
    case "originProductNo":
      return item.originProductNo;
    case "channelProductNo":
      return item.channelProductNo;
    case "sellerManagementCode":
      return item.sellerManagementCode;
    case "sellerBarcode":
      return item.sellerBarcode;
    case "productName":
      return item.productName;
    case "saleStatusCode":
      return item.saleStatusCode;
    case "saleStatusLabel":
      return item.saleStatusLabel;
    case "displayStatusCode":
      return item.displayStatusCode;
    case "displayStatusLabel":
      return item.displayStatusLabel;
    default:
      throw new ApiRouteError({
        code: "FIELD_SYNC_INVALID_SOURCE_FIELD",
        message: `Field ${field} is not supported for NAVER.`,
        status: 400,
      });
  }
}

type CoupangSourceRow = {
  sellerProductId: string;
  sellerProductName: string;
  vendorItemId: string;
  itemName: string;
  externalVendorSku: string | null;
  barcode: string | null;
  saleStatus: string;
  brand: string | null;
  displayCategoryName: string | null;
};

function extractCoupangSourceValue(
  item: CoupangSourceRow,
  field: PlatformFieldSyncSourceField,
) {
  switch (field) {
    case "sellerProductId":
      return item.sellerProductId;
    case "sellerProductName":
      return item.sellerProductName;
    case "vendorItemId":
      return item.vendorItemId;
    case "itemName":
      return item.itemName;
    case "externalVendorSku":
      return item.externalVendorSku;
    case "barcode":
      return item.barcode;
    case "saleStatus":
      return item.saleStatus;
    case "brand":
      return item.brand;
    case "displayCategoryName":
      return item.displayCategoryName;
    default:
      throw new ApiRouteError({
        code: "FIELD_SYNC_INVALID_SOURCE_FIELD",
        message: `Field ${field} is not supported for COUPANG.`,
        status: 400,
      });
  }
}

async function loadAllCoupangSourceRows(input: {
  storeId: string;
  refreshSource: boolean;
}) {
  const firstPage = await listProductExplorer({
    storeId: input.storeId,
    refresh: input.refreshSource,
    page: 1,
    pageSize: 100,
  });

  const pages = [firstPage];
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    pages.push(
      await listProductExplorer({
        storeId: input.storeId,
        refresh: false,
        page,
        pageSize: 100,
      }),
    );
  }

  return pages.flatMap((page) =>
    page.items.flatMap<CoupangSourceRow>((row: CoupangProductExplorerRow) =>
      row.vendorItems.map((vendorItem) => ({
        sellerProductId: row.sellerProductId,
        sellerProductName: row.sellerProductName,
        vendorItemId: vendorItem.vendorItemId,
        itemName: vendorItem.itemName,
        externalVendorSku: vendorItem.externalVendorSku ?? null,
        barcode: vendorItem.barcode ?? null,
        saleStatus: vendorItem.saleStatus,
        brand: row.brand ?? null,
        displayCategoryName: row.displayCategoryName ?? null,
      })),
    ),
  );
}

function collectSourceSnapshotFromRows<Row>(input: {
  rows: Row[];
  sourceField: PlatformFieldSyncSourceField;
  sourceMatchField?: PlatformFieldSyncSourceField | null;
  syncMode: PlatformFieldSyncMode;
  readField: (row: Row, field: PlatformFieldSyncSourceField) => unknown;
}): SourceSnapshot {
  let blankValueCount = 0;
  let duplicateValueCount = 0;
  let blankMatchCount = 0;
  let duplicateMatchCount = 0;
  let conflictingMatchCount = 0;
  const uniqueValues = new Map<string, NormalizedSourceValue>();
  const uniqueMatches = new Map<string, MatchedSourceValue>();

  for (const row of input.rows) {
    const normalizedValue = normalizeSourceValue(input.readField(row, input.sourceField));
    if (!normalizedValue) {
      blankValueCount += 1;
      continue;
    }

    if (uniqueValues.has(normalizedValue.text)) {
      duplicateValueCount += 1;
    } else {
      uniqueValues.set(normalizedValue.text, normalizedValue);
    }

    if (input.syncMode === "append_distinct") {
      continue;
    }

    const normalizedMatch = normalizeSourceValue(
      input.readField(row, input.sourceMatchField ?? input.sourceField),
    );
    if (!normalizedMatch) {
      blankMatchCount += 1;
      continue;
    }

    const existingMatch = uniqueMatches.get(normalizedMatch.text);
    if (!existingMatch) {
      uniqueMatches.set(normalizedMatch.text, {
        matchRaw: normalizedMatch.raw,
        matchText: normalizedMatch.text,
        valueRaw: normalizedValue.raw,
        valueText: normalizedValue.text,
      });
      continue;
    }

    if (existingMatch.valueText === normalizedValue.text) {
      duplicateMatchCount += 1;
      continue;
    }

    conflictingMatchCount += 1;
  }

  return {
    totalSourceRows: input.rows.length,
    blankValueCount,
    duplicateValueCount,
    uniqueValues: Array.from(uniqueValues.values()),
    blankMatchCount,
    duplicateMatchCount,
    conflictingMatchCount,
    uniqueMatches: Array.from(uniqueMatches.values()),
  };
}

async function collectSourceSnapshot(input: {
  channel: PlatformFieldSyncChannel;
  storeId: string;
  syncMode: PlatformFieldSyncMode;
  sourceField: PlatformFieldSyncSourceField;
  sourceMatchField?: PlatformFieldSyncSourceField | null;
  refreshSource: boolean;
}): Promise<SourceSnapshot> {
  if (input.channel === "naver") {
    const response = await fetchNaverProducts({
      storeId: input.storeId,
      all: true,
      refresh: input.refreshSource,
      includeSellerBarcodes:
        input.sourceField === "sellerBarcode" ||
        input.sourceMatchField === "sellerBarcode",
    });

    return collectSourceSnapshotFromRows({
      rows: response.items,
      sourceField: input.sourceField,
      sourceMatchField: input.sourceMatchField,
      syncMode: input.syncMode,
      readField: extractNaverSourceValue,
    });
  }

  const rows = await loadAllCoupangSourceRows({
    storeId: input.storeId,
    refreshSource: input.refreshSource,
  });

  return collectSourceSnapshotFromRows({
    rows,
    sourceField: input.sourceField,
    sourceMatchField: input.sourceMatchField,
    syncMode: input.syncMode,
    readField: extractCoupangSourceValue,
  });
}

async function fetchExistingTargetValueTexts(input: {
  schema: string;
  table: string;
  column: string;
  texts: string[];
}) {
  const pool = getTargetDatabasePool();
  if (!input.texts.length) {
    return new Set<string>();
  }

  const existing = new Set<string>();
  const chunkSize = 500;
  for (let index = 0; index < input.texts.length; index += chunkSize) {
    const chunk = input.texts.slice(index, index + chunkSize);
    const result = await pool.query<{ value_text: string }>(
      `
        select cast(${quoteIdentifier(input.column)} as text) as value_text
        from ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)}
        where cast(${quoteIdentifier(input.column)} as text) = any($1::text[])
      `,
      [chunk],
    );

    for (const row of result.rows) {
      if (row.value_text) {
        existing.add(row.value_text);
      }
    }
  }

  return existing;
}

async function insertTargetValues(input: {
  schema: string;
  table: string;
  column: string;
  values: NormalizedSourceValue[];
}) {
  const pool = getTargetDatabasePool();
  if (!input.values.length) {
    return 0;
  }

  let insertedCount = 0;
  const chunkSize = 250;

  for (let index = 0; index < input.values.length; index += chunkSize) {
    const chunk = input.values.slice(index, index + chunkSize);
    const params = chunk.map((item) => item.raw);
    const valuesSql = chunk.map((_, itemIndex) => `($${itemIndex + 1})`).join(", ");

    await pool.query(
      `
        insert into ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)} (
          ${quoteIdentifier(input.column)}
        )
        values ${valuesSql}
      `,
      params,
    );

    insertedCount += chunk.length;
  }

  return insertedCount;
}

async function fetchTargetMatchRowCounts(input: {
  schema: string;
  table: string;
  matchColumn: string;
  matchTexts: string[];
}) {
  const pool = getTargetDatabasePool();
  const counts = new Map<string, number>();
  if (!input.matchTexts.length) {
    return counts;
  }

  const chunkSize = 500;
  for (let index = 0; index < input.matchTexts.length; index += chunkSize) {
    const chunk = input.matchTexts.slice(index, index + chunkSize);
    const result = await pool.query<{ match_text: string; row_count: string }>(
      `
        select
          cast(${quoteIdentifier(input.matchColumn)} as text) as match_text,
          count(*)::text as row_count
        from ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)}
        where cast(${quoteIdentifier(input.matchColumn)} as text) = any($1::text[])
        group by cast(${quoteIdentifier(input.matchColumn)} as text)
      `,
      [chunk],
    );

    for (const row of result.rows) {
      counts.set(row.match_text, Number(row.row_count) || 0);
    }
  }

  return counts;
}

async function updateTargetRowsForMatch(input: {
  schema: string;
  table: string;
  targetColumn: string;
  matchColumn: string;
  matchText: string;
  valueRaw: ScalarValue;
  valueText: string;
  updateBehavior: PlatformFieldSyncUpdateBehavior;
}) {
  const pool = getTargetDatabasePool();
  const targetColumnSql = quoteIdentifier(input.targetColumn);
  const matchColumnSql = quoteIdentifier(input.matchColumn);

  if (input.updateBehavior === "fill_blank_only") {
    const result = await pool.query(
      `
        update ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)}
        set ${targetColumnSql} = $1
        where cast(${matchColumnSql} as text) = $2
          and (
            ${targetColumnSql} is null
            or btrim(cast(${targetColumnSql} as text)) = ''
          )
      `,
      [input.valueRaw, input.matchText],
    );

    return result.rowCount ?? 0;
  }

  const result = await pool.query(
    `
      update ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)}
      set ${targetColumnSql} = $1
      where cast(${matchColumnSql} as text) = $2
        and cast(${targetColumnSql} as text) is distinct from $3
    `,
    [input.valueRaw, input.matchText, input.valueText],
  );

  return result.rowCount ?? 0;
}

async function insertMatchedTargetRows(input: {
  schema: string;
  table: string;
  targetColumn: string;
  matchColumn: string;
  values: MatchedSourceValue[];
}) {
  const pool = getTargetDatabasePool();
  if (!input.values.length) {
    return 0;
  }

  let insertedCount = 0;
  const chunkSize = 250;
  const matchColumnSql = quoteIdentifier(input.matchColumn);
  const targetColumnSql = quoteIdentifier(input.targetColumn);

  for (let index = 0; index < input.values.length; index += chunkSize) {
    const chunk = input.values.slice(index, index + chunkSize);
    let params: ScalarValue[] = [];
    let valuesSql = "";

    if (input.matchColumn === input.targetColumn) {
      params = chunk.map((item) => item.valueRaw);
      valuesSql = chunk.map((_, itemIndex) => `($${itemIndex + 1})`).join(", ");

      await pool.query(
        `
          insert into ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)} (
            ${targetColumnSql}
          )
          values ${valuesSql}
        `,
        params,
      );
    } else {
      params = chunk.flatMap((item) => [item.matchRaw, item.valueRaw]);
      valuesSql = chunk
        .map((_, itemIndex) => `($${itemIndex * 2 + 1}, $${itemIndex * 2 + 2})`)
        .join(", ");

      await pool.query(
        `
          insert into ${quoteIdentifier(input.schema)}.${quoteIdentifier(input.table)} (
            ${matchColumnSql},
            ${targetColumnSql}
          )
          values ${valuesSql}
        `,
        params,
      );
    }

    insertedCount += chunk.length;
  }

  return insertedCount;
}

async function getRuleById(ruleId: string) {
  await ensureWorkDataTables();
  const rows = await assertWorkDataDatabaseEnabled()
    .select()
    .from(platformFieldSyncRules)
    .where(eq(platformFieldSyncRules.id, ruleId))
    .limit(1);

  return rows[0] ? mapRuleRow(rows[0]) : null;
}

async function createRunRecord(input: {
  rule: PlatformFieldSyncRule;
  triggerMode: PlatformFieldSyncTriggerMode;
}) {
  await ensureWorkDataTables();
  const now = new Date();
  const database = assertWorkDataDatabaseEnabled();
  const id = randomUUID();

  await database.insert(platformFieldSyncRuns).values({
    id,
    ruleId: input.rule.id,
    ruleName: input.rule.name,
    channel: input.rule.channel,
    storeId: input.rule.storeId,
    syncMode: input.rule.syncMode,
    sourceField: input.rule.sourceField,
    sourceMatchField: input.rule.sourceMatchField,
    targetSchema: input.rule.targetSchema,
    targetTable: input.rule.targetTable,
    targetColumn: input.rule.targetColumn,
    targetMatchColumn: input.rule.targetMatchColumn,
    updateBehavior: input.rule.updateBehavior,
    triggerMode: input.triggerMode,
    status: "running",
    summaryJson: createEmptyRunSummary(),
    errorMessage: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const row = await assertWorkDataDatabaseEnabled()
    .select()
    .from(platformFieldSyncRuns)
    .where(eq(platformFieldSyncRuns.id, id))
    .limit(1);

  return row[0] ? mapRunRow(row[0]) : null;
}

async function updateRunRecord(input: {
  runId: string;
  status: PlatformFieldSyncRunStatus;
  summary: PlatformFieldSyncRunSummary;
  errorMessage: string | null;
}) {
  const database = assertWorkDataDatabaseEnabled();
  const now = new Date();

  await database
    .update(platformFieldSyncRuns)
    .set({
      status: input.status,
      summaryJson: input.summary,
      errorMessage: input.errorMessage,
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(platformFieldSyncRuns.id, input.runId));

  const row = await database
    .select()
    .from(platformFieldSyncRuns)
    .where(eq(platformFieldSyncRuns.id, input.runId))
    .limit(1);

  return row[0] ? mapRunRow(row[0]) : null;
}

async function hasRunningRun(ruleId: string) {
  await ensureWorkDataTables();
  const rows = await assertWorkDataDatabaseEnabled()
    .select({ id: platformFieldSyncRuns.id })
    .from(platformFieldSyncRuns)
    .where(
      and(
        eq(platformFieldSyncRuns.ruleId, ruleId),
        eq(platformFieldSyncRuns.status, "running"),
      ),
    )
    .limit(1);

  return Boolean(rows[0]);
}

export async function listPlatformFieldSyncRules() {
  await ensureWorkDataTables();
  return (
    await assertWorkDataDatabaseEnabled()
      .select()
      .from(platformFieldSyncRules)
      .orderBy(desc(platformFieldSyncRules.updatedAt))
  ).map(mapRuleRow);
}

export async function listPlatformFieldSyncRuns(input?: {
  ruleId?: string | null;
  limit?: number;
}) {
  await ensureWorkDataTables();
  const database = assertWorkDataDatabaseEnabled();
  const baseQuery = database.select().from(platformFieldSyncRuns);
  const scopedQuery = input?.ruleId
    ? baseQuery.where(eq(platformFieldSyncRuns.ruleId, input.ruleId))
    : baseQuery;
  const rows = await scopedQuery
    .orderBy(desc(platformFieldSyncRuns.startedAt))
    .limit(Math.max(1, Math.min(input?.limit ?? 20, 100)));

  return rows.map(mapRunRow);
}

export async function getPlatformFieldSyncTargetMetadata(input: {
  schema?: string | null;
  table?: string | null;
  syncMode?: PlatformFieldSyncMode | null;
  targetColumn?: string | null;
  targetMatchColumn?: string | null;
}): Promise<PlatformFieldSyncTargetMetadata> {
  let databaseUrlAvailable = true;
  try {
    resolveMasterSkuDatabaseUrl();
  } catch (error) {
    if (
      error instanceof ApiRouteError &&
      error.code === "MASTER_SKU_DATABASE_URL_REQUIRED"
    ) {
      databaseUrlAvailable = false;
    } else {
      throw error;
    }
  }

  if (!databaseUrlAvailable) {
    return {
      configured: false,
      databaseUrlAvailable: false,
      tables: [],
      columns: [],
      sampleRows: [],
      requestedTable: null,
      selectedTargetColumnExists: false,
      selectedMatchColumnExists: false,
      requiredInsertColumns: [],
      supportsConfiguredWrite: false,
      blockingColumns: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  const tables = await queryTargetTables();
  const schema = input.schema?.trim() ?? "";
  const table = input.table?.trim() ?? "";
  const syncMode = normalizeSyncMode(input.syncMode);
  const targetColumn = input.targetColumn?.trim() ?? "";
  const targetMatchColumn = input.targetMatchColumn?.trim() ?? "";

  let requestedTable: PlatformFieldSyncTargetTableRef | null = null;
  let columns: PlatformFieldSyncTargetColumn[] = [];
  let sampleRows: PlatformFieldSyncTargetSampleRow[] = [];

  if (schema && table) {
    requestedTable = { schema, table };
    const exists = tables.some((item) => item.schema === schema && item.table === table);
    if (!exists) {
      throw new ApiRouteError({
        code: "FIELD_SYNC_TARGET_TABLE_NOT_FOUND",
        message: `Table ${schema}.${table} was not found.`,
        status: 404,
      });
    }

    columns = await queryTargetColumns({ schema, table });
    sampleRows = await queryTargetSampleRows({ schema, table });
  }

  const selectedTargetColumnExists = targetColumn
    ? columns.some((column) => column.name === targetColumn)
    : false;
  const selectedMatchColumnExists =
    syncMode === "append_distinct"
      ? true
      : targetMatchColumn
        ? columns.some((column) => column.name === targetMatchColumn)
        : false;
  const requiredInsertColumns = resolveRequiredInsertColumns({
    syncMode,
    targetColumn,
    targetMatchColumn: targetMatchColumn || null,
  });
  const blockingColumns = resolveBlockingColumns(columns, requiredInsertColumns);
  const supportsConfiguredWrite =
    selectedTargetColumnExists &&
    selectedMatchColumnExists &&
    (syncMode !== "upsert_matched" || blockingColumns.length === 0);

  return {
    configured: true,
    databaseUrlAvailable: true,
    tables,
    columns,
    sampleRows,
    requestedTable,
    selectedTargetColumnExists,
    selectedMatchColumnExists,
    requiredInsertColumns,
    supportsConfiguredWrite,
    blockingColumns,
    fetchedAt: new Date().toISOString(),
  };
}

export async function previewPlatformFieldSyncRule(
  input: PlatformFieldSyncRuleInput,
): Promise<PlatformFieldSyncPreview> {
  const rule = platformFieldSyncRuleInputSchema.parse(input);
  const source = await collectSourceSnapshot({
    channel: rule.channel,
    storeId: rule.storeId,
    syncMode: rule.syncMode,
    sourceField: rule.sourceField,
    sourceMatchField: rule.sourceMatchField,
    refreshSource: false,
  });

  return {
    totalSourceRows: source.totalSourceRows,
    blankValueCount: source.blankValueCount,
    duplicateValueCount: source.duplicateValueCount,
    uniqueValueCount: source.uniqueValues.length,
    blankMatchCount: source.blankMatchCount,
    duplicateMatchCount: source.duplicateMatchCount,
    conflictingMatchCount: source.conflictingMatchCount,
    uniqueMatchCount: source.uniqueMatches.length,
    sampleValues: source.uniqueValues.slice(0, 10).map((item) => item.text),
    sampleMappings: source.uniqueMatches.slice(0, 10).map((item) => ({
      matchValue: item.matchText,
      targetValue: item.valueText,
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function savePlatformFieldSyncRule(input: {
  id?: string | null;
  rule: PlatformFieldSyncRuleInput;
}) {
  const rule = platformFieldSyncRuleInputSchema.parse(input.rule);
  await ensureTargetWriteSupported(rule);
  await ensureWorkDataTables();

  const database = assertWorkDataDatabaseEnabled();
  const now = new Date();

  if (input.id?.trim()) {
    const existing = await getRuleById(input.id);
    if (!existing) {
      throw new ApiRouteError({
        code: "FIELD_SYNC_RULE_NOT_FOUND",
        message: "Rule not found.",
        status: 404,
      });
    }

    await database
      .update(platformFieldSyncRules)
      .set({
        name: rule.name,
        channel: rule.channel,
        storeId: rule.storeId,
        syncMode: rule.syncMode,
        sourceField: rule.sourceField,
        sourceMatchField: rule.sourceMatchField,
        targetSchema: rule.targetSchema,
        targetTable: rule.targetTable,
        targetColumn: rule.targetColumn,
        targetMatchColumn: rule.targetMatchColumn,
        updateBehavior: rule.updateBehavior,
        enabled: rule.enabled,
        autoRunOnRefresh: rule.autoRunOnRefresh,
        updatedAt: now,
      })
      .where(eq(platformFieldSyncRules.id, input.id));

    const updated = await getRuleById(input.id);
    if (!updated) {
      throw new ApiRouteError({
        code: "FIELD_SYNC_RULE_SAVE_FAILED",
        message: "Failed to reload updated rule.",
        status: 500,
      });
    }

    return updated;
  }

  const id = randomUUID();
  await database.insert(platformFieldSyncRules).values({
    id,
    name: rule.name,
    channel: rule.channel,
    storeId: rule.storeId,
    syncMode: rule.syncMode,
    sourceField: rule.sourceField,
    sourceMatchField: rule.sourceMatchField,
    targetSchema: rule.targetSchema,
    targetTable: rule.targetTable,
    targetColumn: rule.targetColumn,
    targetMatchColumn: rule.targetMatchColumn,
    updateBehavior: rule.updateBehavior,
    enabled: rule.enabled,
    autoRunOnRefresh: rule.autoRunOnRefresh,
    createdAt: now,
    updatedAt: now,
  });

  const created = await getRuleById(id);
  if (!created) {
    throw new ApiRouteError({
      code: "FIELD_SYNC_RULE_SAVE_FAILED",
      message: "Failed to reload saved rule.",
      status: 500,
    });
  }

  return created;
}

export async function deletePlatformFieldSyncRule(ruleId: string) {
  await ensureWorkDataTables();
  const existing = await getRuleById(ruleId);
  if (!existing) {
    throw new ApiRouteError({
      code: "FIELD_SYNC_RULE_NOT_FOUND",
      message: "Rule not found.",
      status: 404,
    });
  }

  await assertWorkDataDatabaseEnabled()
    .delete(platformFieldSyncRules)
    .where(eq(platformFieldSyncRules.id, ruleId));

  return { id: ruleId, deleted: true };
}

export async function runPlatformFieldSyncRule(input: {
  ruleId: string;
  triggerMode: PlatformFieldSyncTriggerMode;
  refreshSource?: boolean;
}) {
  const rule = await getRuleById(input.ruleId);
  if (!rule) {
    throw new ApiRouteError({
      code: "FIELD_SYNC_RULE_NOT_FOUND",
      message: "Rule not found.",
      status: 404,
    });
  }

  if (input.triggerMode === "auto" && !rule.enabled) {
    return null;
  }

  if (await hasRunningRun(rule.id)) {
    if (input.triggerMode === "auto") {
      return null;
    }

    throw new ApiRouteError({
      code: "FIELD_SYNC_RULE_ALREADY_RUNNING",
      message: "This rule is already running.",
      status: 409,
    });
  }

  await ensureTargetWriteSupported(rule);
  const run = await createRunRecord({
    rule,
    triggerMode: input.triggerMode,
  });
  if (!run) {
    throw new ApiRouteError({
      code: "FIELD_SYNC_RUN_CREATE_FAILED",
      message: "Failed to create run.",
      status: 500,
    });
  }

  let latestSummary = createEmptyRunSummary();

  try {
    const source = await collectSourceSnapshot({
      channel: rule.channel,
      storeId: rule.storeId,
      syncMode: rule.syncMode,
      sourceField: rule.sourceField,
      sourceMatchField: rule.sourceMatchField,
      refreshSource: input.refreshSource ?? input.triggerMode === "manual",
    });

    latestSummary = createSummaryFromSourceSnapshot(source);

    if (rule.syncMode !== "append_distinct" && source.conflictingMatchCount > 0) {
      throw new ApiRouteError({
        code: "FIELD_SYNC_SOURCE_MATCH_CONFLICT",
        message:
          "The selected source match field produced conflicting values for the same key. Pick a different match field or clean the source data first.",
        status: 400,
      });
    }

    if (rule.syncMode === "append_distinct") {
      const existingTexts = await fetchExistingTargetValueTexts({
        schema: rule.targetSchema,
        table: rule.targetTable,
        column: rule.targetColumn,
        texts: source.uniqueValues.map((item) => item.text),
      });

      const valuesToInsert = source.uniqueValues.filter((item) => !existingTexts.has(item.text));
      const insertedCount = await insertTargetValues({
        schema: rule.targetSchema,
        table: rule.targetTable,
        column: rule.targetColumn,
        values: valuesToInsert,
      });

      latestSummary = {
        ...latestSummary,
        existingValueCount: existingTexts.size,
        insertedCount,
      };
    } else {
      const matchColumn = rule.targetMatchColumn ?? "";
      const matchCounts = await fetchTargetMatchRowCounts({
        schema: rule.targetSchema,
        table: rule.targetTable,
        matchColumn,
        matchTexts: source.uniqueMatches.map((item) => item.matchText),
      });

      const matchedValues = source.uniqueMatches.filter((item) => (matchCounts.get(item.matchText) ?? 0) > 0);
      const missingValues = source.uniqueMatches.filter((item) => (matchCounts.get(item.matchText) ?? 0) === 0);
      const matchedRowCount = Array.from(matchCounts.values()).reduce((sum, count) => sum + count, 0);

      let updatedCount = 0;
      for (const item of matchedValues) {
        updatedCount += await updateTargetRowsForMatch({
          schema: rule.targetSchema,
          table: rule.targetTable,
          targetColumn: rule.targetColumn,
          matchColumn,
          matchText: item.matchText,
          valueRaw: item.valueRaw,
          valueText: item.valueText,
          updateBehavior: rule.updateBehavior,
        });
      }

      let insertedCount = 0;
      if (rule.syncMode === "upsert_matched") {
        insertedCount = await insertMatchedTargetRows({
          schema: rule.targetSchema,
          table: rule.targetTable,
          targetColumn: rule.targetColumn,
          matchColumn,
          values: missingValues,
        });
      }

      latestSummary = {
        ...latestSummary,
        matchedRowCount,
        missingMatchCount: missingValues.length,
        updatedCount,
        insertedCount,
        unchangedCount: Math.max(matchedRowCount - updatedCount, 0),
      };
    }

    return await updateRunRecord({
      runId: run.id,
      status: "succeeded",
      summary: latestSummary,
      errorMessage: null,
    });
  } catch (error) {
    return await updateRunRecord({
      runId: run.id,
      status: "failed",
      summary: latestSummary,
      errorMessage: error instanceof Error ? error.message : "Field sync failed.",
    });
  }
}

export async function runEnabledPlatformFieldSyncRules(input: {
  channel?: PlatformFieldSyncChannel;
  storeId?: string;
  triggerMode: PlatformFieldSyncTriggerMode;
  refreshSource?: boolean;
}) {
  const rules = (await listPlatformFieldSyncRules()).filter((rule) =>
    input.triggerMode === "auto"
      ? rule.enabled && rule.autoRunOnRefresh
      : rule.enabled,
  );
  const filtered = rules.filter((rule) => {
    if (input.channel && rule.channel !== input.channel) {
      return false;
    }

    if (input.storeId && rule.storeId !== input.storeId) {
      return false;
    }

    return true;
  });

  const runs: PlatformFieldSyncRun[] = [];
  for (const rule of filtered) {
    const run = await runPlatformFieldSyncRule({
      ruleId: rule.id,
      triggerMode: input.triggerMode,
      refreshSource: input.refreshSource,
    });
    if (run) {
      runs.push(run);
    }
  }

  return runs;
}

export async function scheduleAutoPlatformFieldSyncRuns(input: {
  channel: PlatformFieldSyncChannel;
  storeId: string;
  refreshSource?: boolean;
}) {
  void runEnabledPlatformFieldSyncRules({
    channel: input.channel,
    storeId: input.storeId,
    triggerMode: "auto",
    refreshSource: input.refreshSource ?? true,
  }).catch(() => undefined);
}
