import type { ChannelCode } from "@shared/channel-control";
import { listChannelAdapters } from "../adapters/channel-adapter";
import { storage } from "../storage";

export async function syncChannel(channel: ChannelCode) {
  const adapter = listChannelAdapters().find((item) => item.channel === channel);
  if (!adapter) {
    throw new Error(`Unknown channel: ${channel}`);
  }

  const run = await storage.createSyncRun(channel);
  await storage.updateSyncRun(run.id, {
    status: "running",
    startedAt: new Date(),
  });

  try {
    let cursor: string | null = null;
    let productCount = 0;
    let optionCount = 0;
    let mappingCount = 0;

    do {
      const page = await adapter.listCatalog({ cursor, limit: 50 });
      const result = await storage.upsertCatalog(page.items);
      productCount += result.productCount;
      optionCount += result.optionCount;
      mappingCount += result.mappingCount;
      cursor = page.nextCursor;
    } while (cursor);

    await storage.updateSyncRun(run.id, {
      status: "succeeded",
      finishedAt: new Date(),
      summaryJson: { productCount, optionCount, mappingCount },
    });
  } catch (error) {
    await storage.updateSyncRun(run.id, {
      status: "failed",
      finishedAt: new Date(),
      errorText: error instanceof Error ? error.message : "Unknown sync error",
    });
  }

  const runs = await storage.listSyncRuns();
  return runs.find((item) => item.id === run.id);
}

export async function syncChannels(channels: ChannelCode[]) {
  return Promise.all(channels.map((channel) => syncChannel(channel)));
}
