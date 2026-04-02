import { z } from "zod";

export const channelCodes = ["naver", "coupang"] as const;
export type ChannelCode = (typeof channelCodes)[number];

export const saleStatuses = ["on_sale", "sale_stopped"] as const;
export type SaleStatus = (typeof saleStatuses)[number];

export const soldOutStatuses = ["in_stock", "sold_out"] as const;
export type SoldOutStatus = (typeof soldOutStatuses)[number];

export const draftSources = ["manual", "csv", "retry"] as const;
export type DraftSource = (typeof draftSources)[number];

export const draftStatuses = ["draft", "validated", "executed"] as const;
export type DraftStatus = (typeof draftStatuses)[number];

export const validationStatuses = ["pending", "valid", "invalid"] as const;
export type ValidationStatus = (typeof validationStatuses)[number];

export const runStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "partially_succeeded",
] as const;
export type RunStatus = (typeof runStatuses)[number];

export const executionItemStatuses = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const;
export type ExecutionItemStatus = (typeof executionItemStatuses)[number];

export const controlPatchSchema = z
  .object({
    price: z.number().int().min(0).optional(),
    stockQuantity: z.number().int().min(0).optional(),
    saleStatus: z.enum(saleStatuses).optional(),
    soldOutStatus: z.enum(soldOutStatuses).optional(),
  });

export type ControlPatch = z.infer<typeof controlPatchSchema>;

export const catalogSearchQuerySchema = z.object({
  q: z.string().optional(),
  channel: z.union([z.enum(channelCodes), z.literal("all")]).optional(),
  mapped: z.enum(["all", "mapped", "unmapped"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export interface CatalogSearchQuery {
  q?: string;
  channel?: ChannelCode | "all";
  mapped?: "all" | "mapped" | "unmapped";
  limit?: number;
  offset?: number;
}

export interface CatalogOptionRow {
  id: string;
  channel: ChannelCode;
  channelProductId: string;
  channelOptionId: string;
  sellerProductCode: string | null;
  productName: string;
  optionName: string;
  price: number;
  stockQuantity: number;
  saleStatus: SaleStatus;
  soldOutStatus: SoldOutStatus;
  masterSku: string | null;
  optionSku: string | null;
  mappingSource: string | null;
  syncedAt: string;
}

export interface DraftItemInput {
  channel: ChannelCode;
  masterSku?: string | null;
  optionSku?: string | null;
  channelProductId?: string | null;
  channelOptionId?: string | null;
  requestedPatch: ControlPatch;
}

export interface DraftPreviewRow {
  draftItemId: string;
  validationStatus: ValidationStatus;
  messages: string[];
  current: CatalogOptionRow | null;
  next: {
    price: number | null;
    stockQuantity: number | null;
    saleStatus: SaleStatus | null;
    soldOutStatus: SoldOutStatus | null;
  };
}

export interface ChannelOptionTarget {
  channel: ChannelCode;
  channelProductId: string;
  channelOptionId: string;
  masterSku?: string | null;
  optionSku?: string | null;
}

export interface ChannelOptionSnapshot extends ChannelOptionTarget {
  sellerProductCode: string | null;
  productName: string;
  optionName: string;
  price: number;
  stockQuantity: number;
  saleStatus: SaleStatus;
  soldOutStatus: SoldOutStatus;
  rawJson: Record<string, unknown>;
}

export interface NormalizedChannelOption {
  channelOptionId: string;
  optionName: string;
  price: number;
  stockQuantity: number;
  saleStatus: SaleStatus;
  soldOutStatus: SoldOutStatus;
  masterSku?: string | null;
  optionSku?: string | null;
  rawJson: Record<string, unknown>;
}

export interface NormalizedChannelProduct {
  channel: ChannelCode;
  channelProductId: string;
  sellerProductCode: string | null;
  productName: string;
  productStatus: string | null;
  rawJson: Record<string, unknown>;
  options: NormalizedChannelOption[];
}

export interface CatalogPage {
  items: NormalizedChannelProduct[];
  nextCursor: string | null;
}

export interface ChannelAdapter {
  channel: ChannelCode;
  listCatalog(input: { cursor?: string | null; limit?: number }): Promise<CatalogPage>;
  getOptionSnapshot(target: ChannelOptionTarget): Promise<ChannelOptionSnapshot>;
  applyControlPatch(input: {
    target: ChannelOptionTarget;
    patch: ControlPatch;
  }): Promise<{
    before: ChannelOptionSnapshot;
    after: ChannelOptionSnapshot;
    adapterResponse: Record<string, unknown>;
  }>;
}

export interface ExecutionItemResult {
  id: string;
  runId: string;
  draftItemId: string | null;
  channel: ChannelCode;
  masterSku: string | null;
  optionSku: string | null;
  channelProductId: string;
  channelOptionId: string;
  status: ExecutionItemStatus;
  errorCode: string | null;
  errorMessage: string | null;
  beforeSnapshotJson: Record<string, unknown> | null;
  afterSnapshotJson: Record<string, unknown> | null;
  adapterResponseJson: Record<string, unknown> | null;
  requestedPatchJson: ControlPatch;
}

export interface ExecutionRunSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export function hasControlPatchValues(patch: ControlPatch) {
  return (
    patch.price !== undefined ||
    patch.stockQuantity !== undefined ||
    patch.saleStatus !== undefined ||
    patch.soldOutStatus !== undefined
  );
}

export function applyPatchToSnapshot(
  snapshot: Pick<
    ChannelOptionSnapshot,
    "price" | "stockQuantity" | "saleStatus" | "soldOutStatus"
  >,
  patch: ControlPatch,
) {
  return {
    price: patch.price ?? snapshot.price,
    stockQuantity: patch.stockQuantity ?? snapshot.stockQuantity,
    saleStatus: patch.saleStatus ?? snapshot.saleStatus,
    soldOutStatus: patch.soldOutStatus ?? snapshot.soldOutStatus,
  };
}
