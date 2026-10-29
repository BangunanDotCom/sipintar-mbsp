import { db, audit, notify, issueIdentity, origin, safeUser } from "./core.js";
import { fail } from "./auth.js";
import { isCurrent } from "../../../packages/shared/src/index.js";
export async function inviteOfficer(actor: string, role: string, b: any) {
  const u = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: b.name, email: b.email, phone: b.phone, kind: "OFFICER" },
    });
    await tx.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId: b.roleId,
        departmentId: b.departmentId,
        districtId: b.districtId,
        reference: b.reference,
        authorizedBy: actor,
        startsAt: new Date(b.startsAt || Date.now()),
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor,
        activeRole: role,
        action: "OFFICER_INVITE",
        target: user.id,
      },
    });
    return user;
  });
  const t = await issueIdentity(u.id, "OFFICER_INVITE");
  await notify(
    u.id,
    "INVITATION",
    "Jemputan pegawai STAYLink",
    "Sila aktifkan akaun dan daftar MFA.",
    `${origin}/aktifkan?type=OFFICER_INVITE&token=${t}`,
  );
  return safeUser(u);
}
export async function assignArea(s: any, b: any) {
  const area = await db.area.findUniqueOrThrow({ where: { id: b.areaId } });
  const scopes = s.assignments.map((a: any) => a.districtId);
  if (scopes.every((d: any) => d && d !== area.districtId))
    fail(403, "Di luar kawasan kuasa.");
  const pic = await db.user.findUnique({
    where: { id: b.userId },
    include: { roles: true },
  });
  if (
    !pic ||
    pic.status !== "ACTIVE" ||
    !pic.roles.some(
      (a) =>
        a.roleId === "PIC_KAWASAN" &&
        isCurrent(a) &&
        (!a.districtId || a.districtId === area.districtId),
    )
  )
    fail(400, "PIC tidak mempunyai pelantikan aktif bagi daerah ini.");
  // Lock the area row to serialize concurrent replacements.
  const record = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM areas WHERE id = ${area.id} FOR UPDATE`;
    await tx.areaAssignment.updateMany({
      where: { areaId: area.id, endsAt: null },
      data: { endsAt: new Date() },
    });
    const a = await tx.areaAssignment.create({
      data: {
        areaId: area.id,
        userId: b.userId,
        reason: b.reason,
        assignedBy: s.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: s.userId,
        activeRole: s.activeRole,
        action: "AREA_REASSIGNED",
        target: area.id,
        metadata: { userId: b.userId, reason: b.reason },
      },
    });
    return a;
  });
  await notify(
    b.userId,
    "AREA_ASSIGNMENT",
    "Pelantikan kawasan",
    `Anda ditugaskan ke ${area.name}. Sebab: ${b.reason}`,
  );
  return record;
}
export async function dashboard(s: any) {
  const role = s.activeRole;
  const current = s.user.roles.filter(
    (a: any) => a.roleId === role && isCurrent(a),
  );
  if (!current.length) fail(403, "Pilih peranan aktif.");
  const companies =
    role === "PEMOHON" || role === "WAKIL_SYARIKAT"
      ? await db.companyRepresentative.findMany({
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
        })
      : [];
  const notifications = await db.notification.findMany({
    where: { userId: s.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const areaAssignments =
    role === "PIC_KAWASAN"
      ? await db.areaAssignment
          .findMany({
            where: {
              userId: s.userId,
              startsAt: { lte: new Date() },
              OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            },
            include: { area: { include: { district: true } } },
          })
          .then((rows) =>
            rows.filter((a) =>
              current.some(
                (r: any) => !r.districtId || r.districtId === a.area.districtId,
              ),
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
}
export async function resolvePic(areaId?: string) {
  if (!areaId) return { status: "PERLU PENENTUAN PPSK" };
  const assignments = await db.areaAssignment.findMany({
    where: {
      areaId,
      startsAt: { lte: new Date() },
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
  });
  if (assignments.length !== 1) return { status: "PERLU PENENTUAN PPSK" };
  const pic = await db.user.findUnique({
    where: { id: assignments[0].userId },
    include: { roles: true },
  });
  const area = await db.area.findUnique({ where: { id: areaId } });
  if (
    !pic ||
    pic.status !== "ACTIVE" ||
    !pic.roles.some(
      (a) =>
        a.roleId === "PIC_KAWASAN" &&
        isCurrent(a) &&
        (!a.districtId || a.districtId === area?.districtId),
    )
  )
    return { status: "PERLU PENENTUAN PPSK" };
  return { status: "PIC_DIKENAL_PASTI", userId: pic.id };
}
export { audit };
