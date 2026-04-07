import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, apiRequestJson } from "./queryClient";

describe("apiRequestJson HTML error handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("surfaces a targeted hint for HTML 429 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        new Response("<html><body>rate limited</body></html>", {
          status: 429,
          headers: {
            "content-type": "text/html",
            "retry-after": "3",
          },
        }),
      ),
    );

    await expect(apiRequestJson("POST", "/api/coupang/stores/test-connection")).rejects.toMatchObject({
      name: "ApiHttpError",
      status: 429,
      retryAfterMs: 3000,
    });

    try {
      await apiRequestJson("POST", "/api/coupang/stores/test-connection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiHttpError);
      expect((error as ApiHttpError).message).toContain(
        "was rate-limited before the JSON API responded.",
      );
      expect((error as ApiHttpError).message).toContain("Retry after about 3s.");
      expect((error as ApiHttpError).message).toContain("VITE_API_BASE_URL");
    }
  });
});
