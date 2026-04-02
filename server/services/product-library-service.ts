import { randomUUID } from "crypto";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type {
  ProductLibraryAttachment,
  ProductLibraryListResponse,
  ProductLibraryRecord,
  ProductLibraryRef,
  ProductLibraryStatus,
  ProductLibrarySummary,
  UpsertProductLibraryRecordInput,
} from "@shared/product-library";
import {
  PRODUCT_LIBRARY_MAX_ATTACHMENT_BYTES,
  productLibraryChannels,
  productLibraryStatuses,
} from "@shared/product-library";
import {
  productLibraryAttachments,
  productLibraryRecords,
  type ProductLibraryAttachmentRow,
  type ProductLibraryRecordRow,
} from "@shared/schema";
import { db } from "../storage";
import { channelSettingsStore } from "./channel-settings-store";
import type { NaverProductMemoStorePort } from "../interfaces/naver-product-memo-store";
import { naverProductMemoStore } from "./naver-product-memo-store";
import { ApiRouteError } from "./shared/api-response";

const PRODUCT_LIBRARY_UPLOAD_LIMIT_BYTES = PRODUCT_LIBRARY_MAX_ATTACHMENT_BYTES + 1_048_576;
const DEFAULT_PRODUCT_LIBRARY_STATUS: ProductLibraryStatus = "review_required";

let initializePromise: Promise<void> | null = null;

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}

function normalizeStatus(value: string | null | undefined): ProductLibraryStatus {
  const normalized = normalizeText(value);

  if ((productLibraryStatuses as readonly string[]).includes(normalized)) {
    return normalized as ProductLibraryStatus;
  }

  return DEFAULT_PRODUCT_LIBRARY_STATUS;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function assertDatabaseEnabled() {
  if (!db) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_DATABASE_UNAVAILABLE",
      message: "자료실 기능을 사용하려면 DATABASE_URL 설정이 필요합니다.",
      status: 503,
    });
  }

  return db;
}

function assertProductLibraryChannel(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if ((productLibraryChannels as readonly string[]).includes(normalized)) {
    return normalized as ProductLibraryRef["channel"];
  }

  throw new ApiRouteError({
    code: "INVALID_PRODUCT_LIBRARY_CHANNEL",
    message: "지원하지 않는 채널입니다.",
    status: 400,
  });
}

function normalizeReference(input: ProductLibraryRef): ProductLibraryRef {
  const channel = assertProductLibraryChannel(input.channel);
  const storeId = normalizeText(input.storeId);
  const channelProductId = normalizeText(input.channelProductId);
  const productName = normalizeText(input.productName);

  if (!storeId) {
    throw new ApiRouteError({
      code: "MISSING_PRODUCT_LIBRARY_STORE_ID",
      message: "storeId is required.",
      status: 400,
    });
  }

  if (!channelProductId) {
    throw new ApiRouteError({
      code: "MISSING_PRODUCT_LIBRARY_CHANNEL_PRODUCT_ID",
      message: "channelProductId is required.",
      status: 400,
    });
  }

  if (!productName) {
    throw new ApiRouteError({
      code: "MISSING_PRODUCT_LIBRARY_PRODUCT_NAME",
      message: "productName is required.",
      status: 400,
    });
  }

  return {
    channel,
    storeId,
    channelProductId,
    secondaryChannelProductId: normalizeOptionalText(input.secondaryChannelProductId),
    storeName: normalizeText(input.storeName) || storeId,
    productName,
    sellerProductCode: normalizeOptionalText(input.sellerProductCode),
  };
}

