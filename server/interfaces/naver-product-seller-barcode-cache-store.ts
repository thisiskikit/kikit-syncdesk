export interface NaverProductSellerBarcodeCacheStorePort {
  getMany(storeId: string, originProductNos: string[]): Promise<Map<string, string>>;
  setMany(
    storeId: string,
    entries: Array<{
      originProductNo: string;
      sellerBarcode: string;
    }>,
  ): Promise<void>;
}
