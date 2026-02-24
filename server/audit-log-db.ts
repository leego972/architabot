/**
 * Audit Log DB — Helpers for recording and querying audit events.
 */

import { getDb } from "./db";
import { auditLogs } from "../drizzle/schema";
import { eq, desc, and, gte, lte, like, sql } from "drizzle-orm";
import { createLogger } from "./_core/logger.js";
const log = createLogger("AuditLogDb");

export interface LogAuditParams {
  userId: number;
  userName?: string;
  userEmail?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(auditLogs).values({
      userId: params.userId,
      userName: params.userName ?? null,
      userEmail: params.userEmail ?? null,
      action: params.action,
      resource: params.resource ?? null,
      resourceId: params.resourceId ?? null,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    });
  } catch (err) {
    // Audit logging should never break the main flow
    log.error("[AuditLog] Failed to write:", { error: String(err) });
  }
}

export interface AuditLogQuery {
  teamOwnerId?: number;
  userId?: number;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function queryAuditLogs(query: AuditLogQuery) {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };

  const conditions = [];

  if (query.userId) {
    conditions.push(eq(auditLogs.userId, query.userId));
  }
  if (query.action) {
    conditions.push(eq(auditLogs.action, query.action));
  }
  if (query.resource) {
    conditions.push(eq(auditLogs.resource, query.resource));
  }
  if (query.startDate) {
    conditions.push(gte(auditLogs.createdAt, query.startDate));
  }
  if (query.endDate) {
    conditions.push(lte(auditLogs.createdAt, query.endDate));
  }
  if (query.search) {
    conditions.push(like(auditLogs.action, `%${query.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(query.limit || 50, 100);
  const offset = query.offset || 0;

  const [logs, countResult] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(auditLogs)
      .where(whereClause),
  ]);

  return {
    logs,
    total: countResult[0]?.count ?? 0,
  };
}

// Get distinct action types for filter dropdowns
export async function getDistinctActions(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .orderBy(auditLogs.action);

  return result.map((r) => r.action);
}
