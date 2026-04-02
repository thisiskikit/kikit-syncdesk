import type { ChannelCode, ControlPatch } from "@shared/channel-control";
import { getChannelAdapter } from "../adapters/channel-adapter";
import { storage } from "../storage";
import { addDraftItems, validateDraft } from "./draft-service";
import { mapWithConcurrency } from "./shared/async-control";

export const EXECUTION_CHANNEL_CONCURRENCY = 2;

function resolveRunStatus(succeeded: number, failed: number) {
  if (failed > 0 && succeeded > 0) return "partially_succeeded";
  if (failed > 0) return "failed";
  return "succeeded";
}

type ExecutionItemWrite = {
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

export async function executeDraft(
  draftId: string,
  createdBy = "system",
  retryOfRunId?: string | null,
) {
  const draft = await storage.getDraft(draftId);
  if (!draft) {
    throw new Error("Draft not found");
  }

  const validation = await validateDraft(draftId);
  const run = await storage.createExecutionRun({
    draftId,
    retryOfRunId: retryOfRunId ?? null,
    status: "running",
    createdBy,
    summaryJson: {},
    errorText: null,
    startedAt: new Date(),
    finishedAt: null,
  });

  const itemsById = new Map(validation.items.map((item) => [item.id, item] as const));
  const workByChannel = new Map<
    ChannelCode,
    Array<{
      index: number;
      item: (typeof validation.items)[number];
      row: (typeof validation.previewRows)[number];
      requestedPatch: ControlPatch;
    }>
  >();

  for (let index = 0; index < validation.previewRows.length; index += 1) {
    const row = validation.previewRows[index];
    const item = itemsById.get(row.draftItemId);
    if (!item) {
      continue;
    }

    const channel = item.channel as ChannelCode;
    const workItems = workByChannel.get(channel) ?? [];
    workItems.push({
      index,
      item,
      row,
      requestedPatch: item.requestedPatchJson as ControlPatch,
    });
    workByChannel.set(channel, workItems);
  }

  const processedGroups = await Promise.all(
    Array.from(workByChannel.entries(), async ([channel, workItems]) => {
      const adapter = getChannelAdapter(channel);

      return mapWithConcurrency(workItems, EXECUTION_CHANNEL_CONCURRENCY, async (workItem) => {
        if (workItem.row.validationStatus !== "valid" || !workItem.row.current) {
          return {
            index: workItem.index,
            executionItem: {
              runId: run.id,
              draftItemId: workItem.item.id,
              channel,
              masterSku: workItem.item.masterSku,
              optionSku: workItem.item.optionSku,
              channelProductId: workItem.item.channelProductId || "",
              channelOptionId: workItem.item.channelOptionId || "",
              requestedPatchJson: workItem.requestedPatch,
              beforeSnapshotJson:
                (workItem.item.currentSnapshotJson as Record<string, unknown> | null) ?? null,
              afterSnapshotJson: null,
              status: "skipped",
              attemptCount: 1,
              errorCode: "VALIDATION_FAILED",
              errorMessage: workItem.row.messages.join(" "),
              adapterResponseJson: null,
            } satisfies ExecutionItemWrite,
          };
        }

        try {
          const result = await adapter.applyControlPatch({
            target: {
              channel,
              channelProductId: workItem.row.current.channelProductId,
              channelOptionId: workItem.row.current.channelOptionId,
              masterSku: workItem.item.masterSku,
              optionSku: workItem.item.optionSku,
            },
            patch: workItem.requestedPatch,
          });

          return {
            index: workItem.index,
            executionItem: {
              runId: run.id,
              draftItemId: workItem.item.id,
              channel,
              masterSku: workItem.item.masterSku,
              optionSku: workItem.item.optionSku,
              channelProductId: workItem.row.current.channelProductId,
              channelOptionId: workItem.row.current.channelOptionId,
              requestedPatchJson: workItem.requestedPatch,
              beforeSnapshotJson: result.before as unknown as Record<string, unknown>,
              afterSnapshotJson: result.after as unknown as Record<string, unknown>,
              status: "succeeded",
              attemptCount: 1,
              errorCode: null,
              errorMessage: null,
              adapterResponseJson: result.adapterResponse,
            } satisfies ExecutionItemWrite,
          };
        } catch (error) {
          return {
            index: workItem.index,
            executionItem: {
              runId: run.id,
              draftItemId: workItem.item.id,
              channel,
              masterSku: workItem.item.masterSku,
              optionSku: workItem.item.optionSku,
              channelProductId: workItem.row.current.channelProductId,
              channelOptionId: workItem.row.current.channelOptionId,
              requestedPatchJson: workItem.requestedPatch,
              beforeSnapshotJson: workItem.row.current as unknown as Record<string, unknown>,
              afterSnapshotJson: null,
              status: "failed",
              attemptCount: 1,
              errorCode: "ADAPTER_ERROR",
              errorMessage: error instanceof Error ? error.message : "Unknown adapter error",
              adapterResponseJson: null,
            } satisfies ExecutionItemWrite,
          };
        }
      });
    }),
  );

  const executionItems = processedGroups
    .flat()
    .sort((left, right) => left.index - right.index)
    .map((result) => result.executionItem);

  await storage.createExecutionItemsBatch(executionItems);

  const summary = executionItems.reduce(
    (accumulator, item) => {
      if (item.status === "succeeded") {
        accumulator.succeeded += 1;
      } else if (item.status === "failed") {
        accumulator.failed += 1;
      } else if (item.status === "skipped") {
        accumulator.skipped += 1;
      }

      return accumulator;
    },
    {
      total: validation.items.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    },
  );

  await storage.updateExecutionRun(run.id, {
    status: resolveRunStatus(summary.succeeded, summary.failed),
    summaryJson: summary,
    finishedAt: new Date(),
  });

  await storage.updateDraft(draftId, {
    status: "executed",
    summaryJson: summary,
  });

  return storage.getExecutionRunDetail(run.id);
}

export async function retryFailedRun(runId: string, createdBy = "system") {
  const failedItems = await storage.getFailedExecutionItems(runId);
  if (failedItems.length === 0) {
    throw new Error("Retry 대상 실패 건이 없습니다.");
  }

  const retryDraft = await storage.createDraft({
    source: "retry",
    status: "draft",
    note: `Retry from run ${runId}`,
    csvFileName: null,
    createdBy,
    summaryJson: {},
  });

  await addDraftItems(
    retryDraft.id,
    failedItems.map((item) => ({
      channel: item.channel as "naver" | "coupang",
      masterSku: item.masterSku,
      optionSku: item.optionSku,
      channelProductId: item.channelProductId,
      channelOptionId: item.channelOptionId,
      requestedPatch: item.requestedPatchJson as ControlPatch,
    })),
  );

  return executeDraft(retryDraft.id, createdBy, runId);
}

export async function resumeQueuedRuns() {
  return;
}
