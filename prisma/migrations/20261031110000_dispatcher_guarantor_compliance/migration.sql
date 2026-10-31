ALTER TABLE "dispatcher_revisions"
  ADD COLUMN "encryptedGuarantorNin" TEXT,
  ADD COLUMN "guarantorNinFingerprint" TEXT;

-- Legacy revisions may not have collected a guarantor address. They remain
-- readable, but must be corrected before a new revision can be submitted.
UPDATE "dispatcher_revisions"
SET "guarantorAddress" = ''
WHERE "guarantorAddress" IS NULL;

ALTER TABLE "dispatcher_revisions"
  ALTER COLUMN "guarantorAddress" SET NOT NULL;

CREATE INDEX "dispatcher_revisions_guarantorNinFingerprint_idx"
  ON "dispatcher_revisions"("guarantorNinFingerprint");
