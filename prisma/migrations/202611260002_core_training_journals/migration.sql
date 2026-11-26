CREATE TABLE synthetic_financial_entries (
  id text PRIMARY KEY,
  "submissionId" text NOT NULL REFERENCES synthetic_submissions(id),
  "invoiceId" text NOT NULL,
  stage integer NOT NULL CHECK (stage IN (1, 2)),
  event text NOT NULL CHECK (event IN ('INVOICE', 'RECEIPT')),
  "amountSen" integer NOT NULL CHECK ("amountSen" > 0),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("submissionId", stage, event),
  UNIQUE ("invoiceId", event)
);

CREATE FUNCTION synthetic_financial_entries_retain() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Synthetic financial entries are append-only' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER synthetic_financial_entries_immutable
  BEFORE UPDATE OR DELETE ON synthetic_financial_entries
  FOR EACH ROW EXECUTE FUNCTION synthetic_financial_entries_retain();

CREATE TRIGGER synthetic_financial_entries_no_truncate
  BEFORE TRUNCATE ON synthetic_financial_entries
  FOR EACH STATEMENT EXECUTE FUNCTION synthetic_financial_entries_retain();

ALTER TABLE training_reminder_outbox
  ADD COLUMN kind text NOT NULL DEFAULT 'DRAFT_INACTIVE'
    CHECK (kind IN ('DRAFT_INACTIVE','TECH_PRE_DUE','TECH_OVERDUE','TECH_ESCALATE')),
  ADD COLUMN context jsonb,
  ADD COLUMN "dedupeKey" text,
  ADD COLUMN "notifiedAt" timestamp(3);
UPDATE training_reminder_outbox SET "dedupeKey" = 'draft:' || "draftId" || ':' || "draftVersion";
ALTER TABLE training_reminder_outbox
  ALTER COLUMN "dedupeKey" SET NOT NULL,
  DROP CONSTRAINT "training_reminder_outbox_draftId_draftVersion_key",
  ADD CONSTRAINT training_reminder_dedupe_key UNIQUE ("dedupeKey"),
  ADD CONSTRAINT training_reminder_context_required CHECK ((kind = 'DRAFT_INACTIVE') = (context IS NULL));
