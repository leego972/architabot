/**
 * Request Correlation ID — AsyncLocalStorage-based
 *
 * Generates a unique ID per incoming HTTP request and makes it available
 * to all code running within that request's async context, including
 * tRPC procedures, service functions, and the structured logger.
 *
 * Usage:
 *   // In middleware (already wired in index.ts):
 *   correlationMiddleware(req, res, next)
 *
 *   // Anywhere in request-scoped code:
 *   import { getCorrelationId } from "./_core/correlation";
 *   const id = getCorrelationId(); // e.g. "a3f8c2d1"
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

interface RequestContext {
  correlationId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Generate a short, unique correlation ID (8 hex chars = 4 billion combinations) */
function generateCorrelationId(): string {
  return randomBytes(4).toString("hex");
}

/**
 * Get the current request's correlation ID.
 * Returns undefined if called outside a request context (e.g., startup code, cron jobs).
 */
export function getCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId;
}

/**
 * Express middleware that wraps each request in an AsyncLocalStorage context
 * with a unique correlation ID. The ID is also set as a response header.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use incoming header if present (for distributed tracing), otherwise generate
  const correlationId =
    (req.headers["x-correlation-id"] as string) || generateCorrelationId();

  // Set on response for client-side debugging
  res.setHeader("x-correlation-id", correlationId);

  // Run the rest of the request inside the async context
  requestContext.run({ correlationId }, () => {
    next();
  });
}
