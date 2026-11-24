import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authorize, fail, session } from "./auth.js";
import { postgresAuth } from "./auth-repository.js";
import { postgresManagement } from "./management-repository.js";
import { UPLOAD_CATEGORIES, uploadCategoryForKey } from "./upload-policy.js";

export async function managementRoutes(
  app: FastifyInstance,
  repository = postgresManagement,
  auth = postgresAuth,
) {
  const allow = (req: FastifyRequest, action: string) =>
    authorize(req, action, auth);
  const scopeParam = z.object({ scope: z.enum(["technical", "operations"]) });

  app.post("/api/notifications/:id/read", async (req) => {
    const { userId } = await session(req, true, auth);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return repository.markNotificationRead(id, userId);
  });

  app.get("/api/config/:scope", async (req) => {
    const { scope } = scopeParam.parse(req.params);
    await allow(req, `config.${scope}`);
    return repository.configurations(scope);
  });

  app.post("/api/config/:scope", async (req) => {
    const { scope } = scopeParam.parse(req.params);
    const s = await allow(req, `config.${scope}`);
    const b = z
      .object({
        key: z.string().regex(/^[a-z][a-z0-9_.]{2,60}$/),
        value: z.union([z.string().max(1000), z.number(), z.boolean()]),
        reason: z.string().min(5).max(500),
      })
      .parse(req.body);
    const category =
      scope === "technical" ? uploadCategoryForKey(b.key) : undefined;
    if (
      category &&
      (typeof b.value !== "number" ||
        !Number.isInteger(b.value) ||
        b.value < 1 ||
        b.value > UPLOAD_CATEGORIES[category].ceilingMiB)
    )
      fail(
        400,
        `Had ${category} mesti nombor bulat 1 hingga ${UPLOAD_CATEGORIES[category].ceilingMiB} MiB.`,
      );
    await repository.changeConfiguration({
      ...b,
      key: `${scope}.${b.key}`,
      userId: s.userId,
      activeRole: s.activeRole,
    });
    return { ok: true };
  });

  app.get("/api/audit", async (req) => {
    const s = await session(req, true, auth);
    if (s.activeRole === "PENTADBIR_ICT") {
      await allow(req, "audit.all");
      await auth.audit(s.userId, s.activeRole, "AUDIT_READ");
      return repository.auditHistory();
    }
    await allow(req, "audit.operations");
    return repository.auditHistory(s.userId);
  });

  app.get("/api/admin/services", async (req) => {
    await allow(req, "services.read");
    return {
      database: "CONNECTED",
      email: await repository.emailStatus(),
      integrations: {
        AI: "NOT_CONFIGURED",
        MBSPPay: "NOT_CONFIGURED",
        GIS: "NOT_CONFIGURED",
        SSO: "NOT_CONFIGURED",
        digitalSignature: "NOT_CONFIGURED",
      },
    };
  });
}
