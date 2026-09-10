import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import * as controller from "./crmLeadReports.controller";

const router = Router();
// Same audience as the existing Reports module (managers need this to see
// their team's pipeline, not just Admin).
router.use(requireAuth, requireRole(Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD));

router.get("/dashboard/assignment-overview", asyncHandler(controller.assignmentOverviewHandler));
router.get("/dashboard/grouped-by-staff", asyncHandler(controller.groupedByStaffHandler));
router.get("/dashboard/activity-feed", asyncHandler(controller.activityFeedHandler));
router.get("/dashboard/conversion-rate", asyncHandler(controller.conversionRateHandler));
router.get("/dashboard/stage-wise", asyncHandler(controller.stageWiseHandler));

router.get("/kanban", asyncHandler(controller.kanbanHandler));
router.get("/daily", asyncHandler(controller.dailyReportHandler));
router.get("/closure", asyncHandler(controller.closureReportHandler));

router.get("/leads", asyncHandler(controller.leadsSelectorHandler));
router.get("/leads/:id", asyncHandler(controller.leadDetailHandler));

router.get("/staff", asyncHandler(controller.staffOverviewHandler));
// :staffName — the Lead's "Staff Name" custom field, not Owner. See
// crmLeadReports.service.ts's module comment and listStaffOverview/getStaffDetail.
router.get("/staff/:staffName", asyncHandler(controller.staffDetailHandler));

export default router;
