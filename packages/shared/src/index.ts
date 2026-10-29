import { z } from "zod";
export const roles = {
  PEMOHON: "Pemohon",
  WAKIL_SYARIKAT: "Wakil syarikat",
  PIC_KAWASAN: "PIC Kawasan",
  PPSK: "PPSK",
  PERANCANG_BANDAR: "Perancang Bandar",
  KEJURUTERAAN: "Kejuruteraan",
  URUS_SETIA_JK: "Urus Setia JK",
  PEGAWAI_PENANDATANGAN: "Pegawai Penandatangan",
  PENTADBIR_OPERASI: "Pentadbir Operasi",
  PENTADBIR_TEMPLAT: "Pentadbir Templat",
  PENTADBIR_ICT: "Pentadbir ICT",
} as const;
export type RoleId = keyof typeof roles;
export const permissions: Record<RoleId, string[]> = {
  PEMOHON: ["profile", "companies", "applications.draft"],
  WAKIL_SYARIKAT: ["profile", "companies", "applications.draft"],
  PIC_KAWASAN: ["profile", "areas.read", "representation.verify"],
  PPSK: ["profile", "areas.read", "areas.assign", "audit.operations"],
  PERANCANG_BANDAR: ["profile"],
  KEJURUTERAAN: ["profile"],
  URUS_SETIA_JK: ["profile"],
  PEGAWAI_PENANDATANGAN: ["profile"],
  PENTADBIR_OPERASI: [
    "profile",
    "areas.read",
    "areas.write",
    "areas.assign",
    "config.operations",
    "audit.operations",
  ],
  PENTADBIR_TEMPLAT: ["profile", "templates.write"],
  PENTADBIR_ICT: [
    "profile",
    "users.manage",
    "roles.manage",
    "config.technical",
    "audit.all",
    "services.read",
  ],
};
export const passwordSchema = z
  .string()
  .min(12, "Gunakan sekurang-kurangnya 12 aksara.")
  .max(128)
  .regex(/[a-z]/, "Perlu huruf kecil.")
  .regex(/[A-Z]/, "Perlu huruf besar.")
  .regex(/[0-9]/, "Perlu nombor.")
  .regex(/[^a-zA-Z0-9]/, "Perlu simbol.");
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export const identificationSchema = z
  .string()
  .trim()
  .max(30)
  .transform((v) => v.toUpperCase().replace(/[ -]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9]{6,20}$/,
        "Masukkan nombor MyKad atau pasport yang sah (6–20 huruf/nombor).",
      ),
  );
export const registerSchema = z.object({
  identificationNumber: identificationSchema,
  name: z.string().trim().min(3).max(120),
  email: emailSchema,
  phone: z.string().regex(/^\+?[0-9 -]{8,20}$/),
  password: passwordSchema,
  consent: z.literal(true),
});
export const companySchema = z.object({
  name: z.string().trim().min(3).max(160),
  registrationNumber: z
    .string()
    .min(4)
    .max(40)
    .transform((x) => x.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .pipe(z.string().min(4).max(40)),
  address: z.string().trim().min(10).max(500),
  phone: z.string().min(8).max(20),
  email: emailSchema,
  authorityType: z.enum(["PENGARAH", "PEKERJA", "WAKIL_DIBERI_KUASA"]),
  endsAt: z.iso.datetime().optional(),
});
export const templateCategories = [
  "Slip pemakluman penghantaran",
  "Notis pembetulan",
  "Slip penerimaan rasmi",
  "Bil dan pemakluman pembayaran",
  "Surat rujukan jabatan teknikal",
  "Format ulasan teknikal",
  "Kertas Pertimbangan",
  "Surat kelulusan",
  "Surat kelulusan bersyarat",
  "Surat penolakan",
  "Surat pemakluman TANGGUH",
  "Surat keputusan susulan",
  "Dokumen tambahan",
];
export function isCurrent(
  a: { status: string; startsAt: Date; endsAt: Date | null },
  now = new Date(),
) {
  return (
    a.status === "ACTIVE" && a.startsAt <= now && (!a.endsAt || a.endsAt > now)
  );
}
export function independent(preparer: string, approver: string) {
  return preparer !== approver;
}

// Client chooses capacity only; authoritative identities always come from the session/database.
export const applicationDraftSchema = z.discriminatedUnion("capacity", [
  z
    .object({
      capacity: z.literal("INDIVIDUAL"),
      notes: z.string().trim().max(2000).default(""),
    })
    .strict(),
  z
    .object({
      capacity: z.literal("COMPANY"),
      companyId: z.uuid(),
      notes: z.string().trim().max(2000).default(""),
    })
    .strict(),
]);
export const applicationDraftUpdateSchema = z.discriminatedUnion("capacity", [
  z
    .object({
      capacity: z.literal("INDIVIDUAL"),
      notes: z.string().trim().max(2000).default(""),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      capacity: z.literal("COMPANY"),
      companyId: z.uuid(),
      notes: z.string().trim().max(2000).default(""),
      version: z.number().int().positive(),
    })
    .strict(),
]);
/** Closed allowlist: never redirect login to arbitrary URLs or query strings. */
export function safeApplicantReturnPath(value: string | null): string | null {
  if (!value) return null;
  return value === "/permohonan/baharu" ||
    /^\/permohonan\/draf\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\/(?:premis|semakan))?$/.test(
      value,
    ) ||
    /^\/jemputan-syarikat\?token=[a-f0-9]{64}$/.test(value)
    ? value
    : null;
}
