import type { FastifyInstance } from "fastify";
import { isCurrent } from "../../../packages/shared/src/index.js";
import { postgresApplicantRepository } from "./applicant-repository.js";
import { postgresAuth } from "./auth-repository.js";
import { fail, session } from "./auth.js";
import { safeUser } from "./core.js";
import { postgresDashboard } from "./dashboard-repository.js";

export function dashboardRoutes(
  app: FastifyInstance,
  repository = postgresDashboard,
  applicants = postgresApplicantRepository,
  auth = postgresAuth,
) {
  app.get("/api/dashboard", async (req) => {
    const s = await session(req, true, auth);
    const role = s.activeRole;
    const current = s.user.roles.filter(
      (assignment) => assignment.roleId === role && isCurrent(assignment),
    );
    if (!current.length) fail(403, "Pilih peranan aktif.");
    const companies =
      role === "PEMOHON" || role === "WAKIL_SYARIKAT"
        ? await applicants.companies(s.userId)
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
    return {
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
