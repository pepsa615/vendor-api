import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../core/database/prisma.service.js';

@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly db: PrismaService) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.processOne(), 5_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async processOne() {
    if (!process.env.SMTP_HOST) return false;
    const item = await this.db.emailOutbox.findFirst({
      where: {
        sentAt: null,
        failedAt: null,
        nextAttemptAt: { lte: new Date() },
        OR: [
          { claimedAt: null },
          { claimedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!item) return false;
    const claimed = await this.db.emailOutbox.updateMany({
      where: {
        id: item.id,
        sentAt: null,
        failedAt: null,
        claimedAt: item.claimedAt,
      },
      data: { claimedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    const payload = item.payload as Record<string, string>;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    const invitationUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/invitation?token=${encodeURIComponent(payload.token ?? '')}`;
    const content = this.content(item.template, payload, invitationUrl);
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? 'Pepsa Vendor <no-reply@pepsa.co>',
        to: item.recipient,
        subject: content.subject,
        text: content.text,
      });
      await this.db.emailOutbox.update({
        where: { id: item.id },
        data: {
          sentAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
          claimedAt: null,
        },
      });
    } catch {
      const attempts = item.attempts + 1;
      await this.db.emailOutbox.update({
        where: { id: item.id },
        data: {
          attempts,
          lastError: 'Delivery failed',
          claimedAt: null,
          failedAt: attempts >= 5 ? new Date() : null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(3_600_000, 2 ** attempts * 30_000),
          ),
        },
      });
    }
    return true;
  }

  private content(
    template: string,
    payload: Record<string, string>,
    invitationUrl: string,
  ) {
    if (template === 'verify-email')
      return {
        subject: 'Verify your Pepsa Vendor account',
        text: `Your verification code is ${payload.code}. It expires in 15 minutes.`,
      };
    if (template === 'reset-transaction-pin')
      return {
        subject: 'Reset your transaction PIN',
        text: `Your reset code is ${payload.code}. It expires in 15 minutes.`,
      };
    if (template === 'workflow-notification') {
      const url = payload.href
        ? `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}${payload.href}`
        : '';
      return {
        subject: payload.title || 'Pepsa Vendor update',
        text: `${payload.body ?? ''}${url ? `\n\nView: ${url}` : ''}`,
      };
    }
    return {
      subject: 'You are invited to Pepsa Vendor',
      text: `Complete your staff invitation: ${invitationUrl}`,
    };
  }
}
