import { describe, expect, it } from "vitest";
import { canDismissOperationToast } from "./operation-toaster";

describe("operation-toaster", () => {
  it("allows manual dismissal for active toasts", () => {
    expect(canDismissOperationToast({ source: "server", status: "running" })).toBe(true);
    expect(canDismissOperationToast({ source: "local", status: "queued" })).toBe(true);
  });

  it("keeps completed toasts dismissible", () => {
    expect(canDismissOperationToast({ source: "server", status: "success" })).toBe(true);
    expect(canDismissOperationToast({ source: "local", status: "warning" })).toBe(true);
    expect(canDismissOperationToast({ source: "server", status: "error" })).toBe(true);
  });
});
