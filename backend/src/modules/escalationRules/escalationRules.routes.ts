import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { createHandler, deleteHandler, listHandler } from "./escalationRules.controller";

const router = Router();
router.use(requireAuth, requireRole(Role.ADMIN));

router.get("/", asyncHandler(listHandler));
router.post("/", asyncHandler(createHandler));
router.delete("/:id", asyncHandler(deleteHandler));

export default router;
