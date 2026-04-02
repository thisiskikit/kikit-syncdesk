import { describe, expect, it } from "vitest";
import { searchMasterSkuReferences, validateMasterSkuReference } from "./master-sku";

describe("master sku integration fallback", () => {
  it("finds sample SKU references by query", async () => {
    const results = await searchMasterSkuReferences("MSK-1001");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.masterSku).toBe("MSK-1001");
  });

  it("validates known master/option SKU pairs", async () => {
    const result = await validateMasterSkuReference({
      masterSku: "MSK-1001",
      optionSku: "OPT-1001-RED",
    });

    expect(result.valid).toBe(true);
  });

  it("rejects unknown SKU pairs", async () => {
    const result = await validateMasterSkuReference({
      masterSku: "UNKNOWN",
      optionSku: "UNKNOWN",
    });

    expect(result.valid).toBe(false);
  });
});
