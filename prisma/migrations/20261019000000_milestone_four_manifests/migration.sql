CREATE TYPE "BatchStatus" AS ENUM ('FINALIZED', 'MANIFESTED');
CREATE TYPE "ManifestStatus" AS ENUM ('SENT', 'CHANGE_REQUESTED', 'DECLINED', 'ACCEPTED', 'IN_TRANSIT', 'REROUTED', 'REMOTE_LOCATION', 'DELIVERED');

CREATE TABLE "batches" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "publicReference" TEXT NOT NULL,
  "status" "BatchStatus" NOT NULL DEFAULT 'FINALIZED', "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "manifestedAt" TIMESTAMP(3),
  CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "batches_publicReference_key" ON "batches"("publicReference");
CREATE INDEX "batches_tenantId_createdAt_idx" ON "batches"("tenantId", "createdAt");

CREATE TABLE "batch_items" (
  "batchId" UUID NOT NULL, "orderId" UUID NOT NULL,
  CONSTRAINT "batch_items_pkey" PRIMARY KEY ("batchId", "orderId")
);
CREATE UNIQUE INDEX "batch_items_orderId_key" ON "batch_items"("orderId");

CREATE TABLE "manifests" (
  "id" UUID NOT NULL, "publicReference" TEXT NOT NULL, "waybillNumber" TEXT NOT NULL,
  "originTenantId" UUID NOT NULL, "destinationTenantId" UUID NOT NULL,
  "status" "ManifestStatus" NOT NULL DEFAULT 'SENT', "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "manifests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "manifests_publicReference_key" ON "manifests"("publicReference");
CREATE UNIQUE INDEX "manifests_waybillNumber_key" ON "manifests"("waybillNumber");
CREATE INDEX "manifests_originTenantId_createdAt_idx" ON "manifests"("originTenantId", "createdAt");
CREATE INDEX "manifests_destinationTenantId_createdAt_idx" ON "manifests"("destinationTenantId", "createdAt");

CREATE TABLE "manifest_revisions" (
  "id" UUID NOT NULL, "manifestId" UUID NOT NULL, "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL, "originState" TEXT NOT NULL, "originCity" TEXT NOT NULL,
  "destinationState" TEXT NOT NULL, "destinationCity" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manifest_revisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "manifest_revisions_manifestId_version_key" ON "manifest_revisions"("manifestId", "version");

CREATE TABLE "manifest_revision_items" (
  "id" UUID NOT NULL, "revisionId" UUID NOT NULL, "orderId" UUID, "batchId" UUID,
  CONSTRAINT "manifest_revision_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manifest_revision_items_source_check" CHECK (("orderId" IS NOT NULL) <> ("batchId" IS NOT NULL))
);
CREATE UNIQUE INDEX "manifest_revision_items_revisionId_orderId_key" ON "manifest_revision_items"("revisionId", "orderId");
CREATE UNIQUE INDEX "manifest_revision_items_revisionId_batchId_key" ON "manifest_revision_items"("revisionId", "batchId");

CREATE TABLE "manifest_actions" (
  "id" UUID NOT NULL, "manifestId" UUID NOT NULL, "actorId" TEXT NOT NULL,
  "actorTenantId" UUID NOT NULL, "action" TEXT NOT NULL, "fromStatus" "ManifestStatus",
  "toStatus" "ManifestStatus" NOT NULL, "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manifest_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "manifest_actions_manifestId_createdAt_idx" ON "manifest_actions"("manifestId", "createdAt");

CREATE TABLE "manifest_previews" (
  "id" UUID NOT NULL, "tokenHash" TEXT NOT NULL, "tenantId" UUID NOT NULL, "actorId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "payload" JSONB NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manifest_previews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "manifest_previews_tokenHash_key" ON "manifest_previews"("tokenHash");
CREATE INDEX "manifest_previews_tenantId_expiresAt_idx" ON "manifest_previews"("tenantId", "expiresAt");

ALTER TABLE "batches" ADD CONSTRAINT "batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_originTenantId_fkey" FOREIGN KEY ("originTenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_destinationTenantId_fkey" FOREIGN KEY ("destinationTenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manifest_revisions" ADD CONSTRAINT "manifest_revisions_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "manifests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manifest_revision_items" ADD CONSTRAINT "manifest_revision_items_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "manifest_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manifest_revision_items" ADD CONSTRAINT "manifest_revision_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manifest_revision_items" ADD CONSTRAINT "manifest_revision_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manifest_actions" ADD CONSTRAINT "manifest_actions_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "manifests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
