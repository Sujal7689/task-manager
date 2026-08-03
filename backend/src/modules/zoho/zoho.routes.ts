import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { statusHandler, syncLogHandler, triggerSyncHandler } from "./zoho.controller";

const router = Router();
router.use(requireAuth, requireRole(Role.ADMIN));

router.get("/status", asyncHandler(statusHandler));
router.get("/sync-log", asyncHandler(syncLogHandler));
router.post("/sync", asyncHandler(triggerSyncHandler));

export default router;
