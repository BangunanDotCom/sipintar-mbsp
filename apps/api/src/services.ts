import { withStaffAuthority } from "./staff-mutation-authority.js";
import {
  db,
  audit,
  dispatchMail,
  queueNotification,
  issueIdentity,
  origin,
  safeUser,
} from "./core.js";
import {
  companyDelegationViews,
  principalAtUse,
} from "./delegation-evidence.js";
import { fail, type session } from "./auth.js";
import { isCurrent } from "../../../packages/shared/src/index.js";
type StaffSession = Awaited<ReturnType<typeof session>>;

export async function inviteOfficer(
  s: StaffSession,
  b: {
    name: string;
    email: string;
    phone: string;
    roleId: string;
    departmentId: string;
    districtId?: string;
    reference: string;
    startsAt?: string;
    endsAt?: string;
  },
) {
  const { user, mail } = await db.$transaction((tx) =>
    withStaffAuthority(tx, s, "users.manage", async () => {
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
          authorizedBy: s.userId,
          startsAt: new Date(b.startsAt ?? Date.now()),
          endsAt: b.endsAt ? new Date(b.endsAt) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "OFFICER_INVITE",
          target: user.id,
        },
      });
      const identity = await issueIdentity(user.id, "OFFICER_INVITE", tx);
      const mail = await queueNotification(
        tx,
        user.id,
        "INVITATION",
        "Jemputan pegawai STAYLink",
        "Sila aktifkan akaun dan daftar MFA.",
        `${origin}/aktifkan?type=OFFICER_INVITE&token=${identity}`,
      );
      return { user, mail };
    }),
  );
  await dispatchMail(mail.id);
  return safeUser(user);
}

export async function assignArea(
  s: StaffSession,
  b: { areaId: string; userId: string; reason: string },
) {
  const area = await db.area.findUniqueOrThrow({ where: { id: b.areaId } });
  const { assignment, mail } = await db.$transaction((tx) =>
    withStaffAuthority(
      tx,
      s,
      "areas.assign",
      async () => {
        await tx.$queryRaw`SELECT id FROM areas WHERE id=${area.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM user_role_assignments
        WHERE "userId"=${b.userId} AND "roleId"='PIC_KAWASAN' ORDER BY id FOR SHARE`;
        const requirePic = async () => {
          const [result] = await tx.$queryRaw<{ eligible: boolean }[]>`
          WITH now AS MATERIALIZED (SELECT clock_timestamp() AT TIME ZONE 'UTC' AS instant)
          SELECT EXISTS (SELECT 1 FROM users u JOIN user_role_assignments r ON r."userId"=u.id
            JOIN areas a ON a.id=${area.id} AND a."districtId"=${area.districtId}
            CROSS JOIN now
            WHERE u.id=${b.userId} AND u.kind='OFFICER' AND u.status='ACTIVE'
              AND r."roleId"='PIC_KAWASAN' AND r.status='ACTIVE' AND r."startsAt"<=now.instant
              AND (r."endsAt" IS NULL OR r."endsAt">now.instant)
              AND (r."districtId" IS NULL OR r."districtId"=a."districtId")) AS eligible`;
          if (!result?.eligible)
            fail(400, "PIC tidak mempunyai pelantikan aktif bagi daerah ini.");
        };
        await requirePic();
        await tx.areaAssignment.updateMany({
          where: { areaId: area.id, endsAt: null },
          data: { endsAt: new Date() },
        });
        const assignment = await tx.areaAssignment.create({
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
        const mail = await queueNotification(
          tx,
          b.userId,
          "AREA_ASSIGNMENT",
          "Pelantikan kawasan",
          `Anda ditugaskan ke ${area.name}. Sebab: ${b.reason}`,
        );
        await requirePic();
        return { assignment, mail };
      },
      {
        targets: [b.userId],
        scope: { district: area.districtId, allowGlobal: true },
      },
    ),
  );
  await dispatchMail(mail.id);
  return assignment;
}

export async function dashboard(s: Awaited<ReturnType<typeof session>>) {
  const role = s.activeRole;
  const current = s.user.roles.filter(
    (a: any) => a.roleId === role && isCurrent(a),
  );
  if (!current.length) fail(403, "Pilih peranan aktif.");
  const companies =
    role === "PEMOHON" || role === "WAKIL_SYARIKAT"
      ? await db.$transaction(
          async (tx) => {
            await principalAtUse(tx, s, "COMPANY");
            return companyDelegationViews(tx, s.userId, false);
          },
          { isolationLevel: "RepeatableRead" },
        )
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
