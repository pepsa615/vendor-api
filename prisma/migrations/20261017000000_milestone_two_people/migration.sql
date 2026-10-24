CREATE TYPE "DispatcherStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DISABLED');
CREATE TYPE "DispatcherRevisionStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "customers" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatchers" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "status" "DispatcherStatus" NOT NULL DEFAULT 'DRAFT',
  "availability" BOOLEAN NOT NULL DEFAULT false,
  "approvedRevisionId" UUID,
  "latestRevisionId" UUID,
  "totalOrdersPicked" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dispatchers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatcher_revisions" (
  "id" UUID NOT NULL,
  "dispatcherId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "DispatcherRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "dateOfBirth" TIMESTAMP(3) NOT NULL,
  "gender" TEXT NOT NULL,
  "identityType" TEXT NOT NULL,
  "encryptedIdentityNo" TEXT NOT NULL,
  "identityFingerprint" TEXT NOT NULL,
  "identityExpiry" TIMESTAMP(3),
  "homeAddress" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
  "engagementType" TEXT NOT NULL,
  "vehicleType" TEXT NOT NULL,
  "vehicleBrand" TEXT,
  "plateNumber" TEXT,
  "vehicleRegistrationDate" TIMESTAMP(3) NOT NULL,
  "guarantorName" TEXT NOT NULL,
  "guarantorPhone" TEXT NOT NULL,
  "guarantorEmail" TEXT,
  "guarantorAddress" TEXT,
  "revenueSharePct" DECIMAL(5,2) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "decisionReason" TEXT,
  "correctionFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dispatcher_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatcher_documents" (
  "id" UUID NOT NULL,
  "revisionId" UUID NOT NULL,
  "documentType" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'QUARANTINED',
  "scanMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scannedAt" TIMESTAMP(3),
  CONSTRAINT "dispatcher_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_tenantId_phone_key" ON "customers"("tenantId", "phone");
CREATE INDEX "customers_tenantId_createdAt_idx" ON "customers"("tenantId", "createdAt");
CREATE UNIQUE INDEX "dispatchers_approvedRevisionId_key" ON "dispatchers"("approvedRevisionId");
CREATE UNIQUE INDEX "dispatchers_latestRevisionId_key" ON "dispatchers"("latestRevisionId");
CREATE INDEX "dispatchers_tenantId_status_idx" ON "dispatchers"("tenantId", "status");
CREATE INDEX "dispatchers_tenantId_availability_idx" ON "dispatchers"("tenantId", "availability");
CREATE UNIQUE INDEX "dispatcher_revisions_dispatcherId_version_key" ON "dispatcher_revisions"("dispatcherId", "version");
CREATE INDEX "dispatcher_revisions_status_submittedAt_idx" ON "dispatcher_revisions"("status", "submittedAt");
CREATE INDEX "dispatcher_documents_revisionId_documentType_idx" ON "dispatcher_documents"("revisionId", "documentType");

ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatchers" ADD CONSTRAINT "dispatchers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatcher_revisions" ADD CONSTRAINT "dispatcher_revisions_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "dispatchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatcher_documents" ADD CONSTRAINT "dispatcher_documents_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "dispatcher_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatchers" ADD CONSTRAINT "dispatchers_approvedRevisionId_fkey" FOREIGN KEY ("approvedRevisionId") REFERENCES "dispatcher_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatchers" ADD CONSTRAINT "dispatchers_latestRevisionId_fkey" FOREIGN KEY ("latestRevisionId") REFERENCES "dispatcher_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
