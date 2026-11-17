import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { loadDocumentSubmissionReadiness } from "../apps/api/src/document-submission-readiness-db.js";

const draftId = "550e8400-e29b-41d4-a716-446655440000";
const categories = ["premises_plan", "floor_layout", "ownership_or_tenancy", "premises_photos"];

function fixture(rows: Array<{
  category: string; version: number; fileName: string; scanStatus: string;
  verificationStatus: string; supersededAt: Date | null;
}>) {
  const findMany = vi.fn(async () => rows);
  return {
    db: { applicationDocument: { findMany } } as unknown as PrismaClient,
    findMany,
  };
}

describe("database-backed document readiness snapshot", () => {
  it("queries only the specified draft and selects safe metadata", async () => {
    const f = fixture(categories.map((category) => ({
      category, version: 1, fileName: category + ".pdf",
      scanStatus: "CLEAN", verificationStatus: "UNVERIFIED", supersededAt: null,
    })));
    await expect(loadDocumentSubmissionReadiness(f.db, draftId, "INDIVIDUAL"))
      .resolves.toEqual({ ready: true, blockingCategories: [], pendingScanCategories: [] });
    expect(f.findMany).toHaveBeenCalledWith({
      where: { draftId },
      select: {
        category: true, version: true, fileName: true,
        scanStatus: true, verificationStatus: true, supersededAt: true,
      },
      orderBy: [{ category: "asc" }, { version: "desc" }],
    });
  });
  it("rejects invalid draft IDs before accessing the database", async () => {
    const f = fixture([]);
    await expect(loadDocumentSubmissionReadiness(f.db, "../other", "INDIVIDUAL"))
      .rejects.toThrow("ID draf");
    expect(f.findMany).not.toHaveBeenCalled();
  });
  it("blocks missing company authority and pending scans", async () => {
    const f = fixture(categories.map((category) => ({
      category, version: 1, fileName: category + ".pdf",
      scanStatus: category === "floor_layout" ? "PENDING" : "CLEAN",
      verificationStatus: "UNVERIFIED", supersededAt: null,
    })));
    await expect(loadDocumentSubmissionReadiness(f.db, draftId, "COMPANY"))
      .resolves.toEqual({
        ready: false,
        blockingCategories: ["floor_layout", "company_authority"],
        pendingScanCategories: ["floor_layout"], unexpectedActiveDocuments: false,
      });
  });
});
