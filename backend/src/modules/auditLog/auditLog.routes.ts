import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { listHandler } from "./auditLog.controller";

const router = Router();
router.use(requireAuth, requireRole(Role.ADMIN));
router.get("/", asyncHandler(listHandler));

export default router;
