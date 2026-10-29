ALTER TABLE users ADD COLUMN "identificationHash" TEXT, ADD COLUMN "identificationEncrypted" TEXT, ADD COLUMN "identificationMasked" TEXT;
CREATE UNIQUE INDEX "users_identificationHash_key" ON users ("identificationHash");
ALTER TABLE users ADD CONSTRAINT "users_identification_complete" CHECK (("identificationHash" IS NULL AND "identificationEncrypted" IS NULL AND "identificationMasked" IS NULL) OR ("identificationHash" IS NOT NULL AND "identificationEncrypted" IS NOT NULL AND "identificationMasked" IS NOT NULL));
ALTER TABLE company_representatives ADD COLUMN "canManageRepresentatives" BOOLEAN NOT NULL DEFAULT FALSE;
-- Existing representatives retain their existing authority; no unverified legacy account gains management rights automatically.
CREATE TABLE company_representation_invitations (
 id TEXT PRIMARY KEY, "companyId" TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "recipientId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "invitedBy" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "authorityType" TEXT NOT NULL, "authorityEndsAt" TIMESTAMP(3), "tokenHash" TEXT NOT NULL UNIQUE,
 "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "company_representation_invitations_recipientId_idx" ON company_representation_invitations ("recipientId");
