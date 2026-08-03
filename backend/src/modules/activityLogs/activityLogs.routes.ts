import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { makeUploader } from "../../utils/uploadStorage";
import { createHandler, listForTaskHandler, uploadAttachmentHandler } from "./activityLogs.controller";

const router = Router();
router.use(requireAuth);

const { upload } = makeUploader("activity-logs");

router.post("/", asyncHandler(createHandler));
router.get("/task/:taskId", asyncHandler(listForTaskHandler));
router.post("/:id/attachments", upload.single("file"), asyncHandler(uploadAttachmentHandler));

export default router;
