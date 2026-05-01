import { Resend } from 'resend';

export interface EmailOptions {
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tracking?: {
    open: boolean;
    click: boolean;
  };
  tags?: Array<{ name: string; value: string }>;
}

export class EmailService {
  private resend: Resend;
  private readonly defaultFrom: string;
  private readonly defaultReplyTo: string;
  private readonly transactionalFrom: string;

  constructor() {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.defaultFrom = process.env.EMAIL_FROM_ADDRESS || 'notifications@dance-hub.io';
    this.defaultReplyTo = process.env.EMAIL_REPLY_TO || 'hello@dance-hub.io';
    this.transactionalFrom = process.env.EMAIL_FROM_TRANSACTIONAL || 'account@dance-hub.io';
  }

  async sendWithRetry<T>(
    emailData: Parameters<Resend['emails']['send']>[0],
    maxRetries: number = 3,
    backoffMs: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.resend.emails.send(emailData);

        if (result.error) {
          throw new Error(result.error.message);
        }

        return result.data as T;
      } catch (error) {
        lastError = error as Error;
        console.error(`Email send attempt ${attempt + 1} failed:`, error);

        if (attempt < maxRetries - 1) {
          await this.delay(backoffMs * Math.pow(2, attempt));
        }
      }
    }

    throw lastError!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendTransactionalEmail(
    to: string | string[],
    subject: string,
    react: React.ReactElement,
    options?: EmailOptions
  ) {
    const emailData = {
      from: this.transactionalFrom,
      replyTo: this.defaultReplyTo,
      tracking: { open: false, click: false },
      ...options,
      to: Array.isArray(to) ? to : [to],
      subject,
      react,
    };

    return await this.sendWithRetry(emailData);
  }

  async sendBulkEmails(
    emails: Array<{
      to: string | string[];
      subject: string;
      react: React.ReactElement;
      options?: EmailOptions;
    }>
  ) {
    return Promise.allSettled(
      emails.map(e => this.sendTransactionalEmail(e.to, e.subject, e.react, e.options))
    );
  }

  async sendAuthEmail(
    to: string,
    subject: string,
    react: React.ReactElement
  ) {
    return await this.sendTransactionalEmail(to, subject, react, {
      from: 'DanceHub <account@dance-hub.io>',
    });
  }

  async sendNotificationEmail(
    to: string,
    subject: string,
    react: React.ReactElement
  ) {
    return await this.sendTransactionalEmail(to, subject, react, {
      from: this.defaultFrom,
    });
  }
}

let emailService: EmailService;

export function getEmailService(): EmailService {
  if (!emailService) {
    emailService = new EmailService();
  }
  return emailService;
}
