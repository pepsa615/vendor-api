ALTER TYPE "VendorStatus" ADD VALUE IF NOT EXISTS 'APPROVED_PROVISIONING';

CREATE TYPE "PaymentProvisioningStatus" AS ENUM (
  'PENDING', 'KYC_EXPORTING', 'PAYMENT_USER_CREATING', 'SVA_PROVISIONING',
  'RECONCILING', 'ACTIVE', 'FAILED_RETRYABLE', 'MANUAL_REVIEW', 'SUSPENDED'
);
CREATE TYPE "FeeCode" AS ENUM ('RUNWAY_DISPATCH', 'GENERAL_POOL_MARKUP', 'TRAVEL_MANIFEST', 'CUSTOMER_CHECKOUT_COMMISSION');
CREATE TYPE "FeePolicyScope" AS ENUM ('PLATFORM_DEFAULT', 'VENDOR_OVERRIDE');
CREATE TYPE "FeeCalculationType" AS ENUM ('FLAT', 'PERCENTAGE', 'TIERED');
CREATE TYPE "FeePolicyStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'ACTIVE', 'RETIRED');

ALTER TABLE "vendors"
  ALTER COLUMN "paymentProvisioning" DROP DEFAULT,
  ALTER COLUMN "paymentProvisioning" TYPE "PaymentProvisioningStatus"
    USING "paymentProvisioning"::"PaymentProvisioningStatus",
  ALTER COLUMN "paymentProvisioning" SET DEFAULT 'PENDING';

CREATE TABLE "vendor_provisioning_sagas" (
  "id" UUID PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "applicationId" UUID NOT NULL UNIQUE,
  "status" "PaymentProvisioningStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastRequestId" TEXT,
  "approvedKycSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "vendor_provisioning_sagas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT
);
CREATE INDEX "vendor_provisioning_sagas_status_nextAttemptAt_idx" ON "vendor_provisioning_sagas"("status", "nextAttemptAt");
CREATE INDEX "vendor_provisioning_sagas_leaseExpiresAt_idx" ON "vendor_provisioning_sagas"("leaseExpiresAt");

CREATE TABLE "internal_admin_actor_nonces" (
  "jti" TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "internal_admin_actor_nonces_expiresAt_idx" ON "internal_admin_actor_nonces"("expiresAt");

CREATE TABLE "fee_policy_versions" (
  "id" UUID PRIMARY KEY,
  "feeCode" "FeeCode" NOT NULL,
  "scope" "FeePolicyScope" NOT NULL,
  "tenantId" UUID,
  "version" INTEGER NOT NULL,
  "calculationType" "FeeCalculationType" NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
  "flatAmountMinor" INTEGER,
  "percentageBps" INTEGER,
  "minimumAmountMinor" INTEGER,
  "maximumAmountMinor" INTEGER,
  "tiers" JSONB,
  "deferralAllowed" BOOLEAN NOT NULL DEFAULT false,
  "status" "FeePolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvalReference" TEXT,
  "reason" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_policy_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT,
  CONSTRAINT "fee_policy_scope_tenant_check" CHECK (("scope" = 'PLATFORM_DEFAULT' AND "tenantId" IS NULL) OR ("scope" = 'VENDOR_OVERRIDE' AND "tenantId" IS NOT NULL)),
  CONSTRAINT "fee_policy_amount_check" CHECK (
    ("calculationType" = 'FLAT' AND "flatAmountMinor" IS NOT NULL AND "flatAmountMinor" >= 0) OR
    ("calculationType" = 'PERCENTAGE' AND "percentageBps" IS NOT NULL AND "percentageBps" BETWEEN 0 AND 10000) OR
    ("calculationType" = 'TIERED' AND "tiers" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "fee_policy_versions_feeCode_scope_tenantId_version_key" ON "fee_policy_versions"("feeCode", "scope", "tenantId", "version");
CREATE INDEX "fee_policy_versions_effective_idx" ON "fee_policy_versions"("feeCode", "scope", "tenantId", "status", "effectiveFrom");

INSERT INTO "fee_policy_versions" (
  "id", "feeCode", "scope", "version", "calculationType", "currency",
  "flatAmountMinor", "deferralAllowed", "status", "effectiveFrom",
  "createdById", "approvedById", "approvalReference", "reason", "contentHash", "updatedAt"
) VALUES (
  gen_random_uuid(), 'RUNWAY_DISPATCH', 'PLATFORM_DEFAULT', 1, 'FLAT', 'NGN',
  2000, true, 'ACTIVE', CURRENT_TIMESTAMP,
  'system:migration', 'system:migration', 'migration:legacy-runway-fee',
  'Preserve the approved legacy Runway fee during versioned-policy migration',
  'legacy-runway-fee-v1-2000', CURRENT_TIMESTAMP
);

ALTER TABLE "dispatches" ADD COLUMN "feePolicyVersionId" UUID;
ALTER TABLE "dispatches" ADD COLUMN "feePolicySnapshot" JSONB;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_feePolicyVersionId_fkey" FOREIGN KEY ("feePolicyVersionId") REFERENCES "fee_policy_versions"("id") ON DELETE RESTRICT;

-- Preserve the old fixed Runway amount as history without pretending an approved
-- policy existed when those dispatches were created.
UPDATE "dispatches"
SET "feePolicySnapshot" = jsonb_build_object(
  'code', 'RUNWAY_DISPATCH',
  'source', 'LEGACY_FIXED_2000',
  'amountMinor', "feeAmountMinor",
  'currency', "currency"
)
WHERE "mode" = 'OWN_FLEET' AND "feePolicySnapshot" IS NULL;
