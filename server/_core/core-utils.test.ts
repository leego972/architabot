/**
 * Tests for core utility modules:
 * - getErrorMessage (errors.ts)
 * - withCache / invalidateCache (cache.ts)
 * - safeSqlIdentifier / safeDDLStatement (sql-sanitize.ts)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getErrorMessage } from "./errors";
import { withCache, invalidateCache, invalidateCachePrefix, clearCache, getCacheStats } from "./cache";
import { safeSqlIdentifier, safeDDLStatement } from "./sql-sanitize";

// ─── getErrorMessage ────────────────────────────────────────────────

describe("getErrorMessage", () => {
  it("extracts message from Error instances", () => {
    expect(getErrorMessage(new Error("test error"))).toBe("test error");
  });

  it("returns string errors as-is", () => {
    expect(getErrorMessage("raw string error")).toBe("raw string error");
  });

  it("converts numbers to string", () => {
    expect(getErrorMessage(42)).toBe("42");
  });

  it("converts null to string", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it("converts undefined to string", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("converts objects to string", () => {
    expect(getErrorMessage({ code: "ERR" })).toBe("[object Object]");
  });
});

// ─── Cache ──────────────────────────────────────────────────────────

describe("withCache", () => {
  beforeEach(() => {
    clearCache();
  });

  it("caches the result of a fetcher", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return "result";
    };

    const r1 = await withCache("test:key", 60, fetcher);
    const r2 = await withCache("test:key", 60, fetcher);

    expect(r1).toBe("result");
    expect(r2).toBe("result");
    expect(callCount).toBe(1); // fetcher only called once
  });

  it("invalidates a specific key", async () => {
    let callCount = 0;
    const fetcher = async () => ++callCount;

    await withCache("test:inv", 60, fetcher);
    invalidateCache("test:inv");
    await withCache("test:inv", 60, fetcher);

    expect(callCount).toBe(2);
  });

  it("invalidates by prefix", async () => {
    await withCache("user:1:profile", 60, async () => "a");
    await withCache("user:1:settings", 60, async () => "b");
    await withCache("other:key", 60, async () => "c");

    invalidateCachePrefix("user:");

    expect(getCacheStats().size).toBe(1); // only "other:key" remains
  });

  it("expires entries after TTL", async () => {
    let callCount = 0;
    const fetcher = async () => ++callCount;

    // Use a very short TTL (0 seconds = immediate expiry)
    await withCache("test:ttl", 0, fetcher);

    // Wait a tick for the TTL to pass
    await new Promise((r) => setTimeout(r, 10));

    await withCache("test:ttl", 0, fetcher);
    expect(callCount).toBe(2);
  });
});

// ─── SQL Sanitization ───────────────────────────────────────────────

describe("safeSqlIdentifier", () => {
  it("allows valid table names", () => {
    expect(safeSqlIdentifier("users")).toBe("users");
    expect(safeSqlIdentifier("blog_posts")).toBe("blog_posts");
    expect(safeSqlIdentifier("user123")).toBe("user123");
  });

  it("rejects SQL injection attempts", () => {
    expect(() => safeSqlIdentifier("users; DROP TABLE users")).toThrow();
    expect(() => safeSqlIdentifier("users--")).toThrow();
    expect(() => safeSqlIdentifier("users' OR '1'='1")).toThrow();
    expect(() => safeSqlIdentifier("")).toThrow();
  });

  it("rejects identifiers that are too long", () => {
    expect(() => safeSqlIdentifier("a".repeat(65))).toThrow();
  });
});

describe("safeDDLStatement", () => {
  it("allows valid DDL statements", () => {
    expect(() => safeDDLStatement("ALTER TABLE users ADD COLUMN name VARCHAR(255)")).not.toThrow();
    expect(() => safeDDLStatement("CREATE INDEX idx_name ON users(name)")).not.toThrow();
  });

  it("rejects DML and dangerous statements", () => {
    expect(() => safeDDLStatement("DELETE FROM users")).toThrow();
    expect(() => safeDDLStatement("TRUNCATE TABLE users")).toThrow();
    expect(() => safeDDLStatement("UPDATE users SET admin=1")).toThrow();
    expect(() => safeDDLStatement("INSERT INTO users VALUES (1)")).toThrow();
  });

  it("allows DROP TABLE as valid DDL", () => {
    expect(() => safeDDLStatement("DROP TABLE temp_table")).not.toThrow();
  });

  it("rejects multi-statement SQL injection", () => {
    expect(() => safeDDLStatement("ALTER TABLE users ADD col INT; DROP TABLE users;")).toThrow();
  });
});
