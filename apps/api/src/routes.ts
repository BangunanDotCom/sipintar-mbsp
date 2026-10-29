import { premisesRoutes } from "./premises.js";
import { applicationDraftRoutes } from "./application-drafts.js";
import argon2 from "argon2";
import { protectIdentification } from "./identity.js";
import { identificationSchema } from "../../../packages/shared/src/index.js";
import {
  companyInvitationRoutes,
  validRepresentative,
} from "./company-invitations.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, audit, notify, safeUser } from "./core.js";
import { authorize, session, fail } from "./auth.js";
import {
  companySchema,
  roles,
  independent,
  isCurrent,
  templateCategories,
} from "../../../packages/shared/src/index.js";
import {
  inviteOfficer,
  assignArea,
  dashboard,
  resolvePic,
} from "./services.js";
import { hash } from "./core.js";
const id = (r: any) => z.object({ id: z.string().uuid() }).parse(r.params).id;
const roleSchema = z.enum(
  Object.keys(roles) as [keyof typeof roles, ...(keyof typeof roles)[]],
);
const scopedDistricts = (s: any) =>
  s.assignments.some((a: any) => !a.districtId)
    ? undefined
    : s.assignments.map((a: any) => a.districtId);
async function ownCompany(req: any, companyId: string) {
  const s = await authorize(req, "companies");
  const representative = await db.companyRepresentative.findUnique({
    where: { userId_companyId: { userId: s.userId, companyId } },
  });
  if (!representative || !validRepresentative(representative))
    fail(404, "Rekod tidak ditemui.");
  return s;
}
export async function routes(app: FastifyInstance) {
  await companyInvitationRoutes(app);
  await applicationDraftRoutes(app);
  await premisesRoutes(app);
  app.post("/api/profile/identification", async (req) => {
    const s = await session(req);
    if (s.user.kind !== "APPLICANT") fail(403, "Akaun pemohon diperlukan.");
    const b = z
      .object({
        identificationNumber: identificationSchema,
        currentPassword: z.string().max(128),
      })
      .parse(req.body);
    if (s.user.identificationHash)
      fail(
        409,
        "Nombor pengenalan telah ditetapkan. Hubungi pentadbir untuk pembetulan.",
      );
    if (
      !s.user.passwordHash ||
      !(await argon2.verify(s.user.passwordHash, b.currentPassword))
    )
      fail(400, "Kata laluan semasa tidak sah.");
    const data = protectIdentification(b.identificationNumber);
    const claimed = await db.user.updateMany({
      where: { id: s.userId, identificationHash: null },
      data,
    });
    if (!claimed.count) fail(409, "Nombor pengenalan telah ditetapkan.");
    await audit(s.userId, s.activeRole, "IDENTIFICATION_ADDED", s.userId);
    return { identificationMasked: data.identificationMasked };
  });
  app.get("/api/public/districts", () =>
    db.district.findMany({ orderBy: { id: "asc" } }),
  );
  app.get("/api/dashboard", async (req) => dashboard(await session(req)));
  app.patch("/api/profile", async (req) => {
    const s = await session(req);
    const b = z
      .object({
        name: z.string().trim().min(3).max(120),
        phone: z.string().regex(/^\+?[0-9 -]{8,20}$/),
      })
      .parse(req.body);
    const u = await db.user.update({ where: { id: s.userId }, data: b });
    await audit(s.userId, s.activeRole, "PROFILE_UPDATED", s.userId);
    return safeUser(u);
  });
  app.post("/api/notifications/:id/read", async (req) => {
    const s = await session(req);
    return db.notification.updateMany({
      where: { id: id(req), userId: s.userId },
      data: { readAt: new Date() },
    });
  });
  app.get("/api/companies", async (req) => {
    const s = await authorize(req, "companies");
    return db.companyRepresentative.findMany({
      where: {
        userId: s.userId,
        status: { not: "REVOKED" },
        startsAt: { lte: new Date() },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
      include: {
        company: {
          include: {
            documents: {
              select: {
                id: true,
                fileName: true,
                status: true,
                validUntil: true,
              },
            },
          },
        },
      },
    });
  });
  app.post("/api/companies", async (req, reply) => {
    const s = await authorize(req, "companies");
    if (!s.user.identificationHash)
      fail(409, "Lengkapkan nombor pengenalan dalam Profil saya dahulu.");
    const b = companySchema.parse(req.body);
    if (b.endsAt && new Date(b.endsAt) <= new Date())
      fail(400, "Tarikh tamat mesti pada masa hadapan.");
    const { authorityType, endsAt, ...data } = b;
    let c;
    try {
      c = await db.company.create({
        data: {
          ...data,
          representatives: {
            create: {
              userId: s.userId,
              authorityType,
              canManageRepresentatives: true,
              endsAt: endsAt ? new Date(endsAt) : null,
            },
          },
        },
      });
    } catch (e: any) {
      if (e.code === "P2002")
        fail(
          409,
          "Nombor SSM telah didaftarkan. Hubungi bantuan untuk pengesahan perwakilan; akses tidak diberikan secara automatik.",
        );
      throw e;
    }
    await audit(s.userId, s.activeRole, "COMPANY_CREATED", c.id);
    reply.code(201);
    return c;
  });
  app.patch("/api/companies/:id", async (req) => {
    const companyId = id(req),
      s = await ownCompany(req, companyId);
    const b = companySchema
      .pick({ name: true, address: true, phone: true, email: true })
      .parse(req.body);
    const result = await db.company.update({
      where: { id: companyId },
      data: { ...b, informationStatus: "UNVERIFIED" },
    });
    await audit(s.userId, s.activeRole, "COMPANY_UPDATED", companyId);
    return result;
  });
  app.post("/api/companies/:id/representatives", async (req) => {
    const companyId = id(req);
    await ownCompany(req, companyId);
    fail(
      409,
      "Gunakan jemputan wakil syarikat; penerima perlu menerima melalui akaun sendiri.",
    );
  });
  app.post("/api/companies/:id/documents", async (req) => {
    const companyId = id(req),
      s = await ownCompany(req, companyId);
    const b = z
      .object({
        fileName: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[^/\\]+\.pdf$/i),
        content: z.string().max(2800000),
        validUntil: z.iso.datetime().optional(),
      })
      .parse(req.body);
    if (b.validUntil && new Date(b.validUntil) <= new Date())
      fail(400, "Tarikh sah dokumen mesti pada masa hadapan.");
    const content = Buffer.from(b.content, "base64");
    if (
      content.length > 2 * 1024 * 1024 ||
      content.length < 5 ||
      content.subarray(0, 5).toString() !== "%PDF-"
    )
      fail(400, "Hanya PDF maksimum 2 MB dibenarkan.");
    const doc = await db.delegationDocument.create({
      data: {
        companyId,
        uploadedBy: s.userId,
        fileName: b.fileName,
        mimeType: "application/pdf",
        content,
        sha256: hash(content.toString("base64")),
        validUntil: b.validUntil ? new Date(b.validUntil) : null,
      },
      select: { id: true, fileName: true, status: true },
    });
    await audit(s.userId, s.activeRole, "DOCUMENT_UPLOADED", doc.id);
    return doc;
  });
  app.get("/api/documents/:id", async (req, reply) => {
    const doc = await db.delegationDocument.findUnique({
      where: { id: id(req) },
    });
    if (!doc) fail(404, "Dokumen tidak ditemui.");
    const s = await ownCompany(req, doc.companyId);
    await audit(s.userId, s.activeRole, "DOCUMENT_READ", doc.id);
    reply
      .header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      )
      .type("application/pdf");
    return Buffer.from(doc.content);
  });
  // Fasa 1: authorized PIC verification is explicit; no counter clerk role receives this permission.
  app.get("/api/representations", async (req) => {
    const s = await authorize(req, "representation.verify");
    const districts = scopedDistricts(s);
    if (districts)
      fail(
        403,
        "Dokumen belum dipautkan kepada lokasi permohonan. Pengesahan memerlukan PIC dengan skop seluruh daerah atau proses Fasa 2.",
      );
    await audit(s.userId, s.activeRole, "REPRESENTATION_LIST_READ");
    return db.companyRepresentative.findMany({
      take: 100,
      include: {
        user: { select: { id: true, name: true } },
        company: {
          select: {
            id: true,
            name: true,
            documents: {
              select: { id: true, fileName: true, uploadedBy: true },
            },
          },
        },
      },
    });
  });
  app.get("/api/representation-documents/:id", async (req, reply) => {
    const s = await authorize(req, "representation.verify");
    if (scopedDistricts(s))
      fail(403, "Skop kawasan belum dapat ditentukan tanpa permohonan.");
    const doc = await db.delegationDocument.findUniqueOrThrow({
      where: { id: id(req) },
    });
    await audit(s.userId, s.activeRole, "REPRESENTATION_DOCUMENT_READ", doc.id);
    reply
      .header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      )
      .type("application/pdf");
    return Buffer.from(doc.content);
  });
  app.post("/api/representations/:id/verify", async (req) => {
    const s = await authorize(req, "representation.verify");
    if (scopedDistricts(s))
      fail(403, "Skop kawasan belum dapat ditentukan tanpa permohonan.");
    const rep = await db.companyRepresentative.findUniqueOrThrow({
      where: { id: id(req) },
    });
    if (!independent(rep.userId, s.userId))
      fail(403, "Pengesah bebas diperlukan.");
    const b = z
      .object({
        status: z.enum(["VERIFIED", "DOCUMENT_UPDATE_REQUIRED"]),
        reason: z.string().min(5).max(500),
      })
      .parse(req.body);
    const docs = await db.delegationDocument.count({
      where: {
        companyId: rep.companyId,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
    });
    if (b.status === "VERIFIED" && !docs)
      fail(400, "Surat kuasa sah diperlukan.");
    await db.$transaction([
      db.companyRepresentative.update({
        where: { id: rep.id },
        data: { status: b.status, verifiedBy: s.userId },
      }),
      db.delegationDocument.updateMany({
        where: {
          companyId: rep.companyId,
          OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
        },
        data: { status: b.status },
      }),
    ]);
    await audit(
      s.userId,
      s.activeRole,
      "REPRESENTATION_VERIFIED",
      rep.id,
      "SUCCESS",
      { reason: b.reason },
    );
    await notify(rep.userId, "COMPANY", "Status perwakilan berubah", b.reason);
    return { ok: true };
  });
  app.get("/api/admin/users", async (req) => {
    const s = await authorize(req, "users.manage");
    await audit(s.userId, s.activeRole, "USERS_READ");
    const users = await db.user.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { roles: true },
    });
    return users.map((u) => ({ ...safeUser(u), roles: u.roles }));
  });
  app.get("/api/admin/roles", async (req) => {
    await authorize(req, "roles.manage");
    return db.role.findMany({ include: { permissions: true } });
  });
  app.get("/api/admin/departments", async (req) => {
    await authorize(req, "roles.manage");
    return db.department.findMany();
  });
  app.post("/api/admin/officers", async (req, reply) => {
    const s = await authorize(req, "users.manage");
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
    if (!(await db.department.findUnique({ where: { id: b.departmentId } })))
      fail(400, "Jabatan tidak sah.");
    reply.code(201);
    return inviteOfficer(s.userId, s.activeRole!, b);
  });
  app.patch("/api/admin/users/:id/status", async (req) => {
    const s = await authorize(req, "users.manage");
    const target = id(req);
    if (target === s.userId)
      fail(400, "Tidak boleh mengubah status akaun sendiri.");
    const b = z
      .object({
        status: z.enum(["ACTIVE", "SUSPENDED"]),
        reason: z.string().min(5).max(500),
      })
      .parse(req.body);
    await db.$transaction([
      db.user.update({ where: { id: target }, data: { status: b.status } }),
      db.session.deleteMany({ where: { userId: target } }),
    ]);
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
    const s = await authorize(req, "users.manage"),
      target = id(req);
    const { reason } = z
      .object({ reason: z.string().min(10).max(500) })
      .parse(req.body);
    if (target === s.userId) fail(403, "Pemulihan memerlukan pentadbir lain.");
    await db.$transaction([
      db.mfaFactor.deleteMany({ where: { userId: target } }),
      db.recoveryCode.deleteMany({ where: { userId: target } }),
      db.session.deleteMany({ where: { userId: target } }),
    ]);
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
    const s = await authorize(req, "roles.manage"),
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
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (
      u.kind !== "OFFICER" ||
      ["PEMOHON", "WAKIL_SYARIKAT"].includes(b.roleId)
    )
      fail(400, "Pelantikan pegawai sahaja.");
    if (b.endsAt && new Date(b.endsAt) <= new Date(b.startsAt))
      fail(400, "Julat tarikh tidak sah.");
    if (!(await db.department.findUnique({ where: { id: b.departmentId } })))
      fail(400, "Jabatan tidak sah.");
    const a = await db.userRoleAssignment.create({
      data: {
        ...b,
        userId,
        startsAt: new Date(b.startsAt),
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
        authorizedBy: s.userId,
      },
    });
    await audit(s.userId, s.activeRole, "ROLE_ASSIGNED", a.id);
    await notify(
      userId,
      "ROLE",
      "Pelantikan peranan",
      `Peranan ${b.roleId} ditambah.`,
    );
    return a;
  });
  app.delete("/api/admin/appointments/:id", async (req) => {
    const s = await authorize(req, "roles.manage");
    const a = await db.userRoleAssignment.findUniqueOrThrow({
      where: { id: id(req) },
    });
    if (a.userId === s.userId)
      fail(403, "Perubahan pelantikan sendiri tidak dibenarkan.");
    await db.$transaction([
      db.userRoleAssignment.update({
        where: { id: a.id },
        data: { status: "REVOKED", endsAt: new Date() },
      }),
      db.session.deleteMany({ where: { userId: a.userId } }),
    ]);
    await audit(s.userId, s.activeRole, "ROLE_REVOKED", a.id);
    await notify(
      a.userId,
      "ROLE",
      "Pelantikan ditamatkan",
      `Peranan ${a.roleId} ditamatkan.`,
    );
    return { ok: true };
  });
  app.get("/api/areas", async (req) => {
    const s = await authorize(req, "areas.read");
    const districts = scopedDistricts(s);
    return db.area.findMany({
      where: districts ? { districtId: { in: districts } } : {},
      include: {
        district: true,
        assignments: { orderBy: { createdAt: "desc" } },
      },
    });
  });
  app.get("/api/areas/pics", async (req) => {
    const s = await authorize(req, "areas.assign");
    const districts = scopedDistricts(s);
    const users = await db.user.findMany({
      where: { kind: "OFFICER", status: "ACTIVE" },
      include: { roles: true },
    });
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
    const s = await authorize(req, "areas.write");
    const b = z
      .object({
        name: z.string().trim().min(3).max(100),
        districtId: z.enum(["SPU", "SPT", "SPS"]),
      })
      .parse(req.body);
    const districts = scopedDistricts(s);
    if (districts && !districts.includes(b.districtId))
      fail(403, "Di luar skop daerah.");
    const a = await db.area.create({ data: b });
    await audit(s.userId, s.activeRole, "AREA_CREATED", a.id);
    return a;
  });
  app.post("/api/areas/assign", async (req) => {
    const s = await authorize(req, "areas.assign");
    return assignArea(
      s,
      z
        .object({
          areaId: z.string().uuid(),
          userId: z.string().uuid(),
          reason: z.string().trim().min(10).max(500),
        })
        .parse(req.body),
    );
  });
  app.get("/api/areas/:id/resolve", async (req) => {
    const s = await authorize(req, "areas.read");
    const area = await db.area.findUniqueOrThrow({ where: { id: id(req) } });
    const ds = scopedDistricts(s);
    if (ds && !ds.includes(area.districtId)) fail(403, "Di luar skop.");
    return resolvePic(area.id);
  });
  app.get("/api/templates", async (req) => {
    await authorize(req, "templates.write");
    return db.templateDefinition.findMany({
      include: { versions: { orderBy: { version: "desc" } } },
      orderBy: { name: "asc" },
    });
  });
  app.post("/api/templates", async (req) => {
    const s = await authorize(req, "templates.write");
    const b = z
      .object({
        name: z.string().min(3).max(150),
        category: z.string().refine((v) => templateCategories.includes(v)),
        content: z.string().min(5).max(50000),
      })
      .parse(req.body);
    const t = await db.templateDefinition.create({
      data: {
        name: b.name,
        category: b.category,
        versions: {
          create: { version: 1, content: b.content, createdBy: s.userId },
        },
      },
    });
    await audit(s.userId, s.activeRole, "TEMPLATE_CREATED", t.id);
    return t;
  });
  app.post("/api/templates/:id/versions", async (req) => {
    const s = await authorize(req, "templates.write");
    const templateId = id(req);
    const { content } = z
      .object({ content: z.string().min(5).max(50000) })
      .parse(req.body);
    const t = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM template_definitions WHERE id = ${templateId} FOR UPDATE`;
      const max = await tx.templateVersion.aggregate({
        where: { templateId },
        _max: { version: true },
      });
      return tx.templateVersion.create({
        data: {
          templateId,
          version: (max._max.version || 0) + 1,
          content,
          createdBy: s.userId,
        },
      });
    });
    await audit(s.userId, s.activeRole, "TEMPLATE_VERSION_CREATED", t.id);
    return t;
  });
  app.post("/api/template-versions/:id/activate", async (req) => {
    const s = await authorize(req, "templates.write");
    const versionId = id(req);
    const v = await db.templateVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM template_definitions WHERE id = ${v.templateId} FOR UPDATE`;
      await tx.templateVersion.updateMany({
        where: { templateId: v.templateId, status: "ACTIVE" },
        data: { status: "ARCHIVED" },
      });
      await tx.templateVersion.update({
        where: { id: v.id },
        data: { status: "ACTIVE", activatedBy: s.userId },
      });
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "TEMPLATE_ACTIVATED",
          target: v.id,
        },
      });
    });
    return { ok: true };
  });
  app.get("/api/config/:scope", async (req) => {
    const scope = z
      .enum(["technical", "operations"])
      .parse((req.params as any).scope);
    await authorize(req, `config.${scope}`);
    return db.systemConfiguration.findMany({
      where: { key: { startsWith: `${scope}.` } },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
  });
  app.post("/api/config/:scope", async (req) => {
    const scope = z
      .enum(["technical", "operations"])
      .parse((req.params as any).scope);
    const s = await authorize(req, `config.${scope}`);
    const b = z
      .object({
        key: z.string().regex(/^[a-z][a-z0-9_.]{2,60}$/),
        value: z.union([z.string().max(1000), z.number(), z.boolean()]),
        reason: z.string().min(5).max(500),
      })
      .parse(req.body);
    const key = `${scope}.${b.key}`;
    await db.$transaction(async (tx) => {
      await tx.systemConfiguration.upsert({
        where: { key },
        create: { key, value: b.value },
        update: { value: b.value },
      });
      await tx.configurationVersion.create({
        data: { key, value: b.value, changedBy: s.userId, reason: b.reason },
      });
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "CONFIG_CHANGED",
          target: key,
        },
      });
    });
    return { ok: true };
  });
  app.get("/api/audit", async (req) => {
    const s = await session(req);
    if (s.activeRole === "PENTADBIR_ICT") {
      await authorize(req, "audit.all");
      await audit(s.userId, s.activeRole, "AUDIT_READ");
      return db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }
    await authorize(req, "audit.operations");
    const areas = await db.area.findMany();
    const assignments = await db.areaAssignment.findMany({
      where: { assignedBy: s.userId },
    });
    return db.auditLog.findMany({
      where: {
        OR: [
          { actorId: s.userId },
          {
            action: "AREA_REASSIGNED",
            target: {
              in: assignments
                .map((a) => a.areaId)
                .filter((v) => areas.some((a) => a.id === v)),
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
  app.get("/api/admin/services", async (req) => {
    await authorize(req, "services.read");
    await db.$queryRaw`SELECT 1`;
    return {
      database: "CONNECTED",
      email: await db.emailDeliveryLog.groupBy({
        by: ["status"],
        _count: true,
      }),
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
