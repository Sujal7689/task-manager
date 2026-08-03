import { Prisma } from "@prisma/client";
import { AppError } from "./appError";

// Deleting a row that's still referenced by a RESTRICT foreign key (e.g. a
// Department with Projects still pointing at it) can surface two different
// ways depending on the exact Postgres SQLSTATE: known FK violations (23503)
// map to Prisma's P2003, but plain RESTRICT violations (23001, what Postgres
// actually raises here) aren't in Prisma's known-error table and come through
// as PrismaClientUnknownRequestError instead — so both need checking.
export async function withFriendlyDeleteError<T>(fn: () => Promise<T>, entityLabel: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003") {
        throw new AppError(409, `Cannot delete this ${entityLabel} — it's still referenced by other records (tasks, projects, or users). Reassign or remove those first.`);
      }
      if (err.code === "P2025") {
        throw new AppError(404, `${entityLabel} not found`);
      }
    }
    if (err instanceof Prisma.PrismaClientUnknownRequestError) {
      const message = err.message.toLowerCase();
      if (message.includes("foreign key constraint") || message.includes("restrict")) {
        throw new AppError(409, `Cannot delete this ${entityLabel} — it's still referenced by other records (tasks, projects, or users). Reassign or remove those first.`);
      }
    }
    throw err;
  }
}
