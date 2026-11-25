import { db } from "./core.js";

export const postgresDashboard = {
  async notifications(userId: string) {
    return db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },
  async areaAssignments(userId: string) {
    const now = new Date();
    return db.areaAssignment.findMany({
      where: {
        userId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      include: { area: { include: { district: true } } },
    });
  },
};
export type DashboardRepository = typeof postgresDashboard;
