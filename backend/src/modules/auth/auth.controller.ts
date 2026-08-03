import { Request, Response } from "express";
import { z } from "zod";
import * as authService from "./auth.service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginHandler(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const result = await authService.login(body.email, body.password);
  res.json(result);
}

export async function meHandler(req: Request, res: Response) {
  const profile = await authService.getProfile(req.user!.id);
  res.json(profile);
}
