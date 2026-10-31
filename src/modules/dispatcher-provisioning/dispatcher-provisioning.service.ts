import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service.js';
import { RiderBackendService } from '../../integrations/rider/rider-backend.service.js';

@Injectable()
export class DispatcherProvisioningService {
  constructor(
    private readonly db: PrismaService,
    private readonly riders: RiderBackendService,
  ) {}

  list(scopedVendorIds?: string[]) {
    return this.db.dispatcherProvisioningSaga.findMany({
      where: scopedVendorIds?.length
        ? { dispatcher: { tenantId: { in: scopedVendorIds } } }
        : {},
      include: {
        dispatcher: {
          select: {
            id: true,
            tenantId: true,
            riderUserId: true,
            riderProvisioningStatus: true,
            riderAccountStatus: true,
            latestRevision: {
              select: { firstName: true, lastName: true, phone: true },
            },
            vendor: { select: { businessName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async retry(dispatcherId: string) {
    const saga = await this.db.dispatcherProvisioningSaga.findFirst({
      where: {
        dispatcherId,
        status: { in: ['FAILED_RETRYABLE', 'MANUAL_REVIEW'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!saga)
      throw new NotFoundException(
        'Retryable rider provisioning saga not found',
      );
    await this.db.$transaction([
      this.db.dispatcherProvisioningSaga.update({
        where: { id: saga.id },
        data: {
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseExpiresAt: null,
          lastErrorCode: null,
        },
      }),
      this.db.dispatcher.update({
        where: { id: dispatcherId },
        data: {
          riderProvisioningStatus: 'PENDING',
          riderProvisioningErrorCode: null,
        },
      }),
    ]);
    return this.process(saga.id);
  }

  async syncAccountStatus(dispatcherId: string) {
    const state = await this.riders.provisioningState(dispatcherId);
    await this.db.dispatcher.update({
      where: { id: dispatcherId },
      data: {
        riderUserId: state.riderId,
        riderAccountStatus: state.provisioningStatus,
        riderLastSyncedAt: new Date(),
      },
    });
    return state;
  }

  async process(id: string) {
    const requestId = randomUUID();
    const claimed = await this.db.dispatcherProvisioningSaga.updateMany({
      where: {
        id,
        status: { in: ['PENDING', 'FAILED_RETRYABLE'] },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }],
      },
      data: {
        status: 'IN_PROGRESS',
        leaseExpiresAt: new Date(Date.now() + 60_000),
        attempts: { increment: 1 },
        lastRequestId: requestId,
      },
    });
    if (claimed.count !== 1)
      return this.db.dispatcherProvisioningSaga.findUnique({ where: { id } });
    const saga = await this.db.dispatcherProvisioningSaga.findUniqueOrThrow({
      where: { id },
      include: { dispatcher: { include: { vendor: true } } },
    });
    const revision = await this.db.dispatcherRevision.findUniqueOrThrow({
      where: { id: saga.revisionId },
    });
    try {
      const result = await this.riders.provision(
        {
          vendorId: saga.dispatcher.tenantId,
          vendorName: saga.dispatcher.vendor.businessName,
          dispatcherId: saga.dispatcherId,
          approvedRevisionId: saga.revisionId,
          firstName: revision.firstName,
          lastName: revision.lastName,
          phone: revision.phone,
          email: revision.email,
          dateOfBirth: revision.dateOfBirth.toISOString().slice(0, 10),
          gender: revision.gender,
          homeAddress: revision.homeAddress,
          state: revision.state,
          city: revision.city,
          vehicleType: revision.vehicleType as never,
          sourceUpdatedAt: revision.updatedAt.toISOString(),
        },
        `dispatcher-rider:${saga.dispatcherId}:${saga.revisionId}`,
        requestId,
      );
      return this.db.$transaction(async (tx) => {
        await tx.dispatcher.update({
          where: { id: saga.dispatcherId },
          data: {
            riderUserId: result.riderId,
            riderProvisioningStatus: 'ACTIVE',
            riderProvisionedAt: new Date(),
            riderLastSyncedAt: new Date(),
            riderProvisioningErrorCode: null,
            riderAccountStatus: result.status,
          },
        });
        return tx.dispatcherProvisioningSaga.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            completedAt: new Date(),
            leaseExpiresAt: null,
            nextAttemptAt: null,
            lastErrorCode: null,
          },
        });
      });
    } catch (error) {
      const details = error as Error & { retryable?: boolean; status?: number };
      const terminal =
        details.retryable === false ||
        (details.status !== undefined &&
          details.status >= 400 &&
          details.status < 500 &&
          details.status !== 429);
      const attempts = saga.attempts;
      const manual = terminal || attempts >= 5;
      const code = (details.message || 'RIDER_PROVISIONING_FAILED').slice(
        0,
        200,
      );
      await this.db.$transaction([
        this.db.dispatcherProvisioningSaga.update({
          where: { id },
          data: {
            status: manual ? 'MANUAL_REVIEW' : 'FAILED_RETRYABLE',
            leaseExpiresAt: null,
            nextAttemptAt: manual
              ? null
              : new Date(Date.now() + Math.min(300_000, 5_000 * 2 ** attempts)),
            lastErrorCode: code,
          },
        }),
        this.db.dispatcher.update({
          where: { id: saga.dispatcherId },
          data: {
            riderProvisioningStatus: manual
              ? 'MANUAL_REVIEW'
              : 'FAILED_RETRYABLE',
            riderProvisioningErrorCode: code,
          },
        }),
      ]);
      return this.db.dispatcherProvisioningSaga.findUnique({ where: { id } });
    }
  }
}
