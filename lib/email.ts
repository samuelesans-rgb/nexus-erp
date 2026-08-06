import "server-only";

import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailDelivery = {
  provider: "smtp" | "noop";
  messageId?: string;
};

export interface EmailProvider {
  readonly name: "smtp" | "noop" | "test";
  send(message: EmailMessage): Promise<EmailDelivery>;
}

class NoopEmailProvider implements EmailProvider {
  readonly name = "noop" as const;

  async send(_message: EmailMessage): Promise<EmailDelivery> {
    console.info(JSON.stringify({ scope: "email", provider: this.name, outcome: "SKIPPED" }));
    return { provider: "noop" };
  }
}

class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp" as const;
  private readonly transporter;

  constructor(private readonly from: string) {
    const port = Number(process.env.SMTP_PORT ?? "587");
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async send(message: EmailMessage): Promise<EmailDelivery> {
    const result = await this.transporter.sendMail({ from: this.from, ...message });
    return { provider: "smtp", messageId: result.messageId };
  }
}

let provider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  provider = process.env.SMTP_HOST && process.env.SMTP_FROM
    ? new SmtpEmailProvider(process.env.SMTP_FROM)
    : new NoopEmailProvider();
  return provider;
}
