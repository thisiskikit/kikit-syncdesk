import { sql } from "drizzle-orm";
import {
  customType,
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
  doublePrecision,
  boolean as pgBoolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{
  data: Buffer;
  driverData: Buffer;
}>({
  dataType() {
    return "bytea";
  },
});

export const channelProducts = pgTable(
  "channel_products",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    channel: text("channel").notNull(),
    channelProductId: text("channel_product_id").notNull(),
    sellerProductCode: text("seller_product_code"),
    productName: text("product_name").notNull(),
    productStatus: text("product_status"),
    rawJson: jsonb("raw_json").notNull().default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    channelProductUnique: uniqueIndex("channel_products_channel_product_uidx").on(
      table.channel,
      table.channelProductId,
    ),
  }),
);

export const channelOptions = pgTable(
  "channel_options",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid("product_id")
      .notNull()
      .references(() => channelProducts.id),
    channel: text("channel").notNull(),
    channelProductId: text("channel_product_id").notNull(),
    channelOptionId: text("channel_option_id").notNull(),
    optionName: text("option_name").notNull(),
    price: integer("price").notNull().default(0),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    saleStatus: text("sale_status").notNull().default("on_sale"),
    soldOutStatus: text("sold_out_status").notNull().default("in_stock"),
    rawJson: jsonb("raw_json").notNull().default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    channelOptionUnique: uniqueIndex("channel_options_channel_option_uidx").on(
      table.channel,
      table.channelOptionId,
    ),
  }),
);

export const skuChannelMappings = pgTable(
  "sku_channel_mappings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    channel: text("channel").notNull(),
    masterSku: text("master_sku"),
    optionSku: text("option_sku"),
    channelProductId: text("channel_product_id").notNull(),
    channelOptionId: text("channel_option_id").notNull(),
    mappingSource: text("mapping_source").notNull().default("sync"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    mappingUnique: uniqueIndex("sku_channel_mappings_channel_option_uidx").on(
      table.channel,
      table.channelOptionId,
    ),
  }),
);

