ALTER TABLE user_role_assignments ADD COLUMN "appointmentKind" text NOT NULL DEFAULT 'STANDARD';
ALTER TABLE user_role_assignments ADD CONSTRAINT staff_appointment_kind_check
  CHECK ("appointmentKind" IN ('STANDARD', 'TEMPORARY', 'ACTING')
    AND ("appointmentKind" = 'STANDARD' OR ("endsAt" IS NOT NULL AND "districtId" IS NOT NULL)));

ALTER TABLE training_reminder_outbox ALTER COLUMN "draftId" DROP NOT NULL;
ALTER TABLE training_reminder_outbox ALTER COLUMN "draftVersion" DROP NOT NULL;
ALTER TABLE training_reminder_outbox DROP CONSTRAINT training_reminder_outbox_kind_check;
ALTER TABLE training_reminder_outbox ADD CONSTRAINT training_reminder_outbox_kind_check
  CHECK (kind IN ('DRAFT_INACTIVE', 'TECH_PRE_DUE', 'TECH_OVERDUE', 'TECH_ESCALATE',
    'CASE_CORRECTION', 'CASE_FIRST_PAYMENT', 'CASE_SECOND_PAYMENT', 'CASE_LETTER',
    'CASE_SKB_EXPIRY', 'CASE_CLOSED', 'STAFF_APPOINTMENT'));
ALTER TABLE training_reminder_outbox ADD CONSTRAINT training_reminder_subject_check
  CHECK ((kind = 'STAFF_APPOINTMENT' AND "draftId" IS NULL AND "draftVersion" IS NULL)
    OR (kind <> 'STAFF_APPOINTMENT' AND "draftId" IS NOT NULL AND "draftVersion" IS NOT NULL));
