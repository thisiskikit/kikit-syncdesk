import { describe, expect, it } from "vitest";
import {
  testChannelConnectionInputSchema,
  upsertChannelStoreInputSchema,
} from "./channel-settings";

describe("channel settings schemas", () => {
  it("trims and accepts a valid NAVER store payload", () => {
    const result = upsertChannelStoreInputSchema.parse({
      channel: "naver",
      storeName: " Test Store ",
      credentials: {
        clientId: " client-id ",
        clientSecret: " client-secret ",
      },
    });

    expect(result).toEqual({
      channel: "naver",
      storeName: "Test Store",
      credentials: {
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });
  });

  it("requires a client id for connection tests", () => {
    expect(() =>
      testChannelConnectionInputSchema.parse({
        channel: "naver",
        credentials: {
          clientId: "   ",
          clientSecret: "secret",
        },
      }),
    ).toThrow();
  });
});
