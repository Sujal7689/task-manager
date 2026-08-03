import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { createHandler, deleteHandler, getHandler, listHandler, updateHandler } from "./users.controller";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(listHandler));
router.get("/:id", asyncHandler(getHandler));
router.post("/", requireRole(Role.ADMIN), asyncHandler(createHandler));
router.patch("/:id", requireRole(Role.ADMIN), asyncHandler(updateHandler));
router.delete("/:id", requireRole(Role.ADMIN), asyncHandler(deleteHandler));

export default router;
