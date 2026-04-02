import type { NaverProductCacheStorePort } from "../interfaces/naver-product-cache-store";
import { fileNaverProductCacheStore } from "../stores/file-naver-product-cache-store";

export type { NaverProductCacheStorePort } from "../interfaces/naver-product-cache-store";

export const naverProductCacheStore: NaverProductCacheStorePort = fileNaverProductCacheStore;
