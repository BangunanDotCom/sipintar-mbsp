# Inventori baseline PR #67

Inventori dijana daripada pokok Git baseline dan AST TypeScript. Senarai API menyenaraikan kaedah HTTP yang didaftarkan secara terus dalam kod aplikasi, termasuk laluan latihan yang tertakluk kepada gerbang konfigurasi. Fastify/Swagger turut membekalkan UI dan JSON di bawah `/api/docs`.

## API

| Kaedah | Laluan | Sumber |
|---|---|---|
| DELETE | `/api/admin/appointments/:id` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L487) |
| GET | `/api/admin/departments` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L363) |
| POST | `/api/admin/officers` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L367) |
| GET | `/api/admin/roles` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L359) |
| GET | `/api/admin/services` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L739) |
| GET | `/api/admin/users` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L349) |
| POST | `/api/admin/users/:id/mfa-reset` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L422) |
| POST | `/api/admin/users/:id/roles` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L445) |
| PATCH | `/api/admin/users/:id/status` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L391) |
| GET | `/api/application-drafts` | [`apps/api/src/application-drafts.ts`](../../apps/api/src/application-drafts.ts#L140) |
| POST | `/api/application-drafts` | [`apps/api/src/application-drafts.ts`](../../apps/api/src/application-drafts.ts#L167) |
| GET | `/api/application-drafts/:id` | [`apps/api/src/application-drafts.ts`](../../apps/api/src/application-drafts.ts#L194) |
| PATCH | `/api/application-drafts/:id` | [`apps/api/src/application-drafts.ts`](../../apps/api/src/application-drafts.ts#L219) |
| GET | `/api/application-drafts/:id/documents` | [`apps/api/src/application-documents.ts`](../../apps/api/src/application-documents.ts#L11) |
| GET | `/api/application-drafts/:id/floors` | [`apps/api/src/premise-floors.ts`](../../apps/api/src/premise-floors.ts#L26) |
| PUT | `/api/application-drafts/:id/floors` | [`apps/api/src/premise-floors.ts`](../../apps/api/src/premise-floors.ts#L59) |
| GET | `/api/application-drafts/:id/premises` | [`apps/api/src/premises.ts`](../../apps/api/src/premises.ts#L76) |
| PUT | `/api/application-drafts/:id/premises` | [`apps/api/src/premises.ts`](../../apps/api/src/premises.ts#L101) |
| GET | `/api/application-drafts/:id/submission-readiness` | [`apps/api/src/application-drafts.ts`](../../apps/api/src/application-drafts.ts#L266) |
| POST | `/api/application-drafts/:id/submit` | [`apps/api/src/application-drafts.ts`](../../apps/api/src/application-drafts.ts#L291) |
| GET | `/api/application-drafts/:id/units` | [`apps/api/src/premise-units.ts`](../../apps/api/src/premise-units.ts#L76) |
| PUT | `/api/application-drafts/:id/units` | [`apps/api/src/premise-units.ts`](../../apps/api/src/premise-units.ts#L89) |
| GET | `/api/application-drafts/context` | [`apps/api/src/application-drafts.ts`](../../apps/api/src/application-drafts.ts#L117) |
| GET | `/api/areas` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L510) |
| POST | `/api/areas` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L545) |
| GET | `/api/areas/:id/resolve` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L573) |
| POST | `/api/areas/assign` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L560) |
| GET | `/api/areas/pics` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L521) |
| GET | `/api/audit` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L706) |
| POST | `/api/auth/activate` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L222) |
| POST | `/api/auth/login` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L155) |
| POST | `/api/auth/logout` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L204) |
| GET | `/api/auth/me` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L173) |
| POST | `/api/auth/mfa/recovery` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L389) |
| POST | `/api/auth/mfa/setup` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L326) |
| POST | `/api/auth/mfa/verify` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L345) |
| POST | `/api/auth/password` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L296) |
| POST | `/api/auth/recover` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L270) |
| POST | `/api/auth/register` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L116) |
| POST | `/api/auth/role` | [`apps/api/src/auth.ts`](../../apps/api/src/auth.ts#L210) |
| GET | `/api/companies` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L107) |
| POST | `/api/companies` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L132) |
| PATCH | `/api/companies/:id` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L167) |
| POST | `/api/companies/:id/documents` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L206) |
| POST | `/api/companies/:id/invitations` | [`apps/api/src/company-invitations.ts`](../../apps/api/src/company-invitations.ts#L78) |
| GET | `/api/companies/:id/representatives` | [`apps/api/src/company-invitations.ts`](../../apps/api/src/company-invitations.ts#L60) |
| POST | `/api/companies/:id/representatives` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L180) |
| POST | `/api/company-invitations/accept` | [`apps/api/src/company-invitations.ts`](../../apps/api/src/company-invitations.ts#L141) |
| POST | `/api/company-invitations/preview` | [`apps/api/src/company-invitations.ts`](../../apps/api/src/company-invitations.ts#L31) |
| GET | `/api/config/:scope` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L659) |
| POST | `/api/config/:scope` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L669) |
| GET | `/api/dashboard` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L87) |
| GET | `/api/documents/:id` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L245) |
| GET | `/api/health` | [`apps/api/src/app.ts`](../../apps/api/src/app.ts#L104) |
| POST | `/api/notifications/:id/read` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L100) |
| PATCH | `/api/profile` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L88) |
| POST | `/api/profile/identification` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L56) |
| GET | `/api/public/districts` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L84) |
| GET | `/api/representation-documents/:id` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L286) |
| GET | `/api/representations` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L261) |
| POST | `/api/representations/:id/verify` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L302) |
| POST | `/api/synthetic-portal/callbacks/payment/:id` | [`apps/api/src/synthetic-portal-billing.ts`](../../apps/api/src/synthetic-portal-billing.ts#L248) |
| GET | `/api/synthetic-portal/drafts/:id` | [`apps/api/src/synthetic-portal.ts`](../../apps/api/src/synthetic-portal.ts#L101) |
| GET | `/api/synthetic-portal/drafts/:id/billing` | [`apps/api/src/synthetic-portal-billing.ts`](../../apps/api/src/synthetic-portal-billing.ts#L148) |
| POST | `/api/synthetic-portal/drafts/:id/evidence` | [`apps/api/src/synthetic-portal.ts`](../../apps/api/src/synthetic-portal.ts#L191) |
| POST | `/api/synthetic-portal/drafts/:id/submit` | [`apps/api/src/synthetic-portal.ts`](../../apps/api/src/synthetic-portal.ts#L369) |
| GET | `/api/synthetic-portal/reviews` | [`apps/api/src/synthetic-portal-review.ts`](../../apps/api/src/synthetic-portal-review.ts#L429) |
| POST | `/api/synthetic-portal/reviews/:id` | [`apps/api/src/synthetic-portal-review.ts`](../../apps/api/src/synthetic-portal-review.ts#L586) |
| GET | `/api/synthetic-portal/reviews/:id/billing` | [`apps/api/src/synthetic-portal-billing.ts`](../../apps/api/src/synthetic-portal-billing.ts#L167) |
| POST | `/api/synthetic-portal/reviews/:id/billing` | [`apps/api/src/synthetic-portal-billing.ts`](../../apps/api/src/synthetic-portal-billing.ts#L176) |
| GET | `/api/synthetic-portal/reviews/:id/comparison` | [`apps/api/src/synthetic-portal-review.ts`](../../apps/api/src/synthetic-portal-review.ts#L518) |
| POST | `/api/template-versions/:id/activate` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L632) |
| GET | `/api/templates` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L580) |
| POST | `/api/templates` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L587) |
| POST | `/api/templates/:id/versions` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L608) |
| GET | `/api/upload-limits` | [`apps/api/src/routes.ts`](../../apps/api/src/routes.ts#L188) |

## Laluan React

| Laluan | Komponen | Sumber |
|---|---|---|
| `/` | `{<Home />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L937) |
| `/daftar` | `{<Auth mode="register" />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L938) |
| `/log-masuk` | `{<Auth mode="login" />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L939) |
| `/pulih-akaun` | `{<Auth mode="recover" />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L940) |
| `/aktifkan` | `{<Auth mode="activate" />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L941) |
| `/dashboard/*` | `{ <React.Suspense fallback={<Loading />}> <Dashboard /> </React.Suspense> }` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L942) |
| `/permohonan/baharu` | `{<ApplicationDraft />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L950) |
| `/permohonan/draf/:id` | `{<ApplicationDraft />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L951) |
| `/permohonan/draf/:id/premis` | `{ <React.Suspense fallback={<Loading />}> <Premises /> </React.Suspense> }` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L952) |
| `/permohonan/draf/:id/tingkat` | `{ <React.Suspense fallback={<Loading />}> <Floors /> </React.Suspense> }` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L960) |
| `/permohonan/draf/:id/unit` | `{ <React.Suspense fallback={<Loading />}> <Units /> </React.Suspense> }` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L968) |
| `/permohonan/draf/:id/semakan` | `{ <React.Suspense fallback={<Loading />}> <Premises review /> </React.Suspense> }` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L976) |
| `/jemputan-syarikat` | `{<CompanyInvitation />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L984) |
| `{`/${x}`}` | `{<Info type={x} />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L986) |
| `/modul/:name` | `{<Info type="modul" />}` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L988) |
| `*` | `{ <div className="container info-page"> <h1>Halaman tidak ditemui</h1> <Link to="/">Kembali ke utama</Link> </div> }` | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx#L989) |

## Model PostgreSQL

| Model | Jadual | Sumber |
|---|---|---|
| `User` | `users` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L10) |
| `AuthenticationIdentity` | `authentication_identities` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L35) |
| `Session` | `sessions` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L45) |
| `MfaFactor` | `mfa_factors` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L56) |
| `RecoveryCode` | `recovery_codes` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L65) |
| `Role` | `roles` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L73) |
| `Permission` | `permissions` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L80) |
| `UserRoleAssignment` | `user_role_assignments` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L88) |
| `Department` | `departments` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L105) |
| `District` | `districts` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L110) |
| `Area` | `areas` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L116) |
| `AreaAssignment` | `area_assignments` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L125) |
| `Company` | `companies` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L137) |
| `CompanyRepresentative` | `company_representatives` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L153) |
| `CompanyRepresentationInvitation` | `company_representation_invitations` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L168) |
| `DelegationDocument` | `delegation_documents` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L183) |
| `Notification` | `notifications` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L197) |
| `EmailDeliveryLog` | `email_delivery_logs` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L208) |
| `TemplateDefinition` | `template_definitions` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L221) |
| `TemplateVersion` | `template_versions` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L228) |
| `SystemConfiguration` | `system_configurations` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L241) |
| `ConfigurationVersion` | `configuration_versions` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L248) |
| `AuditLog` | `audit_logs` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L258) |
| `ApplicationDraft` | `application_drafts` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L271) |
| `ApplicationPremises` | `application_premises` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L295) |
| `PremiseFloor` | `premise_floors` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L325) |
| `PremiseUnit` | `premise_units` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L347) |
| `PremiseUnitFloor` | `premise_unit_floors` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L363) |
| `ApplicationDocument` | `application_documents` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L376) |
| `DraftDocumentScope` | `draft_document_scopes` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L405) |
| `SyntheticSubmission` | `synthetic_submissions` | [`prisma/schema.prisma`](../../prisma/schema.prisma#L419) |

## Migrasi PostgreSQL

- [`prisma/migrations/202610290001_core/migration.sql`](../../prisma/migrations/202610290001_core/migration.sql)
- [`prisma/migrations/202610290002_applicant_accounts/migration.sql`](../../prisma/migrations/202610290002_applicant_accounts/migration.sql)
- [`prisma/migrations/202610290003_application_drafts/migration.sql`](../../prisma/migrations/202610290003_application_drafts/migration.sql)
- [`prisma/migrations/202610290004_premises/migration.sql`](../../prisma/migrations/202610290004_premises/migration.sql)
- [`prisma/migrations/202611170001_premise_floors/migration.sql`](../../prisma/migrations/202611170001_premise_floors/migration.sql)
- [`prisma/migrations/202611170002_application_documents/migration.sql`](../../prisma/migrations/202611170002_application_documents/migration.sql)
- [`prisma/migrations/202611170003_document_scan_lease/migration.sql`](../../prisma/migrations/202611170003_document_scan_lease/migration.sql)
- [`prisma/migrations/202611190001_premise_unit_identity/migration.sql`](../../prisma/migrations/202611190001_premise_unit_identity/migration.sql)
- [`prisma/migrations/202611190002_draft_document_scopes/migration.sql`](../../prisma/migrations/202611190002_draft_document_scopes/migration.sql)
- [`prisma/migrations/202611190003_synthetic_submissions/migration.sql`](../../prisma/migrations/202611190003_synthetic_submissions/migration.sql)

## Suite ujian

- [`tests/api.test.ts`](../../tests/api.test.ts)
- [`tests/clamav-framing-regression.test.ts`](../../tests/clamav-framing-regression.test.ts)
- [`tests/clamav-instream.test.ts`](../../tests/clamav-instream.test.ts)
- [`tests/clamav-scanner.test.ts`](../../tests/clamav-scanner.test.ts)
- [`tests/cloudflare-demo-config.test.ts`](../../tests/cloudflare-demo-config.test.ts)
- [`tests/core.test.ts`](../../tests/core.test.ts)
- [`tests/demo-host-readiness.test.ts`](../../tests/demo-host-readiness.test.ts)
- [`tests/document-checklist-status.test.ts`](../../tests/document-checklist-status.test.ts)
- [`tests/document-clamav-integration.test.ts`](../../tests/document-clamav-integration.test.ts)
- [`tests/document-malware-scanner.test.ts`](../../tests/document-malware-scanner.test.ts)
- [`tests/document-policy.test.ts`](../../tests/document-policy.test.ts)
- [`tests/document-quarantine-integration.test.ts`](../../tests/document-quarantine-integration.test.ts)
- [`tests/document-readiness-guidance.test.ts`](../../tests/document-readiness-guidance.test.ts)
- [`tests/document-scan-batch.test.ts`](../../tests/document-scan-batch.test.ts)
- [`tests/document-scan-exit-code.test.ts`](../../tests/document-scan-exit-code.test.ts)
- [`tests/document-scan-lease.test.ts`](../../tests/document-scan-lease.test.ts)
- [`tests/document-scan-preflight.test.ts`](../../tests/document-scan-preflight.test.ts)
- [`tests/document-scan-runner.test.ts`](../../tests/document-scan-runner.test.ts)
- [`tests/document-scan-worker.test.ts`](../../tests/document-scan-worker.test.ts)
- [`tests/document-store-config.test.ts`](../../tests/document-store-config.test.ts)
- [`tests/document-submission-readiness-db.test.ts`](../../tests/document-submission-readiness-db.test.ts)
- [`tests/document-submission-readiness.test.ts`](../../tests/document-submission-readiness.test.ts)
- [`tests/draft-applicant-context.test.ts`](../../tests/draft-applicant-context.test.ts)
- [`tests/draft-document-upload-policy.test.ts`](../../tests/draft-document-upload-policy.test.ts)
- [`tests/draft-readiness.test.ts`](../../tests/draft-readiness.test.ts)
- [`tests/draft-upload-validation.test.ts`](../../tests/draft-upload-validation.test.ts)
- [`tests/e2e/demo-host.spec.ts`](../../tests/e2e/demo-host.spec.ts)
- [`tests/e2e/download.spec.ts`](../../tests/e2e/download.spec.ts)
- [`tests/e2e/maps.spec.ts`](../../tests/e2e/maps.spec.ts)
- [`tests/e2e/password.spec.ts`](../../tests/e2e/password.spec.ts)
- [`tests/e2e/personal-demo.spec.ts`](../../tests/e2e/personal-demo.spec.ts)
- [`tests/e2e/portal.spec.ts`](../../tests/e2e/portal.spec.ts)
- [`tests/e2e/synthetic-portal.spec.ts`](../../tests/e2e/synthetic-portal.spec.ts)
- [`tests/errors.test.ts`](../../tests/errors.test.ts)
- [`tests/floor-identity.test.ts`](../../tests/floor-identity.test.ts)
- [`tests/floor-summary.test.ts`](../../tests/floor-summary.test.ts)
- [`tests/local-quarantine-document-store.test.ts`](../../tests/local-quarantine-document-store.test.ts)
- [`tests/map-http.test.ts`](../../tests/map-http.test.ts)
- [`tests/map-worker.test.ts`](../../tests/map-worker.test.ts)
- [`tests/maps.test.ts`](../../tests/maps.test.ts)
- [`tests/officer-document-triage-preview.test.tsx`](../../tests/officer-document-triage-preview.test.tsx)
- [`tests/premise-units.test.ts`](../../tests/premise-units.test.ts)
- [`tests/premises-consistency.test.ts`](../../tests/premises-consistency.test.ts)
- [`tests/prisma-config.test.ts`](../../tests/prisma-config.test.ts)
- [`tests/private-document-keys.test.ts`](../../tests/private-document-keys.test.ts)
- [`tests/private-document-store.test.ts`](../../tests/private-document-store.test.ts)
- [`tests/supporting-documents.test.ts`](../../tests/supporting-documents.test.ts)
- [`tests/swagger-ui.test.ts`](../../tests/swagger-ui.test.ts)
- [`tests/synthetic-billing.test.ts`](../../tests/synthetic-billing.test.ts)
- [`tests/synthetic-log-redaction.test.ts`](../../tests/synthetic-log-redaction.test.ts)
- [`tests/synthetic-owner-policy.test.ts`](../../tests/synthetic-owner-policy.test.ts)
- [`tests/synthetic-portal-gate.test.ts`](../../tests/synthetic-portal-gate.test.ts)
- [`tests/synthetic-review.test.ts`](../../tests/synthetic-review.test.ts)
- [`tests/uat-feedback.test.ts`](../../tests/uat-feedback.test.ts)
- [`tests/uat-preflight.test.ts`](../../tests/uat-preflight.test.ts)
- [`tests/upload-policy.test.ts`](../../tests/upload-policy.test.ts)
- [`tests/web-api-session.test.ts`](../../tests/web-api-session.test.ts)

## Dokumentasi dan pakej baseline

- [`docs/API.md`](../../docs/API.md)
- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- [`docs/DECISIONS-OPERATIONS-2026-11.md`](../../docs/DECISIONS-OPERATIONS-2026-11.md)
- [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md)
- [`docs/K02-UNIT-IDENTITY-PLAN.md`](../../docs/K02-UNIT-IDENTITY-PLAN.md)
- [`docs/K03-K04-K07-DOCUMENT-SECURITY-SPEC.md`](../../docs/K03-K04-K07-DOCUMENT-SECURITY-SPEC.md)
- [`docs/MAP-FIX.md`](../../docs/MAP-FIX.md)
- [`docs/MAP-WORKER-DIAGNOSIS.md`](../../docs/MAP-WORKER-DIAGNOSIS.md)
- [`docs/OPERATIONS.md`](../../docs/OPERATIONS.md)
- [`docs/PHASE2.md`](../../docs/PHASE2.md)
- [`docs/PHASE2A.md`](../../docs/PHASE2A.md)
- [`docs/PHASE2B-ACCEPTANCE-GATES.md`](../../docs/PHASE2B-ACCEPTANCE-GATES.md)
- [`docs/PHASE2B1.md`](../../docs/PHASE2B1.md)
- [`docs/PHASE2B2.md`](../../docs/PHASE2B2.md)
- [`docs/RBAC.md`](../../docs/RBAC.md)
- [`docs/REGISTRATION-DIAGNOSIS.md`](../../docs/REGISTRATION-DIAGNOSIS.md)
- [`docs/SECURITY.md`](../../docs/SECURITY.md)
- [`docs/STATUS.md`](../../docs/STATUS.md)
- [`docs/STAYLINK-PHASE1-MULTIWORKSTREAM-ICT-HANDOVER.md`](../../docs/STAYLINK-PHASE1-MULTIWORKSTREAM-ICT-HANDOVER.md)
- [`docs/TESTING.md`](../../docs/TESTING.md)
- [`docs/UI-DESIGN.md`](../../docs/UI-DESIGN.md)
- [`docs/ai-agent-activation.md`](../../docs/ai-agent-activation.md)
- [`docs/ict-handover/DEMO-RELEASE-1-JTIK-HANDOVER.md`](../../docs/ict-handover/DEMO-RELEASE-1-JTIK-HANDOVER.md)
- [`docs/ict-handover/DEMO-RELEASE-MANIFEST.md`](../../docs/ict-handover/DEMO-RELEASE-MANIFEST.md)
- [`docs/ict-handover/DEMO.md`](../../docs/ict-handover/DEMO.md)
- [`docs/ict-handover/GUIDED-INTERNAL-UAT.md`](../../docs/ict-handover/GUIDED-INTERNAL-UAT.md)
- [`docs/ict-handover/GUIDED-UAT-ACCEPTANCE.md`](../../docs/ict-handover/GUIDED-UAT-ACCEPTANCE.md)
- [`docs/ict-handover/INTERNAL-UAT-COCKPIT.md`](../../docs/ict-handover/INTERNAL-UAT-COCKPIT.md)
- [`docs/ict-handover/JTIK-DECISION-AND-UAT-READINESS.md`](../../docs/ict-handover/JTIK-DECISION-AND-UAT-READINESS.md)
- [`docs/ict-handover/JTIK-TECHNICAL-SESSION-AGENDA.md`](../../docs/ict-handover/JTIK-TECHNICAL-SESSION-AGENDA.md)
- [`docs/ict-handover/OWNER-DECISION-PACK.md`](../../docs/ict-handover/OWNER-DECISION-PACK.md)
- [`docs/ict-handover/OWNER-PROPOSALS.md`](../../docs/ict-handover/OWNER-PROPOSALS.md)
- [`docs/ict-handover/PERSONAL-DEMO-COMPLETENESS.md`](../../docs/ict-handover/PERSONAL-DEMO-COMPLETENESS.md)
- [`docs/ict-handover/PERSONAL-DEMO-GUIDE.md`](../../docs/ict-handover/PERSONAL-DEMO-GUIDE.md)
- [`docs/ict-handover/PRE-JTIK-COMPLETE-PACK.md`](../../docs/ict-handover/PRE-JTIK-COMPLETE-PACK.md)
- [`docs/ict-handover/PRESTAGING-ASSURANCE.md`](../../docs/ict-handover/PRESTAGING-ASSURANCE.md)
- [`docs/ict-handover/README.md`](../../docs/ict-handover/README.md)
- [`docs/ict-handover/SYNTHETIC-PORTAL.md`](../../docs/ict-handover/SYNTHETIC-PORTAL.md)
- [`docs/ict-handover/UAT-FEEDBACK-TRIAGE.md`](../../docs/ict-handover/UAT-FEEDBACK-TRIAGE.md)
- [`docs/ict-handover/UAT-SECURITY.md`](../../docs/ict-handover/UAT-SECURITY.md)
- [`docs/ict-handover/UAT-SESSION-WORKSHEET.md`](../../docs/ict-handover/UAT-SESSION-WORKSHEET.md)
- [`docs/ict-handover/VERIFICATION.md`](../../docs/ict-handover/VERIFICATION.md)
- [`docs/previews/README.md`](../../docs/previews/README.md)
- [`deploy/cloudflare/README.md`](../../deploy/cloudflare/README.md)
- [`deploy/demo/README.md`](../../deploy/demo/README.md)
- [`deploy/personal-demo/README.md`](../../deploy/personal-demo/README.md)
