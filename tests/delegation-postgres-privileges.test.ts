import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { delegationDigest } from "../apps/api/src/delegation-evidence";
import {
  dueDelegationScans,
  scanDelegationDocument,
} from "../apps/api/src/delegation-scan-worker";

const database = "staylink_issue58_p0privileges_test";
const urls = ["OWNER", "API", "SCANNER"].map(
  (account) => process.env[`STAYLINK_P0_PG_${account}_URL`],
);

describe.skipIf(urls.every((url) => !url))(
  "PostgreSQL delegation service privileges",
  () => {
    let owner: PrismaClient;
    let api: PrismaClient;
    let scanner: PrismaClient;

    beforeAll(async () => {
      [owner, api, scanner] = urls.map((value, index) => {
        const role = ["stl_p0_owner", "stl_p0_api", "stl_p0_scanner"][index];
        const url = new URL(value ?? "");
        if (
          url.protocol !== "postgresql:" ||
          url.hostname !== "127.0.0.1" ||
          url.pathname !== "/" + database ||
          url.username !== role ||
          url.search ||
          url.hash
        )
          throw Error(
            "Dedicated PostgreSQL privilege lab credentials required.",
          );
        return new PrismaClient({
          adapter: new PrismaPg({ connectionString: value }),
        });
      });
      for (const [client, role] of [
        [owner, "stl_p0_owner"],
        [api, "stl_p0_api"],
        [scanner, "stl_p0_scanner"],
      ] as const) {
        const [identity] = await client.$queryRaw<
          { database: string; role: string }[]
        >`
        SELECT current_database()::text AS database, current_user::text AS role
      `;
        expect(identity).toEqual({ database, role });
      }
    });

    afterAll(async () => {
      await Promise.all([
        owner?.$disconnect(),
        api?.$disconnect(),
        scanner?.$disconnect(),
      ]);
    });

    it("keeps PDF bytes immutable and permits only the scanner to complete a verdict", async () => {
      const id = randomUUID();
      const actor = await owner.user.create({
        data: {
          name: "Synthetic P0 role test",
          email: id + "@example.test",
          phone: "0123456789",
        },
      });
      const company = await owner.company.create({
        data: {
          name: "Synthetic P0 role test",
          registrationNumber: id,
          address: "Lab",
          phone: "0123456789",
          email: id + "@example.test",
        },
      });
      const rep = await owner.companyRepresentative.create({
        data: {
          companyId: company.id,
          userId: actor.id,
          authorityType: "WAKIL_SYARIKAT",
        },
      });
      const content = Buffer.from("%PDF-1.4\nP0 privilege lab\n%%EOF");
      const digest = delegationDigest(content);
      const upload = {
        id,
        content,
        sha256: digest,
        companyId: company.id,
        representativeId: rep.id,
        authorityType: rep.authorityType,
        uploadedBy: actor.id,
        fileName: "synthetic.pdf",
        mimeType: "application/pdf",
        byteSize: content.length,
        version: 1,
        validFrom: new Date(),
      };
      const denied = async (operation: Promise<unknown>) => {
        await expect(operation).rejects.toMatchObject({
          meta: { driverAdapterError: { cause: { originalCode: "42501" } } },
        });
      };
      await denied(api.$executeRaw`
      INSERT INTO delegation_documents (id, "companyId", "uploadedBy", "fileName", "mimeType", content, sha256, "scanStatus")
      VALUES (${id},${company.id},${actor.id},'synthetic.pdf','application/pdf',${content},${digest},'CLEAN')
    `);
      await api.delegationDocument.create({
        data: { ...upload, scanStatus: "PENDING" },
        select: { id: true },
      });
      await denied(
        api.$executeRaw`UPDATE delegation_documents SET "scanStatus"='CLEAN' WHERE id=${id}`,
      );
      await denied(
        api.$executeRaw`UPDATE delegation_documents SET "scanValidUntil"=CURRENT_TIMESTAMP WHERE id=${id}`,
      );
      await denied(
        scanner.$executeRaw`UPDATE delegation_documents SET sha256='unauthorized' WHERE id=${id}`,
      );
      await denied(
        scanner.$executeRaw`UPDATE delegation_documents SET content=decode('00','hex') WHERE id=${id}`,
      );
      await denied(
        scanner.$executeRaw`UPDATE company_representatives SET "canManageRepresentatives"=true WHERE id=${rep.id}`,
      );
      await denied(
        scanner.$executeRaw`UPDATE companies SET status='SUSPENDED' WHERE id=${company.id}`,
      );
      await denied(scanner.$executeRaw`SELECT email FROM users`);
      for (const runtime of [api, scanner]) {
        await denied(
          runtime.$executeRaw`CREATE TABLE public.stl_p0_forbidden (id integer)`,
        );
        await denied(
          runtime.$executeRaw`CREATE TEMP TABLE stl_p0_forbidden (id integer)`,
        );
      }
      expect(await dueDelegationScans(scanner, new Date())).toContainEqual({
        id,
      });
      expect(
        await scanDelegationDocument(
          scanner,
          {
            async scan(bytes) {
              expect(bytes.equals(content)).toBe(true);
              return { status: "CLEAN", engine: "synthetic-privilege-lab" };
            },
          },
          id,
        ),
      ).toBe(true);
      const stored = await owner.delegationDocument.findUniqueOrThrow({
        where: { id },
      });
      expect(stored).toMatchObject({
        scanStatus: "CLEAN",
        sha256: digest,
        scanSha256: digest,
      });
      expect(Buffer.from(stored.content)).toEqual(content);
      expect(
        await owner.companyRepresentative.findUnique({ where: { id: rep.id } }),
      ).toMatchObject({
        canManageRepresentatives: false,
        status: "UNVERIFIED",
      });
      await api.delegationDocument.update({
        where: { id },
        data: { revokedAt: new Date() },
        select: { id: true },
      });
      expect(await dueDelegationScans(scanner, new Date())).not.toContainEqual({
        id,
      });
    });
  },
);
