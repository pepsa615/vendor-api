CREATE TYPE "DispatchMode" AS ENUM ('OWN_FLEET', 'GENERAL_POOL');
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING_MATCH', 'PAIRED', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "dispatches" (
  "id" UUID NOT NULL,
  "publicReference" TEXT NOT NULL,
  "tenantId" UUID NOT NULL,
  "mode" "DispatchMode" NOT NULL,
  "status" "DispatchStatus" NOT NULL DEFAULT 'PENDING_MATCH',
  "batchId" UUID,
  "dispatcherId" UUID,
  "providerReference" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "revenueShareBps" INTEGER,
  "payoutAmountMinor" INTEGER,
  "feeAmountMinor" INTEGER NOT NULL DEFAULT 0,
  "fundingRequiredMinor" INTEGER NOT NULL DEFAULT 0,
  "optimizedDistanceMetres" INTEGER NOT NULL,
  "optimizedDurationSeconds" INTEGER NOT NULL,
  "routeSnapshot" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pairedAt" TIMESTAMP(3),
  "pickedUpAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispatches_amounts_nonnegative" CHECK ("payoutAmountMinor" IS NULL OR "payoutAmountMinor" >= 0),
  CONSTRAINT "dispatches_fees_nonnegative" CHECK ("feeAmountMinor" >= 0 AND "fundingRequiredMinor" >= 0),
  CONSTRAINT "dispatches_mode_dispatcher" CHECK (("mode" = 'OWN_FLEET' AND "dispatcherId" IS NOT NULL) OR ("mode" = 'GENERAL_POOL' AND "dispatcherId" IS NULL))
);

CREATE TABLE "dispatch_items" (
  "id" UUID NOT NULL,
  "dispatchId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "stopSequence" INTEGER NOT NULL,
  "payoutAmountMinor" INTEGER,
  CONSTRAINT "dispatch_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispatch_items_sequence_positive" CHECK ("stopSequence" > 0),
  CONSTRAINT "dispatch_items_payout_nonnegative" CHECK ("payoutAmountMinor" IS NULL OR "payoutAmountMinor" >= 0)
);

CREATE TABLE "dispatch_events" (
  "id" UUID NOT NULL,
  "dispatchId" UUID NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" "DispatchStatus",
  "toStatus" "DispatchStatus" NOT NULL,
  "source" TEXT NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatch_tracking_points" (
  "id" UUID NOT NULL,
  "dispatchId" UUID NOT NULL,
  "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(9,6) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_tracking_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispatch_tracking_latitude" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "dispatch_tracking_longitude" CHECK ("longitude" BETWEEN -180 AND 180)
);

CREATE TABLE "dispatch_previews" (
  "id" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tenantId" UUID NOT NULL,
  "actorId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_previews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatch_provider_events" (
  "id" UUID NOT NULL,
  "eventId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_provider_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatches_publicReference_key" ON "dispatches"("publicReference");
CREATE UNIQUE INDEX "dispatches_batchId_key" ON "dispatches"("batchId");
CREATE UNIQUE INDEX "dispatches_providerReference_key" ON "dispatches"("providerReference");
CREATE INDEX "dispatches_tenantId_status_createdAt_idx" ON "dispatches"("tenantId", "status", "createdAt");
CREATE INDEX "dispatches_dispatcherId_status_idx" ON "dispatches"("dispatcherId", "status");
CREATE UNIQUE INDEX "dispatch_items_dispatchId_orderId_key" ON "dispatch_items"("dispatchId", "orderId");
CREATE UNIQUE INDEX "dispatch_items_orderId_key" ON "dispatch_items"("orderId");
CREATE UNIQUE INDEX "dispatch_items_dispatchId_stopSequence_key" ON "dispatch_items"("dispatchId", "stopSequence");
CREATE INDEX "dispatch_events_dispatchId_createdAt_idx" ON "dispatch_events"("dispatchId", "createdAt");
CREATE INDEX "dispatch_tracking_points_dispatchId_recordedAt_idx" ON "dispatch_tracking_points"("dispatchId", "recordedAt");
CREATE UNIQUE INDEX "dispatch_previews_tokenHash_key" ON "dispatch_previews"("tokenHash");
CREATE INDEX "dispatch_previews_tenantId_expiresAt_idx" ON "dispatch_previews"("tenantId", "expiresAt");
CREATE UNIQUE INDEX "dispatch_provider_events_eventId_key" ON "dispatch_provider_events"("eventId");

ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "dispatchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_tracking_points" ADD CONSTRAINT "dispatch_tracking_points_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
