import { describe, expect, it } from "vitest";
import {
  normalizeCoupangBaseUrl,
  resolveCoupangTestInput,
} from "./settings-store";

describe("coupang settings parsing", () => {
  it("normalizes base URLs and strips path segments", () => {
    expect(normalizeCoupangBaseUrl("https://api-gateway.coupang.com/some/path")).toBe(
      "https://api-gateway.coupang.com",
    );
    expect(normalizeCoupangBaseUrl("http://localhost:8080/internal")).toBe(
      "http://localhost:8080",
    );
  });

  it("rejects insecure non-localhost base URLs", () => {
    expect(() => normalizeCoupangBaseUrl("http://example.com")).toThrow();
  });

  it("reuses the stored secret when connection tests omit it", () => {
    expect(
      resolveCoupangTestInput(
        {
          vendorId: " V12345 ",
          credentials: {
            accessKey: " ACCESS ",
            secretKey: "",
          },
          baseUrl: "https://api-gateway.coupang.com/v2",
        },
        "stored-secret",
      ),
    ).toEqual({
      vendorId: "V12345",
      accessKey: "ACCESS",
      secretKey: "stored-secret",
      baseUrl: "https://api-gateway.coupang.com",
    });
  });
});
