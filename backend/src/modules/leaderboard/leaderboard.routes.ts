import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { getHandler } from "./leaderboard.controller";

const router = Router();
router.use(requireAuth);
router.get("/", asyncHandler(getHandler));

export default router;
