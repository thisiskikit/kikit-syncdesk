import type { NaverProductCacheStorePort } from "../interfaces/naver-product-cache-store";
import { workDataNaverProductCacheStore } from "../stores/work-data-naver-product-cache-store";

export type { NaverProductCacheStorePort } from "../interfaces/naver-product-cache-store";

export const naverProductCacheStore: NaverProductCacheStorePort = workDataNaverProductCacheStore;
