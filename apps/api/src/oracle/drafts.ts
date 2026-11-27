import { draftInactivity } from "../../../../packages/shared/src/draft-inactivity.js";
import { requireOracleUnclosedDraft } from "./completion-gate.js";
import { randomUUID } from "node:crypto";
import {
  Prisma,
  type ApplicationDraft,
  type ApplicationPremises,
  type Company,
  type CompanyRepresentative,
  type PremiseFloor,
} from "@prisma/client";
import oracledb, { type BindParameters, type Connection } from "oracledb";
import { fail } from "../auth.js";
import {
  type DraftRepository,
  type DraftTransaction,
} from "../draft-repository.js";
import { createOracleAuditRepository } from "./audit.js";
import { fromOracleBoolean, oracleJson } from "./codecs.js";
import type { OraclePool } from "./pool.js";
import {
  affected,
  oracleInList,
  oracleTable,
  queryRows,
  requireRecord,
} from "./query.js";

const upperSnake = (key: string) =>
  key.replace(/[A-Z]/g, (letter) => "_" + letter).toUpperCase();
const columns = (names: readonly string[], prefix = "") =>
  names.map((name) => `${prefix}${upperSnake(name)} AS "${name}"`).join(", ");

const draftSummary = [
  "id",
  "capacity",
  "applicantSnapshot",
  "status",
  "version",
  "createdAt",
  "updatedAt",
] as const;
const draftFields = [
  ...draftSummary,
  "initiatedByUserId",
  "companyId",
  "officialApplicantUserId",
  "initiatorSnapshot",
  "representativeSnapshot",
  "notes",
];
const premiseFields = [
  "id",
  "draftId",
  "address",
  "postcode",
  "lotNumber",
  "locality",
  "districtId",
  "latitude",
  "longitude",
  "locationSource",
  "boundaryStatus",
  "buildingType",
  "currentUse",
  "involvedFloors",
  "accommodationUnits",
  "totalRooms",
  "floorAreaSqm",
  "proposedWorkers",
  "certificateType",
  "certificateNumber",
  "createdAt",
  "updatedAt",
];
const floorFields = [
  "id",
  "draftId",
  "position",
  "floorLabel",
  "rooms",
  "beds",
  "workers",
  "areaSqm",
  "facilities",
  "createdAt",
  "updatedAt",
];
const representativeFields = [
  "id",
  "userId",
  "companyId",
  "authorityType",
  "status",
  "startsAt",
  "endsAt",
  "verifiedBy",
  "verifiedDocumentId",
  "verificationRevision",
  "canManageRepresentatives",
];
const companyFields = [
  "name",
  "registrationNumber",
  "address",
  "phone",
  "email",
  "informationStatus",
  "status",
  "createdAt",
] as const;
const documentFields = [
  "id",
  "category",
  "version",
  "fileName",
  "mimeType",
  "byteSize",
  "scanStatus",
  "verificationStatus",
  "uploadedAt",
  "supersededAt",
];

type DraftRow = Omit<
  ApplicationDraft,
  "notes" | "applicantSnapshot" | "initiatorSnapshot" | "representativeSnapshot"
> & {
  notes: string | null;
  applicantSnapshot: string;
  initiatorSnapshot: string;
  representativeSnapshot: string | null;
};
type DraftSummaryRow = Pick<DraftRow, (typeof draftSummary)[number]>;
type PremisesRow = Omit<
  ApplicationPremises,
  "certificateDate" | "floorAreaSqm"
> & {
  certificateDate: string | null;
  floorAreaSqm: number | null;
};
type FloorRow = Omit<PremiseFloor, "areaSqm" | "facilities"> & {
  areaSqm: number;
  facilities: string;
};
type CompanyRow = Omit<CompanyRepresentative, "canManageRepresentatives"> & {
  canManageRepresentatives: number;
} & {
  [Key in (typeof companyFields)[number] as `company_${Key}`]: Company[Key];
};
type Document = Awaited<ReturnType<DraftTransaction["documents"]>>[number];
type DocumentRow = Omit<Document, "scope"> & {
  documentId: string | null;
  unitId: string | null;
  floorId: string | null;
};
type Values = Record<string, unknown>;
const jsonFields = new Set([
  "applicantSnapshot",
  "representativeSnapshot",
  "initiatorSnapshot",
  "facilities",
]);
const selectCompany = representativeFields
  .map((name) => `R.${upperSnake(name)} AS "${name}"`)
  .concat(
    companyFields.map((name) => `C.${upperSnake(name)} AS "company_${name}"`),
  )
  .join(", ");

