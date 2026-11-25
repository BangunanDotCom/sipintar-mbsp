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
  registerSyntheticLab(app: FastifyInstance): Promise<void>;
  checkConnection(): Promise<void>;
};

export function createOracleRepositories(
  pool: OraclePool,
): OracleLabRepositories {
  if (pool.purpose !== "runtime")
    throw Error("API Oracle memerlukan akaun runtime makmal.");
  const auth = createOracleAuthRepository(pool);
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
    companyInvitations: createOracleCompanyInvitationRepository(pool),
    drafts: createOracleDraftRepository(pool),
    management: createOracleManagementRepository(pool),
    async registerSyntheticLab(app) {
      if (
        process.env.NODE_ENV !== "test" ||
        process.env.STAYLINK_ORACLE_LAB_SYNTHETIC !== "true"
      )
        return;
      const owner = loadSyntheticOwnerPolicy();
      if (!owner) throw Error("Polisi Oracle sintetik tidak sah.");
      const { portal, reviews, capture } = createOracleSyntheticPortal(pool);
      await registerSyntheticPortal(app, owner, auth, portal, reviews, capture);
    },
  };
}
