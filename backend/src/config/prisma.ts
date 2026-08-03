import { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentUserId } from "../utils/requestContext";

export const prisma = new PrismaClient();

// Section 5.9 Audit Log: record field-level changes on the entities that matter
// most for accountability. Skips writes with no request-scoped user (e.g. the
// Zoho sync / escalation cron jobs) since AuditLog.changedBy is a required FK.
const AUDITED_MODELS = new Set(["Task", "User", "TimesheetEntry"]);
const IGNORED_KEYS = new Set(["assignees", "updatedAt"]);

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

prisma.$use(async (params, next) => {
  if (params.action !== "update" || !params.model || !AUDITED_MODELS.has(params.model)) {
    return next(params);
  }

  const changedById = getCurrentUserId();
  if (!changedById) return next(params);

  const modelProp = lowerFirst(params.model) as keyof typeof prisma;
  const before = await (prisma[modelProp] as { findUnique: (args: unknown) => Promise<Record<string, unknown> | null> }).findUnique({
    where: params.args.where,
  });

  const result = await next(params);

  if (before && result) {
    const data = (params.args.data ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(data)) {
      if (IGNORED_KEYS.has(key)) continue;
      const oldValue = before[key];
      const newValue = (result as Record<string, unknown>)[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        await prisma.auditLog.create({
          data: {
            entityType: params.model,
            entityId: String((result as Record<string, unknown>).id),
            fieldChanged: key,
            oldValue: oldValue == null ? null : String(oldValue),
            newValue: newValue == null ? null : String(newValue),
            changedById,
          },
        });
      }
    }
  }

  return result;
});

export type { Prisma };
