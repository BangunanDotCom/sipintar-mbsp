-- Document metadata only; no uploaded bytes or public object URLs in PostgreSQL.
CREATE TABLE "application_documents" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "uploadedBy" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedBy" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_documents_byteSize_check" CHECK ("byteSize" > 0),
  CONSTRAINT "application_documents_version_check" CHECK ("version" > 0),
  CONSTRAINT "application_documents_scanStatus_check" CHECK ("scanStatus" IN ('PENDING','CLEAN','INFECTED','FAILED')),
  CONSTRAINT "application_documents_verificationStatus_check" CHECK ("verificationStatus" IN ('UNVERIFIED','VERIFIED','REJECTED'))
);
CREATE UNIQUE INDEX "application_documents_storageKey_key" ON "application_documents"("storageKey");
CREATE UNIQUE INDEX "application_documents_draftId_category_version_key" ON "application_documents"("draftId","category","version");
CREATE INDEX "application_documents_draftId_category_uploadedAt_idx" ON "application_documents"("draftId","category","uploadedAt");
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "application_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
