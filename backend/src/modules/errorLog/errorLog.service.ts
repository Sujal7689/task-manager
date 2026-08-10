import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const MAX_ENTRIES = 500;

export interface LogErrorInput {
  method: string;
  path: string;
  statusCode: number;
  message: string;
  stack?: string;
  userId?: string;
  userRole?: string;
}

// Deliberately swallows its own failures — this runs inside the global error
// handler, so a logging failure (e.g. DB briefly unreachable) must never mask
// or replace the original error response already being sent to the client.
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    await prisma.errorLog.create({ data: input });
    const count = await prisma.errorLog.count();
    if (count > MAX_ENTRIES) {
      const excess = await prisma.errorLog.findMany({
        orderBy: { createdAt: "asc" },
        take: count - MAX_ENTRIES,
        select: { id: true },
      });
      await prisma.errorLog.deleteMany({ where: { id: { in: excess.map((e) => e.id) } } });
    }
  } catch (err) {
    console.error("[errorLog] failed to persist error entry:", err instanceof Error ? err.message : err);
  }
}

export async function listErrorLog(filters: { search?: string }, options?: { skip: number; take: number }) {
  const where: Prisma.ErrorLogWhereInput = filters.search
    ? { OR: [{ path: { contains: filters.search, mode: "insensitive" } }, { message: { contains: filters.search, mode: "insensitive" } }] }
    : {};
  const orderBy = { createdAt: "desc" as const };

  if (!options) {
    return prisma.errorLog.findMany({ where, orderBy, take: MAX_ENTRIES });
  }
  const [items, total] = await Promise.all([
    prisma.errorLog.findMany({ where, orderBy, skip: options.skip, take: options.take }),
    prisma.errorLog.count({ where }),
  ]);
  return { items, total };
}

export async function clearErrorLog(): Promise<void> {
  await prisma.errorLog.deleteMany({});
}
