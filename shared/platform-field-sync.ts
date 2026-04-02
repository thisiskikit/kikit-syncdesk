import { z } from "zod";

export const platformFieldSyncChannels = ["naver", "coupang"] as const;
export type PlatformFieldSyncChannel = (typeof platformFieldSyncChannels)[number];

export const naverPlatformFieldSyncSourceFields = [
  "originProductNo",
  "channelProductNo",
  "sellerManagementCode",
  "sellerBarcode",
  "productName",
  "saleStatusCode",
  "saleStatusLabel",
  "displayStatusCode",
  "displayStatusLabel",
] as const;
export type NaverPlatformFieldSyncSourceField =
  (typeof naverPlatformFieldSyncSourceFields)[number];

export const coupangPlatformFieldSyncSourceFields = [
  "sellerProductId",
  "sellerProductName",
  "vendorItemId",
  "itemName",
  "externalVendorSku",
  "barcode",
  "saleStatus",
  "brand",
  "displayCategoryName",
] as const;
export type CoupangPlatformFieldSyncSourceField =
  (typeof coupangPlatformFieldSyncSourceFields)[number];

export const platformFieldSyncSourceFields = [
  ...naverPlatformFieldSyncSourceFields,
  ...coupangPlatformFieldSyncSourceFields,
] as const;
export type PlatformFieldSyncSourceField =
  | NaverPlatformFieldSyncSourceField
  | CoupangPlatformFieldSyncSourceField;

export const platformFieldSyncModes = [
  "append_distinct",
  "update_matched",
  "upsert_matched",
] as const;
export type PlatformFieldSyncMode = (typeof platformFieldSyncModes)[number];

export const platformFieldSyncUpdateBehaviors = ["overwrite", "fill_blank_only"] as const;
export type PlatformFieldSyncUpdateBehavior =
  (typeof platformFieldSyncUpdateBehaviors)[number];

export const platformFieldSyncRunStatuses = ["running", "succeeded", "failed"] as const;
export type PlatformFieldSyncRunStatus = (typeof platformFieldSyncRunStatuses)[number];

export const platformFieldSyncTriggerModes = ["manual", "auto"] as const;
export type PlatformFieldSyncTriggerMode = (typeof platformFieldSyncTriggerModes)[number];

const nullableSourceFieldSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value ?? null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  },
  z.enum(platformFieldSyncSourceFields).nullable(),
);

const nullableTrimmedStringSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value ?? null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  },
  z.string().max(120).nullable(),
);

export const platformFieldSyncRuleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    channel: z.enum(platformFieldSyncChannels),
    storeId: z.string().trim().min(1).max(200),
    syncMode: z.enum(platformFieldSyncModes).default("append_distinct"),
    sourceField: z.enum(platformFieldSyncSourceFields),
    sourceMatchField: nullableSourceFieldSchema.default(null),
    targetSchema: z.string().trim().min(1).max(120),
    targetTable: z.string().trim().min(1).max(120),
    targetColumn: z.string().trim().min(1).max(120),
    targetMatchColumn: nullableTrimmedStringSchema.default(null),
    updateBehavior: z
      .enum(platformFieldSyncUpdateBehaviors)
      .default("overwrite"),
    enabled: z.boolean().default(true),
    autoRunOnRefresh: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (
      value.channel === "naver" &&
      !(naverPlatformFieldSyncSourceFields as readonly string[]).includes(value.sourceField)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceField"],
        message: "sourceField is not valid for NAVER.",
      });
    }

    if (
      value.channel === "coupang" &&
      !(coupangPlatformFieldSyncSourceFields as readonly string[]).includes(value.sourceField)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceField"],
        message: "sourceField is not valid for COUPANG.",
      });
    }

    if (
      value.sourceMatchField &&
      value.channel === "naver" &&
      !(naverPlatformFieldSyncSourceFields as readonly string[]).includes(value.sourceMatchField)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceMatchField"],
        message: "sourceMatchField is not valid for NAVER.",
      });
    }

    if (
      value.sourceMatchField &&
      value.channel === "coupang" &&
      !(coupangPlatformFieldSyncSourceFields as readonly string[]).includes(
        value.sourceMatchField,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceMatchField"],
        message: "sourceMatchField is not valid for COUPANG.",
      });
    }

    if (value.syncMode !== "append_distinct" && !value.sourceMatchField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceMatchField"],
        message: "sourceMatchField is required for matched update/upsert modes.",
      });
    }

    if (value.syncMode !== "append_distinct" && !value.targetMatchColumn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetMatchColumn"],
        message: "targetMatchColumn is required for matched update/upsert modes.",
      });
    }

    if (
      value.syncMode !== "append_distinct" &&
      value.targetMatchColumn === value.targetColumn &&
      value.sourceMatchField !== value.sourceField
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetMatchColumn"],
        message:
          "When targetMatchColumn and targetColumn are the same, sourceMatchField must match sourceField.",
      });
    }
  });

