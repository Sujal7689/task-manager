import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = env.smtpHost
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
    })
  : null;

export async function sendEmail(to: string, subject: string, text: string) {
  if (!transporter) {
    console.log(`[mailer] SMTP not configured — skipping email to ${to}: ${subject}`);
    return;
  }
  await transporter.sendMail({ from: env.smtpFrom, to, subject, text });
}
