import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { makeUploader } from "../../utils/uploadStorage";
import { createHandler, listMineHandler, listTeamHandler, uploadAttachmentHandler } from "./dailyActivities.controller";

const router = Router();
router.use(requireAuth);

const { upload } = makeUploader("daily-activities");

router.post("/", asyncHandler(createHandler));
router.get("/mine", asyncHandler(listMineHandler));
router.get("/team", asyncHandler(listTeamHandler));
router.post("/:id/attachments", upload.single("file"), asyncHandler(uploadAttachmentHandler));

export default router;
