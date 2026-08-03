import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import * as controller from "./masterData.controller";

const router = Router();
router.use(requireAuth);

const adminOnly = requireRole(Role.ADMIN);

router.get("/companies", asyncHandler(controller.listCompaniesHandler));
router.post("/companies", adminOnly, asyncHandler(controller.createCompanyHandler));
router.patch("/companies/:id", adminOnly, asyncHandler(controller.updateCompanyHandler));
router.delete("/companies/:id", adminOnly, asyncHandler(controller.deleteCompanyHandler));

router.get("/departments", asyncHandler(controller.listDepartmentsHandler));
router.post("/departments", adminOnly, asyncHandler(controller.createDepartmentHandler));
router.patch("/departments/:id", adminOnly, asyncHandler(controller.updateDepartmentHandler));
router.delete("/departments/:id", adminOnly, asyncHandler(controller.deleteDepartmentHandler));

router.get("/categories", asyncHandler(controller.listCategoriesHandler));
router.post("/categories", adminOnly, asyncHandler(controller.createCategoryHandler));
router.patch("/categories/:id", adminOnly, asyncHandler(controller.updateCategoryHandler));
router.delete("/categories/:id", adminOnly, asyncHandler(controller.deleteCategoryHandler));

export default router;
