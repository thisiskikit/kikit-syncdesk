import "./load-env";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type {
  CatalogSearchQuery,
  CatalogOptionRow,
  ChannelCode,
  ControlPatch,
  DraftItemInput,
  ExecutionItemResult,
  NormalizedChannelProduct,
} from "@shared/channel-control";
import type {
  CatalogSyncRun,
  ChannelOption,
  ChannelProduct,
  ControlDraft,
  ControlDraftItem,
  ExecutionItem,
  ExecutionRun,
  SkuChannelMapping,
} from "@shared/schema";
import * as schema from "@shared/schema";

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;

function now() {
  return new Date();
}

function assignDefined<T extends object>(target: T, patch: Partial<T>) {
  for (const [key, value] of Object.entries(patch) as Array<[keyof T, T[keyof T]]>) {
    if (value !== undefined) {
      target[key] = value;
    }
  }
}

function buildCatalogChannelProductKey(channel: string, channelProductId: string) {
  return `${channel}::${channelProductId}`;
}

function buildCatalogChannelOptionKey(channel: string, channelOptionId: string) {
  return `${channel}::${channelOptionId}`;
}

function buildCatalogOptionSkuKey(channel: string, optionSku: string) {
  return `${channel}::${optionSku}`;
}

type DraftItemPatch = Partial<
  Pick<
    ControlDraftItem,
    | "masterSku"
    | "optionSku"
    | "channelProductId"
    | "channelOptionId"
    | "requestedPatchJson"
    | "currentSnapshotJson"
    | "validationStatus"
    | "validationMessagesJson"
  >
>;

type CreateDraftInput = {
  source: string;
  status: string;
  note: string | null;
  csvFileName: string | null;
  createdBy: string;
  summaryJson: Record<string, unknown>;
};

