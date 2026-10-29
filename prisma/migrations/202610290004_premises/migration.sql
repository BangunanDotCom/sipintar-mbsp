-- One aggregate premises record per draft; no room-level records or official GIS decision.
CREATE TABLE application_premises (
 id TEXT PRIMARY KEY,
 "draftId" TEXT NOT NULL UNIQUE REFERENCES application_drafts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 address TEXT CHECK (char_length(address) BETWEEN 1 AND 1000),
 postcode TEXT CHECK (postcode ~ '^[0-9]{5}$'),
 "lotNumber" TEXT CHECK (char_length("lotNumber") BETWEEN 1 AND 120),
 locality TEXT CHECK (char_length(locality) BETWEEN 1 AND 160),
 "districtId" TEXT REFERENCES districts(id) ON DELETE RESTRICT ON UPDATE CASCADE CHECK ("districtId" IN ('SPU','SPT','SPS')),
 latitude DOUBLE PRECISION CHECK (latitude BETWEEN -85 AND 85),
 longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
 "locationSource" TEXT,
 "boundaryStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK ("boundaryStatus" = 'UNVERIFIED'),
 "buildingType" TEXT CHECK (char_length("buildingType") BETWEEN 1 AND 160),
 "currentUse" TEXT CHECK (char_length("currentUse") BETWEEN 1 AND 200),
 "involvedFloors" INTEGER CHECK ("involvedFloors" > 0),
 "accommodationUnits" INTEGER CHECK ("accommodationUnits" > 0),
 "totalRooms" INTEGER CHECK ("totalRooms" > 0),
 "floorAreaSqm" NUMERIC(12,2) CHECK ("floorAreaSqm" > 0 AND "floorAreaSqm" <= 1000000000),
 "proposedWorkers" INTEGER CHECK ("proposedWorkers" > 0),
 "certificateType" TEXT CHECK ("certificateType" IN ('CCC','CFO','OC','NOT_APPLICABLE','UNKNOWN')),
 "certificateNumber" TEXT CHECK (char_length("certificateNumber") BETWEEN 1 AND 120),
 "certificateDate" DATE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "premises_pin_pair" CHECK (
  (latitude IS NULL AND longitude IS NULL AND "locationSource" IS NULL) OR
  (latitude IS NOT NULL AND longitude IS NOT NULL AND "locationSource" IS NOT NULL AND "locationSource" = 'USER_PIN')
 ),
 CONSTRAINT "premises_certificate_fields" CHECK (
  ("certificateNumber" IS NULL AND "certificateDate" IS NULL) OR
  ("certificateType" IS NOT NULL AND "certificateType" IN ('CCC','CFO','OC'))
 )
);
