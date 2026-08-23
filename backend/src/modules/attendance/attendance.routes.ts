import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import * as controller from "./attendance.controller";

const router = Router();
router.use(requireAuth);

router.post("/check-in", asyncHandler(controller.checkInHandler));
router.post("/check-out", asyncHandler(controller.checkOutHandler));
router.get("/today", asyncHandler(controller.todayHandler));
router.get("/mine", asyncHandler(controller.myAttendanceHandler));
router.get("/team", asyncHandler(controller.teamAttendanceHandler));
router.get("/report/monthly", asyncHandler(controller.monthlyReportHandler));
router.patch("/:id", asyncHandler(controller.updateAttendanceHandler));

router.post("/leaves", asyncHandler(controller.createLeaveHandler));
router.get("/leaves/mine", asyncHandler(controller.myLeavesHandler));
router.get("/leaves/team", asyncHandler(controller.teamLeavesHandler));
router.patch("/leaves/:id", asyncHandler(controller.updateLeaveHandler));
router.delete("/leaves/:id", asyncHandler(controller.deleteLeaveHandler));

export default router;
