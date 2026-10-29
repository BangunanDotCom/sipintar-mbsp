import {
  premisesFieldsSchema,
  completePremisesSchema,
  emptyPremises,
} from "../packages/shared/src/premises";
import { randomBytes } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  registerSchema,
  companySchema,
  permissions,
  isCurrent,
  independent,
  applicationDraftSchema,
  safeApplicantReturnPath,
} from "../packages/shared/src/index";
describe("validation and separation of duties", () => {
  it("rejects weak passwords", () =>
    expect(
      registerSchema.safeParse({
        identificationNumber: "UJIAN000001",
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
        identificationNumber: "UJIAN000001",
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

describe("Phase 2B.1 client validation and safe login returns", () => {
  it("requires a valid company when company capacity is selected", () => {
    expect(
      applicationDraftSchema.safeParse({ capacity: "COMPANY" }).success,
    ).toBe(false);
    expect(
      applicationDraftSchema.parse({
        capacity: "INDIVIDUAL",
        notes: "  DATA UJIAN  ",
      }).notes,
    ).toBe("DATA UJIAN");
  });
  it("allows only known applicant return paths and blocks external or nested redirects", () => {
    expect(safeApplicantReturnPath("/permohonan/baharu")).toBe(
      "/permohonan/baharu",
    );
    const draft = "/permohonan/draf/12345678-1234-4234-8234-123456789abc";
    expect(safeApplicantReturnPath(draft)).toBe(draft);
    expect(
      safeApplicantReturnPath("/jemputan-syarikat?token=" + "a".repeat(64)),
    ).toContain("jemputan-syarikat");
    for (const path of [
      "https://example.test",
      "//example.test",
      "/permohonan/baharu?next=https://example.test",
      "/permohonan/draf/invalid",
      null,
    ])
      expect(safeApplicantReturnPath(path)).toBeNull();
  });
});

describe("Phase 2B.2 premises validation", () => {
  it("allows incomplete drafts but requires complete fields to continue", () => {
    expect(premisesFieldsSchema.safeParse(emptyPremises).success).toBe(true);
    expect(completePremisesSchema.safeParse(emptyPremises).success).toBe(false);
  });
  it("requires paired pin coordinates without guessing a district", () => {
    expect(
      premisesFieldsSchema.safeParse({ ...emptyPremises, latitude: 5.4 })
        .success,
    ).toBe(false);
    const p = premisesFieldsSchema.parse({
      ...emptyPremises,
      latitude: 5.4,
      longitude: 100.4,
    });
    expect(p.districtId).toBeNull();
  });
  it("validates positive aggregate counts and area precision", () => {
    for (const changed of [
      { totalRooms: 0 },
      { involvedFloors: 1.5 },
      { floorAreaSqm: -1 },
      { floorAreaSqm: 1.234 },
    ])
      expect(
        premisesFieldsSchema.safeParse({ ...emptyPremises, ...changed })
          .success,
      ).toBe(false);
  });
  it("requires a certificate type for certificate details", () => {
    expect(
      premisesFieldsSchema.safeParse({
        ...emptyPremises,
        certificateNumber: "DATA UJIAN",
      }).success,
    ).toBe(false);
    expect(
      premisesFieldsSchema.safeParse({
        ...emptyPremises,
        certificateType: "UNKNOWN",
      }).success,
    ).toBe(true);
  });
  it("preserves only valid premises/review login return paths", () => {
    const base = "/permohonan/draf/12345678-1234-4234-8234-123456789abc";
    expect(safeApplicantReturnPath(base + "/premis")).toBe(base + "/premis");
    expect(safeApplicantReturnPath(base + "/semakan")).toBe(base + "/semakan");
    expect(
      safeApplicantReturnPath(base + "/premis?next=//example.test"),
    ).toBeNull();
  });
});
