CREATE TABLE synthetic_submissions (
  id TEXT PRIMARY KEY,
  "draftId" TEXT NOT NULL,
  "draftVersion" INTEGER NOT NULL CHECK ("draftVersion" > 0),
  key TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "declarationVersion" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "previousId" TEXT CHECK ("previousId" <> id),
  snapshot JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT synthetic_submissions_draft_fkey FOREIGN KEY ("draftId")
    REFERENCES application_drafts (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT synthetic_submissions_id_draft_unique UNIQUE (id, "draftId"),
  CONSTRAINT synthetic_submissions_previous_draft_unique UNIQUE ("previousId", "draftId"),
  CONSTRAINT synthetic_submissions_previous_fkey FOREIGN KEY ("previousId", "draftId")
    REFERENCES synthetic_submissions (id, "draftId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT synthetic_submissions_key_unique UNIQUE ("draftId", key),
  CONSTRAINT synthetic_submissions_version_unique UNIQUE ("draftId", "draftVersion")
);

CREATE FUNCTION reject_synthetic_submission_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Synthetic submissions are immutable';
END;
$$;
CREATE TRIGGER synthetic_submissions_immutable
  BEFORE UPDATE OR DELETE ON synthetic_submissions
  FOR EACH ROW EXECUTE FUNCTION reject_synthetic_submission_change();
