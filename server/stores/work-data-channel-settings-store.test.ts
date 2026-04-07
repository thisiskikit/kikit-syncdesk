import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ChannelSettingsStore } from "./work-data-channel-settings-store";

const tempDirs: string[] = [];

async function createStore() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kikit-channel-settings-"));
  const filePath = path.join(tempDir, "channel-settings.json");
  tempDirs.push(tempDir);

  return {
    filePath,
    store: new ChannelSettingsStore(filePath),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("ChannelSettingsStore legacy persistence", () => {
  it("persists saved stores and connection test results to disk", async () => {
    const { filePath, store } = await createStore();

    const saved = await store.saveStore({
      channel: "naver",
      storeName: "Main NAVER",
      credentials: {
        clientId: "client-id",
        clientSecret: "secret-value",
      },
    });

    expect(saved.storeName).toBe("Main NAVER");
    expect(saved.credentials.hasClientSecret).toBe(true);

    const updated = await store.updateConnectionTest(saved.id, {
      status: "success",
      testedAt: "2026-04-03T10:00:00.000Z",
      message: "connected",
    });

    expect(updated?.connectionTest.status).toBe("success");

    const reloadedStore = new ChannelSettingsStore(filePath);
    const reloaded = await reloadedStore.getStore(saved.id);

    expect(reloaded).not.toBeNull();
    expect(reloaded?.credentials.clientSecret).toBe("secret-value");
    expect(reloaded?.connectionTest).toEqual({
      status: "success",
      testedAt: "2026-04-03T10:00:00.000Z",
      message: "connected",
    });
  });
});
