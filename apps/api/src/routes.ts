import { syntheticPortalDatabase } from "./synthetic-portal-gate.js";
import {
  unicodeTrainingPdf,
  trainingPdfDigest,
  UnsupportedTrainingGlyph,
} from "./synthetic-letter-pdf.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { origin, safeUser } from "./core.js";
import { authorize, fail } from "./auth.js";
import { postgresAuth } from "./auth-repository.js";
import { postgresAdmin } from "./admin-repository.js";
import {
  roles,
  isCurrent,
  templateCategories,
} from "../../../packages/shared/src/index.js";
const id = (r: any) => z.object({ id: z.string().uuid() }).parse(r.params).id;
const roleSchema = z.enum(
  Object.keys(roles) as [keyof typeof roles, ...(keyof typeof roles)[]],
);
const scopedDistricts = (s: Awaited<ReturnType<typeof authorize>>) =>
  s.assignments.some((assignment) => !assignment.districtId)
    ? undefined
    : s.assignments.map((assignment) => assignment.districtId!);

export async function routes(
  app: FastifyInstance,
  repository = postgresAdmin,
  auth = postgresAuth,
  trainingSandbox = () => Boolean(syntheticPortalDatabase()),
) {
  const { audit, notify, issueIdentity } = auth;
  const allow = (req: Parameters<typeof authorize>[0], action: string) =>
    authorize(req, action, auth);
  app.get("/api/admin/users", async (req) => {
    const s = await allow(req, "users.manage");
    await audit(s.userId, s.activeRole, "USERS_READ");
    const users = await repository.users();
    return users.map((u) => ({ ...safeUser(u), roles: u.roles }));
  });
  app.get("/api/admin/roles", async (req) => {
    await allow(req, "roles.manage");
    return repository.roles();
  });
  app.get("/api/admin/departments", async (req) => {
    await allow(req, "roles.manage");
    return repository.departments();
  });
  app.post("/api/admin/officers", async (req, reply) => {
    const s = await allow(req, "users.manage");
    const b = z
      .object({
        name: z.string().min(3).max(120),
        email: z.email().transform((x) => x.toLowerCase()),
        phone: z.string().min(8).max(20),
        roleId: roleSchema,
        departmentId: z.string(),
        districtId: z.enum(["SPU", "SPT", "SPS"]).optional(),
        reference: z.string().min(5).max(200),
        startsAt: z.iso.datetime().optional(),
        endsAt: z.iso.datetime().optional(),
      })
      .parse(req.body);
    if (["PEMOHON", "WAKIL_SYARIKAT"].includes(b.roleId))
      fail(400, "Pilih peranan pegawai.");
    if (b.endsAt && new Date(b.endsAt) <= new Date(b.startsAt || Date.now()))
      fail(400, "Julat pelantikan tidak sah.");
    if (!(await repository.departmentExists(b.departmentId)))
      fail(400, "Jabatan tidak sah.");
    const { name, email, phone, startsAt, endsAt, districtId, ...assignment } =
      b;
    const u = await repository.createOfficer(
      { name, email, phone },
      {
        ...assignment,
        districtId: districtId ?? null,
        startsAt: new Date(startsAt ?? Date.now()),
        endsAt: endsAt ? new Date(endsAt) : null,
        authorizedBy: s.userId,
      },
      { actorId: s.userId, activeRole: s.activeRole, action: "OFFICER_INVITE" },
    );
    const token = await issueIdentity(u.id, "OFFICER_INVITE");
    await notify(
      u.id,
      "INVITATION",
      "Jemputan pegawai STAYLink",
      "Sila aktifkan akaun dan daftar MFA.",
      `${origin}/aktifkan?type=OFFICER_INVITE&token=${token}`,
    );
    reply.code(201);
    return safeUser(u);
  });
  app.patch("/api/admin/users/:id/status", async (req) => {
    const s = await allow(req, "users.manage");
    const target = id(req);
    if (target === s.userId)
      fail(400, "Tidak boleh mengubah status akaun sendiri.");
    const b = z
      .object({
        status: z.enum(["ACTIVE", "SUSPENDED"]),
        reason: z.string().min(5).max(500),
      })
      .parse(req.body);
    await repository.status(target, b.status);
    await audit(
      s.userId,
      s.activeRole,
      "ACCOUNT_STATUS_CHANGED",
      target,
      "SUCCESS",
      { reason: b.reason },
    );
    await notify(
      target,
      "SECURITY",
      "Status akaun berubah",
      `${b.status}: ${b.reason}`,
    );
    return { ok: true };
  });
  app.post("/api/admin/users/:id/mfa-reset", async (req) => {
    const s = await allow(req, "users.manage"),
      target = id(req);
    const { reason } = z
      .object({ reason: z.string().min(10).max(500) })
      .parse(req.body);
    if (target === s.userId) fail(403, "Pemulihan memerlukan pentadbir lain.");
    await repository.resetMfa(target);
    await audit(s.userId, s.activeRole, "MFA_ADMIN_RESET", target, "SUCCESS", {
      reason,
    });
    await notify(
      target,
      "SECURITY",
      "MFA ditetapkan semula",
      "Daftar faktor MFA baharu pada login seterusnya.",
    );
    return { ok: true };
  });
  app.post("/api/admin/users/:id/roles", async (req) => {
    const s = await allow(req, "roles.manage"),
      userId = id(req);
    if (userId === s.userId) fail(403, "Pelantikan sendiri tidak dibenarkan.");
    const b = z
      .object({
        roleId: roleSchema,
        departmentId: z.string(),
        districtId: z.enum(["SPU", "SPT", "SPS"]).optional(),
        reference: z.string().min(5).max(200),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime().optional(),
      })
      .parse(req.body);
    const u = await repository.officer(userId);
    if (
      u.kind !== "OFFICER" ||
      ["PEMOHON", "WAKIL_SYARIKAT"].includes(b.roleId)
    )
      fail(400, "Pelantikan pegawai sahaja.");
    if (b.endsAt && new Date(b.endsAt) <= new Date(b.startsAt))
      fail(400, "Julat tarikh tidak sah.");
    if (!(await repository.departmentExists(b.departmentId)))
      fail(400, "Jabatan tidak sah.");
    const a = await repository.assignRole(
      userId,
      {
        ...b,
        districtId: b.districtId ?? null,
        startsAt: new Date(b.startsAt),
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
        authorizedBy: s.userId,
      },
      s.userId,
      s.activeRole,
      trainingSandbox() &&
        process.env.STAYLINK_SYNTHETIC_APPOINTMENT_CONFLICTS === "true",
    );
    await notify(
      userId,
      "ROLE",
      "Pelantikan peranan",
      `Peranan ${b.roleId} ditambah.`,
    );
    return a;
  });
  app.delete("/api/admin/appointments/:id", async (req) => {
    const s = await allow(req, "roles.manage");
    const a = await repository.appointment(id(req));
    if (a.userId === s.userId)
      fail(403, "Perubahan pelantikan sendiri tidak dibenarkan.");
    if (!(await repository.revoke(a.id, a.userId, s.userId, s.activeRole)))
      return { ok: true };
    await notify(
      a.userId,
      "ROLE",
      "Pelantikan ditamatkan",
      `Peranan ${a.roleId} ditamatkan.`,
    );
    return { ok: true };
  });
  app.get("/api/areas", async (req) => {
    const s = await allow(req, "areas.read");
    const districts = scopedDistricts(s);
    return repository.areas(districts);
  });
  app.get("/api/areas/pics", async (req) => {
    const s = await allow(req, "areas.assign");
    const districts = scopedDistricts(s);
    const users = await repository.officers();
    return users
      .filter((u) =>
        u.roles.some(
          (a) =>
            a.roleId === "PIC_KAWASAN" &&
            isCurrent(a) &&
            (!districts || !a.districtId || districts.includes(a.districtId)),
        ),
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        roles: u.roles.filter(
          (a) => a.roleId === "PIC_KAWASAN" && isCurrent(a),
        ),
      }));
  });
  app.post("/api/areas", async (req) => {
    const s = await allow(req, "areas.write");
    const b = z
      .object({
        name: z.string().trim().min(3).max(100),
        districtId: z.enum(["SPU", "SPT", "SPS"]),
      })
      .parse(req.body);
    const districts = scopedDistricts(s);
    if (districts && !districts.includes(b.districtId))
      fail(403, "Di luar skop daerah.");
    const a = await repository.newArea(b);
    await audit(s.userId, s.activeRole, "AREA_CREATED", a.id);
    return a;
  });
  app.post("/api/areas/assign", async (req) => {
    const s = await allow(req, "areas.assign");
    const b = z
      .object({
        areaId: z.uuid(),
        userId: z.uuid(),
        reason: z.string().trim().min(10).max(500),
      })
      .parse(req.body);
    const area = await repository.area(b.areaId);
    const districts = scopedDistricts(s);
    if (districts && !districts.includes(area.districtId))
      fail(403, "Di luar kawasan kuasa.");
    if (!(await repository.activePic(b.userId, area.districtId)))
      fail(400, "PIC tidak mempunyai pelantikan aktif bagi daerah ini.");
    const record = await repository.replaceArea(
      { ...b, assignedBy: s.userId },
      s.activeRole,
    );
    await notify(
      b.userId,
      "AREA_ASSIGNMENT",
      "Pelantikan kawasan",
      `Anda ditugaskan ke ${area.name}. Sebab: ${b.reason}`,
    );
    return record;
  });
  app.get("/api/areas/:id/resolve", async (req) => {
    const s = await allow(req, "areas.read");
    const area = await repository.area(id(req));
    const ds = scopedDistricts(s);
    if (ds && !ds.includes(area.districtId)) fail(403, "Di luar skop.");
    const assignments = await repository.activeAssignments(area.id);
    if (
      assignments.length !== 1 ||
      !(await repository.activePic(assignments[0].userId, area.districtId))
    )
      return { status: "PERLU PENENTUAN PPSK" };
    return { status: "PIC_DIKENAL_PASTI", userId: assignments[0].userId };
  });
  app.get("/api/templates", async (req) => {
    await allow(req, "templates.write");
    return repository.templates();
  });
  app.post("/api/templates", async (req) => {
    const s = await allow(req, "templates.write");
    const b = z
      .object({
        name: z.string().min(3).max(150),
        category: z.string().refine((v) => templateCategories.includes(v)),
        content: z.string().min(5).max(50000),
      })
      .parse(req.body);
    const t = await repository.createTemplate(
      b.name,
      b.category,
      b.content,
      s.userId,
    );
    await audit(s.userId, s.activeRole, "TEMPLATE_CREATED", t.id);
    return t;
  });
  app.post("/api/templates/:id/versions", async (req) => {
    const s = await allow(req, "templates.write");
    const templateId = id(req);
    const { content } = z
      .object({ content: z.string().min(5).max(50000) })
      .parse(req.body);
    const t = await repository.newTemplateVersion(
      templateId,
      content,
      s.userId,
    );
    await audit(s.userId, s.activeRole, "TEMPLATE_VERSION_CREATED", t.id);
    return t;
  });
  app.get("/api/template-versions/:id/preview", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store");
    await allow(req, "templates.write");
    if (!trainingSandbox()) fail(404, "Pratonton latihan tidak tersedia.");
    const versionId = z.uuid().parse(id(req));
    const version = await repository.templatePreview(versionId);
    if (!version) fail(404, "Versi templat tidak ditemui.");
    try {
      const bytes = await unicodeTrainingPdf(
        [
          "STAYLink MBSP — PRATONTON LATIHAN",
          `${version.template.name} · Versi ${version.version}`,
          "",
          version.content,
        ].join("\n"),
        version.createdAt.getTime(),
        "SYNTHETIC-TEMPLATE-PREVIEW-v1",
      );
      return reply
        .header(
          "Content-Disposition",
          `attachment; filename="staylink-templat-latihan-v${version.version}.pdf"`,
        )
        .header("Content-Digest", trainingPdfDigest(bytes))
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "sandbox")
        .type("application/pdf")
        .send(bytes);
    } catch (error) {
      if (error instanceof UnsupportedTrainingGlyph)
        fail(
          422,
          "Aksara belum disokong dalam PDF latihan. Kandungan asal kekal tersedia.",
        );
      throw error;
    }
  });
  app.post("/api/template-versions/:id/activate", async (req) => {
    const s = await allow(req, "templates.write");
    const versionId = id(req);
    await repository.activateTemplate(versionId, s.userId, s.activeRole);
    return { ok: true };
  });
}
