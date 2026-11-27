CREATE INDEX completion_audit_target_version_idx ON audit_logs
  (target, (CASE WHEN metadata->>'version' ~ '^[1-9][0-9]{0,3}$'
    THEN (metadata->>'version')::integer ELSE NULL END), id)
  WHERE action = 'SYNTHETIC_PORTAL_COMPLETION' AND outcome = 'SUCCESS';
