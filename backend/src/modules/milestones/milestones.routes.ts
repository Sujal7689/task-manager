import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import * as controller from "./milestones.controller";

const router = Router();
router.use(requireAuth);

const canCreate = requireRole(Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD, Role.STAFF);
const canEditOrDelete = requireRole(Role.ADMIN);

router.get("/", asyncHandler(controller.listHandler));
router.get("/:id", asyncHandler(controller.getHandler));
router.post("/", canCreate, asyncHandler(controller.createHandler));
router.patch("/:id", canEditOrDelete, asyncHandler(controller.updateHandler));
router.delete("/:id", canEditOrDelete, asyncHandler(controller.deleteHandler));

export default router;
