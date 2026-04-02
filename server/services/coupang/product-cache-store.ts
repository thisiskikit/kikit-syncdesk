import type { CoupangProductCacheStorePort } from "../../interfaces/coupang-product-cache-store";
import { fileCoupangProductCacheStore } from "../../stores/file-coupang-product-cache-store";

export type {
  CoupangProductCacheStorePort,
  CoupangProductExplorerSnapshot,
} from "../../interfaces/coupang-product-cache-store";

export const coupangProductCacheStore: CoupangProductCacheStorePort = fileCoupangProductCacheStore;
