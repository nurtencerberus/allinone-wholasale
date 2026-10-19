import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { clientIp } from "@/lib/rate-limit";

type Executor = Pick<typeof db, "insert">;

export type AuditActor = { id: number; email: string } | "system";

/**
 * Appends one staff action to audit_log. Pass the transaction (`tx`) when the change itself
 * runs in one, so the record and the change commit or roll back together.
 */
export async function recordAudit(
  executor: Executor,
  entry: {
    actor: AuditActor;
    action: string;
    entityType: string;
    entityId?: string | number | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    request?: Request;
  },
): Promise<void> {
  await executor.insert(auditLog).values({
    actorId: entry.actor === "system" ? null : entry.actor.id,
    actorEmail: entry.actor === "system" ? "system" : entry.actor.email,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.request ? clientIp(entry.request) : null,
  });
}

/** Only the fields that changed, for a compact before/after pair. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  patch: Partial<T>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const from: Record<string, unknown> = {};
  const to: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const previous = before[key];
    if (JSON.stringify(previous) === JSON.stringify(value)) continue;
    from[key] = previous instanceof Date ? previous.toISOString() : previous;
    to[key] = value instanceof Date ? value.toISOString() : value;
  }
  return { before: from, after: to };
}
