import { oracleTrainingRemindersEnabled } from "../training-reminders.js";
import { createOracleSyntheticAnalytics } from "./synthetic-analytics.js";
import { createOracleTrainingReminders } from "./training-reminders.js";
import { companyInvitationRoutes } from "../company-invitations.js";
import { oracleDelegationRoutes } from "./delegation-routes.js";
import { completionConfig } from "../synthetic-portal-completion.js";
import {
  assertOracleCompletionMigration,
  oracleCompletionEnabled,
} from "./completion-gate.js";
import { createOracleCompletionRuntime } from "./completion-runtime.js";
import { createOracleAdmin } from "./admin.js";
import { createOracleDashboard } from "./dashboard.js";
import { createOracleApplicantRepository } from "./applicants.js";
import { createOracleSyntheticPortal } from "./synthetic-portal.js";
import { loadSyntheticOwnerPolicy } from "../synthetic-owner-policy.js";
import { registerSyntheticPortal } from "../synthetic-portal.js";
import type { FastifyInstance } from "fastify";
import type { DatabaseRepositories } from "../database-provider.js";
import { createOracleAuthRepository } from "./auth.js";
import { createOracleCompanyInvitationRepository } from "./company-invitations.js";
import { createOracleDraftRepository } from "./drafts.js";
import { createOracleManagementRepository } from "./management.js";
import type { OraclePool } from "./pool.js";

export type OracleLabRepositories = DatabaseRepositories & {
  registerDelegationLab(app: FastifyInstance): Promise<void>;
  registerSyntheticLab(app: FastifyInstance): Promise<void>;
  checkConnection(): Promise<void>;
  training(): { review: boolean; completion: boolean; reminders: boolean };
};

export function createOracleRepositories(
  pool: OraclePool,
): OracleLabRepositories {
  if (pool.purpose !== "runtime")
    throw Error("API Oracle memerlukan akaun runtime makmal.");
  const auth = createOracleAuthRepository(pool);
  const companyInvitations = createOracleCompanyInvitationRepository(pool);
  return {
    auth,
    admin: createOracleAdmin(pool),
    applicants: createOracleApplicantRepository(pool),
    dashboard: createOracleDashboard(pool),
    async checkConnection() {
      await pool.use(async (connection) => {
        await connection.execute("SELECT 1 FROM DUAL");
      });
    },
    companyInvitations,
    drafts: createOracleDraftRepository(pool),
    management: createOracleManagementRepository(pool),
    training() {
      const policy =
        process.env.STAYLINK_ORACLE_LAB_SYNTHETIC === "true"
          ? loadSyntheticOwnerPolicy()
          : null;
      const review = policy?.config.review.enabled === true;
      return {
        review,
        reminders: review && oracleTrainingRemindersEnabled(),
        completion:
          review &&
          policy?.config.billing.mode === "MOCK" &&
          oracleCompletionEnabled(),
      };
    },
    async registerDelegationLab(app) {
      await oracleDelegationRoutes(app, pool, auth);
      await companyInvitationRoutes(app, companyInvitations, auth);
    },
    async registerSyntheticLab(app) {
      if (
        process.env.NODE_ENV !== "test" ||
        process.env.STAYLINK_ORACLE_LAB_SYNTHETIC !== "true"
      )
        return;
      const owner = loadSyntheticOwnerPolicy();
      if (!owner) throw Error("Polisi Oracle sintetik tidak sah.");
      const { portal, reviews, capture } = createOracleSyntheticPortal(pool);
      const config =
        owner.config.review.enabled &&
        owner.config.billing.mode === "MOCK" &&
        oracleCompletionEnabled()
          ? completionConfig()
          : null;
      if (config) await assertOracleCompletionMigration(pool);
      await registerSyntheticPortal(
        app,
        owner,
        auth,
        portal,
        reviews,
        capture,
        config
          ? { config, repository: createOracleCompletionRuntime(pool) }
          : undefined,
        {
          analytics: createOracleSyntheticAnalytics(pool),
          reminders: createOracleTrainingReminders(pool).repository,
        },
      );
    },
  };
}
