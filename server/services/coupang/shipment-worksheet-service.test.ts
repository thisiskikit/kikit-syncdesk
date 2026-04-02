import { describe, expect, it } from "vitest";

import { isShipmentWorksheetCandidate } from "./shipment-worksheet-service";

describe("coupang shipment worksheet candidate filter", () => {
  it("includes new ACCEPT orders even before invoice actions are exposed", () => {
    expect(
      isShipmentWorksheetCandidate({
        shipmentBoxId: "100",
        orderId: "O-100",
        status: "ACCEPT",
        availableActions: ["markPreparing", "cancelOrderItem"],
        invoiceNumber: null,
      }),
    ).toBe(true);
  });

  it("keeps invoice-editable rows collectible", () => {
    expect(
      isShipmentWorksheetCandidate({
        shipmentBoxId: "200",
        orderId: "O-200",
        status: "INSTRUCT",
        availableActions: ["uploadInvoice"],
        invoiceNumber: null,
      }),
    ).toBe(true);

    expect(
      isShipmentWorksheetCandidate({
        shipmentBoxId: "300",
        orderId: "O-300",
        status: "DELIVERING",
        availableActions: [],
        invoiceNumber: "1234567890",
      }),
    ).toBe(true);
  });

  it("skips rows without a usable shipment identity", () => {
    expect(
      isShipmentWorksheetCandidate({
        shipmentBoxId: "-",
        orderId: "O-400",
        status: "ACCEPT",
        availableActions: ["markPreparing"],
        invoiceNumber: null,
      }),
    ).toBe(false);

    expect(
      isShipmentWorksheetCandidate({
        shipmentBoxId: "400",
        orderId: "",
        status: "INSTRUCT",
        availableActions: ["uploadInvoice"],
        invoiceNumber: null,
      }),
    ).toBe(false);
  });
});
