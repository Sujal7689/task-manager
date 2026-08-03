import { ProjectStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";

export const listProjects = () =>
  prisma.project.findMany({
    include: { company: true, department: true, owner: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

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
