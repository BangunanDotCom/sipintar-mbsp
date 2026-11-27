-- Give the outbox service read locks without granting UPDATE on principals
-- or on the original delegation evidence.
CREATE FUNCTION public.staylink_lock_outbox_case(recipient text, recipient_role text, submission text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE
  applicant text;
  company text;
  proof text;
BEGIN
  PERFORM id FROM public.users WHERE id=recipient FOR SHARE;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF recipient_role IS NOT NULL THEN
    PERFORM id FROM public.user_role_assignments
      WHERE "userId"=recipient AND "roleId"=recipient_role ORDER BY id FOR SHARE;
  END IF;
  IF submission IS NULL THEN RETURN 1; END IF;

  SELECT s."actorId",s.snapshot->>'companyId' INTO applicant,company
    FROM public.synthetic_submissions s WHERE s.id=submission FOR SHARE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF company IS NOT NULL THEN
    PERFORM id FROM public.companies WHERE id=company FOR SHARE;
    SELECT "verifiedDocumentId" INTO proof FROM public.company_representatives
      WHERE "companyId"=company AND "userId"=applicant FOR SHARE;
    PERFORM id FROM public.delegation_documents WHERE id=proof FOR SHARE;
  END IF;
  RETURN 1;
END;
$$;

CREATE FUNCTION public.staylink_lock_outbox_drafts(candidates text[])
RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog
AS $$
  SELECT id FROM public.application_drafts WHERE cardinality(candidates) <= 25 AND id=ANY(candidates)
    ORDER BY "updatedAt",id FOR UPDATE SKIP LOCKED
$$;

REVOKE ALL ON FUNCTION public.staylink_lock_outbox_case(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staylink_lock_outbox_drafts(text[]) FROM PUBLIC;