function decodeCompany(row: CompanyRow) {
  const {
    company_name,
    company_registrationNumber,
    company_address,
    company_phone,
    company_email,
    company_informationStatus,
    company_status,
    company_createdAt,
    canManageRepresentatives,
    ...representative
  } = row;
  return {
    ...representative,
    canManageRepresentatives: fromOracleBoolean(canManageRepresentatives),
    company: {
      id: row.companyId,
      name: company_name,
      registrationNumber: company_registrationNumber,
      address: company_address,
      phone: company_phone,
      email: company_email,
      informationStatus: company_informationStatus,
      status: company_status,
      createdAt: company_createdAt,
    },
  };
}

function bindValues(values: Values) {
  const binds: Exclude<BindParameters, unknown[]> = {};
  const entries = Object.entries(values).map(([key, value]) => {
    const name = `val_${key}`;
    const column = upperSnake(key);
    if (!/^[A-Z_]+$/.test(column))
      throw Error("Pemetaan kolum draf Oracle tidak sah.");
    if (key === "notes" && value === "")
      return { column, expression: "EMPTY_CLOB()" };
    let expression = `:${name}`;
    if (jsonFields.has(key))
      binds[name] =
        value === null ? { val: null, type: oracledb.CLOB } : oracleJson(value);
    else if (key === "notes")
      binds[name] = { val: value as string, type: oracledb.CLOB };
    else if (key === "certificateDate") {
      binds[name] = {
        val: value instanceof Date ? value.toISOString().slice(0, 10) : null,
        type: oracledb.STRING,
      };
      expression = `TO_DATE(${expression},'YYYY-MM-DD')`;
    } else if (key === "latitude" || key === "longitude")
      binds[name] = {
        val: value as number | null,
        type: oracledb.DB_TYPE_BINARY_DOUBLE,
      };
    else if (Prisma.Decimal.isDecimal(value))
      binds[name] = (value as Prisma.Decimal).toNumber();
    else if (
      typeof value === "string" ||
      typeof value === "number" ||
      value === null
    )
      binds[name] = value;
    else throw Error("Nilai kolum draf Oracle tidak sah.");
    return { column, expression };
  });
  return { entries, binds };
}

async function insert(
  connection: Connection,
  table: string,
  data: Values,
  timestamps = "",
) {
  const { entries, binds } = bindValues(data);
  await connection.execute(
    `INSERT INTO ${table} (${entries.map(({ column }) => column).join(",")}${timestamps})
    VALUES (${entries.map(({ expression }) => expression).join(",")}${timestamps ? ",SYSTIMESTAMP" : ""})`,
    binds,
  );
}

function draftDto(row: DraftRow): ApplicationDraft {
  return {
    ...row,
    notes: row.notes ?? "",
    applicantSnapshot: JSON.parse(row.applicantSnapshot),
    initiatorSnapshot: JSON.parse(row.initiatorSnapshot),
    representativeSnapshot:
      row.representativeSnapshot === null
        ? null
        : JSON.parse(row.representativeSnapshot),
  };
}

