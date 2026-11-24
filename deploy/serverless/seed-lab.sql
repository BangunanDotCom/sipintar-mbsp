-- Local placeholders and scenario anchors only. No sign-in credentials.
INSERT INTO stl_lab_accounts (id, role, district) VALUES
 ('pemohon', 'PEMOHON', NULL),
 ('wakil', 'WAKIL_SYARIKAT', NULL),
 ('pic-spu', 'PIC_KAWASAN', 'SPU'),
 ('pic-spt', 'PIC_KAWASAN', 'SPT'),
 ('ppsk', 'PPSK', 'SPU'),
 ('pentadbir', 'PENTADBIR_ICT', NULL)
ON CONFLICT(id) DO NOTHING;

INSERT INTO stl_lab_drafts (id, owner_id, district, status, version) VALUES
 ('single-unit', 'pemohon', 'SPU', 'SUBMITTED', 1),
 ('multiple-units', 'pemohon', 'SPU', 'DRAFT', 1),
 ('failed-evidence', 'pemohon', 'SPU', 'DRAFT', 1),
 ('company-active', 'wakil', 'SPU', 'DRAFT', 1),
 ('company-expired', 'wakil', 'SPU', 'DRAFT', 1),
 ('district-spt', 'pemohon', 'SPT', 'SUBMITTED', 1)
ON CONFLICT(id) DO NOTHING;
