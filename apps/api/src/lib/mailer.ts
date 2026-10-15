import nodemailer from "nodemailer";
import type { Env } from "../config/env.js";
import type { Logger } from "./logger.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Outgoing email over SMTP. Without `SMTP_URL` (local development only: production config
 * rejects it) messages are written to the log, so sign-in links can be opened from the terminal.
 */
export function createMailer(env: Env, logger: Logger): Mailer {
  if (!env.SMTP_URL)
    return {
      send(mail) {
        logger.info(
          { to: mail.to, subject: mail.subject, text: mail.text },
          "Email not sent (SMTP_URL is unset)",
        );
        return Promise.resolve();
      },
    };
  const transport = nodemailer.createTransport(env.SMTP_URL);
  return {
    async send(mail) {
      await transport.sendMail({ from: env.EMAIL_FROM, ...mail });
    },
  };
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

/** A short message with one button, as plain text and HTML. */
export function linkEmail(input: {
  to: string;
  subject: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): Mail {
  const text = `${input.intro}\n\n${input.action}: ${input.url}\n\n${input.outro}\n`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1b1b1f">
<p>${escapeHtml(input.intro)}</p>
<p><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:10px 18px;border-radius:20px;background:#3f51b5;color:#fff;text-decoration:none">${escapeHtml(input.action)}</a></p>
<p style="color:#5f5f66;font-size:13px">${escapeHtml(input.outro)}</p>
</body></html>`;
  return { to: input.to, subject: input.subject, text, html };
}
