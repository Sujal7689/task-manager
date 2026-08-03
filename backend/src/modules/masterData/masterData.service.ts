import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { withFriendlyDeleteError } from "../../utils/prismaErrors";

// Companies
export const listCompanies = () => prisma.company.findMany({ orderBy: { name: "asc" } });
export const createCompany = (name: string) => prisma.company.create({ data: { name } });
export async function updateCompany(id: string, name: string) {
  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Company not found");
  return prisma.company.update({ where: { id }, data: { name } });
}
export const deleteCompany = (id: string) => withFriendlyDeleteError(() => prisma.company.delete({ where: { id } }), "company");

// Departments
export const listDepartments = (companyId?: string) =>
  prisma.department.findMany({ where: companyId ? { companyId } : undefined, orderBy: { name: "asc" } });
export const createDepartment = (name: string, companyId: string) =>
  prisma.department.create({ data: { name, companyId } });
export async function updateDepartment(id: string, data: { name?: string; companyId?: string }) {
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Department not found");
  return prisma.department.update({ where: { id }, data });
}
export const deleteDepartment = (id: string) => withFriendlyDeleteError(() => prisma.department.delete({ where: { id } }), "department");

// Categories (self-referencing Category/Sub-Category)
export const listCategories = () =>
  prisma.category.findMany({ orderBy: { name: "asc" }, include: { subCategories: true } });
export const createCategory = (name: string, parentId?: string) =>
  prisma.category.create({ data: { name, parentId } });
export async function updateCategory(id: string, data: { name?: string; parentId?: string | null }) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Category not found");
  return prisma.category.update({ where: { id }, data });
}
export const deleteCategory = (id: string) => withFriendlyDeleteError(() => prisma.category.delete({ where: { id } }), "category");
