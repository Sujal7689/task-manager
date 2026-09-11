import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import * as controller from "./crmLeadReports.controller";

const router = Router();
// Staff now included (client direction) — access is gated here, but what
// each role actually SEES is scoped per-request in the service layer
// (getCrmStaffScope): Admin/Manager unrestricted, Team Lead their team,
// Staff themselves only. This scoping is specific to the CRM Reports page —
// it does not change any other module's role rules.
router.use(requireAuth, requireRole(Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD, Role.STAFF));

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
