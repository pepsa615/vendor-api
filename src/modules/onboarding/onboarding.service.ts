/* oxlint-disable no-unused-vars */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { encryptSensitive, sha256 } from '../../common/security/crypto.js';
import { DocumentStorageService } from '../../integrations/storage/document-storage.service.js';
import type {
  BusinessDataDto,
  DirectorDto,
  DocumentMetadataDto,
  PersonalDataDto,
} from './onboarding.dto.js';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly audit: AuditService,
  ) {}

  private async draft(tenantId: string) {
    const value = await this.db.onboardingApplication.findFirst({
      where: { tenantId },
      orderBy: { version: 'desc' },
      include: { directors: true, documents: true },
    });
    if (!value) throw new NotFoundException('Onboarding application not found');
    return value;
  }

  async get(tenantId: string) {
    const application = await this.draft(tenantId);
    return {
      ...application,
      directors: application.directors.map(
        ({ encryptedIdentityNo: _, identityFingerprint: __, ...director }) =>
          director,
      ),
    };
  }

  async savePersonal(
    tenantId: string,
    actorId: string,
    input: PersonalDataDto,
  ) {
    const application = await this.draft(tenantId);
    this.assertEditable(application.status);
    const { identityNumber, ...safe } = input;
    await this.db.onboardingApplication.update({
      where: { id: application.id },
      data: {
        personalData: {
          ...safe,
          encryptedIdentityNo: encryptSensitive(identityNumber),
          identityFingerprint: sha256(identityNumber),
        },
      },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'onboarding.personal_saved',
      subjectId: application.id,
    });
    return this.get(tenantId);
  }

  async saveBusiness(
    tenantId: string,
    actorId: string,
    input: BusinessDataDto,
  ) {
    const application = await this.draft(tenantId);
    this.assertEditable(application.status);
    await this.db.onboardingApplication.update({
      where: { id: application.id },
      data: { businessData: input as unknown as Prisma.InputJsonValue },
    });
    await this.db.vendor.update({
      where: { id: tenantId },
      data: { businessName: input.legalName },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'onboarding.business_saved',
      subjectId: application.id,
    });
    return this.get(tenantId);
  }

  async replaceDirectors(
    tenantId: string,
    actorId: string,
    directors: DirectorDto[],
  ) {
    const application = await this.draft(tenantId);
    this.assertEditable(application.status);
    if (!directors.length || directors.length > 10)
      throw new BadRequestException('One to ten directors are required');
    const sum = directors.reduce(
      (total, value) => total + value.ownershipShare,
      0,
    );
    if (sum > 100.001)
      throw new BadRequestException('Director ownership cannot exceed 100%');
    await this.db.$transaction(async (tx) => {
      await tx.director.deleteMany({
        where: { applicationId: application.id },
      });
      await tx.director.createMany({
        data: directors.map(({ identityNumber, dateOfBirth, ...value }) => ({
          ...value,
          dateOfBirth: new Date(dateOfBirth),
          applicationId: application.id,
          encryptedIdentityNo: encryptSensitive(identityNumber),
          identityFingerprint: sha256(identityNumber),
          ownershipShare: new Prisma.Decimal(value.ownershipShare),
        })),
      });
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'onboarding.directors_saved',
      subjectId: application.id,
      metadata: { count: directors.length },
    });
    return this.get(tenantId);
  }

  async upload(
    tenantId: string,
    actorId: string,
    metadata: DocumentMetadataDto,
    file: Express.Multer.File,
  ) {
    const application = await this.draft(tenantId);
    this.assertEditable(application.status);
    if (
      metadata.ownerType === 'DIRECTOR' &&
      (!metadata.ownerId ||
        !application.directors.some(({ id }) => id === metadata.ownerId))
    )
      throw new BadRequestException(
        'Director does not belong to this application',
      );
    const stored = await this.storage.store(tenantId, file);
    const document = await this.db.kycDocument.create({
      data: {
        applicationId: application.id,
        ownerType: metadata.ownerType,
        ownerId: metadata.ownerId,
        documentType: metadata.documentType,
        objectKey: stored.objectKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksum: createHash('sha256').update(file.buffer).digest('hex'),
        status: 'CLEAN',
        scanMessage: stored.scanMessage,
        scannedAt: new Date(),
      },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'onboarding.document_uploaded',
      subjectId: document.id,
      metadata: { documentType: document.documentType },
    });
    return document;
  }

  async submit(tenantId: string, actorId: string) {
    const application = await this.draft(tenantId);
    this.assertEditable(application.status);
    const vendor = await this.db.vendor.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const required =
      vendor.type === 'INDIVIDUAL'
        ? ['PROOF_OF_ID', 'PROOF_OF_ADDRESS', 'HEADSHOT']
        : [
            'BUSINESS_CERTIFICATE',
            'MEMART_CERTIFICATE',
            'STATUS_REPORT',
            'PROOF_OF_BUSINESS_ADDRESS',
          ];
    if (vendor.type === 'INDIVIDUAL' && !application.personalData)
      throw new BadRequestException('Personal data is required');
    if (
      vendor.type === 'COMPANY' &&
      (!application.businessData || application.directors.length === 0)
    )
      throw new BadRequestException(
        'Business data and at least one director are required',
      );
    const cleanTypes = new Set(
      application.documents
        .filter(({ status }) => status === 'CLEAN')
        .map(({ documentType }) => documentType),
    );
    const missing = required.filter((type) => !cleanTypes.has(type));
    if (vendor.type === 'COMPANY') {
      for (const director of application.directors)
        for (const type of ['PROOF_OF_ID', 'PROOF_OF_ADDRESS', 'HEADSHOT']) {
          if (
            !application.documents.some(
              (document) =>
                document.ownerId === director.id &&
                document.documentType === type &&
                document.status === 'CLEAN',
            )
          )
            missing.push(`${director.id}:${type}`);
        }
    }
    if (missing.length)
      throw new BadRequestException(
        `Required documents missing: ${missing.join(', ')}`,
      );
    const submitted =
      application.status === 'REJECTED'
        ? await this.db.$transaction(async (tx) => {
            const next = await tx.onboardingApplication.create({
              data: {
                tenantId,
                createdById: actorId,
                version: application.version + 1,
                status: 'UNDER_REVIEW',
                personalData: application.personalData ?? undefined,
                businessData: application.businessData ?? undefined,
                submittedAt: new Date(),
                directors: {
                  create: application.directors.map(
                    ({
                      id: _,
                      applicationId: __,
                      createdAt: ___,
                      updatedAt: ____,
                      ...director
                    }) => director,
                  ),
                },
                documents: {
                  create: application.documents
                    .filter(({ status }) => status === 'CLEAN')
                    .map(
                      ({
                        id: _,
                        applicationId: __,
                        createdAt: ___,
                        ...document
                      }) => document,
                    ),
                },
              },
            });
            await tx.vendor.update({
              where: { id: tenantId },
              data: { status: 'UNDER_REVIEW', rejectionNotes: Prisma.JsonNull },
            });
            return next;
          })
        : await this.db.$transaction(async (tx) => {
            const next = await tx.onboardingApplication.update({
              where: { id: application.id },
              data: {
                status: 'UNDER_REVIEW',
                submittedAt: new Date(),
                correctionFields: [],
              },
            });
            await tx.vendor.update({
              where: { id: tenantId },
              data: { status: 'UNDER_REVIEW', rejectionNotes: Prisma.JsonNull },
            });
            return next;
          });
    await this.audit.record({
      tenantId,
      actorId,
      action:
        application.status === 'REJECTED'
          ? 'onboarding.resubmitted'
          : 'onboarding.submitted',
      subjectId: submitted.id,
    });
    return { status: 'UNDER_REVIEW' };
  }

  private assertEditable(status: string) {
    if (!['DRAFT', 'REJECTED'].includes(status))
      throw new ConflictException('Application is not editable');
  }
}
