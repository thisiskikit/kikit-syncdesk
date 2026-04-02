import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { buildCoupangSignedDate, createCoupangAuthorization } from "./auth";

describe("coupang auth helpers", () => {
  it("formats signed dates in Coupang's compact UTC form", () => {
    expect(buildCoupangSignedDate(new Date("2026-03-24T12:34:56.000Z"))).toBe(
      "260324T123456Z",
    );
  });

  it("creates a deterministic authorization header for a fixed request", () => {
    const signedDate = "260324T123456Z";
    const secretKey = "test-secret";
    const method = "GET";
    const path = "/v2/providers/openapi/apis/api/v4/vendors/A00012345/ordersheets";
    const query = "createdAtFrom=2026-03-24&createdAtTo=2026-03-24";
    const expectedSignature = crypto
      .createHmac("sha256", secretKey)
      .update(`${signedDate}${method}${path}${query}`)
      .digest("hex");

    const result = createCoupangAuthorization({
      accessKey: "test-access",
      secretKey,
      method,
      path,
      query,
      signedDate,
    });

    expect(result).toEqual({
      signedDate,
      authorization:
        `CEA algorithm=HmacSHA256, access-key=test-access, signed-date=${signedDate}, ` +
        `signature=${expectedSignature}`,
    });
  });
});
