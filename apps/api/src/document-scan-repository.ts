import type { PrismaClient } from "@prisma/client";

export type ScanDocument = {
  id: string;
  draftId: string;
  storageKey: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
  scanStatus: string;
  supersededAt: Date | null;
};

export type ScanStatus = "CLEAN" | "INFECTED" | "FAILED";

export interface DocumentScanRepository {
  pending(limit: number): Promise<{ id: string }[]>;
  find(id: string): Promise<ScanDocument | null>;
  claim(document: ScanDocument, token: string): Promise<boolean>;
  finish(
    document: ScanDocument,
    token: string,
    status: ScanStatus,
  ): Promise<boolean>;
}

function identity({
  id,
  draftId,
  storageKey,
  sha256,
  byteSize,
  mimeType,
}: ScanDocument) {
  return {
    id,
    draftId,
    storageKey,
    sha256,
    byteSize,
    mimeType,
    supersededAt: null,
  };
}

export function postgresDocumentScan(db: PrismaClient): DocumentScanRepository {
  return {
    pending: (limit) =>
      db.applicationDocument.findMany({
        where: {
          supersededAt: null,
          OR: [
            { scanStatus: "PENDING" },
            { scanStatus: "SCANNING", scanLeaseExpiresAt: { lt: new Date() } },
          ],
        },
        select: { id: true },
        orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
        take: limit,
      }),
    find: (id) =>
      db.applicationDocument.findUnique({
        where: { id },
        select: {
          id: true,
          draftId: true,
          storageKey: true,
          sha256: true,
          byteSize: true,
          mimeType: true,
          scanStatus: true,
          supersededAt: true,
        },
      }),
    async claim(document, token) {
      const now = new Date();
      const claimed = await db.applicationDocument.updateMany({
        where: {
          ...identity(document),
          OR: [
            { scanStatus: "PENDING" },
            { scanStatus: "SCANNING", scanLeaseExpiresAt: { lte: now } },
          ],
        },
        data: {
          scanStatus: "SCANNING",
          scanLeaseToken: token,
          scanLeaseExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        },
      });
      return claimed.count === 1;
    },
    async finish(document, token, status) {
      const updated = await db.applicationDocument.updateMany({
        where: {
          ...identity(document),
          scanStatus: "SCANNING",
          scanLeaseToken: token,
          scanLeaseExpiresAt: { gt: new Date() },
        },
        data: {
          scanStatus: status,
          scanLeaseToken: null,
          scanLeaseExpiresAt: null,
        },
      });
      return updated.count === 1;
    },
  };
}

export function documentScanRepository(
  database: PrismaClient | DocumentScanRepository,
) {
  return "applicationDocument" in database
    ? postgresDocumentScan(database)
    : database;
}
