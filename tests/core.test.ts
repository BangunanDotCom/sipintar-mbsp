import { randomBytes } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  registerSchema,
  companySchema,
  permissions,
  isCurrent,
  independent,
} from "../packages/shared/src/index";
describe("validation and separation of duties", () => {
  it("rejects weak passwords", () =>
    expect(
      registerSchema.safeParse({
        name: "Ujian Sah",
        email: "test@example.test",
        phone: "0123456789",
        password: "password",
        consent: true,
      }).success,
    ).toBe(false));
  it("requires consent", () =>
    expect(
      registerSchema.safeParse({
        name: "Ujian Sah",
        email: "test@example.test",
        phone: "0123456789",
        password: `Aa1!${randomBytes(24).toString("hex")}`,
        consent: false,
      }).success,
    ).toBe(false));
  it("normalizes SSM numbers", () =>
    expect(
      companySchema.parse({
        name: "Syarikat Ujian",
        registrationNumber: "ab-123 (x)",
        address: "Alamat syarikat ujian",
        phone: "0123456789",
        email: "company@example.test",
        authorityType: "PENGARAH",
      }).registrationNumber,
    ).toBe("AB123X"));
  it("rejects expired appointments", () =>
    expect(
      isCurrent({
        status: "ACTIVE",
        startsAt: new Date("2020-01-01"),
        endsAt: new Date("2021-01-01"),
      }),
    ).toBe(false));
  it("rejects future appointments", () =>
    expect(
      isCurrent({
        status: "ACTIVE",
        startsAt: new Date("2099-01-01"),
        endsAt: null,
      }),
    ).toBe(false));
  it("rejects self approval across roles", () =>
    expect(independent("same-user", "same-user")).toBe(false));
  it("ICT has no template or business decision power", () => {
    expect(permissions.PENTADBIR_ICT).not.toContain("templates.write");
    expect(permissions.PENTADBIR_ICT).not.toContain("applications.approve");
  });
  it("operations cannot create officers", () =>
    expect(permissions.PENTADBIR_OPERASI).not.toContain("users.manage"));
  it("rejects punctuation-only company registration numbers", () => {
    expect(
      companySchema.safeParse({
        name: "DATA UJIAN Syarikat",
        registrationNumber: "----",
        address: "Alamat data ujian sahaja",
        phone: "0123456789",
        email: "ujian@example.test",
        authorityType: "PENGARAH",
      }).success,
    ).toBe(false);
  });
});
