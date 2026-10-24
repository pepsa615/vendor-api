CREATE TYPE "SettlementEntrySource" AS ENUM ('RIDER_FULFILLED', 'CUSTOMER_LINK');
CREATE TYPE "SettlementEntryStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "FeeReceivableStatus" AS ENUM ('OUTSTANDING', 'COLLECTED', 'WAIVED');
ALTER TYPE "ChallengeType" ADD VALUE 'TRANSACTION_PIN_RESET';

ALTER TABLE "vendors" ADD COLUMN "paymentWalletId" UUID,
  ADD COLUMN "paymentSettlementId" UUID,
  ADD COLUMN "paymentProvisioning" TEXT NOT NULL DEFAULT 'PENDING';
CREATE UNIQUE INDEX "vendors_paymentWalletId_key" ON "vendors"("paymentWalletId");
CREATE UNIQUE INDEX "vendors_paymentSettlementId_key" ON "vendors"("paymentSettlementId");

ALTER TABLE "users" ADD COLUMN "transactionPinHash" TEXT,
  ADD COLUMN "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pinLockedUntil" TIMESTAMP(3);

CREATE TABLE "transaction_pin_challenges" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "tenantId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL, "purpose" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transaction_pin_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transaction_pin_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "transaction_pin_challenges_tokenHash_key" ON "transaction_pin_challenges"("tokenHash");
CREATE INDEX "transaction_pin_challenges_userId_purpose_expiresAt_idx" ON "transaction_pin_challenges"("userId", "purpose", "expiresAt");

CREATE TABLE "vendor_settlement_entries" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "source" "SettlementEntrySource" NOT NULL,
  "sourceReference" TEXT NOT NULL, "counterpartyId" TEXT, "counterpartyName" TEXT,
  "totalAmountMinor" INTEGER NOT NULL, "earningsMinor" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'NGN',
  "status" "SettlementEntryStatus" NOT NULL DEFAULT 'PENDING', "paymentReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "vendor_settlement_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_settlement_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "vendor_settlement_entries_tenantId_source_sourceReference_key" ON "vendor_settlement_entries"("tenantId", "source", "sourceReference");
CREATE INDEX "vendor_settlement_entries_tenantId_status_createdAt_idx" ON "vendor_settlement_entries"("tenantId", "status", "createdAt");

CREATE TABLE "fee_receivables" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "dispatchId" UUID NOT NULL, "amountMinor" INTEGER NOT NULL,
  "collectedMinor" INTEGER NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'NGN',
  "status" "FeeReceivableStatus" NOT NULL DEFAULT 'OUTSTANDING', "paymentReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "collectedAt" TIMESTAMP(3),
  CONSTRAINT "fee_receivables_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fee_receivables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "fee_receivables_dispatchId_key" ON "fee_receivables"("dispatchId");
CREATE INDEX "fee_receivables_tenantId_status_createdAt_idx" ON "fee_receivables"("tenantId", "status", "createdAt");
