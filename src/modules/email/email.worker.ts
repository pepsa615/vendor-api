import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../core/database/prisma.service.js';
import { wrapPepsaEmail } from './pepsa-email-layout.js';

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
        html: content.html,
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
    if (template === 'verify-email') {
      return wrapPepsaEmail({
        title: 'Verify your Pepsa Vendor account',
        greeting: 'Hello,',
        preheader: `Your verification code is ${payload.code ?? ''}`,
        paragraphs: [
          'Use this code to verify your Pepsa Vendor account.',
          `Verification code: **${payload.code ?? ''}**`,
          'This code expires in 15 minutes.',
        ],
        footerNote: 'If you did not create this account, you can ignore this email.',
        textBody: '',
      });
    }
    if (template === 'reset-transaction-pin') {
      return wrapPepsaEmail({
        title: 'Reset your transaction PIN',
        greeting: 'Hello,',
        preheader: `Your PIN reset code is ${payload.code ?? ''}`,
        paragraphs: [
          'Use this code to reset your transaction PIN.',
          `Reset code: **${payload.code ?? ''}**`,
          'This code expires in 15 minutes.',
        ],
        footerNote: 'If you did not request a PIN reset, contact support immediately.',
        textBody: '',
      });
    }
    if (template === 'workflow-notification') {
      const url = payload.href
        ? `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}${payload.href}`
        : '';
      return wrapPepsaEmail({
        title: payload.title || 'Pepsa Vendor update',
        greeting: 'Hello,',
        preheader: payload.title || 'Pepsa Vendor update',
        paragraphs: [payload.body || 'You have a new update in Pepsa Vendor.'],
        cta: url ? { label: 'Open in Pepsa Vendor', url } : undefined,
        textBody: '',
      });
    }
    return wrapPepsaEmail({
      title: 'You are invited to Pepsa Vendor',
      greeting: 'Hello,',
      preheader: 'Complete your staff invitation',
      paragraphs: [
        'You have been invited to join a Pepsa Vendor workspace.',
        'Use the secure button below to complete your invitation.',
      ],
      cta: { label: 'Accept invitation', url: invitationUrl },
      footerNote: 'If you did not expect this invitation, you can ignore this email.',
      textBody: '',
    });
  }
}
