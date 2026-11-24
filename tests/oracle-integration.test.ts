import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import oracledb, { type Connection } from "oracledb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { oracleConfig } from "../apps/api/src/oracle/config";
import { createOraclePool, type OraclePool } from "../apps/api/src/oracle/pool";
import { createOracleAuditRepository } from "../apps/api/src/oracle/audit";
import { createOracleSessionReader } from "../apps/api/src/oracle/session-read";
import { oracleBinary, oracleJson } from "../apps/api/src/oracle/codecs";
import { migrateOracle } from "../scripts/oracle/migrations";
import {
  labActorId,
  labSessionHash,
  prepareOracleLab,
} from "../scripts/oracle/lab";

const ownerFile = process.env.ORACLE_LAB_OWNER_ENV;
const runtimeFile = process.env.ORACLE_LAB_RUNTIME_ENV;
const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
describe.skipIf(!ownerFile || !runtimeFile)(
  "Oracle isolated synthetic integration",
  () => {
    let owner: OraclePool;
    let runtime: OraclePool;

    beforeAll(async () => {
      const ownerEnv = parse(await readFile(ownerFile!));
      owner = await createOraclePool(oracleConfig(ownerEnv, "install"));
      runtime = await createOraclePool(
        oracleConfig(parse(await readFile(runtimeFile!)), "runtime"),
      );
      await owner.use((connection) => migrateOracle(connection, true));
      await prepareOracleLab(ownerEnv);
    });

    afterAll(async () => {
      await Promise.all([owner?.close(), runtime?.close()]);
    });

    it("detects a completed schema and verifies that applying it again is a no-op", async () => {
      expect(
        await owner.use((connection) => migrateOracle(connection, false)),
      ).toBe("APPLIED");
      expect(
        await owner.use((connection) => migrateOracle(connection, true)),
      ).toBe("APPLIED");
    });

    it("reads the hashed session, explicit role permission and district without mutation", async () => {
      const repository = createOracleSessionReader(runtime);
      expect(await repository.findActiveSession(labSessionHash)).toMatchObject({
        userId: labActorId,
        activeRole: "PIC_KAWASAN",
        emailVerified: true,
        mfaVerified: true,
        assignments: expect.arrayContaining([
          { role: "PIC_KAWASAN", district: "SPU", permission: "areas.read" },
        ]),
      });
      expect(await repository.findActiveSession("e".repeat(64))).toBeNull();
      expect(await repository.findActiveSession("bukan-hash")).toBeNull();
    });

    it("binds and commits large JSON CLOB audit, rolls back a second audit, and rejects runtime DELETE", async () => {
      const audit = createOracleAuditRepository(runtime);
      const target = randomUUID();
      const action = "STL_LAB_'_TEST";
      const recorded = await audit.record({
        action,
        target,
        metadata: { kind: "fixture", content: "é界".repeat(3500) },
      });
      await expect(
        runtime.transaction(async (connection) => {
          await audit.append(connection, { action, target });
          throw Error("rollback fixture");
        }),
      ).rejects.toThrow("rollback fixture");
      await owner.use(async (connection) => {
        const rows = await connection.execute<{
          ID: string;
          ACTION: string;
          KIND: string;
        }>(
          "SELECT ID,ACTION,JSON_VALUE(METADATA,'$.kind') AS KIND FROM STL_AUDIT_LOGS WHERE TARGET=:target",
          { target },
          options,
        );
        expect(rows.rows).toEqual([
          { ID: recorded, ACTION: action, KIND: "fixture" },
        ]);
      });
      await expect(
        runtime.use((connection) =>
          connection.execute(
            `DELETE FROM ${runtime.owner}.STL_AUDIT_LOGS WHERE ID=:id`,
            { id: recorded },
          ),
        ),
      ).rejects.toMatchObject({
        code: expect.stringMatching(/^ORA-(?:01031|41900)$/),
      });
    });

    it("allows historical district assignments and enforces one ongoing assignment", async () => {
      await owner.use(async (connection) => {
        try {
          const id = randomUUID();
          await connection.execute(
            "INSERT INTO STL_AREAS (ID,NAME,DISTRICT_ID) VALUES (:id,:name,'SPU')",
            { id, name: `Latihan ${id}` },
          );
          const assign = (historic: boolean) =>
            connection.execute(
              `INSERT INTO STL_AREA_ASSIGNMENTS
            (ID,AREA_ID,USER_ID,ENDS_AT,REASON,ASSIGNED_BY) VALUES
            (:assignmentId,:area,:actor,CASE WHEN :historic=1 THEN SYSTIMESTAMP ELSE NULL END,:reason,:actor)`,
              {
                assignmentId: randomUUID(),
                area: id,
                actor: labActorId,
                historic: historic ? 1 : 0,
                reason: "Latihan STL",
              },
            );
          await assign(true);
          await assign(true);
          await assign(false);
          await expect(assign(false)).rejects.toMatchObject({
            code: "ORA-00001",
          });
        } finally {
          await connection.rollback();
        }
      });
    });

    it("preserves the nullable correction key, composite FK, immutable trigger, and LOB codecs", async () => {
      await owner.use(async (connection) => {
        try {
          const draftId = randomUUID();
          const otherId = randomUUID();
          for (const draft of [draftId, otherId])
            await connection.execute(
              `INSERT INTO STL_APPLICATION_DRAFTS
            (ID, INITIATED_BY_USER_ID, CAPACITY, OFFICIAL_APPLICANT_USER_ID,
             INITIATOR_SNAPSHOT, APPLICANT_SNAPSHOT, UPDATED_AT)
             VALUES (:draft,:actor,'INDIVIDUAL',:actor,:payload,:payload,SYSTIMESTAMP)`,
              {
                draft,
                actor: labActorId,
                payload: oracleJson({ synthetic: true }),
              },
            );
          await expect(
            connection.execute(
              "UPDATE STL_APPLICATION_DRAFTS SET NOTES=:notes WHERE ID=:id",
              {
                notes: { val: "x".repeat(2001), type: oracledb.CLOB },
                id: draftId,
              },
            ),
          ).rejects.toMatchObject({ code: "ORA-20063" });
          const insert = (
            db: Connection,
            id: string,
            draft: string,
            version: number,
            previous: string | null,
            key = randomUUID(),
          ) =>
            db.execute(
              `INSERT INTO STL_SYNTHETIC_SUBMISSIONS
            (ID,DRAFT_ID,DRAFT_VERSION,KEY,ACTOR_ID,DECLARATION_VERSION,POLICY_VERSION,PREVIOUS_ID,SNAPSHOT)
            VALUES (:id,:draft,:version,:key,:actor,'SYNTHETIC-1','SYNTHETIC-1',:previous,:snapshot)`,
              {
                id,
                draft,
                version,
                key,
                actor: labActorId,
                previous,
                snapshot: oracleJson({ synthetic: true }),
              },
            );
          const original = randomUUID();
          const replayKey = randomUUID();
          await insert(connection, original, draftId, 1, null, replayKey);
          await expect(
            insert(connection, randomUUID(), draftId, 9, null, replayKey),
          ).rejects.toMatchObject({ code: "ORA-00001" });
          await insert(connection, randomUUID(), draftId, 2, null);
          await expect(
            insert(connection, randomUUID(), otherId, 2, original),
          ).rejects.toMatchObject({ code: "ORA-02291" });
          await insert(connection, randomUUID(), draftId, 3, original);
          await expect(
            insert(connection, randomUUID(), draftId, 4, original),
          ).rejects.toMatchObject({ code: "ORA-00001" });
          await expect(
            connection.execute(
              "UPDATE STL_SYNTHETIC_SUBMISSIONS SET SNAPSHOT=:snapshot WHERE ID=:id",
              { snapshot: oracleJson({ changed: true }), id: original },
            ),
          ).rejects.toMatchObject({ code: "ORA-20062" });
          const { rows } = await connection.execute<{ N: number }>(
            "SELECT DBMS_LOB.GETLENGTH(:content) AS N FROM DUAL",
            { content: oracleBinary(Uint8Array.from([0, 1, 255])) },
            options,
          );
          expect(rows?.[0]?.N).toBe(3);
        } finally {
          await connection.rollback();
        }
      });
    });
  },
);
