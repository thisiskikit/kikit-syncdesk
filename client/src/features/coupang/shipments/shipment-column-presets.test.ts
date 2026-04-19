import { describe, expect, it } from "vitest";

import {
  buildShipmentColumnPresetConfigs,
  buildShipmentColumnPresetWidths,
  detectShipmentColumnPresetKey,
} from "./shipment-column-presets";
import { createBuiltinShipmentColumnSource } from "./worksheet-config";

describe("shipment-column-presets", () => {
  it("builds a compact operations preset", () => {
    const configs = buildShipmentColumnPresetConfigs("operations");

    expect(
      configs.map((config) => (config.source.kind === "builtin" ? config.source.key : null)),
    ).toEqual(["productName", "optionName", "receiverName", "selpickOrderNumber", "quantity"]);
  });

  it("builds an invoice-focused preset with courier and invoice columns", () => {
    const configs = buildShipmentColumnPresetConfigs("invoice_input");

    expect(
      configs.map((config) => (config.source.kind === "builtin" ? config.source.key : null)),
    ).toEqual([
      "selpickOrderNumber",
      "productName",
      "receiverName",
      "deliveryCompanyCode",
      "invoiceNumber",
    ]);
  });

  it("detects preset keys from ordered source keys", () => {
    const operationsConfigs = buildShipmentColumnPresetConfigs("operations");
    const invoiceConfigs = buildShipmentColumnPresetConfigs("invoice_input");

    expect(detectShipmentColumnPresetKey(operationsConfigs)).toBe("operations");
    expect(detectShipmentColumnPresetKey(invoiceConfigs)).toBe("invoice_input");
    expect(
      detectShipmentColumnPresetKey([
        ...operationsConfigs.slice(0, 2),
        {
          ...operationsConfigs[2],
          source: createBuiltinShipmentColumnSource("invoiceNumber"),
        },
      ]),
    ).toBe("custom");
  });

  it("returns width overrides for compact presets", () => {
    const configs = buildShipmentColumnPresetConfigs("operations");
    const widths = buildShipmentColumnPresetWidths(configs, "operations");

    expect(widths[configs[0].id]).toBe(176);
    expect(widths[configs[4].id]).toBe(72);
  });
});
