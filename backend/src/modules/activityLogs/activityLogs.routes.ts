import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { makeUploader } from "../../utils/uploadStorage";
import { createHandler, deleteHandler, listForTaskHandler, updateHandler, uploadAttachmentHandler } from "./activityLogs.controller";

const router = Router();
router.use(requireAuth);

const { upload } = makeUploader("activity-logs");
const canEditOrDelete = requireRole(Role.ADMIN);

router.post("/", asyncHandler(createHandler));
router.get("/task/:taskId", asyncHandler(listForTaskHandler));
router.patch("/:id", canEditOrDelete, asyncHandler(updateHandler));
router.delete("/:id", canEditOrDelete, asyncHandler(deleteHandler));
router.post("/:id/attachments", upload.array("file", 10), asyncHandler(uploadAttachmentHandler));

export default router;
