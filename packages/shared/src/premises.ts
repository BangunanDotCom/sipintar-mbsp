import { z } from "zod";

// A premises draft may be partial; supplied values must still be valid.
const draftText = (max: number) => z.string().trim().min(1).max(max).nullable();
const aggregateCount = z.number().int().min(1).max(2147483647).nullable();
export const premisesFieldsSchema = z
  .object({
    address: draftText(1000),
    postcode: z
      .string()
      .regex(/^\d{5}$/, "Poskod mesti lima digit.")
      .nullable(),
    lotNumber: draftText(120),
    locality: draftText(160),
    districtId: z.enum(["SPU", "SPT", "SPS"]).nullable(),
    latitude: z.number().min(-85).max(85).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    buildingType: draftText(160),
    currentUse: draftText(200),
    involvedFloors: aggregateCount,
    accommodationUnits: aggregateCount,
    totalRooms: aggregateCount,
    floorAreaSqm: z
      .number()
      .positive()
      .max(1000000000)
      .multipleOf(0.01)
      .nullable(),
    proposedWorkers: aggregateCount,
    certificateType: z
      .enum(["CCC", "CFO", "OC", "NOT_APPLICABLE", "UNKNOWN"])
      .nullable(),
    certificateNumber: draftText(120),
    certificateDate: z.iso
      .date()
      .refine(
        (d) => d <= new Date().toISOString().slice(0, 10),
        "Tarikh sijil tidak boleh pada masa hadapan.",
      )
      .nullable(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if ((p.latitude === null) !== (p.longitude === null))
      ctx.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "Pilih pin untuk merekod latitude dan longitude bersama.",
      });
    if (
      !["CCC", "CFO", "OC"].includes(p.certificateType || "") &&
      (p.certificateNumber !== null || p.certificateDate !== null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["certificateType"],
        message: "Pilih jenis CCC/CFO/OC sebelum mengisi maklumat sijil.",
      });
  });
export const completePremisesSchema = premisesFieldsSchema.superRefine(
  (p, ctx) => {
    const required = [
      "address",
      "postcode",
      "lotNumber",
      "locality",
      "districtId",
      "latitude",
      "longitude",
      "buildingType",
      "currentUse",
      "involvedFloors",
      "accommodationUnits",
      "totalRooms",
      "floorAreaSqm",
      "proposedWorkers",
      "certificateType",
    ] as const;
    for (const key of required)
      if (p[key] === null)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Medan ini diperlukan sebelum meneruskan.",
        });
    if (
      ["CCC", "CFO", "OC"].includes(p.certificateType || "") &&
      !p.certificateNumber
    )
      ctx.addIssue({
        code: "custom",
        path: ["certificateNumber"],
        message: "Masukkan nombor rujukan sijil yang dipilih.",
      });
  },
);
export const premisesSaveSchema = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(["SAVE", "CONTINUE"]).default("SAVE"),
    premises: premisesFieldsSchema,
  })
  .strict();
export type PremisesFields = z.infer<typeof premisesFieldsSchema>;
export const emptyPremises: PremisesFields = {
  address: null,
  postcode: null,
  lotNumber: null,
  locality: null,
  districtId: null,
  latitude: null,
  longitude: null,
  buildingType: null,
  currentUse: null,
  involvedFloors: null,
  accommodationUnits: null,
  totalRooms: null,
  floorAreaSqm: null,
  proposedWorkers: null,
  certificateType: null,
  certificateNumber: null,
  certificateDate: null,
};
