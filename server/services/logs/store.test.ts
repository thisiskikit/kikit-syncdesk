import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LogStore } from "./store";

function buildEventLogLine(input: {
  id: string;
  updatedAt: string;
  message: string;
}) {
  return `${JSON.stringify({
    id: input.id,
    kind: "event",
    eventType: "startup",
    channel: "system",
    menuKey: "system.startup",
    actionKey: "bootstrap",
    level: "info",
    status: "success",
    startedAt: input.updatedAt,
    finishedAt: input.updatedAt,
    durationMs: 1,
    message: input.message,
    meta: null,
    operationId: null,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  })}\n`;
}

describe("LogStore", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "kikit-logs-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("appends operation snapshots and deduplicates the latest state", async () => {
    const store = new LogStore({
      logDir: tempDir,
      retentionDays: 30,
      maxTotalBytes: 1024 * 1024,
      legacyDbImportLimit: 0,
      legacyOperationLogFile: path.join(tempDir, "missing.json"),
    });

    const created = await store.createOperation({
      channel: "coupang",
      menuKey: "coupang.shipments",
      actionKey: "upload-invoice",
      status: "queued",
      mode: "background",
      targetType: "order",
      targetCount: 1,
      targetIds: ["order-1"],
      requestPayload: { shipmentBoxId: "SB-1" },
    });

    await store.updateOperation(created.id, {
      status: "success",
      finishedAt: "2026-03-28T10:00:05.000Z",
      resultSummary: {
        headline: "done",
        detail: null,
        stats: { succeeded: 1 },
        preview: null,
      },
    });

    const logs = await store.listRecentLogs({
      kind: "operation",
      limit: 10,
    });

    expect(logs.items).toHaveLength(1);
    expect(logs.items[0]?.kind).toBe("operation");
    if (logs.items[0]?.kind !== "operation") {
      throw new Error("Expected an operation entry.");
    }

    expect(logs.items[0].operation.status).toBe("success");

    const files = (await readdir(tempDir)).filter((name) => name.endsWith(".jsonl"));
    expect(files).toHaveLength(1);

    const raw = await readFile(path.join(tempDir, files[0]!), "utf-8");
    expect(raw.trim().split(/\r?\n/)).toHaveLength(2);
  });

  it("prunes old files by age and removes the oldest files when size exceeds the cap", async () => {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    const oldFile = path.join(tempDir, "2000-01-01.jsonl");
    const yesterdayFile = path.join(tempDir, `${yesterdayKey}.jsonl`);
    const todayFile = path.join(tempDir, `${todayKey}.jsonl`);

    await writeFile(oldFile, buildEventLogLine({
      id: "old-1",
      updatedAt: "2000-01-01T00:00:00.000Z",
      message: "very old",
    }));

    const yesterdayPayload = buildEventLogLine({
      id: "yesterday-1",
      updatedAt: `${yesterdayKey}T09:00:00.000Z`,
      message: "y".repeat(600),
    });
    const todayPayload = buildEventLogLine({
      id: "today-1",
      updatedAt: `${todayKey}T09:00:00.000Z`,
      message: "t".repeat(600),
    });

    await writeFile(yesterdayFile, yesterdayPayload);
    await writeFile(todayFile, todayPayload);

    const store = new LogStore({
      logDir: tempDir,
      retentionDays: 30,
      maxTotalBytes: Buffer.byteLength(todayPayload, "utf-8") + 32,
      legacyDbImportLimit: 0,
      legacyOperationLogFile: path.join(tempDir, "missing.json"),
    });

    await store.listRecentLogs({ kind: "event", limit: 10 });

    const remainingFiles = await readdir(tempDir);
    expect(remainingFiles).not.toContain("2000-01-01.jsonl");
    expect(remainingFiles).not.toContain(`${yesterdayKey}.jsonl`);
    expect(remainingFiles).toContain(`${todayKey}.jsonl`);
  });

  it("lists event logs with cursor pagination without requiring a database", async () => {
    const store = new LogStore({
      logDir: tempDir,
      retentionDays: 30,
      maxTotalBytes: 1024 * 1024,
      legacyDbImportLimit: 0,
      legacyOperationLogFile: path.join(tempDir, "missing.json"),
    });

    await store.createEvent({
      channel: "system",
      eventType: "startup",
      level: "info",
      status: "success",
      message: "startup",
    });

    await new Promise((resolve) => setTimeout(resolve, 8));

    await store.createEvent({
      channel: "coupang",
      eventType: "external",
      level: "warning",
      status: "warning",
      message: "slow coupang request",
      durationMs: 1_800,
      meta: { slow: true },
    });

    const firstPage = await store.listRecentLogs({
      kind: "event",
      limit: 1,
    });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await store.listRecentLogs({
      kind: "event",
      limit: 10,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.kind).toBe("event");
  });
});
