import type {
  ChannelStoreSummary,
  ConnectionTestResult,
  ConnectionTestStatus,
  UpsertChannelStoreInput,
} from "@shared/channel-settings";
import type { ChannelCode } from "@shared/channel-control";

export type StoredChannelCredentials = {
  clientId: string;
  clientSecret: string;
};

export type StoredChannelStore = {
  id: string;
  channel: ChannelCode;
  storeName: string;
  credentials: StoredChannelCredentials;
  connectionTest: {
    status: ConnectionTestStatus;
    testedAt: string | null;
    message: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export interface ChannelSettingsStorePort {
  listStoreSummaries(): Promise<ChannelStoreSummary[]>;
  getStore(id: string): Promise<StoredChannelStore | null>;
  saveStore(input: UpsertChannelStoreInput): Promise<ChannelStoreSummary>;
  updateConnectionTest(
    storeId: string,
    result: ConnectionTestResult,
  ): Promise<ChannelStoreSummary | null>;
}
