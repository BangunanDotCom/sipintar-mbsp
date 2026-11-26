import { trainingRemindersEnabled } from "./training-reminders.js";
import { syntheticPortalDatabase } from "./synthetic-portal-gate.js";
import { completionSandbox } from "./synthetic-completion-gate.js";
import { loadSyntheticOwnerPolicy } from "./synthetic-owner-policy.js";
import type { FastifyInstance } from "fastify";
import { isCurrent } from "../../../packages/shared/src/index.js";
import { postgresApplicantRepository } from "./applicant-repository.js";
import { postgresAuth } from "./auth-repository.js";
import { fail, session } from "./auth.js";
import { safeUser } from "./core.js";
import { postgresDashboard } from "./dashboard-repository.js";

function postgresTraining() {
  const policy = syntheticPortalDatabase() ? loadSyntheticOwnerPolicy() : null;
  const review = policy?.config.review.enabled === true;
  return {
    review,
    reminders: review && trainingRemindersEnabled(),
    completion:
      review && policy?.config.billing.mode === "MOCK" && completionSandbox(),
  };
}

export function dashboardRoutes(
  app: FastifyInstance,
  repository = postgresDashboard,
  applicants = postgresApplicantRepository,
  auth = postgresAuth,
  training = postgresTraining,
) {
  app.get("/api/dashboard", async (req, reply) => {
    const s = await session(req, true, auth);
    const role = s.activeRole;
    const current = s.user.roles.filter(
      (assignment) => assignment.roleId === role && isCurrent(assignment),
    );
    if (!current.length) fail(403, "Pilih peranan aktif.");
    const companies =
      role === "PEMOHON" || role === "WAKIL_SYARIKAT"
        ? await applicants.companies(s, false)
        : [];
    const notifications = await repository.notifications(s.userId);
    const areaAssignments =
      role === "PIC_KAWASAN"
        ? (await repository.areaAssignments(s.userId)).filter((item) =>
            current.some(
              (assignment) =>
                !assignment.districtId ||
                assignment.districtId === item.area.districtId,
            ),
          )
        : [];
    reply.header("Cache-Control", "private, no-store");
    return {
      training: training(),
      user: safeUser(s.user),
      role,
      companies,
      notifications,
      areaAssignments,
      applications: [],
      moduleStatus: "Akan Tersedia Dalam Fasa Seterusnya",
    };
  });
}
