import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { getConfigHandler, updateConfigHandler } from "./config.controller";

const router = Router();
router.use(requireAuth, requireRole(Role.ADMIN));

router.get("/", asyncHandler(getConfigHandler));
router.put("/", asyncHandler(updateConfigHandler));

export default router;
