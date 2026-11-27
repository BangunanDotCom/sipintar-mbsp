-- Run with psql as the migration owner of the dedicated synthetic database.
\set ON_ERROR_STOP on
SELECT current_database() = 'staylink_issue58_p0privileges_test'
   AND current_user = 'stl_p0_owner'
   AND inet_server_addr() IN ('127.0.0.1'::inet, '::1'::inet) AS safe
\gset
\if :safe
\else
  \echo 'Requires the loopback PostgreSQL delegation privilege lab and its migration owner.'
  \quit 3
\endif

BEGIN;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO stl_p0_api, stl_p0_scanner;

-- The API handles other application tables. Scope the immutable delegation
-- evidence and append-only records independently of general API DML.
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO stl_p0_api', tablename)
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('_prisma_migrations', '_staylink_migrations', 'delegation_documents', 'audit_logs',
                        'synthetic_financial_entries', 'synthetic_submissions')
\gexec
GRANT SELECT, INSERT ON public.audit_logs, public.synthetic_financial_entries,
  public.synthetic_submissions TO stl_p0_api;
-- Row locking needs UPDATE on at least one column. The append-only trigger
-- on synthetic_submissions still rejects every UPDATE.
GRANT UPDATE (id) ON public.synthetic_submissions TO stl_p0_api;

GRANT SELECT ON public.delegation_documents TO stl_p0_api;
GRANT INSERT (id, "companyId", "representativeId", version, "authorityType",
  "uploadedBy", "fileName", "mimeType", content, sha256, "byteSize",
  "scanStatus", "validFrom", "validUntil", "createdAt", status),
  UPDATE ("supersededAt", "revokedAt") ON public.delegation_documents TO stl_p0_api;

CREATE OR REPLACE FUNCTION public.staylink_lab_enforce_pending_delegation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF current_user = 'stl_p0_api' AND (NEW."scanStatus" <> 'PENDING' OR NEW.status <> 'UNVERIFIED') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Initial scan status must be PENDING';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS staylink_lab_pending_delegation ON public.delegation_documents;
CREATE TRIGGER staylink_lab_pending_delegation
  BEFORE INSERT ON public.delegation_documents
  FOR EACH ROW EXECUTE FUNCTION public.staylink_lab_enforce_pending_delegation();

GRANT SELECT (id, "companyId", "authorityType", status, "startsAt", "endsAt")
  ON public.company_representatives TO stl_p0_scanner;
GRANT SELECT (id, status) ON public.companies TO stl_p0_scanner;
GRANT SELECT ON public.delegation_documents TO stl_p0_scanner;
GRANT UPDATE ("scanStatus", "scanLeaseToken", "scanLeaseExpiresAt", "scanSha256",
  "scanEngine", "scanValidUntil") ON public.delegation_documents TO stl_p0_scanner;
GRANT EXECUTE ON FUNCTION public.staylink_lock_delegation_scan(text, text) TO stl_p0_scanner;
COMMIT;
