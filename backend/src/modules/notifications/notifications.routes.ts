import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { listHandler, markAllReadHandler, markReadHandler, unreadCountHandler } from "./notifications.controller";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(listHandler));
router.get("/unread-count", asyncHandler(unreadCountHandler));
router.patch("/:id/read", asyncHandler(markReadHandler));
router.patch("/read-all", asyncHandler(markAllReadHandler));

export default router;
