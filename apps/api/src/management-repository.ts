import { db } from "./core.js";

type ConfigChange = {
  key: string;
  value: string | number | boolean;
  reason: string;
  userId: string;
  activeRole: string | null;
};

export const postgresManagement = {
  async markNotificationRead(id: string, userId: string) {
    return db.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  },
  async configurations(scope: string) {
    return db.systemConfiguration.findMany({
      where: { key: { startsWith: `${scope}.` } },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
  },
  async changeConfiguration({
    key,
    value,
    reason,
    userId,
    activeRole,
  }: ConfigChange) {
    await db.$transaction(async (tx) => {
      await tx.systemConfiguration.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
      await tx.configurationVersion.create({
        data: { key, value, changedBy: userId, reason },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          activeRole,
          action: "CONFIG_CHANGED",
          target: key,
        },
      });
    });
  },
  async auditHistory(userId?: string) {
    if (!userId)
      return db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    const areas = await db.area.findMany();
    const assignments = await db.areaAssignment.findMany({
      where: { assignedBy: userId },
    });
    return db.auditLog.findMany({
      where: {
        OR: [
          { actorId: userId },
          {
            action: "AREA_REASSIGNED",
            target: {
              in: assignments
                .map((assignment) => assignment.areaId)
                .filter((areaId) => areas.some((area) => area.id === areaId)),
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },
  async emailStatus() {
    await db.$queryRaw`SELECT 1`;
    return db.emailDeliveryLog.groupBy({ by: ["status"], _count: true });
  },
};

export type ManagementRepository = typeof postgresManagement;
export type Configuration = Awaited<
  ReturnType<ManagementRepository["configurations"]>
>[number];
