import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service.js';
import { PaymentService } from '../../integrations/payment/payment.service.js';
import { DocumentStorageService } from '../../integrations/storage/document-storage.service.js';
import { decryptSensitive } from '../../common/security/crypto.js';

export function normalizeE164Phone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

@Injectable()
export class ProvisioningService {
  constructor(
    private readonly db: PrismaService,
    private readonly payment: PaymentService,
    private readonly storage: DocumentStorageService,
  ) {}

  list(scopedVendorIds?: string[]) {
    return this.db.vendorProvisioningSaga.findMany({
      where: scopedVendorIds?.length
        ? { tenantId: { in: scopedVendorIds } }
        : {},
      include: {
        vendor: { select: { id: true, businessName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async detail(vendorId: string) {
    const saga = await this.db.vendorProvisioningSaga.findFirst({
      where: { tenantId: vendorId },
      orderBy: { createdAt: 'desc' },
      include: { vendor: true },
    });
    if (!saga) throw new NotFoundException('Provisioning saga not found');
    return saga;
  }

  async retry(vendorId: string) {
    const saga = await this.db.vendorProvisioningSaga.findFirst({
      where: {
        tenantId: vendorId,
        status: { in: ['FAILED_RETRYABLE', 'RECONCILING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!saga)
      throw new NotFoundException('Retryable provisioning saga not found');
    await this.db.vendorProvisioningSaga.update({
      where: { id: saga.id },
      data: {
        status: 'PENDING',
        nextAttemptAt: new Date(),
        lastErrorCode: null,
      },
    });
    await this.db.vendor.update({
      where: { id: vendorId },
      data: { paymentProvisioning: 'PENDING' },
    });
    return this.process(saga.id);
  }

  async process(id: string) {
    const requestId = randomUUID();
    const claimed = await this.db.vendorProvisioningSaga.updateMany({
      where: {
        id,
        status: { in: ['PENDING', 'FAILED_RETRYABLE'] },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }],
      },
      data: {
        status: 'PAYMENT_USER_CREATING',
        leaseExpiresAt: new Date(Date.now() + 60_000),
        attempts: { increment: 1 },
        lastRequestId: requestId,
      },
    });
    if (claimed.count !== 1)
      return this.db.vendorProvisioningSaga.findUnique({ where: { id } });
    const saga = await this.db.vendorProvisioningSaga.findUniqueOrThrow({
      where: { id },
      include: { vendor: true },
    });
    try {
      const snapshot = saga.approvedKycSnapshot as {
        fullName?: string;
        phone?: string;
        address?: string;
        dateOfBirth?: string;
        encryptedNin?: string;
        documents?: Array<{
          type: 'proof_of_nin' | 'proof_of_address';
          objectKey: string;
          contentType: string;
          contentLength: number;
          checksumSha256: string;
        }>;
      };
      if (!snapshot.encryptedNin || snapshot.documents?.length !== 2)
        throw new Error('Approved Payment KYC snapshot is incomplete');
      await this.db.vendorProvisioningSaga.update({
        where: { id },
        data: { status: 'KYC_EXPORTING' },
      });
      const imported = new Map<string, string>();
      for (const document of snapshot.documents) {
        const sourceUrl = await this.storage.signedDownload(document.objectKey);
        imported.set(
          document.type,
          await this.payment.importKycDocument({
            sourceUrl,
            documentType: document.type,
            contentType: document.contentType,
            contentLength: document.contentLength,
            checksumSha256: document.checksumSha256,
          }),
        );
      }
      await this.db.vendorProvisioningSaga.update({
        where: { id },
        data: { status: 'PAYMENT_USER_CREATING' },
      });
      const wallet = await this.payment.createWallet(
        {
          external_user_id: saga.tenantId,
          user_type: 'business',
          kyc: {
            // The approved business identity is the holder of a commercial wallet.
            // Responsible-person details remain available as supporting KYC evidence.
            full_name: saga.vendor.businessName,
            phone_number: normalizeE164Phone(
              snapshot.phone ?? saga.vendor.phone,
            ),
            ...(snapshot.address ? { address: snapshot.address } : {}),
            ...(snapshot.dateOfBirth
              ? { date_of_birth: snapshot.dateOfBirth }
              : {}),
            nin: decryptSensitive(snapshot.encryptedNin),
            proof_of_nin_document_id: imported.get('proof_of_nin'),
            proof_of_address_document_id: imported.get('proof_of_address'),
          },
        },
        `vendor-wallet:${saga.tenantId}:${saga.applicationId}`,
      );
      return await this.db.$transaction(async (tx) => {
        await tx.vendor.update({
          where: { id: saga.tenantId },
          data: {
            status: 'APPROVED',
            externalCheckoutUserId: wallet.user_id,
            paymentWalletId: wallet.wallet_id,
            paymentSettlementId: wallet.settlement_wallet_id,
            paymentProvisioning: 'ACTIVE',
          },
        });
        return tx.vendorProvisioningSaga.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            leaseExpiresAt: null,
            nextAttemptAt: null,
            completedAt: new Date(),
          },
        });
      });
    } catch (error) {
      const nextAttemptAt = new Date(
        Date.now() + Math.min(300_000, 5_000 * 2 ** saga.attempts),
      );
      const code =
        error instanceof HttpException
          ? `${error.getStatus()}:${typeof error.getResponse() === 'string' ? error.getResponse() : JSON.stringify(error.getResponse()).slice(0, 90)}`
          : error instanceof Error
            ? `${error.name}: ${error.message}`.slice(0, 100)
            : 'PAYMENT_PROVISIONING_FAILED';
      await this.db.$transaction([
        this.db.vendor.update({
          where: { id: saga.tenantId },
          data: { paymentProvisioning: 'FAILED_RETRYABLE' },
        }),
        this.db.vendorProvisioningSaga.update({
          where: { id },
          data: {
            status: saga.attempts >= 4 ? 'MANUAL_REVIEW' : 'FAILED_RETRYABLE',
            leaseExpiresAt: null,
            nextAttemptAt: saga.attempts >= 4 ? null : nextAttemptAt,
            lastErrorCode: code.slice(0, 100),
          },
        }),
      ]);
      return this.db.vendorProvisioningSaga.findUnique({ where: { id } });
    }
  }
}
