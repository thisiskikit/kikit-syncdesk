import type { ChannelCode, DraftItemInput, NormalizedChannelProduct } from "@shared/channel-control";
import { resetChannelAdapterStates } from "../server/adapters/channel-adapter";
import { syncChannels } from "../server/services/catalog-sync";
import { validateDraft } from "../server/services/draft-service";
import { executeDraft } from "../server/services/execution-service";
import { storage } from "../server/storage";

const SYNTHETIC_OPTION_COUNT = 5_000;
const DRAFT_ITEM_COUNT = 1_000;
const ITERATIONS = 3;

type BenchmarkSummary = {
  label: string;
  durationsMs: number[];
  averageMs: number;
  minMs: number;
  maxMs: number;
};

type DraftTarget = {
  channel: ChannelCode;
  optionSku: string;
};

function buildSyntheticCatalog(optionCount: number): NormalizedChannelProduct[] {
  const optionsPerProduct = 4;
  const productCount = Math.ceil(optionCount / optionsPerProduct);

  return Array.from({ length: productCount }, (_, productIndex) => {
    const channel: ChannelCode = productIndex % 2 === 0 ? "naver" : "coupang";
    const channelPrefix = channel === "naver" ? "NAV" : "CP";
    const channelProductId = `${channelPrefix}-SYN-PROD-${productIndex + 1}`;

    return {
      channel,
      channelProductId,
      sellerProductCode: `SYN-${productIndex + 1}`,
      productName: `Synthetic Product ${productIndex + 1}`,
      productStatus: "sale",
      rawJson: { synthetic: true, productIndex },
      options: Array.from({ length: optionsPerProduct }, (_, optionIndex) => {
        const globalOptionIndex = productIndex * optionsPerProduct + optionIndex;
        return {
          channelOptionId: `${channelPrefix}-SYN-OPT-${globalOptionIndex + 1}`,
          optionName: `Option ${optionIndex + 1}`,
          price: 10_000 + (globalOptionIndex % 500),
          stockQuantity: 20 + (globalOptionIndex % 25),
          saleStatus: "on_sale" as const,
          soldOutStatus: "in_stock" as const,
          masterSku: `SYN-MSK-${productIndex + 1}`,
          optionSku: `SYN-OPT-${globalOptionIndex + 1}`,
          rawJson: { synthetic: true, optionIndex: globalOptionIndex },
        };
      }),
    };
  });
}

async function prepareDataset() {
  await storage.reset();
  resetChannelAdapterStates();
  await syncChannels(["naver", "coupang"]);
  await storage.upsertCatalog(buildSyntheticCatalog(SYNTHETIC_OPTION_COUNT));
}

async function createPerfDraft(label: string, itemCount: number) {
  const draft = await storage.createDraft({
    source: "manual",
    status: "draft",
    note: label,
    csvFileName: null,
    createdBy: "perf-script",
    summaryJson: {},
  });

  const targets: DraftTarget[] = [
    { channel: "naver", optionSku: "OPT-1001-RED" },
    { channel: "naver", optionSku: "OPT-1001-BLUE" },
    { channel: "naver", optionSku: "OPT-3001-WHITE" },
    { channel: "coupang", optionSku: "OPT-2001-L" },
    { channel: "coupang", optionSku: "OPT-2001-M" },
    { channel: "coupang", optionSku: "OPT-1001-RED" },
    { channel: "coupang", optionSku: "OPT-1001-BLUE" },
  ];

  const items: DraftItemInput[] = Array.from({ length: itemCount }, (_, index) => {
    const target = targets[index % targets.length];

    return {
      channel: target.channel,
      optionSku: target.optionSku,
      requestedPatch:
        index % 2 === 0
          ? { price: 20_000 + index }
          : { stockQuantity: (index % 50) + 1 },
    };
  });

  await storage.addDraftItems(draft.id, items);
  return draft.id;
}

async function measureAsync<T>(fn: () => Promise<T>) {
  const startedAt = process.hrtime.bigint();
  const result = await fn();
  const endedAt = process.hrtime.bigint();

  return {
    result,
    durationMs: Number(endedAt - startedAt) / 1_000_000,
  };
}

function summarizeDurations(label: string, durationsMs: number[]): BenchmarkSummary {
  const total = durationsMs.reduce((sum, duration) => sum + duration, 0);

  return {
    label,
    durationsMs,
    averageMs: total / durationsMs.length,
    minMs: Math.min(...durationsMs),
    maxMs: Math.max(...durationsMs),
  };
}

async function benchmarkCatalogQuery() {
  const durations: number[] = [];

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    await prepareDataset();
    const { durationMs } = await measureAsync(() =>
      storage.listCatalogOptions({
        q: "Synthetic Product 12",
        channel: "all",
        mapped: "all",
        limit: 200,
        offset: 0,
      }),
    );
    durations.push(durationMs);
  }

  return summarizeDurations("catalog query", durations);
}

async function benchmarkDraftValidation() {
  const durations: number[] = [];

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    await prepareDataset();
    const draftId = await createPerfDraft(`validate-${iteration + 1}`, DRAFT_ITEM_COUNT);
    const { durationMs } = await measureAsync(() => validateDraft(draftId));
    durations.push(durationMs);
  }

  return summarizeDurations("draft validate", durations);
}

async function benchmarkDraftExecution() {
  const durations: number[] = [];

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    await prepareDataset();
    const draftId = await createPerfDraft(`execute-${iteration + 1}`, DRAFT_ITEM_COUNT);
    const { durationMs } = await measureAsync(() => executeDraft(draftId, "perf-script"));
    durations.push(durationMs);
  }

  return summarizeDurations("draft execute", durations);
}

function printSummary(summary: BenchmarkSummary) {
  console.log(
    `${summary.label}: avg=${summary.averageMs.toFixed(1)}ms min=${summary.minMs.toFixed(
      1,
    )}ms max=${summary.maxMs.toFixed(1)}ms runs=${summary.durationsMs
      .map((duration) => duration.toFixed(1))
      .join(", ")}`,
  );
}

async function main() {
  console.log(
    `Benchmarking with ${SYNTHETIC_OPTION_COUNT.toLocaleString()} catalog options and ${DRAFT_ITEM_COUNT.toLocaleString()} draft items.`,
  );

  const catalogQuerySummary = await benchmarkCatalogQuery();
  const draftValidationSummary = await benchmarkDraftValidation();
  const draftExecutionSummary = await benchmarkDraftExecution();

  printSummary(catalogQuerySummary);
  printSummary(draftValidationSummary);
  printSummary(draftExecutionSummary);

  await storage.reset();
  resetChannelAdapterStates();
}

main().catch(async (error) => {
  console.error(error);
  await storage.reset();
  resetChannelAdapterStates();
  process.exitCode = 1;
});
