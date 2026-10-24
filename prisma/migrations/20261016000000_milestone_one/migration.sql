CREATE TYPE "VendorType" AS ENUM ('INDIVIDUAL', 'COMPANY');
CREATE TYPE "VendorStatus" AS ENUM ('EMAIL_PENDING', 'IN_PROGRESS', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');
CREATE TYPE "ChallengeType" AS ENUM ('EMAIL_VERIFICATION', 'INVITATION');
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE "DocumentStatus" AS ENUM ('QUARANTINED', 'SCANNING', 'CLEAN', 'REJECTED');
CREATE TYPE "DocumentOwnerType" AS ENUM ('INDIVIDUAL', 'BUSINESS', 'DIRECTOR');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

ALTER TABLE "vendors" ADD COLUMN "type" "VendorType" NOT NULL DEFAULT 'COMPANY',
ADD COLUMN "status" "VendorStatus" NOT NULL DEFAULT 'EMAIL_PENDING',
ADD COLUMN "rejectionNotes" JSONB;
DROP INDEX IF EXISTS "vendors_id_email_key";
CREATE UNIQUE INDEX "vendors_email_key" ON "vendors"("email");
ALTER TABLE "audit_events" ALTER COLUMN "tenantId" DROP NOT NULL,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'SUCCESS';
CREATE INDEX "audit_events_action_createdAt_idx" ON "audit_events"("action", "createdAt");

CREATE TABLE "users" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "email" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL,
  "phone" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
  "emailVerifiedAt" TIMESTAMP(3), "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"), CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "users_normalizedEmail_key" ON "users"("normalizedEmail");
CREATE INDEX "users_tenantId_status_idx" ON "users"("tenantId", "status");

CREATE TABLE "sessions" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "refreshTokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "replacedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"), CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");
CREATE INDEX "sessions_userId_expiresAt_idx" ON "sessions"("userId", "expiresAt");

CREATE TABLE "auth_challenges" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "type" "ChallengeType" NOT NULL,
  "tokenHash" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id"), CONSTRAINT "auth_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "auth_challenges_tokenHash_key" ON "auth_challenges"("tokenHash");
CREATE INDEX "auth_challenges_userId_type_expiresAt_idx" ON "auth_challenges"("userId", "type", "expiresAt");

CREATE TABLE "onboarding_applications" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "createdById" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "personalData" JSONB, "businessData" JSONB, "submittedAt" TIMESTAMP(3), "decidedAt" TIMESTAMP(3),
  "decisionReason" TEXT, "correctionFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onboarding_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_applications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "onboarding_applications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "onboarding_applications_tenantId_version_key" ON "onboarding_applications"("tenantId", "version");
CREATE INDEX "onboarding_applications_status_submittedAt_idx" ON "onboarding_applications"("status", "submittedAt");

CREATE TABLE "directors" (
  "id" UUID NOT NULL, "applicationId" UUID NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL,
  "gender" TEXT NOT NULL, "dateOfBirth" TIMESTAMP(3) NOT NULL, "encryptedIdentityNo" TEXT NOT NULL,
  "identityFingerprint" TEXT NOT NULL, "phone" TEXT NOT NULL, "homeAddress" TEXT NOT NULL,
  "state" TEXT NOT NULL, "city" TEXT NOT NULL, "role" TEXT NOT NULL, "ownershipShare" DECIMAL(5,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "directors_pkey" PRIMARY KEY ("id"), CONSTRAINT "directors_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "onboarding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "directors_applicationId_idx" ON "directors"("applicationId");

CREATE TABLE "kyc_documents" (
  "id" UUID NOT NULL, "applicationId" UUID NOT NULL, "ownerType" "DocumentOwnerType" NOT NULL,
  "ownerId" TEXT, "documentType" TEXT NOT NULL, "objectKey" TEXT NOT NULL, "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "checksum" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'QUARANTINED', "scanMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "scannedAt" TIMESTAMP(3),
  CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id"), CONSTRAINT "kyc_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "onboarding_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "kyc_documents_applicationId_ownerType_ownerId_idx" ON "kyc_documents"("applicationId", "ownerType", "ownerId");

CREATE TABLE "roles" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[], "isOwner" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id"), CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

CREATE TABLE "user_roles" (
  "userId" UUID NOT NULL, "roleId" UUID NOT NULL, "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId", "roleId"),
  CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "invitations" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "roleId" UUID NOT NULL, "invitedById" UUID NOT NULL,
  "email" TEXT NOT NULL, "normalizedEmail" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");
CREATE INDEX "invitations_tenantId_status_idx" ON "invitations"("tenantId", "status");
CREATE INDEX "invitations_normalizedEmail_idx" ON "invitations"("normalizedEmail");

CREATE TABLE "email_outbox" (
  "id" UUID NOT NULL, "recipient" TEXT NOT NULL, "template" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3), "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_outbox_sentAt_nextAttemptAt_idx" ON "email_outbox"("sentAt", "nextAttemptAt");

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL, "scope" TEXT NOT NULL, "key" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL, "responseStatus" INTEGER NOT NULL, "responseBody" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "idempotency_records_scope_key_key" ON "idempotency_records"("scope", "key");
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");