function buildWhereClause(
  conditions: Array<ReturnType<typeof eq> | ReturnType<typeof ilike> | ReturnType<typeof sql>>,
) {
  if (!conditions.length) {
    return undefined;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return and(...conditions);
}

function buildMemoPreview(memo: string) {
  const normalized = memo.trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
}

function buildDownloadUrl(attachmentId: string) {
  return `/api/product-library/attachments/${attachmentId}/download`;
}

function mapAttachment(row: ProductLibraryAttachmentRow): ProductLibraryAttachment {
  return {
    id: row.id,
    recordId: row.recordId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    downloadUrl: buildDownloadUrl(row.id),
  };
}

function mapSummary(row: ProductLibraryRecordRow): ProductLibrarySummary {
  return {
    id: row.id,
    channel: assertProductLibraryChannel(row.channel),
    storeId: row.storeId,
    channelProductId: row.channelProductId,
    secondaryChannelProductId: row.secondaryChannelProductId,
    storeName: row.storeName,
    productName: row.productName,
    sellerProductCode: row.sellerProductCode,
    status: normalizeStatus(row.status),
    tags: normalizeTags(row.tagsJson),
    memoPreview: buildMemoPreview(row.memo),
    attachmentCount: row.attachmentCount,
    attachmentBytes: row.attachmentBytes,
    lastActivityAt: toIsoString(row.lastActivityAt) ?? toIsoString(row.updatedAt) ?? new Date().toISOString(),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  };
}

function buildScaffoldRecord(reference: ProductLibraryRef): ProductLibraryRecord {
  return {
    id: null,
    exists: false,
    channel: reference.channel,
    storeId: reference.storeId,
    channelProductId: reference.channelProductId,
    secondaryChannelProductId: reference.secondaryChannelProductId,
    storeName: reference.storeName,
    productName: reference.productName,
    sellerProductCode: reference.sellerProductCode,
    status: DEFAULT_PRODUCT_LIBRARY_STATUS,
    tags: [],
    memo: "",
    attachmentCount: 0,
    attachmentBytes: 0,
    attachments: [],
    lastActivityAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

function mapRecord(
  row: ProductLibraryRecordRow,
  attachments: ProductLibraryAttachment[],
): ProductLibraryRecord {
  return {
    id: row.id,
    exists: true,
    channel: assertProductLibraryChannel(row.channel),
    storeId: row.storeId,
    channelProductId: row.channelProductId,
    secondaryChannelProductId: row.secondaryChannelProductId,
    storeName: row.storeName,
    productName: row.productName,
    sellerProductCode: row.sellerProductCode,
    status: normalizeStatus(row.status),
    tags: normalizeTags(row.tagsJson),
    memo: row.memo,
    attachmentCount: row.attachmentCount,
    attachmentBytes: row.attachmentBytes,
    attachments,
    lastActivityAt: toIsoString(row.lastActivityAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

async function ensureTables() {
  const database = assertDatabaseEnabled();

  await database.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS product_library_records (
      id uuid PRIMARY KEY,
      channel text NOT NULL,
      store_id text NOT NULL,
      channel_product_id text NOT NULL,
      secondary_channel_product_id text,
      store_name text NOT NULL,
      product_name text NOT NULL,
      seller_product_code text,
      status text NOT NULL DEFAULT 'review_required',
      tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      memo text NOT NULL DEFAULT '',
      attachment_count integer NOT NULL DEFAULT 0,
      attachment_bytes integer NOT NULL DEFAULT 0,
      last_activity_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `));

  await database.execute(sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS product_library_records_channel_store_product_uidx
    ON product_library_records (channel, store_id, channel_product_id)
  `));

  await database.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS product_library_attachments (
      id uuid PRIMARY KEY,
      record_id uuid NOT NULL REFERENCES product_library_records(id) ON DELETE CASCADE,
      file_name text NOT NULL,
      mime_type text NOT NULL,
      byte_size integer NOT NULL,
      binary_data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `));
}

async function migrateLegacyNaverMemos(store = naverProductMemoStore) {
  const database = assertDatabaseEnabled();
  const legacyEntries = await store.listAll();

  if (!legacyEntries.length) {
    return;
  }

  for (const entry of legacyEntries) {
    const existingRows = await database
      .select()
      .from(productLibraryRecords)
      .where(
        and(
          eq(productLibraryRecords.channel, "naver"),
          eq(productLibraryRecords.storeId, entry.storeId),
          eq(productLibraryRecords.channelProductId, entry.originProductNo),
        ),
      )
      .limit(1);

    const existing = existingRows[0] ?? null;

    if (existing) {
      continue;
    }

    const storeRecord = await channelSettingsStore.getStore(entry.storeId);
    const timestamp = entry.updatedAt ? new Date(entry.updatedAt) : new Date();

    await database.insert(productLibraryRecords).values({
      id: randomUUID(),
      channel: "naver",
      storeId: entry.storeId,
      channelProductId: entry.originProductNo,
      secondaryChannelProductId: null,
      storeName: storeRecord?.storeName ?? entry.storeId,
      productName: entry.productName ?? entry.originProductNo,
      sellerProductCode: null,
      status: DEFAULT_PRODUCT_LIBRARY_STATUS,
      tagsJson: [],
      memo: entry.memo,
      attachmentCount: 0,
      attachmentBytes: 0,
      lastActivityAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

async function ensureInitialized() {
  assertDatabaseEnabled();

  if (!initializePromise) {
    initializePromise = (async () => {
      await ensureTables();
      await migrateLegacyNaverMemos();
    })().catch((error) => {
      initializePromise = null;
      throw error;
    });
  }

  await initializePromise;
}

async function getExistingRecord(reference: Pick<ProductLibraryRef, "channel" | "storeId" | "channelProductId">) {
  await ensureInitialized();
  const database = assertDatabaseEnabled();

  const rows = await database
    .select()
    .from(productLibraryRecords)
    .where(
      and(
        eq(productLibraryRecords.channel, reference.channel),
        eq(productLibraryRecords.storeId, reference.storeId),
        eq(productLibraryRecords.channelProductId, reference.channelProductId),
      ),
    )
    .limit(1);

  return rows[0] ?? undefined;
}

async function getAttachments(recordId: string) {
  await ensureInitialized();
  const database = assertDatabaseEnabled();

  const rows = await database
    .select({
      id: productLibraryAttachments.id,
      recordId: productLibraryAttachments.recordId,
      fileName: productLibraryAttachments.fileName,
      mimeType: productLibraryAttachments.mimeType,
      byteSize: productLibraryAttachments.byteSize,
      createdAt: productLibraryAttachments.createdAt,
    })
    .from(productLibraryAttachments)
    .where(eq(productLibraryAttachments.recordId, recordId))
    .orderBy(desc(productLibraryAttachments.createdAt));

  return rows.map((row) =>
    mapAttachment({
      ...row,
      binaryData: Buffer.alloc(0),
    } as ProductLibraryAttachmentRow),
  );
}

async function refreshAttachmentTotals(recordId: string) {
  await ensureInitialized();
  const database = assertDatabaseEnabled();

  const totals = await database
    .select({
      attachmentCount: sql<string>`count(*)`,
      attachmentBytes: sql<string>`coalesce(sum(${productLibraryAttachments.byteSize}), 0)`,
    })
    .from(productLibraryAttachments)
    .where(eq(productLibraryAttachments.recordId, recordId));

  const row = totals[0];
  const attachmentCount = row ? Number(row.attachmentCount) : 0;
  const attachmentBytes = row ? Number(row.attachmentBytes) : 0;
  const now = new Date();

  await database
    .update(productLibraryRecords)
    .set({
      attachmentCount,
      attachmentBytes,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(eq(productLibraryRecords.id, recordId));
}

export async function getProductLibraryRecord(input: ProductLibraryRef): Promise<ProductLibraryRecord> {
  const reference = normalizeReference(input);
  const existing = await getExistingRecord(reference);

  if (!existing) {
    return buildScaffoldRecord(reference);
  }

  const attachments = await getAttachments(existing.id);
  return mapRecord(existing, attachments);
}

export async function upsertProductLibraryRecord(
  input: UpsertProductLibraryRecordInput,
): Promise<ProductLibraryRecord> {
  const reference = normalizeReference(input);
  await ensureInitialized();
  const database = assertDatabaseEnabled();
  const now = new Date();
  const existing = await getExistingRecord(reference);

  if (existing) {
    await database
      .update(productLibraryRecords)
      .set({
        secondaryChannelProductId: reference.secondaryChannelProductId,
        storeName: reference.storeName,
        productName: reference.productName,
        sellerProductCode: reference.sellerProductCode,
        status: normalizeStatus(input.status),
        tagsJson: normalizeTags(input.tags),
        memo: typeof input.memo === "string" ? input.memo.trim() : "",
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(productLibraryRecords.id, existing.id));
  } else {
    await database.insert(productLibraryRecords).values({
      id: randomUUID(),
      channel: reference.channel,
      storeId: reference.storeId,
      channelProductId: reference.channelProductId,
      secondaryChannelProductId: reference.secondaryChannelProductId,
      storeName: reference.storeName,
      productName: reference.productName,
      sellerProductCode: reference.sellerProductCode,
      status: normalizeStatus(input.status),
      tagsJson: normalizeTags(input.tags),
      memo: typeof input.memo === "string" ? input.memo.trim() : "",
      attachmentCount: 0,
      attachmentBytes: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return getProductLibraryRecord(reference);
}

export async function listProductLibraryRecords(input: {
  channel?: string | null;
  storeId?: string | null;
  status?: string | null;
  search?: string | null;
  tag?: string | null;
  page: number;
  pageSize: number;
}): Promise<ProductLibraryListResponse> {
  await ensureInitialized();
  const database = assertDatabaseEnabled();
  const conditions: Array<ReturnType<typeof eq> | ReturnType<typeof ilike> | ReturnType<typeof sql>> = [];
  const channel = normalizeOptionalText(input.channel);
  const storeId = normalizeOptionalText(input.storeId);
  const status = normalizeOptionalText(input.status);
  const search = normalizeOptionalText(input.search);
  const tag = normalizeOptionalText(input.tag);
  const page = Math.max(1, Math.floor(input.page || 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize || 50)));

  if (channel) {
    conditions.push(eq(productLibraryRecords.channel, assertProductLibraryChannel(channel)));
  }

  if (storeId) {
    conditions.push(eq(productLibraryRecords.storeId, storeId));
  }

  if (status) {
    conditions.push(eq(productLibraryRecords.status, normalizeStatus(status)));
  }

  if (search) {
    const likeTerm = `%${search}%`;
    conditions.push(
      or(
        ilike(productLibraryRecords.productName, likeTerm),
        ilike(productLibraryRecords.channelProductId, likeTerm),
        ilike(productLibraryRecords.storeName, likeTerm),
        ilike(productLibraryRecords.memo, likeTerm),
        ilike(productLibraryRecords.sellerProductCode, likeTerm),
      )!,
    );
  }

  if (tag) {
    conditions.push(sql`${productLibraryRecords.tagsJson} ? ${tag}`);
  }

  const whereClause = buildWhereClause(conditions);

  const totalRows = await database
    .select({
      total: sql<string>`count(*)`,
    })
    .from(productLibraryRecords)
    .where(whereClause);

  const total = Number(totalRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;

  const rows = await database
    .select()
    .from(productLibraryRecords)
    .where(whereClause)
    .orderBy(desc(productLibraryRecords.updatedAt))
    .limit(pageSize)
    .offset(offset);

  return {
    items: rows.map(mapSummary),
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function addProductLibraryAttachment(input: {
  reference: ProductLibraryRef;
  file: File;
}): Promise<ProductLibraryRecord> {
  const reference = normalizeReference(input.reference);
  await ensureInitialized();
  const database = assertDatabaseEnabled();
  const fileName = normalizeText(input.file.name);

  if (!fileName) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_FILE_NAME_REQUIRED",
      message: "업로드할 파일을 선택해 주세요.",
      status: 400,
    });
  }

  if (input.file.size <= 0) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_EMPTY_FILE",
      message: "빈 파일은 업로드할 수 없습니다.",
      status: 400,
    });
  }

  if (input.file.size > PRODUCT_LIBRARY_MAX_ATTACHMENT_BYTES) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_FILE_TOO_LARGE",
      message: "파일 하나의 크기가 50MB를 넘을 수 없습니다.",
      status: 400,
    });
  }

  const existingRecord =
    (await getExistingRecord(reference)) ??
    (await upsertProductLibraryRecord({
      ...reference,
      status: DEFAULT_PRODUCT_LIBRARY_STATUS,
      tags: [],
      memo: "",
    }).then((record) => getExistingRecord(normalizeReference(record))))!;

  if (!existingRecord) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_RECORD_CREATE_FAILED",
      message: "자료실 레코드를 만들지 못했습니다.",
      status: 500,
    });
  }

  if (existingRecord.attachmentBytes + input.file.size > PRODUCT_LIBRARY_MAX_ATTACHMENT_BYTES) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_ATTACHMENT_LIMIT_EXCEEDED",
      message: "상품별 첨부 총용량은 50MB를 넘을 수 없습니다.",
      status: 400,
    });
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const now = new Date();

  await database.insert(productLibraryAttachments).values({
    id: randomUUID(),
    recordId: existingRecord.id,
    fileName,
    mimeType: normalizeText(input.file.type) || "application/octet-stream",
    byteSize: buffer.byteLength,
    binaryData: buffer,
    createdAt: now,
  });

  await refreshAttachmentTotals(existingRecord.id);
  return getProductLibraryRecord(reference);
}

export async function deleteProductLibraryAttachment(attachmentId: string) {
  await ensureInitialized();
  const database = assertDatabaseEnabled();
  const normalizedAttachmentId = normalizeText(attachmentId);

  if (!normalizedAttachmentId) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_ATTACHMENT_ID_REQUIRED",
      message: "attachmentId is required.",
      status: 400,
    });
  }

  const attachmentRows = await database
    .select()
    .from(productLibraryAttachments)
    .where(eq(productLibraryAttachments.id, normalizedAttachmentId))
    .limit(1);

  const attachment = attachmentRows[0] ?? null;

  if (!attachment) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_ATTACHMENT_NOT_FOUND",
      message: "첨부파일을 찾을 수 없습니다.",
      status: 404,
    });
  }

  const recordRows = await database
    .select()
    .from(productLibraryRecords)
    .where(eq(productLibraryRecords.id, attachment.recordId))
    .limit(1);

  const record = recordRows[0] ?? null;

  if (!record) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_RECORD_NOT_FOUND",
      message: "자료실 레코드를 찾을 수 없습니다.",
      status: 404,
    });
  }

  await database
    .delete(productLibraryAttachments)
    .where(eq(productLibraryAttachments.id, normalizedAttachmentId));

  await refreshAttachmentTotals(record.id);

  return getProductLibraryRecord({
    channel: assertProductLibraryChannel(record.channel),
    storeId: record.storeId,
    channelProductId: record.channelProductId,
    secondaryChannelProductId: record.secondaryChannelProductId,
    storeName: record.storeName,
    productName: record.productName,
    sellerProductCode: record.sellerProductCode,
  });
}

export async function getProductLibraryAttachmentDownload(attachmentId: string) {
  await ensureInitialized();
  const database = assertDatabaseEnabled();
  const normalizedAttachmentId = normalizeText(attachmentId);

  if (!normalizedAttachmentId) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_ATTACHMENT_ID_REQUIRED",
      message: "attachmentId is required.",
      status: 400,
    });
  }

  const attachmentRows = await database
    .select()
    .from(productLibraryAttachments)
    .where(eq(productLibraryAttachments.id, normalizedAttachmentId))
    .limit(1);

  const attachment = attachmentRows[0] ?? null;

  if (!attachment) {
    throw new ApiRouteError({
      code: "PRODUCT_LIBRARY_ATTACHMENT_NOT_FOUND",
      message: "첨부파일을 찾을 수 없습니다.",
      status: 404,
    });
  }

  return {
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    binaryData: attachment.binaryData,
  };
}

export async function listProductLibraryMemosByStore(input: {
  channel: ProductLibraryRef["channel"];
  storeId: string;
  legacyStore?: NaverProductMemoStorePort;
}) {
  const channel = assertProductLibraryChannel(input.channel);
  const storeId = normalizeText(input.storeId);

  if (!storeId) {
    return new Map<string, string>();
  }

  if (!db) {
    if (channel !== "naver") {
      return new Map<string, string>();
    }

    const legacyEntries = await (input.legacyStore ?? naverProductMemoStore).listByStore(storeId);
    return new Map(legacyEntries.map((entry) => [entry.originProductNo, entry.memo] as const));
  }

  try {
    await ensureInitialized();
    const database = assertDatabaseEnabled();
    const rows = await database
      .select({
        channelProductId: productLibraryRecords.channelProductId,
        memo: productLibraryRecords.memo,
      })
      .from(productLibraryRecords)
      .where(
        and(
          eq(productLibraryRecords.channel, channel),
          eq(productLibraryRecords.storeId, storeId),
        ),
      );

    return new Map(
      rows
        .map((row) => [row.channelProductId, row.memo.trim()] as const)
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  } catch {
    if (channel !== "naver") {
      return new Map<string, string>();
    }

    const legacyEntries = await (input.legacyStore ?? naverProductMemoStore).listByStore(storeId);
    return new Map(legacyEntries.map((entry) => [entry.originProductNo, entry.memo] as const));
  }
}

export async function saveLegacyNaverProductMemo(input: {
  storeId: string;
  originProductNo: string;
  productName?: string | null;
  memo: string;
}) {
  const store = await channelSettingsStore.getStore(input.storeId);

  if (!store || store.channel !== "naver") {
    throw new ApiRouteError({
      code: "NAVER_STORE_NOT_FOUND",
      message: "Selected store is not a NAVER store.",
      status: 400,
    });
  }

  const current = await getProductLibraryRecord({
    channel: "naver",
    storeId: input.storeId,
    channelProductId: input.originProductNo,
    secondaryChannelProductId: null,
    storeName: store.storeName,
    productName: normalizeText(input.productName) || input.originProductNo,
    sellerProductCode: null,
  });

  return upsertProductLibraryRecord({
    channel: "naver",
    storeId: current.storeId,
    channelProductId: current.channelProductId,
    secondaryChannelProductId: current.secondaryChannelProductId,
    storeName: current.storeName,
    productName: current.productName,
    sellerProductCode: current.sellerProductCode,
    status: current.status,
    tags: current.tags,
    memo: input.memo,
  });
}

export function getProductLibraryUploadLimitBytes() {
  return PRODUCT_LIBRARY_UPLOAD_LIMIT_BYTES;
}
