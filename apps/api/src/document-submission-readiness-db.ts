import type { PrismaClient } from "@prisma/client";
import { documentSubmissionReadiness, type DocumentSubmissionReadiness } from "./document-submission-readiness.js";

// Server-side snapshot only; callers must still authorize the draft and perform
// a final readiness check inside the submission transaction to avoid races.
export async function loadDocumentSubmissionReadiness(
  db: PrismaClient,
  draftId: string,
  capacity: "INDIVIDUAL" | "COMPANY",
): Promise<DocumentSubmissionReadiness> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draftId))
    throw new Error("ID draf permohonan tidak sah.");
  const documents = await db.applicationDocument.findMany({
    where: { draftId },
    select: {
      category: true, version: true, fileName: true,
      scanStatus: true, verificationStatus: true, supersededAt: true,
    },
    orderBy: [{ category: "asc" }, { version: "desc" }],
  });
  return documentSubmissionReadiness(capacity, documents.map((document) => ({
    ...document,
    supersededAt: document.supersededAt?.toISOString() ?? null,
  })));
}
