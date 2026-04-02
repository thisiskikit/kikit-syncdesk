import type { NaverProductSellerBarcodeCacheStorePort } from "../interfaces/naver-product-seller-barcode-cache-store";
import { workDataNaverProductSellerBarcodeCacheStore } from "../stores/work-data-naver-product-seller-barcode-cache-store";

export type { NaverProductSellerBarcodeCacheStorePort } from "../interfaces/naver-product-seller-barcode-cache-store";

export const naverProductSellerBarcodeCacheStore: NaverProductSellerBarcodeCacheStorePort =
  workDataNaverProductSellerBarcodeCacheStore;
