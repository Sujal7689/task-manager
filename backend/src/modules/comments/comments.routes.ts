import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { createHandler, listHandler } from "./comments.controller";

const router = Router();
router.use(requireAuth);

router.get("/task/:taskId", asyncHandler(listHandler));
router.post("/", asyncHandler(createHandler));

export default router;
