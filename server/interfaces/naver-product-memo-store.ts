export interface NaverProductMemoEntry {
  storeId: string;
  originProductNo: string;
  productName: string | null;
  memo: string;
  updatedAt: string;
}

export type UpsertNaverProductMemoInput = {
  storeId: string;
  originProductNo: string;
  productName?: string | null;
  memo: string;
};

export interface NaverProductMemoStorePort {
  get(storeId: string, originProductNo: string): Promise<NaverProductMemoEntry | null>;
  listByStore(storeId: string): Promise<NaverProductMemoEntry[]>;
  listAll(): Promise<NaverProductMemoEntry[]>;
  upsert(input: UpsertNaverProductMemoInput): Promise<{
    storeId: string;
    originProductNo: string;
    memo: string | null;
    updatedAt: string;
  }>;
}
