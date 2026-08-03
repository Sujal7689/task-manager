import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import * as controller from "./milestones.controller";

const router = Router();
router.use(requireAuth);

const canManage = requireRole(Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD);

router.get("/", asyncHandler(controller.listHandler));
router.get("/:id", asyncHandler(controller.getHandler));
router.post("/", canManage, asyncHandler(controller.createHandler));
router.patch("/:id", canManage, asyncHandler(controller.updateHandler));
router.delete("/:id", canManage, asyncHandler(controller.deleteHandler));

export default router;
