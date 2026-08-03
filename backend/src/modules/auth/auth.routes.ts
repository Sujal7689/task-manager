import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { loginHandler, meHandler } from "./auth.controller";

const router = Router();

router.post("/login", asyncHandler(loginHandler));
router.get("/me", requireAuth, asyncHandler(meHandler));

export default router;