type CreateExecutionRunInput = {
  draftId: string;
  retryOfRunId?: string | null;
  status: string;
  createdBy: string;
  summaryJson: Record<string, unknown>;
  errorText?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

type CreateExecutionItemInput = {
  runId: string;
  draftItemId?: string | null;
  channel: ChannelCode;
  masterSku?: string | null;
  optionSku?: string | null;
  channelProductId: string;
  channelOptionId: string;
  requestedPatchJson: ControlPatch;
  beforeSnapshotJson?: Record<string, unknown> | null;
  afterSnapshotJson?: Record<string, unknown> | null;
  status: string;
  attemptCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  adapterResponseJson?: Record<string, unknown> | null;
};

type UpdateDraftItemBatchInput = {
  id: string;
  patch: DraftItemPatch;
};

type CatalogOptionCacheEntry = {
  row: CatalogOptionRow;
  searchText: string;
};

export interface Storage {
  listCatalogOptions(filters: CatalogSearchQuery): Promise<{
    items: CatalogOptionRow[];
    total: number;
    limit: number;
    offset: number;
  }>;
  findCatalogOptionTarget(input: {
    channel: string;
    optionSku?: string | null;
    channelOptionId?: string | null;
  }): Promise<CatalogOptionRow | null>;
  findCatalogOptionByKey(input: {
    channel: string;
    channelOptionId: string;
  }): Promise<CatalogOptionRow | null>;
  listCatalogOptionsByChannelProduct(input: {
    channel: ChannelCode;
    channelProductId: string;
  }): Promise<CatalogOptionRow[]>;
  upsertCatalog(products: NormalizedChannelProduct[]): Promise<{
    productCount: number;
    optionCount: number;
    mappingCount: number;
  }>;
  createSyncRun(channel: string): Promise<CatalogSyncRun>;
  updateSyncRun(
    id: string,
    patch: Partial<
      Pick<CatalogSyncRun, "status" | "summaryJson" | "errorText" | "startedAt" | "finishedAt">
    >,
  ): Promise<CatalogSyncRun | undefined>;
  listSyncRuns(): Promise<CatalogSyncRun[]>;
  createDraft(input: CreateDraftInput): Promise<ControlDraft>;
  getDraft(id: string): Promise<ControlDraft | undefined>;
  listDraftItems(draftId: string): Promise<ControlDraftItem[]>;
  addDraftItems(draftId: string, items: DraftItemInput[]): Promise<ControlDraftItem[]>;
  updateDraft(
    id: string,
    patch: Partial<Pick<ControlDraft, "status" | "summaryJson" | "csvFileName" | "note">>,
  ): Promise<ControlDraft | undefined>;
  updateDraftItem(draftItemId: string, patch: DraftItemPatch): Promise<ControlDraftItem | undefined>;
  updateDraftItemsBatch(items: UpdateDraftItemBatchInput[]): Promise<ControlDraftItem[]>;
  createExecutionRun(input: CreateExecutionRunInput): Promise<ExecutionRun>;
  updateExecutionRun(
    id: string,
    patch: Partial<
      Pick<ExecutionRun, "status" | "summaryJson" | "errorText" | "startedAt" | "finishedAt">
    >,
  ): Promise<ExecutionRun | undefined>;
  listExecutionRuns(): Promise<ExecutionRun[]>;
  createExecutionItem(input: CreateExecutionItemInput): Promise<ExecutionItem>;
  createExecutionItemsBatch(inputs: CreateExecutionItemInput[]): Promise<ExecutionItem[]>;
  listExecutionItems(runId: string): Promise<ExecutionItem[]>;
  getExecutionRunDetail(runId: string): Promise<{
    run: ExecutionRun;
    items: ExecutionItemResult[];
  } | null>;
  getFailedExecutionItems(runId: string): Promise<ExecutionItem[]>;
  reset(): Promise<void>;
}

export class IndexedMemoryStorage implements Storage {
  private channelProductsById = new Map<string, ChannelProduct>();
  private channelProductIdsByKey = new Map<string, string>();
  private channelProductIdsInOrder: string[] = [];

  private channelOptionsById = new Map<string, ChannelOption>();
  private channelOptionIdsByKey = new Map<string, string>();
  private channelOptionIdsInOrder: string[] = [];
  private channelOptionIdsByChannelProductKey = new Map<string, string[]>();

  private skuChannelMappingsById = new Map<string, SkuChannelMapping>();
  private skuChannelMappingIdsByChannelOptionKey = new Map<string, string>();
  private skuChannelMappingIdsByOptionSkuKey = new Map<string, string>();

  private catalogOptionCacheByOptionId = new Map<string, CatalogOptionCacheEntry>();

  private catalogSyncRunsById = new Map<string, CatalogSyncRun>();
  private catalogSyncRunIdsInOrder: string[] = [];

  private controlDraftsById = new Map<string, ControlDraft>();
  private controlDraftIdsInOrder: string[] = [];
  private controlDraftItemsById = new Map<string, ControlDraftItem>();
  private controlDraftItemIdsByDraftId = new Map<string, string[]>();

  private executionRunsById = new Map<string, ExecutionRun>();
  private executionRunIdsInOrder: string[] = [];
  private executionItemsById = new Map<string, ExecutionItem>();
  private executionItemIdsByRunId = new Map<string, string[]>();

  async reset() {
    this.channelProductsById.clear();
    this.channelProductIdsByKey.clear();
    this.channelProductIdsInOrder = [];

    this.channelOptionsById.clear();
    this.channelOptionIdsByKey.clear();
    this.channelOptionIdsInOrder = [];
    this.channelOptionIdsByChannelProductKey.clear();

    this.skuChannelMappingsById.clear();
    this.skuChannelMappingIdsByChannelOptionKey.clear();
    this.skuChannelMappingIdsByOptionSkuKey.clear();

    this.catalogOptionCacheByOptionId.clear();

    this.catalogSyncRunsById.clear();
    this.catalogSyncRunIdsInOrder = [];

    this.controlDraftsById.clear();
    this.controlDraftIdsInOrder = [];
    this.controlDraftItemsById.clear();
    this.controlDraftItemIdsByDraftId.clear();

    this.executionRunsById.clear();
    this.executionRunIdsInOrder = [];
    this.executionItemsById.clear();
    this.executionItemIdsByRunId.clear();
  }

  private addToGroup(groupMap: Map<string, string[]>, key: string, id: string) {
    const items = groupMap.get(key);
    if (!items) {
      groupMap.set(key, [id]);
      return;
    }

    if (!items.includes(id)) {
      items.push(id);
    }
  }

  private removeFromGroup(groupMap: Map<string, string[]>, key: string, id: string) {
    const items = groupMap.get(key);
    if (!items) {
      return;
    }

    const nextItems = items.filter((item) => item !== id);
    if (nextItems.length === 0) {
      groupMap.delete(key);
      return;
    }

    groupMap.set(key, nextItems);
  }

  private listByIds<T>(ids: string[], source: Map<string, T>) {
    return ids
      .map((id) => source.get(id))
      .filter((item): item is T => item !== undefined);
  }

  private getSkuChannelMappingByOption(input: { channel: string; channelOptionId: string }) {
    const mappingId = this.skuChannelMappingIdsByChannelOptionKey.get(
      buildCatalogChannelOptionKey(input.channel, input.channelOptionId),
    );

    return mappingId ? (this.skuChannelMappingsById.get(mappingId) ?? null) : null;
  }

  private refreshCatalogOptionCache(optionId: string) {
    const option = this.channelOptionsById.get(optionId);
    if (!option) {
      this.catalogOptionCacheByOptionId.delete(optionId);
      return;
    }

    const product = this.channelProductsById.get(option.productId);
    if (!product) {
      this.catalogOptionCacheByOptionId.delete(optionId);
      return;
    }

    const mapping = this.getSkuChannelMappingByOption({
      channel: option.channel,
      channelOptionId: option.channelOptionId,
    });

    const row: CatalogOptionRow = {
      id: option.id,
      channel: option.channel as CatalogOptionRow["channel"],
      channelProductId: option.channelProductId,
      channelOptionId: option.channelOptionId,
      sellerProductCode: product.sellerProductCode ?? null,
      productName: product.productName,
      optionName: option.optionName,
      price: option.price,
      stockQuantity: option.stockQuantity,
      saleStatus: option.saleStatus as CatalogOptionRow["saleStatus"],
      soldOutStatus: option.soldOutStatus as CatalogOptionRow["soldOutStatus"],
      masterSku: mapping?.masterSku ?? null,
      optionSku: mapping?.optionSku ?? null,
      mappingSource: mapping?.mappingSource ?? null,
      syncedAt: option.lastSyncedAt.toISOString(),
    };

    const searchText = [
      row.productName,
      row.optionName,
      row.masterSku ?? "",
      row.optionSku ?? "",
      row.sellerProductCode ?? "",
      row.channelProductId,
      row.channelOptionId,
    ]
      .join(" ")
      .toLowerCase();

    this.catalogOptionCacheByOptionId.set(optionId, { row, searchText });
  }

  private refreshCatalogOptionsForChannelProduct(channel: string, channelProductId: string) {
    const optionIds =
      this.channelOptionIdsByChannelProductKey.get(
        buildCatalogChannelProductKey(channel, channelProductId),
      ) ?? [];

    for (const optionId of optionIds) {
      this.refreshCatalogOptionCache(optionId);
    }
  }

  async listCatalogOptions(filters: CatalogSearchQuery) {
    const q = String(filters.q || "").trim().toLowerCase();
    const limit = Math.max(1, Math.min(filters.limit || 50, 200));
    const offset = Math.max(0, filters.offset || 0);

    const matchedRows: CatalogOptionRow[] = [];
    let total = 0;

    for (const optionId of this.channelOptionIdsInOrder) {
      const cached = this.catalogOptionCacheByOptionId.get(optionId);
      if (!cached) {
        continue;
      }

      const { row, searchText } = cached;

      if (filters.channel && filters.channel !== "all" && row.channel !== filters.channel) {
        continue;
      }
      if (filters.mapped === "mapped" && !row.optionSku) {
        continue;
      }
      if (filters.mapped === "unmapped" && row.optionSku) {
        continue;
      }
      if (q && !searchText.includes(q)) {
        continue;
      }

      if (total >= offset && matchedRows.length < limit) {
        matchedRows.push(row);
      }
      total += 1;
    }

    return {
      items: matchedRows,
      total,
      limit,
      offset,
    };
  }

  async findCatalogOptionTarget(input: {
    channel: string;
    optionSku?: string | null;
    channelOptionId?: string | null;
  }) {
    if (input.optionSku) {
      const mappingId = this.skuChannelMappingIdsByOptionSkuKey.get(
        buildCatalogOptionSkuKey(input.channel, input.optionSku),
      );
      const mapping = mappingId ? this.skuChannelMappingsById.get(mappingId) : null;
      if (mapping) {
        return this.findCatalogOptionByKey({
          channel: mapping.channel,
          channelOptionId: mapping.channelOptionId,
        });
      }
    }

    if (input.channelOptionId) {
      return this.findCatalogOptionByKey({
        channel: input.channel,
        channelOptionId: input.channelOptionId,
      });
    }

    return null;
  }

  async findCatalogOptionByKey(input: { channel: string; channelOptionId: string }) {
    const optionId = this.channelOptionIdsByKey.get(
      buildCatalogChannelOptionKey(input.channel, input.channelOptionId),
    );

    if (!optionId) {
      return null;
    }

    return this.catalogOptionCacheByOptionId.get(optionId)?.row ?? null;
  }

  async listCatalogOptionsByChannelProduct(input: {
    channel: ChannelCode;
    channelProductId: string;
  }) {
    const optionIds =
      this.channelOptionIdsByChannelProductKey.get(
        buildCatalogChannelProductKey(input.channel, input.channelProductId),
      ) ?? [];

    return optionIds
      .map((optionId) => this.catalogOptionCacheByOptionId.get(optionId)?.row ?? null)
      .filter((row): row is CatalogOptionRow => row !== null)
      .sort((left, right) => {
        const productResult = left.productName.localeCompare(right.productName, "ko-KR");
        if (productResult !== 0) {
          return productResult;
        }

        const optionResult = left.optionName.localeCompare(right.optionName, "ko-KR");
        if (optionResult !== 0) {
          return optionResult;
        }

        return left.channelOptionId.localeCompare(right.channelOptionId);
      });
  }

  async upsertCatalog(products: NormalizedChannelProduct[]) {
    let productCount = 0;
    let optionCount = 0;
    let mappingCount = 0;
    const syncedAt = now();

    for (const product of products) {
      const productKey = buildCatalogChannelProductKey(product.channel, product.channelProductId);
      const existingProductId = this.channelProductIdsByKey.get(productKey);

      let storedProduct: ChannelProduct;

      if (!existingProductId) {
        storedProduct = {
          id: randomUUID(),
          channel: product.channel,
          channelProductId: product.channelProductId,
          sellerProductCode: product.sellerProductCode,
          productName: product.productName,
          productStatus: product.productStatus,
          rawJson: product.rawJson,
          lastSyncedAt: syncedAt,
          createdAt: syncedAt,
          updatedAt: syncedAt,
        };
        this.channelProductsById.set(storedProduct.id, storedProduct);
        this.channelProductIdsByKey.set(productKey, storedProduct.id);
        this.channelProductIdsInOrder.push(storedProduct.id);
      } else {
        storedProduct = this.channelProductsById.get(existingProductId)!;
        storedProduct.sellerProductCode = product.sellerProductCode;
        storedProduct.productName = product.productName;
        storedProduct.productStatus = product.productStatus;
        storedProduct.rawJson = product.rawJson;
        storedProduct.lastSyncedAt = syncedAt;
        storedProduct.updatedAt = syncedAt;
      }

      productCount += 1;

      for (const option of product.options) {
        const optionKey = buildCatalogChannelOptionKey(product.channel, option.channelOptionId);
        const existingOptionId = this.channelOptionIdsByKey.get(optionKey);

        let storedOption: ChannelOption;
        let previousChannelProductKey: string | null = null;

        if (!existingOptionId) {
          storedOption = {
            id: randomUUID(),
            productId: storedProduct.id,
            channel: product.channel,
            channelProductId: product.channelProductId,
            channelOptionId: option.channelOptionId,
            optionName: option.optionName,
            price: option.price,
            stockQuantity: option.stockQuantity,
            saleStatus: option.saleStatus,
            soldOutStatus: option.soldOutStatus,
            rawJson: option.rawJson,
            lastSyncedAt: syncedAt,
            createdAt: syncedAt,
            updatedAt: syncedAt,
          };
          this.channelOptionsById.set(storedOption.id, storedOption);
          this.channelOptionIdsByKey.set(optionKey, storedOption.id);
          this.channelOptionIdsInOrder.push(storedOption.id);
        } else {
          storedOption = this.channelOptionsById.get(existingOptionId)!;
          previousChannelProductKey = buildCatalogChannelProductKey(
            storedOption.channel,
            storedOption.channelProductId,
          );

          storedOption.productId = storedProduct.id;
          storedOption.channelProductId = product.channelProductId;
          storedOption.optionName = option.optionName;
          storedOption.price = option.price;
          storedOption.stockQuantity = option.stockQuantity;
          storedOption.saleStatus = option.saleStatus;
          storedOption.soldOutStatus = option.soldOutStatus;
          storedOption.rawJson = option.rawJson;
          storedOption.lastSyncedAt = syncedAt;
          storedOption.updatedAt = syncedAt;
        }

        const nextChannelProductKey = buildCatalogChannelProductKey(
          storedOption.channel,
          storedOption.channelProductId,
        );
        if (previousChannelProductKey && previousChannelProductKey !== nextChannelProductKey) {
          this.removeFromGroup(
            this.channelOptionIdsByChannelProductKey,
            previousChannelProductKey,
            storedOption.id,
          );
        }
        this.addToGroup(
          this.channelOptionIdsByChannelProductKey,
          nextChannelProductKey,
          storedOption.id,
        );

        optionCount += 1;

        if (option.masterSku || option.optionSku) {
          const mappingKey = buildCatalogChannelOptionKey(product.channel, option.channelOptionId);
          const existingMappingId = this.skuChannelMappingIdsByChannelOptionKey.get(mappingKey);

          let mapping: SkuChannelMapping;
          const previousOptionSku = existingMappingId
            ? (this.skuChannelMappingsById.get(existingMappingId)?.optionSku ?? null)
            : null;

          if (!existingMappingId) {
            mapping = {
              id: randomUUID(),
              channel: product.channel,
              masterSku: option.masterSku ?? null,
              optionSku: option.optionSku ?? null,
              channelProductId: product.channelProductId,
              channelOptionId: option.channelOptionId,
              mappingSource: "sync",
              createdAt: syncedAt,
              updatedAt: syncedAt,
            };
            this.skuChannelMappingsById.set(mapping.id, mapping);
            this.skuChannelMappingIdsByChannelOptionKey.set(mappingKey, mapping.id);
          } else {
            mapping = this.skuChannelMappingsById.get(existingMappingId)!;
            mapping.masterSku = option.masterSku ?? null;
            mapping.optionSku = option.optionSku ?? null;
            mapping.channelProductId = product.channelProductId;
            mapping.mappingSource = "sync";
            mapping.updatedAt = syncedAt;
          }

          if (previousOptionSku) {
            this.skuChannelMappingIdsByOptionSkuKey.delete(
              buildCatalogOptionSkuKey(product.channel, previousOptionSku),
            );
          }
          if (mapping.optionSku) {
            this.skuChannelMappingIdsByOptionSkuKey.set(
              buildCatalogOptionSkuKey(product.channel, mapping.optionSku),
              mapping.id,
            );
          }

          mappingCount += 1;
        }

        this.refreshCatalogOptionCache(storedOption.id);
      }

      this.refreshCatalogOptionsForChannelProduct(
        storedProduct.channel,
        storedProduct.channelProductId,
      );
    }

    return { productCount, optionCount, mappingCount };
  }

  async createSyncRun(channel: string) {
    const run: CatalogSyncRun = {
      id: randomUUID(),
      channel,
      status: "queued",
      summaryJson: {},
      errorText: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now(),
    };

    this.catalogSyncRunsById.set(run.id, run);
    this.catalogSyncRunIdsInOrder.unshift(run.id);
    return run;
  }

  async updateSyncRun(
    id: string,
    patch: Partial<
      Pick<CatalogSyncRun, "status" | "summaryJson" | "errorText" | "startedAt" | "finishedAt">
    >,
  ) {
    const run = this.catalogSyncRunsById.get(id);
    if (!run) {
      return undefined;
    }

    assignDefined(run, patch);
    return run;
  }

  async listSyncRuns() {
    return this.listByIds(this.catalogSyncRunIdsInOrder, this.catalogSyncRunsById);
  }

  async createDraft(input: CreateDraftInput) {
    const timestamp = now();
    const draft: ControlDraft = {
      id: randomUUID(),
      source: input.source,
      status: input.status,
      note: input.note ?? null,
      csvFileName: input.csvFileName ?? null,
      createdBy: input.createdBy,
      summaryJson: (input.summaryJson as Record<string, unknown> | null) ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.controlDraftsById.set(draft.id, draft);
    this.controlDraftIdsInOrder.unshift(draft.id);
    this.controlDraftItemIdsByDraftId.set(draft.id, []);
    return draft;
  }

  async getDraft(id: string) {
    return this.controlDraftsById.get(id);
  }

  async listDraftItems(draftId: string) {
    return this.listByIds(
      this.controlDraftItemIdsByDraftId.get(draftId) ?? [],
      this.controlDraftItemsById,
    );
  }

  async addDraftItems(draftId: string, items: DraftItemInput[]) {
    const timestamp = now();
    const existingIds = this.controlDraftItemIdsByDraftId.get(draftId) ?? [];
    const created = items.map<ControlDraftItem>((item) => {
      const row: ControlDraftItem = {
        id: randomUUID(),
        draftId,
        channel: item.channel,
        masterSku: item.masterSku ?? null,
        optionSku: item.optionSku ?? null,
        channelProductId: item.channelProductId ?? null,
        channelOptionId: item.channelOptionId ?? null,
        requestedPatchJson: item.requestedPatch,
        currentSnapshotJson: null,
        validationStatus: "pending",
        validationMessagesJson: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      this.controlDraftItemsById.set(row.id, row);
      existingIds.push(row.id);
      return row;
    });

    this.controlDraftItemIdsByDraftId.set(draftId, existingIds);
    return created;
  }

  async updateDraft(
    id: string,
    patch: Partial<Pick<ControlDraft, "status" | "summaryJson" | "csvFileName" | "note">>,
  ) {
    const draft = this.controlDraftsById.get(id);
    if (!draft) {
      return undefined;
    }

    assignDefined(draft, patch);
    draft.updatedAt = now();
    return draft;
  }

  async updateDraftItem(draftItemId: string, patch: DraftItemPatch) {
    const [item] = await this.updateDraftItemsBatch([{ id: draftItemId, patch }]);
    return item;
  }

  async updateDraftItemsBatch(items: UpdateDraftItemBatchInput[]) {
    const timestamp = now();
    const updatedItems: ControlDraftItem[] = [];

    for (const update of items) {
      const item = this.controlDraftItemsById.get(update.id);
      if (!item) {
        continue;
      }

      assignDefined(item, update.patch);
      item.updatedAt = timestamp;
      updatedItems.push(item);
    }

    return updatedItems;
  }

  async createExecutionRun(input: CreateExecutionRunInput) {
    const run: ExecutionRun = {
      id: randomUUID(),
      draftId: input.draftId,
      retryOfRunId: input.retryOfRunId ?? null,
      status: input.status,
      createdBy: input.createdBy,
      summaryJson: (input.summaryJson as Record<string, unknown> | null) ?? {},
      errorText: input.errorText ?? null,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
      createdAt: now(),
    };

    this.executionRunsById.set(run.id, run);
    this.executionRunIdsInOrder.unshift(run.id);
    this.executionItemIdsByRunId.set(run.id, []);
    return run;
  }

  async updateExecutionRun(
    id: string,
    patch: Partial<
      Pick<ExecutionRun, "status" | "summaryJson" | "errorText" | "startedAt" | "finishedAt">
    >,
  ) {
    const run = this.executionRunsById.get(id);
    if (!run) {
      return undefined;
    }

    assignDefined(run, patch);
    return run;
  }

  async listExecutionRuns() {
    return this.listByIds(this.executionRunIdsInOrder, this.executionRunsById);
  }

  async createExecutionItem(input: CreateExecutionItemInput) {
    const [item] = await this.createExecutionItemsBatch([input]);
    return item;
  }

  async createExecutionItemsBatch(inputs: CreateExecutionItemInput[]) {
    const timestamp = now();
    const createdItems = inputs.map<ExecutionItem>((input) => ({
      id: randomUUID(),
      runId: input.runId,
      draftItemId: input.draftItemId ?? null,
      channel: input.channel,
      masterSku: input.masterSku ?? null,
      optionSku: input.optionSku ?? null,
      channelProductId: input.channelProductId,
      channelOptionId: input.channelOptionId,
      requestedPatchJson: input.requestedPatchJson,
      beforeSnapshotJson: (input.beforeSnapshotJson as Record<string, unknown> | null) ?? null,
      afterSnapshotJson: (input.afterSnapshotJson as Record<string, unknown> | null) ?? null,
      status: input.status,
      attemptCount: input.attemptCount,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      adapterResponseJson: (input.adapterResponseJson as Record<string, unknown> | null) ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    for (const item of createdItems) {
      this.executionItemsById.set(item.id, item);
      const ids = this.executionItemIdsByRunId.get(item.runId) ?? [];
      ids.push(item.id);
      this.executionItemIdsByRunId.set(item.runId, ids);
    }

    return createdItems;
  }

  async listExecutionItems(runId: string) {
    return this.listByIds(this.executionItemIdsByRunId.get(runId) ?? [], this.executionItemsById);
  }

  async getExecutionRunDetail(runId: string) {
    const run = this.executionRunsById.get(runId);
    if (!run) {
      return null;
    }

    const items = (await this.listExecutionItems(runId)).map<ExecutionItemResult>((item) => ({
      id: item.id,
      runId: item.runId,
      draftItemId: item.draftItemId,
      channel: item.channel as ExecutionItemResult["channel"],
      masterSku: item.masterSku,
      optionSku: item.optionSku,
      channelProductId: item.channelProductId,
      channelOptionId: item.channelOptionId,
      status: item.status as ExecutionItemResult["status"],
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      beforeSnapshotJson: (item.beforeSnapshotJson as Record<string, unknown> | null) ?? null,
      afterSnapshotJson: (item.afterSnapshotJson as Record<string, unknown> | null) ?? null,
      adapterResponseJson: (item.adapterResponseJson as Record<string, unknown> | null) ?? null,
      requestedPatchJson: item.requestedPatchJson as ControlPatch,
    }));

    return { run, items };
  }

  async getFailedExecutionItems(runId: string) {
    return (await this.listExecutionItems(runId)).filter((item) => item.status === "failed");
  }
}

export const storage: Storage = new IndexedMemoryStorage();
