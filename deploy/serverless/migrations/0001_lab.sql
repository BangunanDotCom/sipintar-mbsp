-- Isolated D1 proof. These tables do not represent the full STAYLink schema.
CREATE TABLE stl_lab_accounts (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('PEMOHON','WAKIL_SYARIKAT','PIC_KAWASAN','PPSK','PENTADBIR_ICT')),
  district TEXT CHECK (district IN ('SPU','SPT')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  CHECK (
    (role IN ('PIC_KAWASAN','PPSK') AND district IS NOT NULL)
    OR (role IN ('PEMOHON','WAKIL_SYARIKAT','PENTADBIR_ICT') AND district IS NULL)
  )
) STRICT;

CREATE TABLE stl_lab_drafts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES stl_lab_accounts(id),
  district TEXT NOT NULL CHECK (district IN ('SPU','SPT')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','CORRECTION_REQUESTED')),
  version INTEGER NOT NULL CHECK (version >= 1),
  transition_actor TEXT REFERENCES stl_lab_accounts(id),
  transition_key TEXT,
  CHECK ((transition_actor IS NULL) = (transition_key IS NULL))
) STRICT;

CREATE INDEX stl_lab_draft_owner ON stl_lab_drafts(owner_id,id);
CREATE INDEX stl_lab_draft_district ON stl_lab_drafts(district,status,id);

CREATE TABLE stl_lab_audit (
  actor_id TEXT NOT NULL REFERENCES stl_lab_accounts(id),
  request_key TEXT NOT NULL,
  draft_id TEXT NOT NULL REFERENCES stl_lab_drafts(id),
  previous_version INTEGER NOT NULL,
  next_version INTEGER NOT NULL CHECK (next_version = previous_version + 1),
  action TEXT NOT NULL CHECK (action = 'REQUEST_CORRECTION'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (actor_id, request_key),
  UNIQUE (draft_id, next_version)
) STRICT;

CREATE TRIGGER stl_lab_correction_audit
AFTER UPDATE OF status ON stl_lab_drafts
WHEN OLD.status = 'SUBMITTED' AND NEW.status = 'CORRECTION_REQUESTED'
BEGIN
  INSERT INTO stl_lab_audit (actor_id, request_key, draft_id, previous_version, next_version, action)
  VALUES (NEW.transition_actor, NEW.transition_key, NEW.id, OLD.version, NEW.version, 'REQUEST_CORRECTION');
END;

CREATE TRIGGER stl_lab_audit_no_update
BEFORE UPDATE ON stl_lab_audit
BEGIN
  SELECT RAISE(ABORT, 'STL lab audit is immutable');
END;

CREATE TRIGGER stl_lab_audit_no_delete
BEFORE DELETE ON stl_lab_audit
BEGIN
  SELECT RAISE(ABORT, 'STL lab audit is immutable');
END;
