import type { Connection } from "oracledb";
import { queryRows } from "../../apps/api/src/oracle/query.js";

export async function oracleGeneratedLobIndexes(connection: Connection) {
  return queryRows<{
    TABLE_NAME: string;
    COLUMN_NAME: string;
    SEGMENT_NAME: string;
    INDEX_NAME: string;
  }>(
    connection,
    `SELECT L.TABLE_NAME, L.COLUMN_NAME, L.SEGMENT_NAME, L.INDEX_NAME
       FROM USER_LOBS L JOIN USER_INDEXES I
         ON I.INDEX_NAME=L.INDEX_NAME AND I.TABLE_NAME=L.TABLE_NAME
      WHERE SUBSTR(L.TABLE_NAME,1,4)='STL_' AND SUBSTR(L.SEGMENT_NAME,1,4)='STL_'
        AND SUBSTR(L.INDEX_NAME,1,6)='SYS_IL' AND I.INDEX_TYPE='LOB' AND I.GENERATED='Y'
      ORDER BY L.TABLE_NAME,L.COLUMN_NAME`,
    {},
  );
}
