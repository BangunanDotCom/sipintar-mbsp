CREATE TABLE premise_floors (
  id UUID PRIMARY KEY,
  "draftId" UUID NOT NULL REFERENCES application_drafts(id) ON DELETE CASCADE,
  "floorLabel" TEXT NOT NULL,
  position INTEGER NOT NULL,
  rooms INTEGER NOT NULL CHECK (rooms >= 0),
  beds INTEGER NOT NULL CHECK (beds >= 0),
  workers INTEGER NOT NULL CHECK (workers >= 0),
  "areaSqm" DECIMAL(12,2) NOT NULL CHECK ("areaSqm" >= 0),
  facilities JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT premise_floors_draft_label_unique UNIQUE ("draftId","floorLabel"),
  CONSTRAINT premise_floors_draft_position_unique UNIQUE ("draftId",position)
);
CREATE INDEX premise_floors_draft_idx ON premise_floors ("draftId");
