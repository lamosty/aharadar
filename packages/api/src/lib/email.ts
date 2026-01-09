import { createLogger } from "@aharadar/shared";
import { Resend } from "resend";

const log = createLogger({ component: "email" });

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not configured");
    }
    resend = new Resend(apiKey);
  }
  return resend;
}

export interface SendMagicLinkParams {
  to: string;
  token: string;
  appUrl: string;
}

export async function sendMagicLinkEmail(params: SendMagicLinkParams): Promise<void> {
  const { to, token, appUrl } = params;
  const verifyUrl = `${appUrl}/verify?token=${encodeURIComponent(token)}`;

  const client = getResend();

  const { error } = await client.emails.send({
    from: "Aha Radar <onboarding@resend.dev>", // Resend test domain - works immediately
    to,
    subject: "Sign in to Aha Radar",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background: #f5f5f5;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="margin: 0 0 24px; font-size: 24px; font-weight: 600; color: #1a1a1a;">Sign in to Aha Radar</h1>
          <p style="margin: 0 0 24px; font-size: 16px; color: #4a4a4a; line-height: 1.5;">
            Click the button below to sign in. This link expires in 15 minutes.
          </p>
          <a href="${verifyUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 16px;">
            Sign in to Aha Radar
          </a>
          <p style="margin: 32px 0 0; font-size: 14px; color: #888;">
            If you didn't request this email, you can safely ignore it.
          </p>
        </div>
      </body>
      </html>
    `,
    text: `Sign in to Aha Radar\n\nClick here to sign in: ${verifyUrl}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
  });

  if (error) {
    log.error({ err: error, to }, "Failed to send magic link");
    throw new Error(`Failed to send email: ${error.message}`);
  }

  log.info({ to }, "Magic link sent");
}
