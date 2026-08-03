import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { createManualEntryHandler, myTimesheetHandler, teamTimesheetHandler } from "./timesheets.controller";

const router = Router();
router.use(requireAuth);

router.get("/mine", asyncHandler(myTimesheetHandler));
router.post("/manual-entry", asyncHandler(createManualEntryHandler));
router.get("/team", requireRole(Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD), asyncHandler(teamTimesheetHandler));

export default router;
