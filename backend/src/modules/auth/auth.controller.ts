import { Request, Response } from "express";
import { z } from "zod";
import * as authService from "./auth.service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
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

export async function forgotPasswordHandler(req: Request, res: Response) {
  const body = forgotPasswordSchema.parse(req.body);
  await authService.requestPasswordReset(body.email);
  res.json({ message: "If that email is registered, a password reset link has been sent." });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const body = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(body.token, body.newPassword);
  res.json({ message: "Password updated. You can now sign in with your new password." });
}
