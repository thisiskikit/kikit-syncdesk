import { describe, expect, it } from "vitest";

import {
  createBuiltinShipmentColumnSource,
  createRawShipmentColumnSource,
  formatShipmentColumnSourceOptionLabel,
  normalizeShipmentColumnConfigs,
  resolveShipmentWorksheetMirrorSyncRequirement,
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

  it("trusts main mirror counts only when the latest full sync covers the selected range", () => {
    expect(
      resolveShipmentWorksheetMirrorSyncRequirement({
        selectedStoreId: "store-1",
        requestedCreatedAtFrom: "2026-03-22",
        requestedCreatedAtTo: "2026-04-20",
        source: "live",
        syncSummary: {
          mode: "full",
          fetchedCount: 2432,
          insertedCount: 0,
          insertedSourceKeys: [],
          updatedCount: 2432,
          skippedHydrationCount: 0,
          autoExpanded: false,
          fetchCreatedAtFrom: "2026-03-22",
          fetchCreatedAtTo: "2026-04-20",
          statusFilter: null,
          completedPhases: ["list"],
          pendingPhases: [],
          warningPhases: [],
        },
      }),
    ).toEqual({
      isTrusted: true,
      requiresFullSync: false,
      reason: "trusted",
      syncRangeLabel: "2026-03-22 ~ 2026-04-20",
    });
  });

  it("requires a full sync again when the latest sync was quick collect only", () => {
    expect(
      resolveShipmentWorksheetMirrorSyncRequirement({
        selectedStoreId: "store-1",
        requestedCreatedAtFrom: "2026-03-22",
        requestedCreatedAtTo: "2026-04-20",
        source: "live",
        syncSummary: {
          mode: "new_only",
          fetchedCount: 278,
          insertedCount: 278,
          insertedSourceKeys: ["source-1"],
          updatedCount: 0,
          skippedHydrationCount: 0,
          autoExpanded: false,
          fetchCreatedAtFrom: "2026-04-19",
          fetchCreatedAtTo: "2026-04-20",
          statusFilter: null,
          completedPhases: ["list"],
          pendingPhases: [],
          warningPhases: [],
        },
      }),
    ).toEqual({
      isTrusted: false,
      requiresFullSync: true,
      reason: "partial_sync",
      syncRangeLabel: "2026-04-19 ~ 2026-04-20",
    });
  });

  it("requires a full sync when the latest full sync range does not cover the selected range", () => {
    expect(
      resolveShipmentWorksheetMirrorSyncRequirement({
        selectedStoreId: "store-1",
        requestedCreatedAtFrom: "2026-03-22",
        requestedCreatedAtTo: "2026-04-20",
        source: "live",
        syncSummary: {
          mode: "full",
          fetchedCount: 178,
          insertedCount: 178,
          insertedSourceKeys: [],
          updatedCount: 0,
          skippedHydrationCount: 0,
          autoExpanded: false,
          fetchCreatedAtFrom: "2026-04-18",
          fetchCreatedAtTo: "2026-04-20",
          statusFilter: null,
          completedPhases: ["list"],
          pendingPhases: [],
          warningPhases: [],
        },
      }),
    ).toEqual({
      isTrusted: false,
      requiresFullSync: true,
      reason: "range_outside_sync",
      syncRangeLabel: "2026-04-18 ~ 2026-04-20",
    });
  });

  it("does not trust fallback or degraded worksheet summaries", () => {
    expect(
      resolveShipmentWorksheetMirrorSyncRequirement({
        selectedStoreId: "store-1",
        requestedCreatedAtFrom: "2026-03-22",
        requestedCreatedAtTo: "2026-04-20",
        source: "fallback",
        syncSummary: null,
      }),
    ).toEqual({
      isTrusted: false,
      requiresFullSync: true,
      reason: "fallback",
      syncRangeLabel: null,
    });

    expect(
      resolveShipmentWorksheetMirrorSyncRequirement({
        selectedStoreId: "store-1",
        requestedCreatedAtFrom: "2026-03-22",
        requestedCreatedAtTo: "2026-04-20",
        source: "live",
        syncSummary: {
          mode: "full",
          fetchedCount: 2000,
          insertedCount: 0,
          insertedSourceKeys: [],
          updatedCount: 2000,
          skippedHydrationCount: 0,
          autoExpanded: false,
          fetchCreatedAtFrom: "2026-03-22",
          fetchCreatedAtTo: "2026-04-20",
          statusFilter: null,
          completedPhases: ["list"],
          pendingPhases: [],
          warningPhases: ["customer_service_refresh"],
          degraded: true,
        },
      }),
    ).toEqual({
      isTrusted: false,
      requiresFullSync: true,
      reason: "degraded_sync",
      syncRangeLabel: "2026-03-22 ~ 2026-04-20",
    });
  });
});
