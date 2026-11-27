-- Row locks require UPDATE rights in PostgreSQL. Give the worker a fixed lock
-- operation so it can serialize with revocation without changing authority.
CREATE FUNCTION public.staylink_lock_delegation_scan(rep_id text, company_id text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM id FROM public.company_representatives
    WHERE id = rep_id AND "companyId" = company_id FOR SHARE;
  IF NOT FOUND THEN RETURN 0; END IF;
  PERFORM id FROM public.companies WHERE id = company_id FOR SHARE;
  IF NOT FOUND THEN RETURN 0; END IF;
  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.staylink_lock_delegation_scan(text, text) FROM PUBLIC;
