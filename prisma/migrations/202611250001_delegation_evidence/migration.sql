ALTER TABLE company_representatives
  ADD COLUMN "verifiedDocumentId" text,
  ADD COLUMN "verificationRevision" integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT delegation_rep_company_uk UNIQUE (id, "companyId");

ALTER TABLE delegation_documents
  ADD COLUMN "representativeId" text,
  ADD COLUMN version integer,
  ADD COLUMN "validFrom" timestamp(3),
  ADD COLUMN "byteSize" integer,
  ADD COLUMN "authorityType" text,
  ADD COLUMN "supersededAt" timestamp(3),
  ADD COLUMN "revokedAt" timestamp(3),
  ADD COLUMN "scanStatus" text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "scanLeaseToken" text,
  ADD COLUMN "scanLeaseExpiresAt" timestamp(3),
  ADD COLUMN "scanSha256" text,
  ADD COLUMN "scanEngine" text,
  ADD COLUMN "scanValidUntil" timestamp(3),
  ADD CONSTRAINT delegation_doc_binding_uk UNIQUE (id, "representativeId", "companyId"),
  ADD CONSTRAINT delegation_doc_version_uk UNIQUE ("representativeId", version),
  ADD CONSTRAINT delegation_doc_rep_fk FOREIGN KEY ("representativeId", "companyId")
    REFERENCES company_representatives (id, "companyId"),
  ADD CONSTRAINT delegation_doc_version_ck CHECK (
    ("representativeId" IS NULL AND version IS NULL AND "scanStatus" = 'LEGACY')
    OR ("representativeId" IS NOT NULL AND version IS NOT NULL AND version > 0
      AND "authorityType" IS NOT NULL AND "validFrom" IS NOT NULL
      AND "byteSize" IS NOT NULL AND "byteSize" BETWEEN 1 AND 20971520
      AND sha256 ~ '^[0-9a-f]{64}$' AND "mimeType" = 'application/pdf'
      AND "scanStatus" IN ('PENDING','SCANNING','CLEAN','INFECTED','FAILED'))
  );

ALTER TABLE company_representatives ADD CONSTRAINT delegation_proof_fk
  FOREIGN KEY ("verifiedDocumentId", id, "companyId")
  REFERENCES delegation_documents (id, "representativeId", "companyId");

CREATE UNIQUE INDEX delegation_doc_current_uk ON delegation_documents ("representativeId")
  WHERE "representativeId" IS NOT NULL AND "supersededAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX delegation_doc_scan_ix ON delegation_documents ("scanStatus", "createdAt");

CREATE FUNCTION delegation_immutable_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."supersededAt" IS NOT NULL AND OLD."supersededAt" IS DISTINCT FROM NEW."supersededAt"
    OR OLD."revokedAt" IS NOT NULL AND OLD."revokedAt" IS DISTINCT FROM NEW."revokedAt" THEN
    RAISE EXCEPTION 'Delegation withdrawal is immutable' USING ERRCODE = '23514';
  END IF;
  IF ROW(OLD.id, OLD."companyId", OLD."representativeId", OLD.version,
      OLD."fileName", OLD."mimeType", OLD."uploadedBy", OLD.content, OLD.sha256,
      OLD."byteSize", OLD."authorityType", OLD."validFrom", OLD."validUntil", OLD."createdAt")
    IS DISTINCT FROM ROW(NEW.id, NEW."companyId", NEW."representativeId", NEW.version,
      NEW."fileName", NEW."mimeType", NEW."uploadedBy", NEW.content, NEW.sha256,
      NEW."byteSize", NEW."authorityType", NEW."validFrom", NEW."validUntil", NEW."createdAt") THEN
    RAISE EXCEPTION 'Delegation identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER delegation_identity_immutable
  BEFORE UPDATE ON delegation_documents FOR EACH ROW EXECUTE FUNCTION delegation_immutable_identity();
