import type { ChannelSettingsStorePort } from "../interfaces/channel-settings-store";
import { workDataChannelSettingsStore } from "../stores/work-data-channel-settings-store";

export type {
  ChannelSettingsStorePort,
  StoredChannelCredentials,
  StoredChannelStore,
} from "../interfaces/channel-settings-store";

export const channelSettingsStore: ChannelSettingsStorePort = workDataChannelSettingsStore;
