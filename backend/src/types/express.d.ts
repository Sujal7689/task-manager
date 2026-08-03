import { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        departmentId: string | null;
        companyId: string | null;
      };
    }
  }
}

export {};
