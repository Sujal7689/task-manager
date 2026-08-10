import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/appError";
import { logError } from "../modules/errorLog/errorLog.service";

// Prisma throws raw, uncaught exceptions for constraint violations that
// application code didn't pre-validate (e.g. a dropdown submitting a
// project/department/category id that was deleted by someone else in the
// meantime). Translating the common codes here means a stale reference
// becomes a clear 400/404 instead of an opaque 500 — this was the root cause
// behind several "Internal server error" reports on task creation.
function classifyPrismaError(err: Prisma.PrismaClientKnownRequestError): { statusCode: number; message: string } | null {
  switch (err.code) {
    case "P2002": {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : "value";
      return { statusCode: 409, message: `A record with this ${target} already exists.` };
    }
    case "P2003":
      return { statusCode: 400, message: "One of the referenced records (project, milestone, department, category, or user) no longer exists." };
    case "P2025":
      return { statusCode: 404, message: "Record not found." };
    default:
      return null;
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid request" });
  }

  // Everything below this point wasn't anticipated by application code, so it's
  // exactly the class of error an admin has no visibility into otherwise —
  // capture it before responding. logError swallows its own failures.
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const classified = err instanceof Prisma.PrismaClientKnownRequestError ? classifyPrismaError(err) : null;
  const statusCode = classified?.statusCode ?? 500;

  void logError({
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message,
    stack,
    userId: req.user?.id,
    userRole: req.user?.role,
  });

  if (classified) {
    return res.status(classified.statusCode).json({ error: classified.message });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
