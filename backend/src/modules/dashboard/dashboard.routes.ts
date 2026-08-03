import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import {
  delayAnalysisHandler,
  memberKpiHandler,
  milestoneTrackingHandler,
  projectProgressHandler,
  statusDistributionHandler,
  summaryHandler,
  taskTrendHandler,
} from "./dashboard.controller";

const router = Router();
router.use(requireAuth);

router.get("/summary", asyncHandler(summaryHandler));
router.get("/member-kpi", asyncHandler(memberKpiHandler));
router.get("/project-progress", asyncHandler(projectProgressHandler));
router.get("/milestones-tracking", asyncHandler(milestoneTrackingHandler));
router.get("/delay-analysis", asyncHandler(delayAnalysisHandler));
router.get("/status-distribution", asyncHandler(statusDistributionHandler));
router.get("/task-trend", asyncHandler(taskTrendHandler));

export default router;