export function createOracleDraftRepository(
  pool: OraclePool,
): DraftRepository & {
  onConnection(
    connection: Connection,
    consistentRead?: boolean,
  ): DraftTransaction;
} {
  const drafts = oracleTable(pool, "STL_APPLICATION_DRAFTS");
  const companies = oracleTable(pool, "STL_COMPANIES");
  const representatives = oracleTable(pool, "STL_COMPANY_REPRESENTATIVES");
  const premises = oracleTable(pool, "STL_APPLICATION_PREMISES");
  const floors = oracleTable(pool, "STL_PREMISE_FLOORS");
  const units = oracleTable(pool, "STL_PREMISE_UNITS");
  const links = oracleTable(pool, "STL_PREMISE_UNIT_FLOORS");
  const scope = oracleTable(pool, "STL_DRAFT_DOCUMENT_SCOPES");
  const documents = oracleTable(pool, "STL_APPLICATION_DOCUMENTS");
  const audit = createOracleAuditRepository(pool);
  const eligible = `R.STATUS<>'REVOKED' AND R.STARTS_AT<=SYSTIMESTAMP
    AND (R.ENDS_AT IS NULL OR R.ENDS_AT>SYSTIMESTAMP) AND C.STATUS='ACTIVE'`;
  const selectAuthority = `SELECT ${selectCompany} FROM ${representatives} R
    JOIN ${companies} C ON C.ID=R.COMPANY_ID WHERE R.USER_ID=:userId AND ${eligible}`;

  function transaction(
    connection: Connection,
    consistentRead = false,
  ): DraftTransaction {
    async function findDraft(userId: string, id: string) {
      // Mutation callers share the parent row lock. Snapshot reads already
      // see the draft and its dependants at a consistent point in time.
      if (!consistentRead) {
        // The parent row is the coordination lock for every draft mutation and aggregate read.
        const [locked] = await queryRows(
          connection,
          `SELECT ID FROM ${drafts} WHERE ID=:id AND INITIATED_BY_USER_ID=:userId AND STATUS='DRAFT' FOR UPDATE`,
          { id, userId },
        );
        if (!locked) return null;
      }
      const [row] = await queryRows<DraftRow>(
        connection,
        `SELECT ${columns(draftFields)} FROM ${drafts} WHERE ID=:id AND INITIATED_BY_USER_ID=:userId AND STATUS='DRAFT'`,
        { id, userId },
      );
      return row ? draftDto(row) : null;
    }
    async function findPremises(draftId: string) {
      const [row] = await queryRows<PremisesRow>(
        connection,
        `SELECT ${columns(premiseFields)}, TO_CHAR(CERTIFICATE_DATE,'YYYY-MM-DD') AS "certificateDate"
          FROM ${premises} WHERE DRAFT_ID=:draftId`,
        { draftId },
      );
      if (!row) return null;
      return {
        ...row,
        floorAreaSqm:
          row.floorAreaSqm === null
            ? null
            : new Prisma.Decimal(row.floorAreaSqm),
        certificateDate:
          row.certificateDate === null
            ? null
            : new Date(row.certificateDate + "T00:00:00Z"),
      };
    }
    async function update(
      table: string,
      where: string,
      data: Values,
      keys: Exclude<BindParameters, unknown[]>,
      extra: string[] = [],
    ) {
      const { entries, binds } = bindValues(data);
      const changes = [
        ...entries.map(({ column, expression }) => `${column}=${expression}`),
        ...extra,
        "UPDATED_AT=SYSTIMESTAMP",
      ];
      return affected(
        connection,
        `UPDATE ${table} SET ${changes.join(", ")} WHERE ${where}`,
        { ...binds, ...keys },
      );
    }
    async function scopedRows(
      table: string,
      where: string,
      binds: Exclude<BindParameters, unknown[]>,
    ) {
      return (
        (
          await queryRows(
            connection,
            `SELECT 1 FROM ${table} WHERE ${where} AND ROWNUM=1`,
            binds,
          )
        ).length > 0
      );
    }
    return {
      findDraft,
      findPremises,
      companyAuthority: async (userId, companyId) => {
        if (!consistentRead) {
          await connection.execute(
            `SELECT ID FROM ${companies} WHERE ID=:companyId FOR UPDATE`,
            { companyId },
          );
          await connection.execute(
            `SELECT ID FROM ${representatives} WHERE COMPANY_ID=:companyId AND USER_ID=:userId FOR UPDATE`,
            { companyId, userId },
          );
        }
        const [row] = await queryRows<CompanyRow>(
          connection,
          selectAuthority + " AND R.COMPANY_ID=:companyId",
          { companyId, userId },
        );
        if (!row) fail(404, "Draf atau kebenaran syarikat tidak ditemui.");
        return decodeCompany(row);
      },
      createDraft: async (data) => {
        const id = randomUUID();
        await insert(connection, drafts, { ...data, id }, ",UPDATED_AT");
        return requireRecord(await findDraft(data.initiatedByUserId, id));
      },
      saveDraft: async (userId, id, version, data) => {
        await requireOracleUnclosedDraft(pool, connection, id);
        return (
          (await update(
            drafts,
            "ID=:id AND INITIATED_BY_USER_ID=:userId AND STATUS='DRAFT' AND VERSION=:version",
            data ?? {},
            { id, userId, version },
            ["VERSION=VERSION+1"],
          )) === 1
        );
      },
      savePremises: async (draftId, data) => {
        if (!(await update(premises, "DRAFT_ID=:draftId", data, { draftId })))
          await insert(
            connection,
            premises,
            { ...data, id: randomUUID(), draftId },
            ",UPDATED_AT",
          );
        return requireRecord(await findPremises(draftId));
      },
      floors: async (draftId) =>
        (
          await queryRows<FloorRow>(
            connection,
            `SELECT ${columns(floorFields)} FROM ${floors} WHERE DRAFT_ID=:draftId ORDER BY POSITION`,
            { draftId },
          )
        ).map((row) => ({
          ...row,
          areaSqm: new Prisma.Decimal(row.areaSqm),
          facilities: JSON.parse(row.facilities),
        })),
      hasRemovedFloorLinks: (draftId, retained) => {
        const ids = oracleInList("FLOOR_ID", retained, "NOT IN");
        return scopedRows(links, `DRAFT_ID=:draftId AND ${ids.sql}`, {
          draftId,
          ...ids.binds,
        });
      },
      hasRemovedFloorDocuments: (draftId, retained) => {
        const ids = oracleInList("FLOOR_ID", retained, "NOT IN");
        return scopedRows(
          scope,
          `DRAFT_ID=:draftId AND FLOOR_ID IS NOT NULL AND ${ids.sql}`,
          { draftId, ...ids.binds },
        );
      },
      async deleteFloors(draftId, retained) {
        const ids = oracleInList("ID", retained, "NOT IN");
        await connection.execute(
          `DELETE FROM ${floors} WHERE DRAFT_ID=:draftId AND ${ids.sql}`,
          { draftId, ...ids.binds },
        );
      },
      async updateFloor(id, data) {
        requireRecord((await update(floors, "ID=:id", data, { id })) || null);
      },
      createFloor: (id, draftId, data) =>
        insert(connection, floors, { ...data, id, draftId }, ",UPDATED_AT"),
      units: async (premiseId) => {
        type Unit = Awaited<ReturnType<DraftTransaction["units"]>>[number];
        const rows = await queryRows<
          Omit<Unit, "floorLinks"> & { floorId: string | null }
        >(
          connection,
          `SELECT U.ID AS "id", U.UNIT_LABEL AS "unitLabel", U.NORMALIZED_LABEL AS "normalizedLabel", L.FLOOR_ID AS "floorId"
             FROM ${units} U LEFT JOIN ${links} L ON L.UNIT_ID=U.ID AND L.DRAFT_ID=U.DRAFT_ID
             WHERE U.PREMISE_ID=:premiseId ORDER BY U.CREATED_AT,U.ID,L.FLOOR_ID`,
          { premiseId },
        );
        const grouped = new Map<string, Unit>();
        for (const { floorId, ...row } of rows) {
          const unit = grouped.get(row.id) ?? { ...row, floorLinks: [] };
          if (floorId !== null) unit.floorLinks.push({ floorId });
          grouped.set(row.id, unit);
        }
        return [...grouped.values()];
      },
      hasRemovedUnitDocuments: (draftId, removed) => {
        const ids = oracleInList("UNIT_ID", removed, "IN");
        return scopedRows(scope, `DRAFT_ID=:draftId AND ${ids.sql}`, {
          draftId,
          ...ids.binds,
        });
      },
      async deleteUnits(premiseId, removed) {
        const ids = oracleInList("ID", removed, "IN");
        await connection.execute(
          `DELETE FROM ${units} WHERE PREMISE_ID=:premiseId AND ${ids.sql}`,
          { premiseId, ...ids.binds },
        );
      },
      async updateUnit(id, data) {
        requireRecord((await update(units, "ID=:id", data, { id })) || null);
      },
      createUnit: (id, premiseId, draftId, data) =>
        insert(connection, units, { ...data, id, premiseId, draftId }),
      async deleteFloorLinks(draftId, unitId, retainedFloorIds) {
        const ids = oracleInList("FLOOR_ID", retainedFloorIds, "NOT IN");
        await connection.execute(
          `DELETE FROM ${links} WHERE DRAFT_ID=:draftId AND UNIT_ID=:unitId AND ${ids.sql}`,
          { draftId, unitId, ...ids.binds },
        );
      },
      async createFloorLinks(rows) {
        await connection.executeMany(
          `INSERT INTO ${links} (DRAFT_ID, UNIT_ID, FLOOR_ID) VALUES (:draftId,:unitId,:floorId)`,
          rows,
        );
      },
      documents: async (draftId) =>
        (
          await queryRows<DocumentRow>(
            connection,
            `SELECT ${columns(documentFields, "D.")}, S.DOCUMENT_ID AS "documentId", S.UNIT_ID AS "unitId", S.FLOOR_ID AS "floorId"
          FROM ${documents} D LEFT JOIN ${scope} S ON S.DOCUMENT_ID=D.ID AND S.DRAFT_ID=D.DRAFT_ID
          WHERE D.DRAFT_ID=:draftId ORDER BY D.CATEGORY,D.VERSION DESC`,
            { draftId },
          )
        ).map(({ documentId, unitId, floorId, ...row }) => ({
          ...row,
          scope: documentId ? { unitId, floorId } : null,
        })),
      async audit(entry) {
        await audit.append(connection, entry);
      },
    };
  }
  return {
    onConnection: transaction,
    transaction: (operation) =>
      pool.transaction((connection) => operation(transaction(connection))),
    allowedCompanies: (userId) =>
      pool.use(async (connection) =>
        (
          await queryRows<CompanyRow>(
            connection,
            selectAuthority + " ORDER BY C.NAME,C.ID",
            { userId },
          )
        ).map(decodeCompany),
      ),
    list: (userId) =>
      pool.use(async (connection) =>
        (
          await queryRows<DraftSummaryRow & { submitted: number }>(
            connection,
            `SELECT ${columns(draftSummary, "D.")} , CASE WHEN EXISTS (SELECT 1 FROM ${oracleTable(pool, "STL_SYNTHETIC_SUBMISSIONS")} S WHERE S.DRAFT_ID=D.ID) THEN 1 ELSE 0 END AS "submitted"
              FROM ${drafts} D WHERE D.INITIATED_BY_USER_ID=:userId AND D.STATUS='DRAFT'
        AND (D.CAPACITY='INDIVIDUAL' OR (D.CAPACITY='COMPANY' AND EXISTS (
          SELECT 1 FROM ${representatives} R JOIN ${companies} C ON C.ID=R.COMPANY_ID
          WHERE R.USER_ID=D.INITIATED_BY_USER_ID AND R.COMPANY_ID=D.COMPANY_ID AND ${eligible})))
        ORDER BY D.UPDATED_AT DESC,D.ID FETCH FIRST 50 ROWS ONLY`,
            { userId },
          )
        ).map(({ submitted, ...row }) => ({
          ...row,
          inactivity: submitted
            ? null
            : draftInactivity(row.updatedAt, new Date()),
          applicantSnapshot: JSON.parse(row.applicantSnapshot),
        })),
      ),
    ownsDraft: (userId, id) =>
      pool.use(
        async (connection) =>
          (
            await queryRows(
              connection,
              `SELECT 1 FROM ${drafts} WHERE ID=:id AND INITIATED_BY_USER_ID=:userId`,
              { id, userId },
            )
          ).length > 0,
      ),
  };
}
