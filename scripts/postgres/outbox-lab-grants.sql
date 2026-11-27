-- Run as the owner of the dedicated loopback privilege lab.
\set ON_ERROR_STOP on
SELECT current_database() = 'staylink_issue58_p0privileges_test'
   AND current_user = 'stl_p0_owner'
   AND inet_server_addr() IN ('127.0.0.1'::inet, '::1'::inet) AS safe
\gset
\if :safe
\else
  \echo 'Requires the loopback PostgreSQL privilege lab and its owner.'
  \quit 3
\endif

BEGIN;
GRANT USAGE ON SCHEMA public TO stl_p0_outbox_worker;
GRANT SELECT (id, email, kind, status, "emailVerified", "identificationHash")
  ON public.users TO stl_p0_outbox_worker;
GRANT SELECT ON public.user_role_assignments, public.roles, public.permissions,
  public.application_drafts, public.application_premises, public.companies,
  public.company_representatives, public.delegation_documents,
  public.synthetic_submissions, public.audit_logs, public.training_reminder_outbox
  TO stl_p0_outbox_worker;
GRANT INSERT ON public.audit_logs, public.notifications, public.training_reminder_outbox
  TO stl_p0_outbox_worker;
GRANT SELECT (id) ON public.notifications TO stl_p0_outbox_worker;
GRANT UPDATE (status, attempts, "leaseUntil", "lastError", "availableAt", "sentAt", "notifiedAt")
  ON public.training_reminder_outbox TO stl_p0_outbox_worker;
GRANT EXECUTE ON FUNCTION public.staylink_lock_outbox_case(text,text,text),
  public.staylink_lock_outbox_drafts(text[]) TO stl_p0_outbox_worker;
COMMIT;
