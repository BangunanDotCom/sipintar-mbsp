ALTER TABLE application_documents
  ADD CONSTRAINT application_documents_id_draft_unique UNIQUE (id, "draftId");

CREATE TABLE draft_document_scopes (
  "documentId" TEXT PRIMARY KEY,
  "draftId" TEXT NOT NULL,
  "unitId" TEXT,
  "floorId" TEXT,
  CONSTRAINT draft_document_scopes_one_target CHECK ("unitId" IS NULL OR "floorId" IS NULL),
  CONSTRAINT draft_document_scopes_document_unique UNIQUE ("documentId", "draftId"),
  CONSTRAINT draft_document_scopes_document_fkey FOREIGN KEY ("documentId", "draftId")
    REFERENCES application_documents (id, "draftId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT draft_document_scopes_unit_fkey FOREIGN KEY ("unitId", "draftId")
    REFERENCES premise_units (id, "draftId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT draft_document_scopes_floor_fkey FOREIGN KEY ("floorId", "draftId")
    REFERENCES premise_floors (id, "draftId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX draft_document_scopes_unit_idx ON draft_document_scopes ("unitId", "draftId");
CREATE INDEX draft_document_scopes_floor_idx ON draft_document_scopes ("floorId", "draftId");
