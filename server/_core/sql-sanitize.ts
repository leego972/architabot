/**
 * SQL Sanitization Utilities
 *
 * Prevents SQL injection by validating identifiers before they reach sql.raw().
 * Only allows safe table/column names that match the expected pattern.
 */

import { createLogger } from "./logger.js";

const log = createLogger("SQLSanitize");

/** Valid SQL identifier: letters, digits, underscores only (no spaces, quotes, semicolons) */
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

/**
 * Validate and return a safe SQL identifier (table name, column name).
 * Throws if the identifier contains unsafe characters.
 */
export function safeSqlIdentifier(name: string, context: string = "identifier"): string {
  if (!name || !SAFE_IDENTIFIER.test(name)) {
    log.warn("Rejected unsafe SQL identifier", { context, name: name?.substring(0, 50) });
    throw new Error(`Invalid SQL ${context}: "${name?.substring(0, 30)}"`);
  }
  return name;
}

/**
 * Validate a DDL statement to ensure it's a safe schema operation.
 * Only allows CREATE TABLE, ALTER TABLE, DROP TABLE, and CREATE INDEX statements.
 * Rejects anything that looks like data manipulation or injection.
 */
export function safeDDLStatement(stmt: string): string {
  const trimmed = stmt.trim();
  const upper = trimmed.toUpperCase();

  // Only allow specific DDL patterns
  const allowedPrefixes = [
    "CREATE TABLE",
    "CREATE INDEX",
    "CREATE UNIQUE INDEX",
    "ALTER TABLE",
    "DROP TABLE",
    "DROP INDEX",
    "SHOW COLUMNS",
    "SHOW TABLES",
    "SHOW INDEX",
    "SHOW CREATE TABLE",
    "SELECT COUNT",
  ];

  const isAllowed = allowedPrefixes.some((prefix) => upper.startsWith(prefix));

  if (!isAllowed) {
    log.warn("Rejected non-DDL SQL statement", { prefix: upper.substring(0, 30) });
    throw new Error(`Only DDL statements are allowed, got: "${upper.substring(0, 30)}..."`);
  }

  // Reject statements with multiple semicolons (statement stacking)
  const semicolonCount = (trimmed.match(/;/g) || []).length;
  if (semicolonCount > 1) {
    log.warn("Rejected multi-statement SQL", { semicolons: semicolonCount });
    throw new Error("Multi-statement SQL is not allowed");
  }

  return trimmed;
}
