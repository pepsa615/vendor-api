CREATE TABLE "manifest_transport_assignments" (
  "id" UUID NOT NULL,
  "manifestId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "dispatcherId" UUID NOT NULL,
  "dispatcherRevisionId" UUID NOT NULL,
  "assignedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "manifest_transport_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manifest_transport_assignments_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "manifests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manifest_transport_assignments_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "dispatchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manifest_transport_assignments_dispatcherRevisionId_fkey" FOREIGN KEY ("dispatcherRevisionId") REFERENCES "dispatcher_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "manifest_transport_assignments_manifestId_active_idx" ON "manifest_transport_assignments"("manifestId", "active");
CREATE INDEX "manifest_transport_assignments_tenantId_dispatcherId_active_idx" ON "manifest_transport_assignments"("tenantId", "dispatcherId", "active");
CREATE UNIQUE INDEX "manifest_transport_assignments_one_active_idx" ON "manifest_transport_assignments"("manifestId") WHERE "active" = true;
