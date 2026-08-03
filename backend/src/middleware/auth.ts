import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/appError";
import { verifyToken } from "../utils/jwt";
import { runWithUser } from "../utils/requestContext";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "Missing or invalid Authorization header");
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      departmentId: payload.departmentId,
      companyId: payload.companyId,
    };
    // Makes the acting user available to the Prisma audit-log middleware
    // (config/prisma.ts) without threading a userId through every service call.
    runWithUser(payload.sub, next);
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
}
