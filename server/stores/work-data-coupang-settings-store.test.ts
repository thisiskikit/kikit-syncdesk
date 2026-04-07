import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CoupangSettingsStore } from "./work-data-coupang-settings-store";

const tempDirs: string[] = [];

async function createStore() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kikit-coupang-settings-"));
  const filePath = path.join(tempDir, "coupang-settings.json");
  tempDirs.push(tempDir);

  return {
    filePath,
    store: new CoupangSettingsStore(filePath),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("CoupangSettingsStore legacy persistence", () => {
  it("persists saved stores and connection test results to disk", async () => {
    const { filePath, store } = await createStore();

    const saved = await store.saveStore({
      storeName: "Main Coupang",
      vendorId: "A00012345",
      shipmentPlatformKey: "k",
      credentials: {
        accessKey: "access-key",
        secretKey: "secret-key",
      },
      baseUrl: "https://api-gateway.coupang.com/v2/providers",
    });

    expect(saved.storeName).toBe("Main Coupang");
    expect(saved.credentials.hasSecretKey).toBe(true);
    expect(saved.baseUrl).toBe("https://api-gateway.coupang.com");

    const updated = await store.updateConnectionTest(saved.id, {
      status: "failed",
      testedAt: "2026-04-03T10:00:00.000Z",
      message: "invalid credentials",
    });

    expect(updated?.connectionTest.status).toBe("failed");

    const reloadedStore = new CoupangSettingsStore(filePath);
    const reloaded = await reloadedStore.getStore(saved.id);

    expect(reloaded).not.toBeNull();
    expect(reloaded?.shipmentPlatformKey).toBe("K");
    expect(reloaded?.credentials.secretKey).toBe("secret-key");
    expect(reloaded?.connectionTest).toEqual({
      status: "failed",
      testedAt: "2026-04-03T10:00:00.000Z",
      message: "invalid credentials",
    });
  });
});
