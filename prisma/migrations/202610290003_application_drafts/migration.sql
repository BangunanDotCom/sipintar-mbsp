-- Phase 2B.1: drafts only. No official reference, submission, deletion or approval path.
CREATE TABLE application_drafts (
 id TEXT PRIMARY KEY,
 "initiatedByUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 capacity TEXT NOT NULL,
 "officialApplicantUserId" TEXT REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "companyId" TEXT REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "initiatorSnapshot" JSONB NOT NULL,
 "applicantSnapshot" JSONB NOT NULL,
 "representativeSnapshot" JSONB,
 notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status = 'DRAFT'),
 version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "application_draft_capacity" CHECK (
  (capacity = 'INDIVIDUAL' AND "officialApplicantUserId" = "initiatedByUserId" AND "officialApplicantUserId" IS NOT NULL AND "companyId" IS NULL AND "representativeSnapshot" IS NULL)
  OR
  (capacity = 'COMPANY' AND "officialApplicantUserId" IS NULL AND "companyId" IS NOT NULL AND "representativeSnapshot" IS NOT NULL)
 )
);
CREATE INDEX "application_drafts_initiatedByUserId_updatedAt_idx" ON application_drafts ("initiatedByUserId", "updatedAt");
INSERT INTO permissions (id, "roleId", action)
SELECT 'phase2b1-draft-' || id, id, 'applications.draft' FROM roles WHERE id IN ('PEMOHON', 'WAKIL_SYARIKAT')
ON CONFLICT ("roleId", action) DO NOTHING;
