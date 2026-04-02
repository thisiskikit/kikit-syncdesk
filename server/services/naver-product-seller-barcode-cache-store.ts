import type { NaverProductSellerBarcodeCacheStorePort } from "../interfaces/naver-product-seller-barcode-cache-store";
import { fileNaverProductSellerBarcodeCacheStore } from "../stores/file-naver-product-seller-barcode-cache-store";

export type { NaverProductSellerBarcodeCacheStorePort } from "../interfaces/naver-product-seller-barcode-cache-store";

export const naverProductSellerBarcodeCacheStore: NaverProductSellerBarcodeCacheStorePort =
  fileNaverProductSellerBarcodeCacheStore;
