import type { User, UserRoleAssignment } from "@prisma/client";
import { db } from "./core.js";
import { fail } from "./auth.js";
import type { AuditEntry } from "./oracle/audit.js";

export const publicAccountFields = {
  id: true,
  name: true,
  email: true,
  phone: true,
  kind: true,
  status: true,
  emailVerified: true,
  identificationMasked: true,
} as const;
export type PublicAccount = Pick<User, keyof typeof publicAccountFields>;
export type Appointment = Pick<
  UserRoleAssignment,
  | "roleId"
  | "departmentId"
  | "districtId"
  | "startsAt"
  | "endsAt"
  | "reference"
  | "authorizedBy"
>;

export const postgresAdmin = {
  async users() {
    return db.user.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      select: { ...publicAccountFields, roles: true },
    });
  },
  async roles() {
    return db.role.findMany({ include: { permissions: true } });
  },
  async departments() {
    return db.department.findMany();
  },
  async departmentExists(id: string) {
    return !!(await db.department.findUnique({ where: { id } }));
  },
  async createOfficer(
    data: Pick<User, "name" | "email" | "phone">,
    appointment: Appointment,
    entry: AuditEntry,
  ) {
    return db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { ...data, kind: "OFFICER" },
        select: publicAccountFields,
      });
      await tx.userRoleAssignment.create({
        data: { ...appointment, userId: user.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: entry.actorId,
          activeRole: entry.activeRole,
          action: entry.action,
          target: user.id,
        },
      });
      return user;
    });
  },
  async status(id: string, status: string) {
    await db.$transaction([
      db.user.update({ where: { id }, data: { status } }),
      db.session.deleteMany({ where: { userId: id } }),
    ]);
  },
  async resetMfa(userId: string) {
    await db.$transaction([
      db.mfaFactor.deleteMany({ where: { userId } }),
      db.recoveryCode.deleteMany({ where: { userId } }),
      db.session.deleteMany({ where: { userId } }),
    ]);
  },
  async officer(id: string) {
    return db.user.findUniqueOrThrow({ where: { id }, select: { kind: true } });
  },
  async assignRole(userId: string, data: Appointment) {
    return db.userRoleAssignment.create({ data: { ...data, userId } });
  },
  async appointment(id: string) {
    return db.userRoleAssignment.findUniqueOrThrow({ where: { id } });
  },
  async revoke(id: string, userId: string) {
    await db.$transaction([
      db.userRoleAssignment.update({
        where: { id },
        data: { status: "REVOKED", endsAt: new Date() },
      }),
      db.session.deleteMany({ where: { userId } }),
    ]);
  },
  async areas(districts?: string[]) {
    return db.area.findMany({
      where: districts ? { districtId: { in: districts } } : {},
      include: {
        district: true,
        assignments: { orderBy: { createdAt: "desc" } },
      },
    });
  },
  async officers() {
    return db.user.findMany({
      where: { kind: "OFFICER", status: "ACTIVE" },
      select: { id: true, name: true, roles: true },
    });
  },
  async newArea(data: { name: string; districtId: string }) {
    return db.area.create({ data });
  },
  async area(id: string) {
    return db.area.findUniqueOrThrow({ where: { id } });
  },
  async activeAssignments(areaId: string) {
    const now = new Date();
    return db.areaAssignment.findMany({
      where: {
        areaId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    });
  },
  async activePic(userId: string, districtId: string) {
    const now = new Date();
    return !!(await db.user.findFirst({
      where: {
        id: userId,
        status: "ACTIVE",
        roles: {
          some: {
            roleId: "PIC_KAWASAN",
            status: "ACTIVE",
            startsAt: { lte: now },
            AND: [
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
              { OR: [{ districtId: null }, { districtId }] },
            ],
          },
        },
      },
      select: { id: true },
    }));
  },
  async replaceArea(
    data: {
      areaId: string;
      userId: string;
      reason: string;
      assignedBy: string;
    },
    activeRole: string | null,
  ) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM areas WHERE id = ${data.areaId} FOR UPDATE`;
      await tx.areaAssignment.updateMany({
        where: { areaId: data.areaId, endsAt: null },
        data: { endsAt: new Date() },
      });
      const row = await tx.areaAssignment.create({ data });
      await tx.auditLog.create({
        data: {
          actorId: data.assignedBy,
          activeRole,
          action: "AREA_REASSIGNED",
          target: data.areaId,
          metadata: { userId: data.userId, reason: data.reason },
        },
      });
      return row;
    });
  },
  async templates() {
    return db.templateDefinition.findMany({
      include: { versions: { orderBy: { version: "desc" } } },
      orderBy: { name: "asc" },
    });
  },
  async createTemplate(
    name: string,
    category: string,
    content: string,
    createdBy: string,
  ) {
    return db.templateDefinition.create({
      data: {
        name,
        category,
        versions: {
          create: { version: 1, content, createdBy },
        },
      },
    });
  },
  async newTemplateVersion(
    templateId: string,
    content: string,
    createdBy: string,
  ) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM template_definitions WHERE id = ${templateId} FOR UPDATE`;
      const max = await tx.templateVersion.aggregate({
        where: { templateId },
        _max: { version: true },
      });
      return tx.templateVersion.create({
        data: {
          templateId,
          version: (max._max.version ?? 0) + 1,
          content,
          createdBy,
        },
      });
    });
  },
  async activateTemplate(
    id: string,
    actorId: string,
    activeRole: string | null,
  ) {
    const row = await db.templateVersion.findUniqueOrThrow({ where: { id } });
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM template_definitions WHERE id = ${row.templateId} FOR UPDATE`;
      await tx.templateVersion.updateMany({
        where: { templateId: row.templateId, status: "ACTIVE" },
        data: { status: "ARCHIVED" },
      });
      if (
        !(
          await tx.templateVersion.updateMany({
            where: { id },
            data: { status: "ACTIVE", activatedBy: actorId },
          })
        ).count
      )
        fail(404, "Rekod tidak ditemui.");
      await tx.auditLog.create({
        data: { actorId, activeRole, action: "TEMPLATE_ACTIVATED", target: id },
      });
    });
  },
};
export type AdminRepository = typeof postgresAdmin;
