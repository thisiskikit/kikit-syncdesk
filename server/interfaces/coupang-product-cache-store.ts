import type {
  CoupangDataSource,
  CoupangProductDetailResponse,
  CoupangProductExplorerRow,
  CoupangStoreRef,
} from "@shared/coupang";

export type CoupangProductExplorerSnapshot = {
  store: CoupangStoreRef;
  items: CoupangProductExplorerRow[];
  fetchedAt: string;
  servedFromFallback: boolean;
  message: string | null;
  source: CoupangDataSource;
};

export interface CoupangProductCacheStorePort {
  getExplorer(storeId: string): Promise<CoupangProductExplorerSnapshot | null>;
  setExplorer(storeId: string, snapshot: CoupangProductExplorerSnapshot): Promise<void>;
  updateExplorer(
    storeId: string,
    updater: (
      snapshot: CoupangProductExplorerSnapshot | null,
    ) => CoupangProductExplorerSnapshot | null,
  ): Promise<void>;
  patchExplorerRow(
    storeId: string,
    sellerProductId: string,
    updater: (row: CoupangProductExplorerRow) => CoupangProductExplorerRow | null,
  ): Promise<void>;
  getDetail(storeId: string, sellerProductId: string): Promise<CoupangProductDetailResponse | null>;
  setDetail(
    storeId: string,
    sellerProductId: string,
    response: CoupangProductDetailResponse,
  ): Promise<void>;
  updateDetail(
    storeId: string,
    sellerProductId: string,
    updater: (
      response: CoupangProductDetailResponse | null,
    ) => CoupangProductDetailResponse | null,
  ): Promise<void>;
  invalidateStore(storeId: string): Promise<void>;
  invalidateProduct(storeId: string, sellerProductId: string): Promise<void>;
}
