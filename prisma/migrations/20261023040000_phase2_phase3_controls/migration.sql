ALTER TABLE "vendors" ADD COLUMN "dispatchCreationFrozen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "fee_policy_versions" ADD COLUMN "roundingRule" TEXT NOT NULL DEFAULT 'HALF_UP';

CREATE OR REPLACE FUNCTION prevent_fee_policy_content_rewrite() RETURNS trigger AS $$
BEGIN
  IF OLD."feeCode" IS DISTINCT FROM NEW."feeCode"
     OR OLD."scope" IS DISTINCT FROM NEW."scope"
     OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR OLD."version" IS DISTINCT FROM NEW."version"
     OR OLD."calculationType" IS DISTINCT FROM NEW."calculationType"
     OR OLD."currency" IS DISTINCT FROM NEW."currency"
     OR OLD."flatAmountMinor" IS DISTINCT FROM NEW."flatAmountMinor"
     OR OLD."percentageBps" IS DISTINCT FROM NEW."percentageBps"
     OR OLD."minimumAmountMinor" IS DISTINCT FROM NEW."minimumAmountMinor"
     OR OLD."maximumAmountMinor" IS DISTINCT FROM NEW."maximumAmountMinor"
     OR OLD."tiers" IS DISTINCT FROM NEW."tiers"
     OR OLD."roundingRule" IS DISTINCT FROM NEW."roundingRule"
     OR OLD."deferralAllowed" IS DISTINCT FROM NEW."deferralAllowed"
     OR OLD."contentHash" IS DISTINCT FROM NEW."contentHash" THEN
    RAISE EXCEPTION 'fee policy content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "fee_policy_content_immutable"
BEFORE UPDATE ON "fee_policy_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_fee_policy_content_rewrite();

CREATE OR REPLACE FUNCTION prevent_fee_policy_overlap() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('ACTIVE', 'SCHEDULED') AND EXISTS (
    SELECT 1 FROM "fee_policy_versions" p
    WHERE p."id" <> NEW."id"
      AND p."feeCode" = NEW."feeCode"
      AND p."scope" = NEW."scope"
      AND p."tenantId" IS NOT DISTINCT FROM NEW."tenantId"
      AND p."currency" = NEW."currency"
      AND p."status" IN ('ACTIVE', 'SCHEDULED')
      AND tstzrange(p."effectiveFrom", p."effectiveTo", '[)') &&
          tstzrange(NEW."effectiveFrom", NEW."effectiveTo", '[)')
  ) THEN
    RAISE EXCEPTION 'fee policy interval overlaps an existing version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "fee_policy_no_overlap"
BEFORE INSERT OR UPDATE ON "fee_policy_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_fee_policy_overlap();

CREATE TABLE "fee_assessments" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "feeCode" "FeeCode" NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "policyVersionId" UUID,
  "policySnapshot" JSONB NOT NULL,
  "assessedAmountMinor" INTEGER NOT NULL,
  "collectedAmountMinor" INTEGER NOT NULL DEFAULT 0,
  "adjustedAmountMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fee_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fee_assessments_amounts_check" CHECK ("assessedAmountMinor" >= 0 AND "collectedAmountMinor" >= 0)
);
CREATE UNIQUE INDEX "fee_assessments_tenantId_feeCode_sourceType_sourceReference_key" ON "fee_assessments"("tenantId", "feeCode", "sourceType", "sourceReference");
CREATE INDEX "fee_assessments_tenantId_createdAt_idx" ON "fee_assessments"("tenantId", "createdAt");

CREATE TABLE "fee_collection_portions" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "assessmentId" UUID,
  "receivableId" UUID,
  "sequence" INTEGER NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
  "paymentTransactionId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fee_collection_portions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fee_collection_portions_amount_check" CHECK ("amountMinor" > 0)
);
CREATE UNIQUE INDEX "fee_collection_portions_idempotencyKey_key" ON "fee_collection_portions"("idempotencyKey");
CREATE UNIQUE INDEX "fee_collection_portions_receivableId_sequence_key" ON "fee_collection_portions"("receivableId", "sequence");
CREATE INDEX "fee_collection_portions_assessmentId_createdAt_idx" ON "fee_collection_portions"("assessmentId", "createdAt");
CREATE INDEX "fee_collection_portions_tenantId_createdAt_idx" ON "fee_collection_portions"("tenantId", "createdAt");

CREATE TABLE "fee_adjustments" (
  "id" UUID NOT NULL,
  "assessmentId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
  "kind" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "approvalReference" TEXT NOT NULL,
  "paymentReference" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fee_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fee_adjustments_nonzero_check" CHECK ("amountMinor" <> 0)
);
CREATE INDEX "fee_adjustments_assessmentId_createdAt_idx" ON "fee_adjustments"("assessmentId", "createdAt");
CREATE INDEX "fee_adjustments_tenantId_createdAt_idx" ON "fee_adjustments"("tenantId", "createdAt");
