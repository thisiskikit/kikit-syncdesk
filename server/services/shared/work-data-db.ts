import { readFile } from "fs/promises";
import { eq, sql } from "drizzle-orm";
import { storageImports } from "@shared/schema";
import { db } from "../../storage";
import { ApiRouteError } from "./api-response";

export const WORK_DATA_DATABASE_REQUIRED_MESSAGE = "DATABASE_URL required for persistent work data";

let ensureTablesPromise: Promise<void> | null = null;
const importPromises = new Map<string, Promise<unknown>>();

const createTableStatements = [
  `
    CREATE TABLE IF NOT EXISTS storage_imports (
      import_key text PRIMARY KEY,
      imported_at timestamptz NOT NULL DEFAULT now(),
      details_json jsonb
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS channel_store_settings (
      id text PRIMARY KEY,
      channel text NOT NULL,
      store_name text NOT NULL,
      client_id text NOT NULL,
      client_secret text NOT NULL,
      connection_status text NOT NULL DEFAULT 'idle',
      connection_tested_at timestamptz,
      connection_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_store_settings (
      id text PRIMARY KEY,
      channel text NOT NULL DEFAULT 'coupang',
      store_name text NOT NULL,
      vendor_id text NOT NULL,
      shipment_platform_key text,
      access_key text NOT NULL,
      secret_key text NOT NULL,
      base_url text NOT NULL,
      connection_status text NOT NULL DEFAULT 'idle',
      connection_tested_at timestamptz,
      connection_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_shipment_sheets (
      id text PRIMARY KEY,
      store_id text NOT NULL,
      collected_at timestamptz,
      source text NOT NULL DEFAULT 'live',
      message text,
      sync_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      sync_summary_json jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS coupang_shipment_sheets_store_uidx
    ON coupang_shipment_sheets (store_id)
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_shipment_rows (
      id text PRIMARY KEY,
      sheet_id text NOT NULL REFERENCES coupang_shipment_sheets(id) ON DELETE CASCADE,
      store_id text NOT NULL,
      source_key text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      selpick_order_number text NOT NULL,
      order_date_key text NOT NULL,
      order_status text,
      ordered_at_raw text,
      last_order_hydrated_at timestamptz,
      last_product_hydrated_at timestamptz,
      shipment_box_id text NOT NULL,
      order_id text NOT NULL,
      seller_product_id text,
      vendor_item_id text,
      receiver_name text NOT NULL,
      receiver_base_name text,
      personal_clearance_code text,
      delivery_company_code text NOT NULL DEFAULT '',
      invoice_number text NOT NULL DEFAULT '',
      invoice_transmission_status text,
      invoice_transmission_message text,
      invoice_transmission_at timestamptz,
      invoice_applied_at timestamptz,
      exported_at timestamptz,
      row_data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS coupang_shipment_rows_source_key_uidx
    ON coupang_shipment_rows (source_key)
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_shipment_archive_rows (
      id text PRIMARY KEY,
      store_id text NOT NULL,
      source_key text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      selpick_order_number text NOT NULL,
      order_date_key text NOT NULL,
      order_status text,
      ordered_at_raw text,
      last_order_hydrated_at timestamptz,
      last_product_hydrated_at timestamptz,
      shipment_box_id text NOT NULL,
      order_id text NOT NULL,
      seller_product_id text,
      vendor_item_id text,
      receiver_name text NOT NULL,
      receiver_base_name text,
      personal_clearance_code text,
      delivery_company_code text NOT NULL DEFAULT '',
      invoice_number text NOT NULL DEFAULT '',
      invoice_transmission_status text,
      invoice_transmission_message text,
      invoice_transmission_at timestamptz,
      invoice_applied_at timestamptz,
      exported_at timestamptz,
      archived_at timestamptz NOT NULL DEFAULT now(),
      row_data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS coupang_shipment_archive_rows_source_key_uidx
    ON coupang_shipment_archive_rows (source_key)
  `,
  `
    CREATE TABLE IF NOT EXISTS ui_state_entries (
      key text PRIMARY KEY,
      value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_product_explorer_cache_entries (
      store_id text PRIMARY KEY,
      snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      fetched_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_product_detail_cache_entries (
      id text PRIMARY KEY,
      store_id text NOT NULL,
      seller_product_id text NOT NULL,
      response_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS coupang_product_detail_cache_entries_store_product_uidx
    ON coupang_product_detail_cache_entries (store_id, seller_product_id)
  `,
  `
    CREATE TABLE IF NOT EXISTS naver_product_cache_entries (
      store_id text PRIMARY KEY,
      response_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS naver_product_seller_barcode_cache_entries (
      id text PRIMARY KEY,
      store_id text NOT NULL,
      origin_product_no text NOT NULL,
      seller_barcode text NOT NULL,
      cached_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS naver_product_seller_barcode_cache_entries_store_origin_uidx
    ON naver_product_seller_barcode_cache_entries (store_id, origin_product_no)
  `,
  `
    CREATE TABLE IF NOT EXISTS naver_product_memo_entries (
      id text PRIMARY KEY,
      store_id text NOT NULL,
      origin_product_no text NOT NULL,
      product_name text,
      memo text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS naver_product_memo_entries_store_origin_uidx
    ON naver_product_memo_entries (store_id, origin_product_no)
  `,
  `
    CREATE TABLE IF NOT EXISTS naver_bulk_price_source_presets (
      id text PRIMARY KEY,
      name text NOT NULL,
      memo text NOT NULL DEFAULT '',
      source_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS naver_bulk_price_rule_presets (
      id text PRIMARY KEY,
      name text NOT NULL,
      memo text NOT NULL DEFAULT '',
      rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS naver_bulk_price_runs (
      id text PRIMARY KEY,
      store_id text NOT NULL,
      source_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL,
      summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      finished_at timestamptz
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS naver_bulk_price_run_items (
      id text PRIMARY KEY,
      run_id text NOT NULL REFERENCES naver_bulk_price_runs(id) ON DELETE CASCADE,
      row_key text NOT NULL,
      origin_product_no text NOT NULL,
      channel_product_no text,
      seller_management_code text,
      seller_barcode text,
      product_name text NOT NULL,
      matched_code text,
      status text NOT NULL,
      messages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      current_price integer,
      current_stock_quantity integer,
      source_sold_out boolean,
      current_sale_status text,
      current_display_status text,
      target_stock_quantity integer,
      target_sale_status text,
      target_display_status text,
      sale_status_code text,
      sale_status_label text,
      has_options boolean NOT NULL DEFAULT false,
      option_type text NOT NULL,
      option_count integer NOT NULL DEFAULT 0,
      option_handling_message text NOT NULL DEFAULT '',
      base_price integer,
      discounted_base_cost double precision,
      effective_cost double precision,
      raw_target_price double precision,
      adjusted_target_price double precision,
      rounded_target_price integer,
      computed_price integer,
      manual_override_price integer,
      effective_target_price integer,
      last_applied_at timestamptz,
      last_applied_price integer,
      modified_at timestamptz,
      source_row_json jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS naver_bulk_price_latest_records (
      row_key text PRIMARY KEY,
      origin_product_no text NOT NULL,
      channel_product_no text,
      seller_management_code text,
      seller_barcode text,
      matched_code text,
      before_price integer,
      applied_price integer NOT NULL,
      applied_at timestamptz NOT NULL,
      run_id text NOT NULL,
      store_id text NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_bulk_price_source_presets (
      id text PRIMARY KEY,
      name text NOT NULL,
      memo text NOT NULL DEFAULT '',
      source_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_bulk_price_rule_presets (
      id text PRIMARY KEY,
      name text NOT NULL,
      memo text NOT NULL DEFAULT '',
      rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_bulk_price_runs (
      id text PRIMARY KEY,
      store_id text NOT NULL,
      source_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL,
      summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      finished_at timestamptz
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_bulk_price_run_items (
      id text PRIMARY KEY,
      run_id text NOT NULL REFERENCES coupang_bulk_price_runs(id) ON DELETE CASCADE,
      vendor_item_id text NOT NULL,
      seller_product_id text NOT NULL,
      seller_product_name text NOT NULL,
      item_name text NOT NULL,
      external_vendor_sku text,
      barcode text,
      matched_code text,
      status text NOT NULL,
      messages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      current_price integer,
      current_inventory_count integer,
      source_sold_out boolean,
      current_sale_status text,
      target_inventory_count integer,
      target_sale_status text,
      base_price integer,
      discounted_base_cost double precision,
      effective_cost double precision,
      raw_target_price double precision,
      adjusted_target_price double precision,
      rounded_target_price integer,
      computed_price integer,
      manual_override_price integer,
      effective_target_price integer,
      last_applied_at timestamptz,
      last_applied_price integer,
      source_row_json jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS coupang_bulk_price_latest_records (
      vendor_item_id text PRIMARY KEY,
      seller_product_id text NOT NULL,
      matched_code text,
      before_price integer,
      applied_price integer NOT NULL,
      applied_at timestamptz NOT NULL,
      run_id text NOT NULL,
      store_id text NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS operation_logs (
      id text PRIMARY KEY,
      channel text NOT NULL,
      menu_key text NOT NULL,
      action_key text NOT NULL,
      status text NOT NULL,
      mode text NOT NULL,
      target_type text NOT NULL,
      target_count integer NOT NULL DEFAULT 0,
      target_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      request_payload_json jsonb,
      normalized_payload_json jsonb,
      result_summary_json jsonb,
      error_code text,
      error_message text,
      retryable boolean NOT NULL DEFAULT false,
      retry_of_operation_id text,
      started_at timestamptz NOT NULL,
      finished_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS event_logs (
      id text PRIMARY KEY,
      event_type text NOT NULL,
      channel text NOT NULL,
      menu_key text,
      action_key text,
      level text NOT NULL,
      status text NOT NULL,
      message text,
      meta_json jsonb,
      operation_id text,
      started_at timestamptz NOT NULL,
      finished_at timestamptz,
      duration_ms integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS platform_field_sync_rules (
      id text PRIMARY KEY,
      name text NOT NULL,
      channel text NOT NULL,
      store_id text NOT NULL,
      sync_mode text NOT NULL DEFAULT 'append_distinct',
      source_field text NOT NULL,
      source_match_field text,
      target_schema text NOT NULL,
      target_table text NOT NULL,
      target_column text NOT NULL,
      target_match_column text,
      update_behavior text NOT NULL DEFAULT 'overwrite',
      enabled boolean NOT NULL DEFAULT true,
      auto_run_on_refresh boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS platform_field_sync_runs (
      id text PRIMARY KEY,
      rule_id text NOT NULL REFERENCES platform_field_sync_rules(id) ON DELETE CASCADE,
      rule_name text NOT NULL,
      channel text NOT NULL,
      store_id text NOT NULL,
      sync_mode text NOT NULL DEFAULT 'append_distinct',
      source_field text NOT NULL,
      source_match_field text,
      target_schema text NOT NULL,
      target_table text NOT NULL,
      target_column text NOT NULL,
      target_match_column text,
      update_behavior text NOT NULL DEFAULT 'overwrite',
      trigger_mode text NOT NULL,
      status text NOT NULL,
      summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      error_message text,
      started_at timestamptz NOT NULL,
      finished_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
];

const alterTableStatements = [
  `
    ALTER TABLE naver_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS seller_barcode text
  `,
  `
    ALTER TABLE naver_bulk_price_latest_records
    ADD COLUMN IF NOT EXISTS seller_barcode text
  `,
  `
    ALTER TABLE naver_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS source_sold_out boolean
  `,
  `
    ALTER TABLE naver_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS current_stock_quantity integer
  `,
  `
    ALTER TABLE naver_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS current_sale_status text
  `,
  `
    ALTER TABLE naver_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS current_display_status text
  `,
  `
    ALTER TABLE naver_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS target_stock_quantity integer
  `,
  `
    ALTER TABLE naver_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS target_sale_status text
  `,
  `
    ALTER TABLE naver_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS target_display_status text
  `,
  `
    ALTER TABLE coupang_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS source_sold_out boolean
  `,
  `
    ALTER TABLE coupang_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS current_inventory_count integer
  `,
  `
    ALTER TABLE coupang_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS current_sale_status text
  `,
  `
    ALTER TABLE coupang_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS target_inventory_count integer
  `,
  `
    ALTER TABLE coupang_bulk_price_run_items
    ADD COLUMN IF NOT EXISTS target_sale_status text
  `,
  `
    ALTER TABLE platform_field_sync_rules
    ADD COLUMN IF NOT EXISTS sync_mode text NOT NULL DEFAULT 'append_distinct'
  `,
  `
    ALTER TABLE platform_field_sync_rules
    ADD COLUMN IF NOT EXISTS source_match_field text
  `,
  `
    ALTER TABLE platform_field_sync_rules
    ADD COLUMN IF NOT EXISTS target_match_column text
  `,
  `
    ALTER TABLE platform_field_sync_rules
    ADD COLUMN IF NOT EXISTS update_behavior text NOT NULL DEFAULT 'overwrite'
  `,
  `
    ALTER TABLE platform_field_sync_runs
    ADD COLUMN IF NOT EXISTS sync_mode text NOT NULL DEFAULT 'append_distinct'
  `,
  `
    ALTER TABLE platform_field_sync_runs
    ADD COLUMN IF NOT EXISTS source_match_field text
  `,
  `
    ALTER TABLE platform_field_sync_runs
    ADD COLUMN IF NOT EXISTS target_match_column text
  `,
  `
    ALTER TABLE platform_field_sync_runs
    ADD COLUMN IF NOT EXISTS update_behavior text NOT NULL DEFAULT 'overwrite'
  `,
];

export function assertWorkDataDatabaseEnabled() {
  if (!db) {
    throw new ApiRouteError({
      code: "WORK_DATA_DATABASE_UNAVAILABLE",
      message: WORK_DATA_DATABASE_REQUIRED_MESSAGE,
      status: 503,
    });
  }

  return db;
}

export function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

export function toDateOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function readJsonFileIfExists<T>(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : null;

    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function ensureWorkDataTables() {
  assertWorkDataDatabaseEnabled();

  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      const database = assertWorkDataDatabaseEnabled();

      for (const statement of createTableStatements) {
        await database.execute(sql.raw(statement));
      }

      for (const statement of alterTableStatements) {
        await database.execute(sql.raw(statement));
      }
    })().catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }

  await ensureTablesPromise;
}

async function hasImportRecord(importKey: string) {
  await ensureWorkDataTables();
  const database = assertWorkDataDatabaseEnabled();
  const rows = await database
    .select({ importKey: storageImports.importKey })
    .from(storageImports)
    .where(eq(storageImports.importKey, importKey))
    .limit(1);

  return Boolean(rows[0]);
}

export async function markWorkDataImport(
  importKey: string,
  details: Record<string, unknown> | null = null,
) {
  await ensureWorkDataTables();
  const database = assertWorkDataDatabaseEnabled();

  await database
    .insert(storageImports)
    .values({
      importKey,
      importedAt: new Date(),
      detailsJson: details,
    })
    .onConflictDoUpdate({
      target: storageImports.importKey,
      set: {
        importedAt: new Date(),
        detailsJson: details,
      },
    });
}

export async function runWorkDataImportOnce<T>(
  importKey: string,
  importer: () => Promise<T>,
  resolveDetails?: (result: T) => Record<string, unknown> | null,
) {
  if (!importPromises.has(importKey)) {
    importPromises.set(
      importKey,
      (async () => {
        if (await hasImportRecord(importKey)) {
          return null as T | null;
        }

        const result = await importer();
        await markWorkDataImport(importKey, resolveDetails ? resolveDetails(result) : null);
        return result;
      })().finally(() => {
        importPromises.delete(importKey);
      }),
    );
  }

  return (await importPromises.get(importKey)) as T | null;
}
