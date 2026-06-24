import { describe, expect, it } from "vitest";
import { oauthPostLoginRedirect } from "./lib/auth-oauth";

describe("OAuth verification redirect", () => {
  it("returning verified user skips verify page", () => {
    expect(
      oauthPostLoginRedirect({
        email_verified_at: "2026-06-24T00:00:00.000Z",
      }),
    ).toBe("/dashboard");
  });

  it("new/deleted account still verifies", () => {
    expect(oauthPostLoginRedirect(null)).toBe("/verify");
  });
});
