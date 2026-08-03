import { prisma } from "../../config/prisma";

export async function listAuditLog(filters: { entityType?: string; entityId?: string }) {
  return prisma.auditLog.findMany({
    where: { entityType: filters.entityType, entityId: filters.entityId },
    include: { changedBy: { select: { name: true } } },
    orderBy: { changedAt: "desc" },
    take: 500,
  });
}
