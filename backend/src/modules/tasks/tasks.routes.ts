import { Router } from "express";
import multer from "multer";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { makeUploader } from "../../utils/uploadStorage";
import * as controller from "./tasks.controller";

const router = Router();
router.use(requireAuth);

const canCreateEdit = requireRole(Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD, Role.STAFF);
const canDelete = requireRole(Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD, Role.STAFF);
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { upload: attachmentUpload } = makeUploader("tasks");

router.get("/", asyncHandler(controller.listHandler));
router.get("/bulk-import/template", asyncHandler(controller.bulkImportTemplateHandler));
router.post("/bulk-import", canCreateEdit, csvUpload.single("file"), asyncHandler(controller.bulkImportHandler));
router.get("/:id", asyncHandler(controller.getHandler));
router.post("/", canCreateEdit, asyncHandler(controller.createHandler));
router.post("/:id/clone", canCreateEdit, asyncHandler(controller.cloneHandler));
router.post("/:id/attachments", attachmentUpload.array("file", 10), asyncHandler(controller.uploadAttachmentHandler));
router.delete("/:id/attachments/:attachmentId", asyncHandler(controller.deleteAttachmentHandler));
router.patch("/:id", canCreateEdit, asyncHandler(controller.updateHandler));
router.patch("/:id/progress", asyncHandler(controller.updateProgressHandler));
router.delete("/:id", canDelete, asyncHandler(controller.deleteHandler));

export default router;
