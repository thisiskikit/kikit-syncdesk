import type { NaverProductListResponse } from "@shared/naver-products";

export interface NaverProductCacheStorePort {
  get(storeId: string): Promise<NaverProductListResponse | null>;
  set(storeId: string, response: NaverProductListResponse): Promise<void>;
}
