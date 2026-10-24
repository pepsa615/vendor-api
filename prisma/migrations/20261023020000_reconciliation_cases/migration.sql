CREATE TYPE "ReconciliationCaseStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "ReconciliationCaseSeverity" AS ENUM ('WARNING', 'CRITICAL');

CREATE TABLE "reconciliation_cases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "severity" "ReconciliationCaseSeverity" NOT NULL,
  "status" "ReconciliationCaseStatus" NOT NULL DEFAULT 'OPEN',
  "sourceSystem" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "expectedSnapshot" JSONB,
  "actualSnapshot" JSONB,
  "requestId" TEXT,
  "resolvedById" TEXT,
  "resolutionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "reconciliation_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reconciliation_cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reconciliation_cases_category_sourceReference_subjectId_key" ON "reconciliation_cases"("category", "sourceReference", "subjectId");
CREATE INDEX "reconciliation_cases_tenantId_status_severity_createdAt_idx" ON "reconciliation_cases"("tenantId", "status", "severity", "createdAt");
