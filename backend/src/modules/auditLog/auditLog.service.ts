import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

export async function listAuditLog(
  filters: { entityType?: string; entityId?: string; search?: string },
  options?: { skip: number; take: number },
) {
  const where: Prisma.AuditLogWhereInput = {
    entityType: filters.entityType,
    entityId: filters.entityId,
    ...(filters.search
      ? { OR: [{ entityType: { contains: filters.search, mode: "insensitive" } }, { changedBy: { name: { contains: filters.search, mode: "insensitive" } } }] }
      : {}),
  };
  const include = { changedBy: { select: { name: true } } };
  const orderBy = { changedAt: "desc" as const };

  if (!options) {
    return prisma.auditLog.findMany({ where, include, orderBy, take: 500 });
  }
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include, orderBy, skip: options.skip, take: options.take }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}
