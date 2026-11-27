import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  deliverTrainingReminders,
  scheduleTrainingReminders,
} from "../apps/api/src/training-reminders";

const ownerUrl = process.env.STAYLINK_P0_PG_OWNER_URL;
const workerUrl = process.env.STAYLINK_P0_PG_OUTBOX_URL;
const database = "staylink_issue58_p0privileges_test";

function labClient(value: string | undefined, role: string) {
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
      "Dedicated PostgreSQL outbox privilege lab credentials required.",
    );
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href }),
  });
}

it.runIf(Boolean(workerUrl))(
  "limits the PostgreSQL outbox account to scheduling and delivery privileges",
  async () => {
    const owner = labClient(ownerUrl, "stl_p0_owner");
    const worker = labClient(workerUrl, "stl_p0_outbox_worker");
    try {
      const [identity] = await worker.$queryRaw<
        { name: string; role: string }[]
      >`
      SELECT current_database()::text AS name,current_user::text AS role
    `;
      expect(identity).toEqual({
        name: database,
        role: "stl_p0_outbox_worker",
      });
      const email = randomUUID() + "@example.test";
      const user = await owner.user.create({
        data: {
          email,
          name: "Synthetic outbox account",
          phone: "0123456789",
          emailVerified: true,
        },
      });
      await owner.district.upsert({
        where: { id: "SPU" },
        create: { id: "SPU", name: "Sintetik SPU" },
        update: {},
      });
      const draft = await owner.applicationDraft.create({
        data: {
          capacity: "INDIVIDUAL",
          initiatedByUserId: user.id,
          officialApplicantUserId: user.id,
          initiatorSnapshot: {},
          applicantSnapshot: {},
          updatedAt: new Date(0),
          premises: { create: { districtId: "SPU" } },
        },
      });
      const denied = async (statement: Promise<unknown>) =>
        expect(statement).rejects.toMatchObject({
          meta: { driverAdapterError: { cause: { originalCode: "42501" } } },
        });
      await denied(
        worker.$executeRaw`UPDATE delegation_documents SET "scanStatus"='CLEAN' WHERE false`,
      );
      await denied(
        worker.$executeRaw`UPDATE company_representatives SET "canManageRepresentatives"=true WHERE false`,
      );
      await denied(
        worker.$executeRaw`UPDATE training_reminder_outbox SET context='{}' WHERE false`,
      );
      await denied(
        worker.$executeRaw`DELETE FROM training_reminder_outbox WHERE false`,
      );
      await denied(
        worker.$queryRaw`SELECT "passwordHash" FROM users WHERE id=${user.id}`,
      );
      await denied(
        worker.$executeRaw`CREATE TABLE public.stl_p0_outbox_forbidden (id integer)`,
      );

      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("STAYLINK_DEMO_HOST", "false");
      vi.stubEnv("STAYLINK_SYNTHETIC_PORTAL", "true");
      vi.stubEnv("STAYLINK_SYNTHETIC_REMINDERS", "true");
      vi.stubEnv("DATABASE_URL", ownerUrl);
      vi.stubEnv("TEST_DATABASE_URL", ownerUrl);
      expect(await scheduleTrainingReminders(worker)).toBeGreaterThan(0);
      const sent: string[] = [];
      await deliverTrainingReminders(async ({ to, messageId }) => {
        if (to === email) sent.push(messageId);
      }, worker);
      expect(sent).toHaveLength(1);
      const item = await owner.trainingReminderOutbox.findFirstOrThrow({
        where: { draftId: draft.id },
      });
      expect(item).toMatchObject({
        kind: "DRAFT_INACTIVE",
        status: "SENT",
        attempts: 1,
      });
      expect(item.sentAt).toBeInstanceOf(Date);
    } finally {
      vi.unstubAllEnvs();
      await Promise.all([owner.$disconnect(), worker.$disconnect()]);
    }
  },
);
