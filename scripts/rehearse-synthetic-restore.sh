#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# != 4 ]] || [[ ! "$1" =~ ^[a-zA-Z0-9_.-]+$ ]] || [[ ! "$2" =~ ^[a-zA-Z0-9_]+$ ]] ||
   [[ ! "$3" =~ ^staylink_issue(40|45|49|54|58)_[a-z0-9_]+_test$ ]] || [[ ! "$4" =~ ^staylink_issue(40|45|49|54|58)_restore[a-z0-9_]*_test$ ]] ||
   [[ "$3" == "$4" ]] || [[ "${3:0:16}" != "${4:0:16}" ]]; then
  echo "Usage: $0 <test-container> <fixture-role> <synthetic-source-test-db> <same-issue-empty-restore-test-db>" >&2
  exit 2
fi

container=$1 role=$2 source_db=$3 restore_db=$4
docker_cmd=(docker --host unix:///var/run/docker.sock)
sql() {
  "${docker_cmd[@]}" exec "$container" psql -X -U "$role" -d "$1" -v ON_ERROR_STOP=1 -Atc "$2"
}

if [[ $(sql "$restore_db" "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'") != 0 ]]; then
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
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'synthetic_submissions_immutable' AND tgenabled = 'O')"
source_counts=$(sql "$source_db" "$counts")
restored_counts=$(sql "$restore_db" "$counts")
test "$source_counts" = "$restored_counts"
[[ "$restored_counts" == *'|1' ]]
echo "Match (submissions|evidence links|completion|invoices|settlement|immutable trigger): $restored_counts"
