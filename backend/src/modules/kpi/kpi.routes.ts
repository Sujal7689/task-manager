import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { getConfigHandler, updateConfigHandler } from "./kpi.controller";

const router = Router();
router.use(requireAuth);

router.get("/weights", asyncHandler(getConfigHandler));
router.put("/weights", requireRole(Role.ADMIN), asyncHandler(updateConfigHandler));

export default router;
