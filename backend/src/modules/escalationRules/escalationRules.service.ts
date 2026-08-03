import { prisma } from "../../config/prisma";

export const listEscalationRules = () =>
  prisma.escalationRule.findMany({
    include: { company: { select: { name: true } }, department: { select: { name: true } } },
    orderBy: { overdueDay: "asc" },
  });

export interface EscalationRuleInput {
  companyId?: string;
  departmentId?: string;
  overdueDay: number;
  notifyDepartmentHead?: boolean;
}

export const createEscalationRule = (input: EscalationRuleInput) => prisma.escalationRule.create({ data: input });

export const deleteEscalationRule = (id: string) => prisma.escalationRule.delete({ where: { id } });
