import type { CoupangSettingsStorePort } from "../../interfaces/coupang-settings-store";
import {
  normalizeCoupangBaseUrl,
  resolveCoupangTestInput,
  workDataCoupangSettingsStore,
} from "../../stores/work-data-coupang-settings-store";

export type { CoupangSettingsStorePort, StoredCoupangStore } from "../../interfaces/coupang-settings-store";
export { normalizeCoupangBaseUrl, resolveCoupangTestInput };

export const coupangSettingsStore: CoupangSettingsStorePort = workDataCoupangSettingsStore;
