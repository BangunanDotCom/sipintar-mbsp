CREATE TABLE training_reminder_outbox (
  id text PRIMARY KEY,
  "draftId" text NOT NULL REFERENCES application_drafts(id),
  "draftVersion" integer NOT NULL CHECK ("draftVersion" > 0),
  "recipientId" text NOT NULL REFERENCES users(id),
  "source" text NOT NULL CHECK ("source" IN ('SUPERVISOR', 'SCHEDULE')),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED', 'UNCERTAIN')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  "availableAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" timestamp(3),
  "lastError" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" timestamp(3),
  UNIQUE ("draftId", "draftVersion")
);
CREATE INDEX training_reminder_due_idx ON training_reminder_outbox(status, "availableAt");
