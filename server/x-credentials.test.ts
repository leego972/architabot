/**
 * Test to validate X (Twitter) API credentials
 * Calls the X API v2 /users/me endpoint to verify authentication
 */
import { describe, it, expect } from "vitest";
import { createLogger } from "./_core/logger.js";
const log = createLogger("XCredentialsTest");

describe("X (Twitter) Credentials Validation", () => {
  it("should have all required X environment variables set", () => {
    expect(process.env.X_API_KEY).toBeTruthy();
    expect(process.env.X_API_KEY_SECRET).toBeTruthy();
    expect(process.env.X_ACCESS_TOKEN).toBeTruthy();
    expect(process.env.X_ACCESS_TOKEN_SECRET).toBeTruthy();
    expect(process.env.X_BEARER_TOKEN).toBeTruthy();
  });

  it("should authenticate with X API using Bearer Token", async () => {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
      log.info("Skipping: X_BEARER_TOKEN not set");
      return;
    }

    const response = await fetch("https://api.x.com/2/users/me", {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    // 200 = valid credentials, 401 = invalid
    log.info(`X API response status: ${response.status}`);
    const body = await response.text();
    log.info(`X API response body: ${body}`);

    expect(response.status).not.toBe(401);
  }, 15000);

  it("xAdapter should report as configured", async () => {
    const { xAdapter } = await import("./marketing-channels");
    expect(xAdapter.isConfigured).toBe(true);
  });

  it("xAdapter status should show connected", async () => {
    const { xAdapter } = await import("./marketing-channels");
    const status = xAdapter.getStatus();
    expect(status.connected).toBe(true);
    expect(status.id).toBe("x_twitter");
    expect(status.capabilities).toContain("organic_post");
  });
});
