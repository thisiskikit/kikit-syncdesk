import type { ConnectionTestResult } from "@shared/channel-settings";
import type { CoupangStoreSummary, UpsertCoupangStoreInput } from "@shared/coupang";

export type StoredCoupangStore = {
  id: string;
  channel: "coupang";
  storeName: string;
  vendorId: string;
  shipmentPlatformKey?: string | null;
  credentials: {
    accessKey: string;
    secretKey: string;
  };
  baseUrl: string;
  connectionTest: {
    status: "idle" | ConnectionTestResult["status"];
    testedAt: string | null;
    message: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export interface CoupangSettingsStorePort {
  listStoreSummaries(): Promise<CoupangStoreSummary[]>;
  getStore(id: string): Promise<StoredCoupangStore | null>;
  saveStore(input: UpsertCoupangStoreInput): Promise<CoupangStoreSummary>;
  updateConnectionTest(
    storeId: string,
    result: ConnectionTestResult,
  ): Promise<CoupangStoreSummary | null>;
}
