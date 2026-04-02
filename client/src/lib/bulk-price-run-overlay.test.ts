import { describe, expect, it } from "vitest";
import { hasMatchingBulkPriceRunContext } from "./bulk-price-run-overlay";

describe("bulk price run overlay helper", () => {
  it("returns true when preview and run use the same source config and rules", () => {
    expect(
      hasMatchingBulkPriceRunContext(
        {
          sourceConfig: {
            storeId: "store-1",
            schema: "public",
            table: "prices",
            basePriceColumn: "base_price",
            sourceMatchColumn: "match_code",
            coupangMatchField: "barcode",
          },
          rules: {
            fixedAdjustment: 0,
            feeRate: 0.1,
            marginRate: 0.05,
          },
        },
        {
          sourceConfig: {
            storeId: "store-1",
            schema: "public",
            table: "prices",
            basePriceColumn: "base_price",
            sourceMatchColumn: "match_code",
            coupangMatchField: "barcode",
          },
          rules: {
            fixedAdjustment: 0,
            feeRate: 0.1,
            marginRate: 0.05,
          },
        },
      ),
    ).toBe(true);
  });

  it("returns false when the active run belongs to a different preview context", () => {
    expect(
      hasMatchingBulkPriceRunContext(
        {
          sourceConfig: {
            storeId: "store-1",
            schema: "public",
            table: "prices",
            basePriceColumn: "base_price",
            sourceMatchColumn: "barcode",
            coupangMatchField: "barcode",
          },
          rules: {
            fixedAdjustment: 0,
            feeRate: 0.1,
            marginRate: 0.05,
          },
        },
        {
          sourceConfig: {
            storeId: "store-1",
            schema: "public",
            table: "prices",
            basePriceColumn: "base_price",
            sourceMatchColumn: "sku",
            coupangMatchField: "externalVendorSku",
          },
          rules: {
            fixedAdjustment: 0,
            feeRate: 0.1,
            marginRate: 0.05,
          },
        },
      ),
    ).toBe(false);
  });
});