export type PlatformFieldSyncRuleInput = z.infer<typeof platformFieldSyncRuleInputSchema>;

export interface PlatformFieldSyncRule extends PlatformFieldSyncRuleInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformFieldSyncRunSummary {
  totalSourceRows: number;
  blankValueCount: number;
  duplicateValueCount: number;
  uniqueValueCount: number;
  blankMatchCount: number;
  duplicateMatchCount: number;
  conflictingMatchCount: number;
  uniqueMatchCount: number;
  existingValueCount: number;
  matchedRowCount: number;
  missingMatchCount: number;
  updatedCount: number;
  insertedCount: number;
  unchangedCount: number;
}

export interface PlatformFieldSyncRun {
  id: string;
  ruleId: string;
  ruleName: string;
  channel: PlatformFieldSyncChannel;
  storeId: string;
  syncMode: PlatformFieldSyncMode;
  sourceField: PlatformFieldSyncSourceField;
  sourceMatchField: PlatformFieldSyncSourceField | null;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
  targetMatchColumn: string | null;
  updateBehavior: PlatformFieldSyncUpdateBehavior;
  triggerMode: PlatformFieldSyncTriggerMode;
  status: PlatformFieldSyncRunStatus;
  summary: PlatformFieldSyncRunSummary;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformFieldSyncPreviewMapping {
  matchValue: string;
  targetValue: string;
}

export interface PlatformFieldSyncPreview {
  totalSourceRows: number;
  blankValueCount: number;
  duplicateValueCount: number;
  uniqueValueCount: number;
  blankMatchCount: number;
  duplicateMatchCount: number;
  conflictingMatchCount: number;
  uniqueMatchCount: number;
  sampleValues: string[];
  sampleMappings: PlatformFieldSyncPreviewMapping[];
  generatedAt: string;
}

export type PlatformFieldSyncSerializableValue = string | number | boolean | null;

export interface PlatformFieldSyncTargetTableRef {
  schema: string;
  table: string;
}

export interface PlatformFieldSyncTargetColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
  isIdentity: boolean;
  isGenerated: boolean;
}

export interface PlatformFieldSyncTargetSampleRow {
  index: number;
  values: Record<string, PlatformFieldSyncSerializableValue>;
}

export interface PlatformFieldSyncTargetMetadata {
  configured: boolean;
  databaseUrlAvailable: boolean;
  tables: PlatformFieldSyncTargetTableRef[];
  columns: PlatformFieldSyncTargetColumn[];
  sampleRows: PlatformFieldSyncTargetSampleRow[];
  requestedTable: PlatformFieldSyncTargetTableRef | null;
  selectedTargetColumnExists: boolean;
  selectedMatchColumnExists: boolean;
  requiredInsertColumns: string[];
  supportsConfiguredWrite: boolean;
  blockingColumns: string[];
  fetchedAt: string;
}
