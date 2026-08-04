import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { forgotPasswordHandler, loginHandler, meHandler, resetPasswordHandler } from "./auth.controller";

const router = Router();

router.post("/login", asyncHandler(loginHandler));
router.get("/me", requireAuth, asyncHandler(meHandler));
router.post("/forgot-password", asyncHandler(forgotPasswordHandler));
router.post("/reset-password", asyncHandler(resetPasswordHandler));

export default router;
