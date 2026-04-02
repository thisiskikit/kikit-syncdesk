import type { NaverProductMemoStorePort } from "../interfaces/naver-product-memo-store";
import {
  NaverProductMemoStore,
  buildNaverProductMemoKey,
  fileNaverProductMemoStore,
} from "../stores/file-naver-product-memo-store";

export type {
  NaverProductMemoEntry,
  NaverProductMemoStorePort,
  UpsertNaverProductMemoInput,
} from "../interfaces/naver-product-memo-store";
export { NaverProductMemoStore, buildNaverProductMemoKey };

export const naverProductMemoStore: NaverProductMemoStorePort = fileNaverProductMemoStore;
