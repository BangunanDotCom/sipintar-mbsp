import { postgresAdmin } from "./admin-repository.js";
import { routes as adminRoutes } from "./routes.js";
import { postgresDashboard } from "./dashboard-repository.js";
import { dashboardRoutes } from "./dashboard-routes.js";
import { applicantRoutes } from "./applicant-routes.js";
import { postgresApplicantRepository } from "./applicant-repository.js";
import type { FastifyInstance } from "fastify";
import { applicationDocumentRoutes } from "./application-documents.js";
import { applicationDraftRoutes } from "./application-drafts.js";
import { postgresAuth } from "./auth-repository.js";
import { authRoutes } from "./auth.js";
import { postgresCompanyInvitations } from "./company-invitation-repository.js";
import { companyInvitationRoutes } from "./company-invitations.js";
import { postgresDraftRepository } from "./draft-repository.js";
import { postgresManagement } from "./management-repository.js";
import { managementRoutes } from "./management-routes.js";
import { premisesRoutes } from "./premises.js";
import { premiseFloorRoutes } from "./premise-floors.js";
import { premiseUnitRoutes } from "./premise-units.js";

export const postgresRepositories = {
  auth: postgresAuth,
  admin: postgresAdmin,
  dashboard: postgresDashboard,
  applicants: postgresApplicantRepository,
  companyInvitations: postgresCompanyInvitations,
  drafts: postgresDraftRepository,
  management: postgresManagement,
};

export type DatabaseRepositories = typeof postgresRepositories;

export async function registerRepositoryRoutes(
  app: FastifyInstance,
  {
    auth,
    admin,
    applicants,
    companyInvitations,
    drafts,
    management,
    dashboard,
  }: DatabaseRepositories,
  training?: () => { review: boolean; completion: boolean },
) {
  await authRoutes(app, auth);
  await adminRoutes(app, admin, auth);
  dashboardRoutes(app, dashboard, applicants, auth, training);
  await applicantRoutes(app, applicants, auth, companyInvitations);
  await companyInvitationRoutes(app, companyInvitations, auth);
  await applicationDraftRoutes(app, drafts, auth);
  await premisesRoutes(app, drafts, auth);
  await premiseFloorRoutes(app, drafts, auth);
  await premiseUnitRoutes(app, drafts, auth);
  await applicationDocumentRoutes(app, drafts, auth);
  await managementRoutes(app, management, auth);
}
