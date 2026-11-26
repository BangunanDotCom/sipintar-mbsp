#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# != 4 ]] || [[ ! "$1" =~ ^[a-zA-Z0-9_.-]+$ ]] || [[ ! "$2" =~ ^[a-zA-Z0-9_]+$ ]] ||
   [[ ! "$3" =~ ^staylink_issue(40|45|49|54|58|62)_[a-z0-9_]+_test$ ]] || [[ ! "$4" =~ ^staylink_issue(40|45|49|54|58|62)_restore[a-z0-9_]*_test$ ]] ||
   [[ "$3" == "$4" ]] || [[ "${3:0:16}" != "${4:0:16}" ]]; then
  echo "Usage: $0 <test-container> <fixture-role> <synthetic-source-test-db> <same-issue-empty-restore-test-db>" >&2
  exit 2
fi

container=$1 role=$2 source_db=$3 restore_db=$4
docker_cmd=(docker --host unix:///var/run/docker.sock)
sql() {
  "${docker_cmd[@]}" exec "$container" psql -X -U "$role" -d "$1" -v ON_ERROR_STOP=1 -Atc "$2"
}

if [[ $(sql "$restore_db" "SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p','v','m','f','S')") != 0 ]]; then
  echo "Restore database must be empty." >&2
  exit 2
fi

dump=$(mktemp)
trap 'rm -f "$dump"' EXIT
"${docker_cmd[@]}" exec "$container" pg_dump -U "$role" -Fc "$source_db" > "$dump"
"${docker_cmd[@]}" exec -i "$container" pg_restore --exit-on-error --no-owner -U "$role" -d "$restore_db" < "$dump"

counts="SELECT (SELECT count(*) FROM synthetic_submissions),
  (SELECT count(*) FROM draft_document_scopes),
  (SELECT count(*) FROM audit_logs WHERE action = 'SYNTHETIC_PORTAL_COMPLETE'),
  (SELECT count(*) FROM audit_logs WHERE action = 'SYNTHETIC_PORTAL_INVOICE_ISSUED'),
  (SELECT count(*) FROM audit_logs WHERE action = 'SYNTHETIC_PORTAL_INVOICE_SETTLED'),
  (SELECT count(*) FROM notifications WHERE type = 'SYNTHETIC_REVIEW'),
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'synthetic_submissions'::regclass AND tgname = 'synthetic_submissions_immutable' AND tgenabled = 'O')"
source_counts=$(sql "$source_db" "$counts")
restored_counts=$(sql "$restore_db" "$counts")
test "$source_counts" = "$restored_counts"
# Compare deterministic hashes of the actual rehearsal rows, without printing their contents.
fingerprints="SELECT
  (SELECT encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(s)::text, chr(10) ORDER BY s.id), ''), 'UTF8')), 'hex') FROM synthetic_submissions s),
  (SELECT encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(d)::text, chr(10) ORDER BY d.\"documentId\"), ''), 'UTF8')), 'hex') FROM draft_document_scopes d),
  (SELECT encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(a)::text, chr(10) ORDER BY a.id), ''), 'UTF8')), 'hex') FROM audit_logs a WHERE action LIKE 'SYNTHETIC_PORTAL_%'),
  (SELECT encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(n)::text, chr(10) ORDER BY n.id), ''), 'UTF8')), 'hex') FROM notifications n WHERE type = 'SYNTHETIC_REVIEW')"
source_fingerprints=$(sql "$source_db" "$fingerprints")
restored_fingerprints=$(sql "$restore_db" "$fingerprints")
test "$source_fingerprints" = "$restored_fingerprints"
[[ "$restored_counts" == *'|1' ]]
echo "Match (submissions|evidence links|completion|invoices|settlement|review notifications|immutable trigger): $restored_counts"

if [[ $(sql "$source_db" "SELECT to_regclass('training_reminder_outbox') IS NOT NULL") == t ]]; then
  reminder_proof="SELECT count(*), encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(r)::text, chr(10) ORDER BY r.id), ''), 'UTF8')), 'hex') FROM training_reminder_outbox r"
  [[ $(sql "$source_db" "$reminder_proof") == "$(sql "$restore_db" "$reminder_proof")" ]]
  echo "Training reminder rows and delivery states match."
fi

if [[ $(sql "$source_db" "SELECT to_regclass('synthetic_financial_entries') IS NOT NULL") == t ]]; then
  journal_proof="SELECT count(*), encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(e)::text, chr(10) ORDER BY e.id), ''), 'UTF8')), 'hex') FROM synthetic_financial_entries e"
  [[ $(sql "$source_db" "$journal_proof") == "$(sql "$restore_db" "$journal_proof")" ]]
  archive_proof="SELECT count(*), encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(a)::text, chr(10) ORDER BY a.id), ''), 'UTF8')), 'hex') FROM audit_logs a WHERE action = 'SYNTHETIC_ARCHIVE_CONTROL'"
  [[ $(sql "$source_db" "$archive_proof") == "$(sql "$restore_db" "$archive_proof")" ]]
  echo "Synthetic financial journal and archive control events match."
fi

proof="
SELECT
  (SELECT count(*) FROM delegation_documents),
  (SELECT count(*) FROM application_documents),
  (SELECT count(*) FROM mfa_factors),
  (SELECT encode(sha256(convert_to(COALESCE(string_agg(
    to_jsonb(d)::text, chr(10) ORDER BY d.id), ''), 'UTF8')), 'hex')
    FROM delegation_documents d),
  (SELECT encode(sha256(convert_to(COALESCE(string_agg(
    to_jsonb(a)::text, chr(10) ORDER BY a.id), ''), 'UTF8')), 'hex')
    FROM application_documents a),
  (SELECT encode(sha256(convert_to(COALESCE(string_agg(
    to_jsonb(m)::text, chr(10) ORDER BY m.id), ''), 'UTF8')), 'hex')
    FROM mfa_factors m)
"
source_security_proof=$(sql "$source_db" "$proof")
[[ "$source_security_proof" == "$(sql "$restore_db" "$proof")" ]]
IFS='|' read -r delegations attachments factors _ <<< "$source_security_proof"
echo "Restored delegation PDFs: $delegations; application document metadata: $attachments; encrypted MFA factors: $factors."
