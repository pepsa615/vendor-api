CREATE TYPE "RiderProvisioningStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'IN_PROGRESS', 'ACTIVE', 'FAILED_RETRYABLE', 'MANUAL_REVIEW', 'SUSPENDED');

ALTER TABLE "dispatchers"
  ADD COLUMN "riderUserId" UUID,
  ADD COLUMN "riderProvisioningStatus" "RiderProvisioningStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "riderProvisionedAt" TIMESTAMP(3),
  ADD COLUMN "riderProvisioningErrorCode" TEXT,
  ADD COLUMN "riderAccountStatus" TEXT,
  ADD COLUMN "riderLastSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "dispatchers_riderUserId_key" ON "dispatchers"("riderUserId");

CREATE TABLE "dispatcher_provisioning_sagas" (
  "id" UUID NOT NULL,
  "dispatcherId" UUID NOT NULL,
  "revisionId" UUID NOT NULL,
  "status" "RiderProvisioningStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastRequestId" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dispatcher_provisioning_sagas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispatcher_provisioning_sagas_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "dispatchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "dispatcher_provisioning_sagas_dispatcherId_revisionId_key" ON "dispatcher_provisioning_sagas"("dispatcherId", "revisionId");
CREATE INDEX "dispatcher_provisioning_sagas_status_nextAttemptAt_idx" ON "dispatcher_provisioning_sagas"("status", "nextAttemptAt");
CREATE INDEX "dispatcher_provisioning_sagas_leaseExpiresAt_idx" ON "dispatcher_provisioning_sagas"("leaseExpiresAt");
