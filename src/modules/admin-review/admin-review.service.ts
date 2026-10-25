/* oxlint-disable no-unused-vars */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { sha256 } from '../../common/security/crypto.js';
import { DocumentStorageService } from '../../integrations/storage/document-storage.service.js';
import type { ReviewApplicationDto } from './admin-review.dto.js';
@Injectable()
export class AdminReviewService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: DocumentStorageService,
  ) {}
  list() {
    return this.db.onboardingApplication.findMany({
      where: { status: 'UNDER_REVIEW' },
      include: {
        vendor: {
          select: {
            id: true,
            type: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
        _count: { select: { directors: true, documents: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }
  async detail(id: string) {
    const value = await this.db.onboardingApplication.findUnique({
      where: { id },
      include: {
        vendor: {
          select: {
            id: true,
            type: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
        directors: true,
        documents: {
          select: {
            id: true,
            ownerType: true,
            ownerId: true,
            documentType: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
    if (!value) throw new NotFoundException('Application not found');
    const personal = (value.personalData ?? {}) as Record<string, unknown>;
    const business = (value.businessData ?? {}) as Record<string, unknown>;
    return {
      id: value.id,
      tenantId: value.tenantId,
      version: value.version,
      status: value.status,
      submittedAt: value.submittedAt,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      vendor: value.vendor,
      personalData: this.personalView(personal),
      businessData: {
        legalName: business.legalName,
        registrationType: business.registrationType,
        registrationDate: business.registrationDate,
        registrationNumber: business.registrationNumber,
        taxNumber: business.taxNumber,
        registeredAddress: business.registeredAddress,
        businessAddress: business.businessAddress,
        state: business.state,
        city: business.city,
      },
      directors: value.directors.map((director) => ({
        id: director.id,
        firstName: director.firstName,
        lastName: director.lastName,
        gender: director.gender,
        dateOfBirth: director.dateOfBirth,
        phone: director.phone,
        homeAddress: director.homeAddress,
        state: director.state,
        city: director.city,
        role: director.role,
        ownershipShare: String(director.ownershipShare),
      })),
      documents: value.documents,
    };
  }

  private personalView(value: Record<string, unknown>) {
    return {
      firstName: value.firstName,
      lastName: value.lastName,
      gender: value.gender,
      dateOfBirth: value.dateOfBirth,
      phone: value.phone,
      homeAddress: value.homeAddress,
      state: value.state,
      city: value.city,
    };
  }
  async document(applicationId: string, documentId: string, actorId: string) {
    const value = await this.db.kycDocument.findFirst({
      where: { id: documentId, applicationId, status: 'CLEAN' },
    });
    if (!value) throw new NotFoundException('Document not found');
    const url = await this.storage.signedDownload(value.objectKey);
    await this.audit.record({
      tenantId: undefined,
      actorId,
      action: 'admin.document_accessed',
      subjectId: value.id,
      metadata: { applicationId },
    });
    return { url, expiresIn: 60 };
  }
  async decide(
    applicationId: string,
    actorId: string,
    idempotencyKey: string,
    input: ReviewApplicationDto,
    requestId?: string,
  ) {
    if (!idempotencyKey)
      throw new ConflictException('Idempotency-Key is required');
    const requestHash = sha256(JSON.stringify(input));
    const existing = await this.db.idempotencyRecord.findUnique({
      where: { scope_key: { scope: 'vendor-review', key: idempotencyKey } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash || existing.actorId !== actorId)
        throw new ConflictException(
          'Idempotency key was used for another request',
        );
      return existing.responseBody;
    }
    const application = await this.db.onboardingApplication.findUnique({
      where: { id: applicationId },
      include: { vendor: true, directors: true, documents: true },
    });
    if (!application || application.status !== 'UNDER_REVIEW')
      throw new ConflictException('Application is not awaiting review');
    if (input.decision === 'REJECT' && !input.correctionFields?.length)
      throw new ConflictException(
        'Rejected applications require correction fields',
      );
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const body = { applicationId, status, decidedAt: new Date().toISOString() };
    await this.db.$transaction(async (tx) => {
      await tx.onboardingApplication.update({
        where: { id: applicationId },
        data: {
          status,
          decidedAt: new Date(),
          decisionReason: input.reason,
          correctionFields: input.correctionFields ?? [],
        },
      });
      await tx.vendor.update({
        where: { id: application.tenantId },
        data: {
          status:
            input.decision === 'APPROVE' ? 'APPROVED_PROVISIONING' : 'REJECTED',
          paymentProvisioning:
            input.decision === 'APPROVE' ? 'PENDING' : undefined,
          rejectionNotes:
            input.decision === 'REJECT'
              ? { reason: input.reason, fields: input.correctionFields }
              : Prisma.JsonNull,
        },
      });
      if (input.decision === 'APPROVE') {
        const personal = (application.personalData ?? {}) as Record<
          string,
          unknown
        >;
        const business = (application.businessData ?? {}) as Record<
          string,
          unknown
        >;
        const responsible =
          application.vendor.type === 'INDIVIDUAL'
            ? personal
            : (application.directors[0] as unknown as Record<string, unknown>);
        const proofOfNin = application.documents.find(
          (document) =>
            document.status === 'CLEAN' &&
            document.documentType === 'PROOF_OF_ID' &&
            (application.vendor.type === 'INDIVIDUAL' ||
              document.ownerId === application.directors[0]?.id),
        );
        const proofOfAddress = application.documents.find(
          (document) =>
            document.status === 'CLEAN' &&
            document.documentType === 'PROOF_OF_ADDRESS' &&
            (application.vendor.type === 'INDIVIDUAL' ||
              document.ownerId === application.directors[0]?.id),
        );
        if (!proofOfNin || !proofOfAddress)
          throw new ConflictException('Approved Payment KYC documents missing');
        await tx.vendorProvisioningSaga.upsert({
          where: { applicationId },
          create: {
            tenantId: application.tenantId,
            applicationId,
            approvedKycSnapshot: {
              fullName:
                `${String(responsible.firstName ?? '').trim()} ${String(responsible.lastName ?? '').trim()}`.trim() ||
                application.vendor.businessName,
              phone:
                String(responsible.phone ?? '').trim() ||
                application.vendor.phone,
              address: String(
                responsible.homeAddress ?? business.businessAddress ?? '',
              ),
              dateOfBirth: String(responsible.dateOfBirth ?? ''),
              encryptedNin: String(responsible.encryptedIdentityNo ?? ''),
              documents: [proofOfNin, proofOfAddress].map((document) => ({
                id: document.id,
                type:
                  document.documentType === 'PROOF_OF_ID'
                    ? 'proof_of_nin'
                    : 'proof_of_address',
                objectKey: document.objectKey,
                contentType: document.mimeType,
                contentLength: document.sizeBytes,
                checksumSha256: document.checksum,
              })),
              applicationVersion: application.version,
            },
          },
          update: {},
        });
      }
      await tx.idempotencyRecord.create({
        data: {
          scope: 'vendor-review',
          key: idempotencyKey,
          actorId,
          requestHash,
          responseStatus: 200,
          responseBody: body,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      });
    });
    await this.audit.record({
      tenantId: application.tenantId,
      actorId,
      action: `onboarding.${status.toLowerCase()}`,
      subjectId: application.id,
      requestId,
      metadata: {
        reason: input.reason,
        correctionFields: input.correctionFields ?? [],
      },
    });
    return body;
  }
}
