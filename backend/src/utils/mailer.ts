import nodemailer from "nodemailer";
import { getEffectiveSettings } from "../modules/config/config.service";

// Built fresh per send (not cached at module load) so a Configuration-tab
// change to SMTP settings takes effect on the very next email, no restart.
export async function sendEmail(to: string, subject: string, text: string) {
  const settings = await getEffectiveSettings();
  if (!settings.smtpHost) {
    console.log(`[mailer] SMTP not configured — skipping email to ${to}: ${subject}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpPort === 465,
    auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPassword } : undefined,
  });

  // Email is a best-effort side channel — the in-app notification log (or,
  // for password reset, the token itself) is the source of truth. A bad SMTP
  // config (increasingly easy to fat-finger now that it's editable from the
  // Configuration tab) must not fail the request that triggered the email.
  try {
    await transporter.sendMail({ from: settings.smtpFrom, to, subject, text });
  } catch (err) {
    console.error(`[mailer] failed to send email to ${to}:`, err instanceof Error ? err.message : err);
  }
}
