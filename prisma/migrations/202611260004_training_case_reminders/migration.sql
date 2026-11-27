ALTER TABLE training_reminder_outbox DROP CONSTRAINT training_reminder_outbox_kind_check;
ALTER TABLE training_reminder_outbox ADD CONSTRAINT training_reminder_outbox_kind_check
  CHECK (kind IN ('DRAFT_INACTIVE', 'TECH_PRE_DUE', 'TECH_OVERDUE', 'TECH_ESCALATE',
    'CASE_CORRECTION', 'CASE_FIRST_PAYMENT', 'CASE_SECOND_PAYMENT', 'CASE_LETTER',
    'CASE_SKB_EXPIRY', 'CASE_CLOSED'));
