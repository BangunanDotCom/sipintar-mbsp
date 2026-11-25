import type { Notification, AreaAssignment } from "@prisma/client";
import type { DashboardRepository } from "../dashboard-repository.js";
import type { OraclePool } from "./pool.js";
import { oracleTable, queryRows } from "./query.js";

type AreaRow = AreaAssignment & {
  areaName: string;
  districtId: string;
  districtName: string;
};

export function createOracleDashboard(pool: OraclePool): DashboardRepository {
  const notifications = oracleTable(pool, "STL_NOTIFICATIONS");
  const areas = oracleTable(pool, "STL_AREAS");
  const assignments = oracleTable(pool, "STL_AREA_ASSIGNMENTS");
  const districts = oracleTable(pool, "STL_DISTRICTS");
  return {
    notifications: (userId) =>
      pool.use((connection) =>
        queryRows<Notification>(
          connection,
          `SELECT ID AS "id", USER_ID AS "userId", TYPE AS "type", TITLE AS "title", MESSAGE AS "message",
        CREATED_AT AS "createdAt", READ_AT AS "readAt"
        FROM ${notifications} WHERE USER_ID=:userId ORDER BY CREATED_AT DESC, ID DESC FETCH FIRST 50 ROWS ONLY`,
          { userId },
        ),
      ),
    areaAssignments: (userId) =>
      pool.use(async (connection) => {
        const rows = await queryRows<AreaRow>(
          connection,
          `SELECT A.ID AS "id", A.AREA_ID AS "areaId", A.USER_ID AS "userId", A.STARTS_AT AS "startsAt",
           A.ENDS_AT AS "endsAt", A.REASON AS "reason", A.ASSIGNED_BY AS "assignedBy", A.CREATED_AT AS "createdAt",
           R.NAME AS "areaName", D.ID AS "districtId", D.NAME AS "districtName"
          FROM ${assignments} A JOIN ${areas} R ON R.ID=A.AREA_ID JOIN ${districts} D ON D.ID=R.DISTRICT_ID
          WHERE A.USER_ID=:userId AND A.STARTS_AT<=SYSTIMESTAMP AND (A.ENDS_AT IS NULL OR A.ENDS_AT>SYSTIMESTAMP)`,
          { userId },
        );
        return rows.map(({ areaName, districtId, districtName, ...row }) => ({
          ...row,
          area: {
            id: row.areaId,
            name: areaName,
            districtId,
            district: { id: districtId, name: districtName },
          },
        }));
      }),
  };
}
