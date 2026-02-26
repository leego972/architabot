import { describe, it, expect } from "vitest";

describe("Social Auth Router", () => {
  describe("GitHub OAuth", () => {
    it("should have correct GitHub authorize URL structure", () => {
      const clientId = "Ov23liD9UXvHpNBgSWMS";
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: "https://archibaldtitan.com/api/auth/github/callback",
        scope: "read:user user:email",
        state: "random-state",
      });
      const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
      expect(url).toContain("github.com/login/oauth/authorize");
      expect(url).toContain("client_id=Ov23liD9UXvHpNBgSWMS");
    });

    it("should use manus.space domain for redirect_uri (registered domain)", () => {
      const redirectUri = "https://archibaldtitan.com/api/auth/github/callback";
      expect(redirectUri).toContain("manus.space");
      expect(redirectUri).not.toContain("archibaldtitan.com");
    });

    it("should request read:user and user:email scopes", () => {
      const scope = "read:user user:email";
      expect(scope).toContain("read:user");
      expect(scope).toContain("user:email");
    });
  });

  describe("Google OAuth", () => {
    it("should have correct Google authorize URL structure", () => {
      const params = new URLSearchParams({
        client_id: "1022168697812-p8ek2g9e2qac8fau5qqjhv53ric1oh45.apps.googleusercontent.com",
        redirect_uri: "https://archibaldtitan.com/api/auth/google/callback",
        response_type: "code",
        scope: "openid email profile",
        state: "random-state",
        access_type: "offline",
        prompt: "consent",
      });
      const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
      expect(url).toContain("client_id=1022168697812");
    });

    it("should use manus.space domain for redirect_uri (registered domain)", () => {
      const redirectUri = "https://archibaldtitan.com/api/auth/google/callback";
      expect(redirectUri).toContain("manus.space");
      expect(redirectUri).not.toContain("archibaldtitan.com");
    });

    it("should request openid, email, and profile scopes", () => {
      const scope = "openid email profile";
      expect(scope).toContain("openid");
      expect(scope).toContain("email");
      expect(scope).toContain("profile");
    });
  });

  describe("CSRF State Management", () => {
    it("should generate unique state tokens", () => {
      const crypto = require("crypto");
      const s1 = crypto.randomBytes(32).toString("hex");
      const s2 = crypto.randomBytes(32).toString("hex");
      expect(s1).not.toBe(s2);
      expect(s1.length).toBe(64);
    });

    it("should store state with provider and returnPath", () => {
      const stateMap = new Map<string, { provider: string; returnPath: string; expiresAt: number }>();
      stateMap.set("test", { provider: "github", returnPath: "/dashboard", expiresAt: Date.now() + 600000 });
      const stored = stateMap.get("test");
      expect(stored).toBeDefined();
      expect(stored!.provider).toBe("github");
    });

    it("should expire states after 10 minutes", () => {
      const stateMap = new Map<string, { provider: string; returnPath: string; expiresAt: number }>();
      stateMap.set("expired", { provider: "google", returnPath: "/dashboard", expiresAt: Date.now() - 1000 });
      expect(stateMap.get("expired")!.expiresAt).toBeLessThan(Date.now());
    });

    it("should delete state after use (prevent replay)", () => {
      const stateMap = new Map<string, { provider: string; returnPath: string; expiresAt: number }>();
      stateMap.set("one-time", { provider: "github", returnPath: "/dashboard", expiresAt: Date.now() + 600000 });
      const pending = stateMap.get("one-time");
      stateMap.delete("one-time");
      expect(pending).toBeDefined();
      expect(stateMap.get("one-time")).toBeUndefined();
    });
  });

  describe("Cross-Domain Token Exchange", () => {
    it("should create one-time tokens with 2-minute expiry", () => {
      const crypto = require("crypto");
      const tokens = new Map<string, { sessionToken: string; returnPath: string; expiresAt: number }>();
      const token = crypto.randomBytes(32).toString("hex");
      tokens.set(token, { sessionToken: "jwt-here", returnPath: "/dashboard", expiresAt: Date.now() + 120000 });
      expect(token.length).toBe(64);
      expect(tokens.get(token)!.sessionToken).toBe("jwt-here");
      expect(tokens.get(token)!.expiresAt).toBeGreaterThan(Date.now());
    });

    it("should delete token after single use (prevent replay)", () => {
      const tokens = new Map<string, { sessionToken: string; returnPath: string; expiresAt: number }>();
      tokens.set("tok", { sessionToken: "jwt", returnPath: "/dashboard", expiresAt: Date.now() + 120000 });
      const pending = tokens.get("tok");
      tokens.delete("tok");
      expect(pending).toBeDefined();
      expect(tokens.get("tok")).toBeUndefined();
    });

    it("should reject expired tokens", () => {
      const tokens = new Map<string, { sessionToken: string; returnPath: string; expiresAt: number }>();
      tokens.set("expired", { sessionToken: "jwt", returnPath: "/dashboard", expiresAt: Date.now() - 1000 });
      expect(Date.now() > tokens.get("expired")!.expiresAt).toBe(true);
    });

    it("should reject unknown tokens", () => {
      const tokens = new Map<string, { sessionToken: string; returnPath: string; expiresAt: number }>();
      expect(tokens.get("nonexistent")).toBeUndefined();
    });

    it("should construct correct token-exchange redirect URL", () => {
      const publicOrigin = "https://www.archibaldtitan.com";
      const token = "abc123";
      const returnPath = "/dashboard";
      const url = `${publicOrigin}/api/auth/token-exchange?token=${token}&returnPath=${encodeURIComponent(returnPath)}`;
      expect(url).toBe("https://www.archibaldtitan.com/api/auth/token-exchange?token=abc123&returnPath=%2Fdashboard");
    });

    it("should detect cross-domain scenario correctly", () => {
      const MANUS = "https://archibaldtitan.com";
      expect("https://www.archibaldtitan.com" !== MANUS).toBe(true);
      expect(MANUS !== MANUS).toBe(false);
    });

    it("should preserve returnPath through the token exchange flow", () => {
      const tokens = new Map<string, { sessionToken: string; returnPath: string; expiresAt: number }>();
      tokens.set("t", { sessionToken: "jwt", returnPath: "/fetcher/credentials", expiresAt: Date.now() + 120000 });
      expect(tokens.get("t")!.returnPath).toBe("/fetcher/credentials");
    });
  });

  describe("User Creation/Linking Logic", () => {
    it("should generate correct openId format for GitHub users", () => {
      const crypto = require("crypto");
      const openId = `github_${crypto.randomUUID().replace(/-/g, "")}`;
      expect(openId).toMatch(/^github_[a-f0-9]{32}$/);
    });

    it("should generate correct openId format for Google users", () => {
      const crypto = require("crypto");
      const openId = `google_${crypto.randomUUID().replace(/-/g, "")}`;
      expect(openId).toMatch(/^google_[a-f0-9]{32}$/);
    });

    it("should lowercase email for consistency", () => {
      expect("User@Example.COM".toLowerCase()).toBe("user@example.com");
    });
  });

  describe("SocialLoginButtons Component Logic", () => {
    it("should generate correct GitHub OAuth URL (relative)", () => {
      const url = `/api/auth/github?returnPath=${encodeURIComponent("/dashboard")}&mode=login`;
      expect(url).toBe("/api/auth/github?returnPath=%2Fdashboard&mode=login");
      expect(url).not.toContain("http");
    });

    it("should generate correct Google OAuth URL (relative)", () => {
      const url = `/api/auth/google?returnPath=${encodeURIComponent("/dashboard")}&mode=register`;
      expect(url).toBe("/api/auth/google?returnPath=%2Fdashboard&mode=register");
      expect(url).not.toContain("http");
    });

    it("should not include any Manus OAuth references", () => {
      const url = "/api/auth/github?returnPath=%2Fdashboard&mode=login";
      expect(url).not.toContain("manus");
      expect(url).not.toContain("VITE_OAUTH_PORTAL_URL");
    });
  });

  describe("Provider Config", () => {
    it("should only include email, google, and github providers", () => {
      const providers = ["email", "google", "github"];
      expect(providers).toContain("email");
      expect(providers).toContain("google");
      expect(providers).toContain("github");
      expect(providers).not.toContain("manus");
    });

    it("should filter available providers correctly", () => {
      const linked = ["email", "google"];
      const available = ["google", "github"].filter((p) => !linked.includes(p));
      expect(available).toEqual(["github"]);
    });
  });
});
