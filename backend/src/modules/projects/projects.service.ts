import { Prisma, ProjectStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";

export async function listProjects(options?: { skip: number; take: number; search?: string }) {
  const where: Prisma.ProjectWhereInput = options?.search
    ? { name: { contains: options.search, mode: "insensitive" } }
    : {};
  const include = { company: true, department: true, owner: { select: { id: true, name: true } } };
  const orderBy = { createdAt: "desc" as const };

  if (!options) {
    return prisma.project.findMany({ where, include, orderBy });
  }
  const [items, total] = await Promise.all([
    prisma.project.findMany({ where, include, orderBy, skip: options.skip, take: options.take }),
    prisma.project.count({ where }),
  ]);
  return { items, total };
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      company: true,
      department: true,
      owner: { select: { id: true, name: true } },
      milestones: true,
    },
  });
  if (!project) throw new AppError(404, "Project not found");
  return project;
}

export interface CreateProjectInput {
  name: string;
  companyId: string;
  departmentId: string;
  startDate?: string;
  endDate?: string;
  ownerId: string;
  status?: ProjectStatus;
}

export const createProject = (input: CreateProjectInput) =>
  prisma.project.create({
    data: {
      name: input.name,
      companyId: input.companyId,
      departmentId: input.departmentId,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      ownerId: input.ownerId,
      status: input.status,
    },
  });

export async function updateProject(id: string, input: Partial<CreateProjectInput>) {
  await getProject(id);
  return prisma.project.update({
    where: { id },
    data: {
      ...input,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    },
  });
}

export async function deleteProject(id: string) {
  await getProject(id);
  await prisma.project.delete({ where: { id } });
}
