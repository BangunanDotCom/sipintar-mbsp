import { afterAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import { buildApp } from "../apps/api/src/app";
import { totp } from "../apps/api/src/auth";
import { db } from "../apps/api/src/core";
import { inspectDemoHost } from "../apps/api/src/demo-host-config.mjs";

const kitFile = process.env.STAYLINK_COMPLETION_KIT_FILE;
const root = "/api/synthetic-portal";
type Credentials = {
  label: string;
  role: string;
  email: string;
  password: string;
  mfaSecretBase32: string | null;
};

it.runIf(Boolean(kitFile))(
  "reconciles, refers, publishes partial and supplemental letters, and closes only after second settlement",
  async () => {
    const { database, origin, failures } = inspectDemoHost();
    if (
      failures.length ||
      !/^staylink_issue62_personal_completion[a-z0-9]{0,14}_test$/.test(
        database ?? "",
      ) ||
      origin !== "https://localhost:5444" ||
      process.env.STAYLINK_SYNTHETIC_SECOND_UNIT_FEE_SEN !== "1234"
    )
      throw Error("Gunakan fixture integrasi latihan terasing.");
    const kit = JSON.parse(await readFile(kitFile!, "utf8")) as {
      accounts: Credentials[];
      scenarios: { id: string; draftPath: string }[];
    };
    const app = await buildApp();
    try {
      expect(kit.accounts).toHaveLength(11);
      let sequence = 0;
      const signIn = async (label: string) => {
        const account = kit.accounts.find((item) => item.label === label)!;
        const remoteAddress = "192.0.2." + ++sequence;
        const login = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: account.email, password: account.password },
          remoteAddress,
        });
        expect(login.statusCode, label).toBe(200);
        const headers = {
          origin: origin!,
          cookie:
            "staylink=" +
            login.cookies.find((item) => item.name === "staylink")!.value,
          "x-csrf-token": login.json().csrf,
        };
        if (account.mfaSecretBase32) {
          expect(
            (
              await app.inject({
                url: root + "/completion/queue",
                headers,
                remoteAddress,
              })
            ).statusCode,
          ).toBe(403);
          const mfa = await app.inject({
            method: "POST",
            url: "/api/auth/mfa/verify",
            headers,
            remoteAddress,
            payload: { code: totp(account.mfaSecretBase32).generate() },
          });
          expect(mfa.statusCode, label).toBe(200);
        }
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/auth/role",
              headers,
              remoteAddress,
              payload: { roleId: account.role },
            })
          ).statusCode,
        ).toBe(200);
        return headers;
      };
      const [
        owner,
        other,
        pic,
        spt,
        ppsk,
        planning,
        engineering,
        council,
        signer,
      ] = await Promise.all(
        [
          "pemohon",
          "wakil",
          "pic-spu",
          "pic-spt",
          "ppsk",
          "perancang",
          "kejuruteraan",
          "urus-setia",
          "penandatangan",
        ].map(signIn),
      );
      const draft = kit.scenarios
        .find(({ id }) => id === "single-unit")!
        .draftPath.split("/")[3];
      const appUrl = root + "/drafts/" + draft;
      const current = await app.inject({ url: appUrl, headers: owner });
      expect(current.statusCode).toBe(200);
      const initial = current.json();
      const evidence = await app.inject({
        method: "POST",
        url: appUrl + "/evidence",
        headers: owner,
        payload: { version: initial.draftVersion, verdict: "CLEAN" },
      });
      expect(evidence.statusCode).toBe(200);
      const ready = await app
        .inject({ url: appUrl, headers: owner })
        .then((r) => r.json());
      const submitted = await app.inject({
        method: "POST",
        url: appUrl + "/submit",
        headers: owner,
        payload: {
          version: ready.draftVersion,
          key: randomUUID(),
          accepted: true,
          declarationVersion: ready.declaration.version,
          policyFingerprint: ready.policyFingerprint,
          previousId: null,
        },
      });
      expect(submitted.statusCode).toBe(200);
      const { id } = submitted.json();
      const review = root + "/reviews/" + id;
      const completion = root + "/completion/" + id;
      const post = (url: string, headers: typeof owner, payload: object) =>
        app.inject({ method: "POST", url, headers, payload });
      const command = (
        headers: typeof owner,
        version: number,
        action: string,
        other = {},
      ) =>
        post(completion, headers, { version, command: { action, ...other } });
      expect(
        (
          await post(review, pic, {
            action: "CONFIRM_COMPLETE",
            version: 1,
            reason: "Bukti latihan lengkap",
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await post(review, ppsk, {
            action: "REGISTER",
            version: 2,
            reason: "Pendaftaran latihan",
          })
        ).statusCode,
      ).toBe(200);
      expect((await command(pic, 0, "REFER")).statusCode).toBe(409);
      expect(
        (await post(review + "/billing", ppsk, { action: "ISSUE" })).statusCode,
      ).toBe(200);
      expect(
        (
          await post(review + "/billing", ppsk, {
            action: "SIMULATE_SETTLEMENT",
          })
        ).statusCode,
      ).toBe(200);
      expect((await command(spt, 0, "REFER")).statusCode).toBe(404);
      expect((await command(pic, 0, "REFER")).statusCode).toBe(200);
      const queue = await app.inject({
        url: root + "/completion/queue",
        headers: planning,
      });
      expect(queue.statusCode, queue.body).toBe(200);
      const { scopes } = queue
        .json()
        .cases.find((row: { id: string }) => row.id === id);
      expect(scopes).toHaveLength(2);
      expect(
        (
          await command(pic, 1, "SUBMIT_PAPER", {
            summary: "Ulasan belum lengkap",
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await command(planning, 0, "COMMENT", {
            general: "Semakan perancang latihan",
            details: [],
          })
        ).statusCode,
      ).toBe(409);
      const invalidScope = {
        unitId: scopes[0].unitId,
        floorId: "a78c8455-e65f-4c0b-afff-21f25d270bf1",
        comment: "Di luar skop",
      };
      expect(
        (
          await command(planning, 1, "COMMENT", {
            general: "Semakan perancang latihan",
            details: [invalidScope],
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await command(planning, 1, "COMMENT", {
            general: "Semakan perancang latihan",
            details: [],
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await command(engineering, 2, "COMMENT", {
            general: "Semakan kejuruteraan latihan",
            details: [],
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await command(pic, 3, "SUBMIT_PAPER", {
            summary: "Kertas Pertimbangan latihan",
          })
        ).statusCode,
      ).toBe(200);
      const outcomes = scopes.map(
        (
          { unitId, floorId }: { unitId: string; floorId: string },
          i: number,
        ) => ({
          unitId,
          floorId,
          outcome: i ? "TANGGUH" : "SK",
          reason: "Keputusan mesyuarat latihan",
        }),
      );
      expect(
        (await command(signer, 4, "DECIDE", { decisions: outcomes }))
          .statusCode,
      ).toBe(403);
      expect(
        (await command(council, 4, "DECIDE", { decisions: outcomes }))
          .statusCode,
      ).toBe(200);
      expect((await command(signer, 5, "SIGN")).statusCode).toBe(200);
      const first = await app.inject({
        url: appUrl + "/completion/letters/1",
        headers: owner,
      });
      expect(first.statusCode).toBe(200);
      expect(first.headers["cache-control"]).toContain("no-store");
      expect(first.body).toMatch(/LATIHAN[\s\S]+TANGGUH/);
      expect(
        (
          await app.inject({
            url: appUrl + "/completion/letters/1",
            headers: other,
          })
        ).statusCode,
      ).toBe(404);
      expect((await command(ppsk, 6, "CLOSE")).statusCode).toBe(409);
      expect(
        (
          await post(appUrl + "/completion", owner, {
            version: 6,
            command: {
              action: "RESPOND",
              note: "Bukti pindaan latihan tersedia",
            },
          })
        ).statusCode,
      ).toBe(200);
      expect((await command(pic, 7, "CHECK_RESPONSE")).statusCode).toBe(200);
      expect((await command(ppsk, 8, "ALLOW_RECONSIDERATION")).statusCode).toBe(
        200,
      );
      expect(
        (await command(pic, 9, "REREFER", { departments: ["KEJURUTERAAN"] }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await command(planning, 10, "COMMENT", {
            general: "Tidak dirujuk semula",
            details: [],
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await command(engineering, 10, "COMMENT", {
            general: "Semakan susulan selesai",
            details: [],
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await command(pic, 11, "SUBMIT_PAPER", {
            summary: "Kertas susulan latihan",
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await command(council, 12, "DECIDE", {
            decisions: [{ ...outcomes[1], outcome: "SK" }],
          })
        ).statusCode,
      ).toBe(200);
      expect((await command(signer, 13, "SIGN")).statusCode).toBe(200);
      expect(
        (
          await app.inject({
            url: appUrl + "/completion/letters/1",
            headers: owner,
          })
        ).body,
      ).toBe(first.body);
      expect(
        (
          await app.inject({
            url: appUrl + "/completion/letters/2",
            headers: owner,
          })
        ).body,
      ).toContain("Surat susulan");
      const invoice = await command(ppsk, 14, "ISSUE_SECOND").then(
        (r) => r.json().invoice,
      );
      expect(invoice.amountSen).toBe(1234);
      expect((await command(ppsk, 15, "CLOSE")).statusCode).toBe(409);
      const callback = (
        amountSen: number,
        key = process.env.STAYLINK_SYNTHETIC_CALLBACK_KEY!,
      ) => {
        const payload = JSON.stringify({
          invoiceId: invoice.id,
          eventId: invoice.id,
          providerReference: "SYNTHETIC-" + invoice.id,
          currency: "MYR",
          amountSen,
          outcome: "SETTLED",
        });
        return app.inject({
          method: "POST",
          url: root + "/callbacks/payment-second/" + id,
          headers: {
            "x-staylink-synthetic-signature": createHmac(
              "sha256",
              Buffer.from(key, "hex"),
            )
              .update(payload)
              .digest("hex"),
          },
          payload: { payload },
        });
      };
      expect((await callback(1234, "aa".repeat(32))).statusCode).toBe(401);
      expect((await callback(1235)).statusCode).toBe(409);
      const callbacks = await Promise.all([callback(1234), callback(1234)]);
      expect(callbacks.map((r) => r.json().result).sort()).toEqual([
        "REPLAY",
        "SETTLED",
      ]);
      expect((await command(ppsk, 16, "CLOSE")).statusCode).toBe(200);
      expect(
        (
          await app.inject({ url: appUrl + "/completion", headers: owner })
        ).json().closed,
      ).toBe(true);
      const aggregate = await app.inject({
        url: root + "/completion/queue",
        headers: ppsk,
      });
      expect(aggregate.statusCode).toBe(200);
      expect(aggregate.json()).toEqual({
        cases: [],
        summary: { sampled: 1, overdue: 0, closed: 1, paymentPending: 0 },
      });
      expect(
        (await app.inject({ url: root + "/completion/queue", headers: spt }))
          .statusCode,
      ).toBe(404);
      const existing = await app.inject({
        url: "/api/application-drafts/" + draft,
        headers: owner,
      });
      expect(existing.statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/application-drafts/" + draft,
            headers: owner,
            payload: {
              version: existing.json().version,
              capacity: "INDIVIDUAL",
              notes: "Percubaan selepas tutup",
            },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        await db.auditLog.findFirst({
          where: { target: id, actorId: "SYNTHETIC_PROVIDER" },
          select: { activeRole: true },
        }),
      ).toEqual({ activeRole: null });
      expect(
        await db.auditLog.count({
          where: { target: id, action: "SYNTHETIC_PORTAL_COMPLETION" },
        }),
      ).toBe(17);
    } finally {
      await app.close();
    }
  },
  90_000,
);

afterAll(async () => {
  if (kitFile) await db.$disconnect();
});
