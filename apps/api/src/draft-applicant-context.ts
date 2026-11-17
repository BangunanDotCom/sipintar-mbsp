import { z } from "zod";

const uuid = z.uuid();

// A draft's stored applicant context must be internally consistent before
// authorizing access to its document readiness information.
export function validDraftApplicantContext(
  capacity: string,
  companyId: string | null,
  officialApplicantUserId: string | null,
  initiatedByUserId: string,
): boolean {
  if (!uuid.safeParse(initiatedByUserId).success) return false;
  if (capacity === "INDIVIDUAL")
    return companyId === null && officialApplicantUserId === initiatedByUserId;
  if (capacity === "COMPANY")
    return typeof companyId === "string" && uuid.safeParse(companyId).success &&
      officialApplicantUserId === null;
  return false;
}
