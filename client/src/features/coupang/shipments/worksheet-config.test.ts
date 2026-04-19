import { describe, expect, it } from "vitest";

import {
  createBuiltinShipmentColumnSource,
  createRawShipmentColumnSource,
  formatShipmentColumnSourceOptionLabel,
  normalizeShipmentColumnConfigs,
  resolveShipmentColumnLabelForSourceChange,
  resolveShipmentColumnSourceLabel,
} from "./worksheet-config";

describe("worksheet-config column source helpers", () => {
  it("formats builtin source options with the key and resolved label", () => {
    const source = createBuiltinShipmentColumnSource("productName");

    expect(formatShipmentColumnSourceOptionLabel(source)).toBe(
      `productName · ${resolveShipmentColumnSourceLabel(source)}`,
    );
  });

  it("formats raw source options with the namespace key and catalog label", () => {
    const source = createRawShipmentColumnSource("productItem.itemName");
    const rawFieldCatalog = [
      {
        key: "productItem.itemName",
        label: "상품 옵션명",
        group: "상품 옵션",
        sampleValueType: "string" as const,
      },
    ];

    expect(formatShipmentColumnSourceOptionLabel(source, rawFieldCatalog)).toBe(
      "productItem.itemName · 상품 옵션명",
    );
  });

  it("keeps raw-key headers in sync when the source column changes", () => {
    expect(
      resolveShipmentColumnLabelForSourceChange({
        currentLabel: "productName",
        previousSource: createBuiltinShipmentColumnSource("productName"),
        nextSource: createBuiltinShipmentColumnSource("invoiceNumber"),
      }),
    ).toBe("invoiceNumber");
  });

  it("keeps default labels in sync when the source column changes", () => {
    const previousSource = createBuiltinShipmentColumnSource("productName");
    const nextSource = createBuiltinShipmentColumnSource("invoiceNumber");

    expect(
      resolveShipmentColumnLabelForSourceChange({
        currentLabel: resolveShipmentColumnSourceLabel(previousSource),
        previousSource,
        nextSource,
      }),
    ).toBe(resolveShipmentColumnSourceLabel(nextSource));
  });

  it("preserves custom headers when the source column changes", () => {
    expect(
      resolveShipmentColumnLabelForSourceChange({
        currentLabel: "출고용 상품명",
        previousSource: createBuiltinShipmentColumnSource("productName"),
        nextSource: createBuiltinShipmentColumnSource("invoiceNumber"),
      }),
    ).toBe("출고용 상품명");
  });

  it("migrates legacy sourceKey configs before render-time consumers use them", () => {
    const normalized = normalizeShipmentColumnConfigs([
      {
        id: "legacy-1",
        label: "상품명",
        sourceKey: "productName",
      },
    ]);

    expect(normalized).toEqual([
      {
        id: "legacy-1",
        label: "상품명",
        source: {
          kind: "builtin",
          key: "productName",
        },
      },
    ]);
  });
});
