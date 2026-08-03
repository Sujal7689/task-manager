import { Request, Response } from "express";
import { z } from "zod";
import * as service from "./masterData.service";

// Companies
export async function listCompaniesHandler(_req: Request, res: Response) {
  res.json(await service.listCompanies());
}
export async function createCompanyHandler(req: Request, res: Response) {
  const body = z.object({ name: z.string().min(1) }).parse(req.body);
  res.status(201).json(await service.createCompany(body.name));
}
export async function updateCompanyHandler(req: Request, res: Response) {
  const body = z.object({ name: z.string().min(1) }).parse(req.body);
  res.json(await service.updateCompany(req.params.id, body.name));
}
export async function deleteCompanyHandler(req: Request, res: Response) {
  await service.deleteCompany(req.params.id);
  res.status(204).send();
}

// Departments
export async function listDepartmentsHandler(req: Request, res: Response) {
  res.json(await service.listDepartments(req.query.companyId as string | undefined));
}
export async function createDepartmentHandler(req: Request, res: Response) {
  const body = z.object({ name: z.string().min(1), companyId: z.string().min(1) }).parse(req.body);
  res.status(201).json(await service.createDepartment(body.name, body.companyId));
}
export async function updateDepartmentHandler(req: Request, res: Response) {
  const body = z.object({ name: z.string().min(1).optional(), companyId: z.string().min(1).optional() }).parse(req.body);
  res.json(await service.updateDepartment(req.params.id, body));
}
export async function deleteDepartmentHandler(req: Request, res: Response) {
  await service.deleteDepartment(req.params.id);
  res.status(204).send();
}

// Categories
export async function listCategoriesHandler(_req: Request, res: Response) {
  res.json(await service.listCategories());
}
export async function createCategoryHandler(req: Request, res: Response) {
  const body = z.object({ name: z.string().min(1), parentId: z.string().optional() }).parse(req.body);
  res.status(201).json(await service.createCategory(body.name, body.parentId));
}
export async function updateCategoryHandler(req: Request, res: Response) {
  const body = z
    .object({ name: z.string().min(1).optional(), parentId: z.string().nullable().optional() })
    .parse(req.body);
  res.json(await service.updateCategory(req.params.id, body));
}
export async function deleteCategoryHandler(req: Request, res: Response) {
  await service.deleteCategory(req.params.id);
  res.status(204).send();
}
