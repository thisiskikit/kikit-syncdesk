import type { CoupangProductCacheStorePort } from "../../interfaces/coupang-product-cache-store";
import { workDataCoupangProductCacheStore } from "../../stores/work-data-coupang-product-cache-store";

export type {
  CoupangProductCacheStorePort,
  CoupangProductExplorerSnapshot,
} from "../../interfaces/coupang-product-cache-store";

export const coupangProductCacheStore: CoupangProductCacheStorePort =
  workDataCoupangProductCacheStore;
