-- Supports case-scoped replay, reconciliation and workflow lookup.
CREATE INDEX audit_logs_target_action_outcome_idx ON audit_logs (target, action, outcome);
