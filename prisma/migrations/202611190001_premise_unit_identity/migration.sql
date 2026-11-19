-- Add identity and link storage without deriving records from legacy aggregates.
ALTER TABLE application_premises
  ADD CONSTRAINT application_premises_id_draft_unique UNIQUE (id, "draftId");

ALTER TABLE premise_floors
  ADD CONSTRAINT premise_floors_id_draft_unique UNIQUE (id, "draftId");

CREATE TABLE premise_units (
  id TEXT PRIMARY KEY,
  "premiseId" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "unitLabel" TEXT NOT NULL CHECK (char_length("unitLabel") BETWEEN 1 AND 80),
  "normalizedLabel" TEXT NOT NULL CHECK ("normalizedLabel" <> ''),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT premise_units_label_unique UNIQUE ("premiseId", "normalizedLabel"),
  CONSTRAINT premise_units_id_draft_unique UNIQUE (id, "draftId"),
  CONSTRAINT premise_units_premise_draft_fkey
    FOREIGN KEY ("premiseId", "draftId") REFERENCES application_premises (id, "draftId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE premise_unit_floors (
  "unitId" TEXT NOT NULL,
  "floorId" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  CONSTRAINT premise_unit_floors_pkey PRIMARY KEY ("unitId", "floorId"),
  CONSTRAINT premise_unit_floors_unit_draft_fkey
    FOREIGN KEY ("unitId", "draftId") REFERENCES premise_units (id, "draftId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT premise_unit_floors_floor_draft_fkey
    FOREIGN KEY ("floorId", "draftId") REFERENCES premise_floors (id, "draftId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX premise_unit_floors_floor_draft_idx ON premise_unit_floors ("floorId", "draftId");
