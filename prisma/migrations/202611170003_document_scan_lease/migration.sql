ALTER TABLE "application_documents"
  ADD COLUMN "scanLeaseToken" TEXT,
  ADD COLUMN "scanLeaseExpiresAt" TIMESTAMP(3);

ALTER TABLE "application_documents"
  DROP CONSTRAINT IF EXISTS "application_documents_scanStatus_check";

ALTER TABLE "application_documents"
  ADD CONSTRAINT "application_documents_scanStatus_check"
  CHECK ("scanStatus" IN ('PENDING', 'SCANNING', 'CLEAN', 'INFECTED', 'FAILED'));

CREATE INDEX "application_documents_scanStatus_scanLeaseExpiresAt_idx"
  ON "application_documents" ("scanStatus", "scanLeaseExpiresAt");
