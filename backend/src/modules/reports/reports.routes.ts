import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import * as controller from "./reports.controller";

const router = Router();
router.use(requireAuth);

const managerUp = requireRole(Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD);

router.get("/grouped", managerUp, asyncHandler(controller.groupedHandler));
router.get("/task-detail", managerUp, asyncHandler(controller.taskDetailHandler));
router.get("/task-summary", managerUp, asyncHandler(controller.taskSummaryHandler));
router.get("/staff-performance", asyncHandler(controller.staffPerformanceHandler));
router.get("/staff-timesheet", asyncHandler(controller.staffTimesheetHandler));
router.get("/overdue", managerUp, asyncHandler(controller.overdueHandler));
router.get("/department-rollup", requireRole(Role.ADMIN), asyncHandler(controller.departmentRollupHandler));
router.get("/leaderboard-export", managerUp, asyncHandler(controller.leaderboardExportHandler));
router.get("/timesheet-summary", managerUp, asyncHandler(controller.timesheetSummaryHandler));
router.get("/timesheet-detail", managerUp, asyncHandler(controller.timesheetDetailHandler));

export default router;