export const catalogSyncRuns = pgTable("catalog_sync_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("queued"),
  summaryJson: jsonb("summary_json").notNull().default({}),
  errorText: text("error_text"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const controlDrafts = pgTable("control_drafts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("draft"),
  note: text("note"),
  csvFileName: text("csv_file_name"),
  createdBy: text("created_by").notNull().default("system"),
  summaryJson: jsonb("summary_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const controlDraftItems = pgTable("control_draft_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => controlDrafts.id),
  channel: text("channel").notNull(),
  masterSku: text("master_sku"),
  optionSku: text("option_sku"),
  channelProductId: text("channel_product_id"),
  channelOptionId: text("channel_option_id"),
  requestedPatchJson: jsonb("requested_patch_json").notNull().default({}),
  currentSnapshotJson: jsonb("current_snapshot_json"),
  validationStatus: text("validation_status").notNull().default("pending"),
  validationMessagesJson: jsonb("validation_messages_json").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const executionRuns = pgTable("execution_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => controlDrafts.id),
  retryOfRunId: uuid("retry_of_run_id"),
  status: text("status").notNull().default("queued"),
  createdBy: text("created_by").notNull().default("system"),
  summaryJson: jsonb("summary_json").notNull().default({}),
  errorText: text("error_text"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const executionItems = pgTable("execution_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id")
    .notNull()
    .references(() => executionRuns.id),
  draftItemId: uuid("draft_item_id"),
  channel: text("channel").notNull(),
  masterSku: text("master_sku"),
  optionSku: text("option_sku"),
  channelProductId: text("channel_product_id").notNull(),
  channelOptionId: text("channel_option_id").notNull(),
  requestedPatchJson: jsonb("requested_patch_json").notNull().default({}),
  beforeSnapshotJson: jsonb("before_snapshot_json"),
  afterSnapshotJson: jsonb("after_snapshot_json"),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  adapterResponseJson: jsonb("adapter_response_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const productLibraryRecords = pgTable(
  "product_library_records",
  {
    id: uuid("id").primaryKey(),
    channel: text("channel").notNull(),
    storeId: text("store_id").notNull(),
    channelProductId: text("channel_product_id").notNull(),
    secondaryChannelProductId: text("secondary_channel_product_id"),
    storeName: text("store_name").notNull(),
    productName: text("product_name").notNull(),
    sellerProductCode: text("seller_product_code"),
    status: text("status").notNull().default("review_required"),
    tagsJson: jsonb("tags_json").$type<string[]>().notNull().default([]),
    memo: text("memo").notNull().default(""),
    attachmentCount: integer("attachment_count").notNull().default(0),
    attachmentBytes: integer("attachment_bytes").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    productLibraryRecordUnique: uniqueIndex("product_library_records_channel_store_product_uidx").on(
      table.channel,
      table.storeId,
      table.channelProductId,
    ),
  }),
);

export const productLibraryAttachments = pgTable("product_library_attachments", {
  id: uuid("id").primaryKey(),
  recordId: uuid("record_id")
    .notNull()
    .references(() => productLibraryRecords.id),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  binaryData: bytea("binary_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const channelStoreSettings = pgTable("channel_store_settings", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull(),
  storeName: text("store_name").notNull(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  connectionStatus: text("connection_status").notNull().default("idle"),
  connectionTestedAt: timestamp("connection_tested_at", { withTimezone: true }),
  connectionMessage: text("connection_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coupangStoreSettings = pgTable("coupang_store_settings", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull().default("coupang"),
  storeName: text("store_name").notNull(),
  vendorId: text("vendor_id").notNull(),
  shipmentPlatformKey: text("shipment_platform_key"),
  accessKey: text("access_key").notNull(),
  secretKey: text("secret_key").notNull(),
  baseUrl: text("base_url").notNull(),
  connectionStatus: text("connection_status").notNull().default("idle"),
  connectionTestedAt: timestamp("connection_tested_at", { withTimezone: true }),
  connectionMessage: text("connection_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coupangShipmentSheets = pgTable(
  "coupang_shipment_sheets",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    source: text("source").notNull().default("live"),
    message: text("message"),
    syncStateJson: jsonb("sync_state_json").notNull().default({}),
    syncSummaryJson: jsonb("sync_summary_json"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    coupangShipmentSheetStoreUnique: uniqueIndex("coupang_shipment_sheets_store_uidx").on(
      table.storeId,
    ),
  }),
);

export const coupangShipmentRows = pgTable(
  "coupang_shipment_rows",
  {
    id: text("id").primaryKey(),
    sheetId: text("sheet_id").notNull(),
    storeId: text("store_id").notNull(),
    sourceKey: text("source_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    selpickOrderNumber: text("selpick_order_number").notNull(),
    orderDateKey: text("order_date_key").notNull(),
    orderStatus: text("order_status"),
    orderedAtRaw: text("ordered_at_raw"),
    lastOrderHydratedAt: timestamp("last_order_hydrated_at", { withTimezone: true }),
    lastProductHydratedAt: timestamp("last_product_hydrated_at", { withTimezone: true }),
    shipmentBoxId: text("shipment_box_id").notNull(),
    orderId: text("order_id").notNull(),
    sellerProductId: text("seller_product_id"),
    vendorItemId: text("vendor_item_id"),
    receiverName: text("receiver_name").notNull(),
    receiverBaseName: text("receiver_base_name"),
    personalClearanceCode: text("personal_clearance_code"),
    deliveryCompanyCode: text("delivery_company_code").notNull().default(""),
    invoiceNumber: text("invoice_number").notNull().default(""),
    invoiceTransmissionStatus: text("invoice_transmission_status"),
    invoiceTransmissionMessage: text("invoice_transmission_message"),
    invoiceTransmissionAt: timestamp("invoice_transmission_at", { withTimezone: true }),
    invoiceAppliedAt: timestamp("invoice_applied_at", { withTimezone: true }),
    exportedAt: timestamp("exported_at", { withTimezone: true }),
    rowDataJson: jsonb("row_data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    coupangShipmentRowSourceUnique: uniqueIndex("coupang_shipment_rows_source_key_uidx").on(
      table.sourceKey,
    ),
  }),
);

export const uiStateEntries = pgTable("ui_state_entries", {
  key: text("key").primaryKey(),
  valueJson: jsonb("value_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coupangProductExplorerCacheEntries = pgTable("coupang_product_explorer_cache_entries", {
  storeId: text("store_id").primaryKey(),
  snapshotJson: jsonb("snapshot_json").notNull().default({}),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coupangProductDetailCacheEntries = pgTable(
  "coupang_product_detail_cache_entries",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    sellerProductId: text("seller_product_id").notNull(),
    responseJson: jsonb("response_json").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    coupangProductDetailCacheUnique: uniqueIndex(
      "coupang_product_detail_cache_entries_store_product_uidx",
    ).on(table.storeId, table.sellerProductId),
  }),
);

export const naverProductCacheEntries = pgTable("naver_product_cache_entries", {
  storeId: text("store_id").primaryKey(),
  responseJson: jsonb("response_json").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const naverProductSellerBarcodeCacheEntries = pgTable(
  "naver_product_seller_barcode_cache_entries",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    originProductNo: text("origin_product_no").notNull(),
    sellerBarcode: text("seller_barcode").notNull(),
    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    naverProductSellerBarcodeCacheUnique: uniqueIndex(
      "naver_product_seller_barcode_cache_entries_store_origin_uidx",
    ).on(table.storeId, table.originProductNo),
  }),
);

export const naverProductMemoEntries = pgTable(
  "naver_product_memo_entries",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    originProductNo: text("origin_product_no").notNull(),
    productName: text("product_name"),
    memo: text("memo").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    naverProductMemoUnique: uniqueIndex("naver_product_memo_entries_store_origin_uidx").on(
      table.storeId,
      table.originProductNo,
    ),
  }),
);

export const naverBulkPriceSourcePresets = pgTable("naver_bulk_price_source_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  memo: text("memo").notNull().default(""),
  sourceConfigJson: jsonb("source_config_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const naverBulkPriceRulePresets = pgTable("naver_bulk_price_rule_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  memo: text("memo").notNull().default(""),
  rulesJson: jsonb("rules_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const naverBulkPriceRuns = pgTable("naver_bulk_price_runs", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  sourceConfigJson: jsonb("source_config_json").notNull().default({}),
  rulesJson: jsonb("rules_json").notNull().default({}),
  status: text("status").notNull(),
  summaryJson: jsonb("summary_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const naverBulkPriceRunItems = pgTable("naver_bulk_price_run_items", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  rowKey: text("row_key").notNull(),
  originProductNo: text("origin_product_no").notNull(),
  channelProductNo: text("channel_product_no"),
  sellerManagementCode: text("seller_management_code"),
  sellerBarcode: text("seller_barcode"),
  productName: text("product_name").notNull(),
  matchedCode: text("matched_code"),
  status: text("status").notNull(),
  messagesJson: jsonb("messages_json").notNull().default([]),
  currentPrice: integer("current_price"),
  currentStockQuantity: integer("current_stock_quantity"),
  sourceSoldOut: pgBoolean("source_sold_out"),
  currentSaleStatus: text("current_sale_status"),
  currentDisplayStatus: text("current_display_status"),
  targetStockQuantity: integer("target_stock_quantity"),
  targetSaleStatus: text("target_sale_status"),
  targetDisplayStatus: text("target_display_status"),
  saleStatusCode: text("sale_status_code"),
  saleStatusLabel: text("sale_status_label"),
  hasOptions: pgBoolean("has_options").notNull().default(false),
  optionType: text("option_type").notNull(),
  optionCount: integer("option_count").notNull().default(0),
  optionHandlingMessage: text("option_handling_message").notNull().default(""),
  basePrice: integer("base_price"),
  discountedBaseCost: doublePrecision("discounted_base_cost"),
  effectiveCost: doublePrecision("effective_cost"),
  rawTargetPrice: doublePrecision("raw_target_price"),
  adjustedTargetPrice: doublePrecision("adjusted_target_price"),
  roundedTargetPrice: integer("rounded_target_price"),
  computedPrice: integer("computed_price"),
  manualOverridePrice: integer("manual_override_price"),
  effectiveTargetPrice: integer("effective_target_price"),
  lastAppliedAt: timestamp("last_applied_at", { withTimezone: true }),
  lastAppliedPrice: integer("last_applied_price"),
  modifiedAt: timestamp("modified_at", { withTimezone: true }),
  sourceRowJson: jsonb("source_row_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const naverBulkPriceLatestRecords = pgTable(
  "naver_bulk_price_latest_records",
  {
    rowKey: text("row_key").primaryKey(),
    originProductNo: text("origin_product_no").notNull(),
    channelProductNo: text("channel_product_no"),
    sellerManagementCode: text("seller_management_code"),
    sellerBarcode: text("seller_barcode"),
    matchedCode: text("matched_code"),
    beforePrice: integer("before_price"),
    appliedPrice: integer("applied_price").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull(),
    runId: text("run_id").notNull(),
    storeId: text("store_id").notNull(),
  },
);

export const coupangBulkPriceSourcePresets = pgTable("coupang_bulk_price_source_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  memo: text("memo").notNull().default(""),
  sourceConfigJson: jsonb("source_config_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coupangBulkPriceRulePresets = pgTable("coupang_bulk_price_rule_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  memo: text("memo").notNull().default(""),
  rulesJson: jsonb("rules_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coupangBulkPriceRuns = pgTable("coupang_bulk_price_runs", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  sourceConfigJson: jsonb("source_config_json").notNull().default({}),
  rulesJson: jsonb("rules_json").notNull().default({}),
  status: text("status").notNull(),
  summaryJson: jsonb("summary_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const coupangBulkPriceRunItems = pgTable("coupang_bulk_price_run_items", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  vendorItemId: text("vendor_item_id").notNull(),
  sellerProductId: text("seller_product_id").notNull(),
  sellerProductName: text("seller_product_name").notNull(),
  itemName: text("item_name").notNull(),
  externalVendorSku: text("external_vendor_sku"),
  barcode: text("barcode"),
  matchedCode: text("matched_code"),
  status: text("status").notNull(),
  messagesJson: jsonb("messages_json").notNull().default([]),
  currentPrice: integer("current_price"),
  currentInventoryCount: integer("current_inventory_count"),
  sourceSoldOut: pgBoolean("source_sold_out"),
  currentSaleStatus: text("current_sale_status"),
  targetInventoryCount: integer("target_inventory_count"),
  targetSaleStatus: text("target_sale_status"),
  basePrice: integer("base_price"),
  discountedBaseCost: doublePrecision("discounted_base_cost"),
  effectiveCost: doublePrecision("effective_cost"),
  rawTargetPrice: doublePrecision("raw_target_price"),
  adjustedTargetPrice: doublePrecision("adjusted_target_price"),
  roundedTargetPrice: integer("rounded_target_price"),
  computedPrice: integer("computed_price"),
  manualOverridePrice: integer("manual_override_price"),
  effectiveTargetPrice: integer("effective_target_price"),
  lastAppliedAt: timestamp("last_applied_at", { withTimezone: true }),
  lastAppliedPrice: integer("last_applied_price"),
  sourceRowJson: jsonb("source_row_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const coupangBulkPriceLatestRecords = pgTable(
  "coupang_bulk_price_latest_records",
  {
    vendorItemId: text("vendor_item_id").primaryKey(),
    sellerProductId: text("seller_product_id").notNull(),
    matchedCode: text("matched_code"),
    beforePrice: integer("before_price"),
    appliedPrice: integer("applied_price").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull(),
    runId: text("run_id").notNull(),
    storeId: text("store_id").notNull(),
  },
);

export const operationLogs = pgTable("operation_logs", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull(),
  menuKey: text("menu_key").notNull(),
  actionKey: text("action_key").notNull(),
  status: text("status").notNull(),
  mode: text("mode").notNull(),
  targetType: text("target_type").notNull(),
  targetCount: integer("target_count").notNull().default(0),
  targetIdsJson: jsonb("target_ids_json").notNull().default([]),
  requestPayloadJson: jsonb("request_payload_json"),
  normalizedPayloadJson: jsonb("normalized_payload_json"),
  resultSummaryJson: jsonb("result_summary_json"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  retryable: pgBoolean("retryable").notNull().default(false),
  retryOfOperationId: text("retry_of_operation_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventLogs = pgTable("event_logs", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  channel: text("channel").notNull(),
  menuKey: text("menu_key"),
  actionKey: text("action_key"),
  level: text("level").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  metaJson: jsonb("meta_json"),
  operationId: text("operation_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const platformFieldSyncRules = pgTable("platform_field_sync_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  channel: text("channel").notNull(),
  storeId: text("store_id").notNull(),
  syncMode: text("sync_mode").notNull().default("append_distinct"),
  sourceField: text("source_field").notNull(),
  sourceMatchField: text("source_match_field"),
  targetSchema: text("target_schema").notNull(),
  targetTable: text("target_table").notNull(),
  targetColumn: text("target_column").notNull(),
  targetMatchColumn: text("target_match_column"),
  updateBehavior: text("update_behavior").notNull().default("overwrite"),
  enabled: pgBoolean("enabled").notNull().default(true),
  autoRunOnRefresh: pgBoolean("auto_run_on_refresh").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const platformFieldSyncRuns = pgTable("platform_field_sync_runs", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id")
    .notNull()
    .references(() => platformFieldSyncRules.id, { onDelete: "cascade" }),
  ruleName: text("rule_name").notNull(),
  channel: text("channel").notNull(),
  storeId: text("store_id").notNull(),
  syncMode: text("sync_mode").notNull().default("append_distinct"),
  sourceField: text("source_field").notNull(),
  sourceMatchField: text("source_match_field"),
  targetSchema: text("target_schema").notNull(),
  targetTable: text("target_table").notNull(),
  targetColumn: text("target_column").notNull(),
  targetMatchColumn: text("target_match_column"),
  updateBehavior: text("update_behavior").notNull().default("overwrite"),
  triggerMode: text("trigger_mode").notNull(),
  status: text("status").notNull(),
  summaryJson: jsonb("summary_json").notNull().default({}),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const storageImports = pgTable("storage_imports", {
  importKey: text("import_key").primaryKey(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  detailsJson: jsonb("details_json"),
});

export type InsertChannelProduct = typeof channelProducts.$inferInsert;
export type InsertChannelOption = typeof channelOptions.$inferInsert;
export type InsertSkuChannelMapping = typeof skuChannelMappings.$inferInsert;
export type InsertCatalogSyncRun = typeof catalogSyncRuns.$inferInsert;
export type InsertControlDraft = typeof controlDrafts.$inferInsert;
export type InsertControlDraftItem = typeof controlDraftItems.$inferInsert;
export type InsertExecutionRun = typeof executionRuns.$inferInsert;
export type InsertExecutionItem = typeof executionItems.$inferInsert;
export type InsertProductLibraryRecord = typeof productLibraryRecords.$inferInsert;
export type InsertProductLibraryAttachment = typeof productLibraryAttachments.$inferInsert;
export type InsertUiStateEntry = typeof uiStateEntries.$inferInsert;
export type InsertCoupangProductExplorerCacheEntry =
  typeof coupangProductExplorerCacheEntries.$inferInsert;
export type InsertCoupangProductDetailCacheEntry =
  typeof coupangProductDetailCacheEntries.$inferInsert;
export type InsertNaverProductCacheEntry = typeof naverProductCacheEntries.$inferInsert;
export type InsertNaverProductSellerBarcodeCacheEntry =
  typeof naverProductSellerBarcodeCacheEntries.$inferInsert;
export type InsertNaverProductMemoEntry = typeof naverProductMemoEntries.$inferInsert;
export type InsertChannelStoreSetting = typeof channelStoreSettings.$inferInsert;
export type InsertCoupangStoreSetting = typeof coupangStoreSettings.$inferInsert;
export type InsertCoupangShipmentSheet = typeof coupangShipmentSheets.$inferInsert;
export type InsertCoupangShipmentRow = typeof coupangShipmentRows.$inferInsert;
export type InsertNaverBulkPriceSourcePreset = typeof naverBulkPriceSourcePresets.$inferInsert;
export type InsertNaverBulkPriceRulePreset = typeof naverBulkPriceRulePresets.$inferInsert;
export type InsertNaverBulkPriceRun = typeof naverBulkPriceRuns.$inferInsert;
export type InsertNaverBulkPriceRunItem = typeof naverBulkPriceRunItems.$inferInsert;
export type InsertNaverBulkPriceLatestRecord = typeof naverBulkPriceLatestRecords.$inferInsert;
export type InsertCoupangBulkPriceSourcePreset = typeof coupangBulkPriceSourcePresets.$inferInsert;
export type InsertCoupangBulkPriceRulePreset = typeof coupangBulkPriceRulePresets.$inferInsert;
export type InsertCoupangBulkPriceRun = typeof coupangBulkPriceRuns.$inferInsert;
export type InsertCoupangBulkPriceRunItem = typeof coupangBulkPriceRunItems.$inferInsert;
export type InsertCoupangBulkPriceLatestRecord = typeof coupangBulkPriceLatestRecords.$inferInsert;
export type InsertOperationLog = typeof operationLogs.$inferInsert;
export type InsertEventLog = typeof eventLogs.$inferInsert;
export type InsertPlatformFieldSyncRule = typeof platformFieldSyncRules.$inferInsert;
export type InsertPlatformFieldSyncRun = typeof platformFieldSyncRuns.$inferInsert;
export type InsertStorageImport = typeof storageImports.$inferInsert;

export type ChannelProduct = typeof channelProducts.$inferSelect;
export type ChannelOption = typeof channelOptions.$inferSelect;
export type SkuChannelMapping = typeof skuChannelMappings.$inferSelect;
export type CatalogSyncRun = typeof catalogSyncRuns.$inferSelect;
export type ControlDraft = typeof controlDrafts.$inferSelect;
export type ControlDraftItem = typeof controlDraftItems.$inferSelect;
export type ExecutionRun = typeof executionRuns.$inferSelect;
export type ExecutionItem = typeof executionItems.$inferSelect;
export type ProductLibraryRecordRow = typeof productLibraryRecords.$inferSelect;
export type ProductLibraryAttachmentRow = typeof productLibraryAttachments.$inferSelect;
export type UiStateEntryRow = typeof uiStateEntries.$inferSelect;
export type CoupangProductExplorerCacheEntryRow =
  typeof coupangProductExplorerCacheEntries.$inferSelect;
export type CoupangProductDetailCacheEntryRow =
  typeof coupangProductDetailCacheEntries.$inferSelect;
export type NaverProductCacheEntryRow = typeof naverProductCacheEntries.$inferSelect;
export type NaverProductSellerBarcodeCacheEntryRow =
  typeof naverProductSellerBarcodeCacheEntries.$inferSelect;
export type NaverProductMemoEntryRow = typeof naverProductMemoEntries.$inferSelect;
export type ChannelStoreSettingRow = typeof channelStoreSettings.$inferSelect;
export type CoupangStoreSettingRow = typeof coupangStoreSettings.$inferSelect;
export type CoupangShipmentSheetRow = typeof coupangShipmentSheets.$inferSelect;
export type CoupangShipmentRowRow = typeof coupangShipmentRows.$inferSelect;
export type NaverBulkPriceSourcePresetRow = typeof naverBulkPriceSourcePresets.$inferSelect;
export type NaverBulkPriceRulePresetRow = typeof naverBulkPriceRulePresets.$inferSelect;
export type NaverBulkPriceRunRow = typeof naverBulkPriceRuns.$inferSelect;
export type NaverBulkPriceRunItemRow = typeof naverBulkPriceRunItems.$inferSelect;
export type NaverBulkPriceLatestRecordRow = typeof naverBulkPriceLatestRecords.$inferSelect;
export type CoupangBulkPriceSourcePresetRow = typeof coupangBulkPriceSourcePresets.$inferSelect;
export type CoupangBulkPriceRulePresetRow = typeof coupangBulkPriceRulePresets.$inferSelect;
export type CoupangBulkPriceRunRow = typeof coupangBulkPriceRuns.$inferSelect;
export type CoupangBulkPriceRunItemRow = typeof coupangBulkPriceRunItems.$inferSelect;
export type CoupangBulkPriceLatestRecordRow = typeof coupangBulkPriceLatestRecords.$inferSelect;
export type OperationLogRow = typeof operationLogs.$inferSelect;
export type EventLogRow = typeof eventLogs.$inferSelect;
export type PlatformFieldSyncRuleRow = typeof platformFieldSyncRules.$inferSelect;
export type PlatformFieldSyncRunRow = typeof platformFieldSyncRuns.$inferSelect;
export type StorageImportRow = typeof storageImports.$inferSelect;
