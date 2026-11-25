import { describe, expect, it } from "vitest";
import {
  cleanDelegation, delegationDigest, matchesDelegationBytes,
  type DelegationMetadata,
} from "../apps/api/src/delegation-evidence.js";

const now = new Date("2026-11-25T00:00:00.000Z");
const bytes = Buffer.from("%PDF-1.4\n% Synthetic\n%%EOF");
const digest = delegationDigest(bytes);
const clean: DelegationMetadata = {
  id: "doc", companyId: "company", representativeId: "rep", version: 1,
  fileName: "synthetic.pdf", mimeType: "application/pdf", uploadedBy: "user",
  sha256: digest, byteSize: bytes.length, authorityType: "PEKERJA",
  validFrom: now, validUntil: null, supersededAt: null, revokedAt: null,
  scanStatus: "CLEAN", scanSha256: digest, scanEngine: "synthetic",
  scanValidUntil: new Date(now.getTime() + 1), scanLeaseToken: null, scanLeaseExpiresAt: null,
};

describe("delegation checks fail closed", () => {
  it.each<Partial<DelegationMetadata>>([
    { scanStatus: "UNRECOGNIZED" }, { scanValidUntil: now }, { scanSha256: null },
    { scanEngine: " " }, { representativeId: null }, { revokedAt: now },
    { supersededAt: now }, { validUntil: now }, { scanLeaseToken: "pending" },
    { validFrom: new Date(now.getTime() + 1) }, { version: 0 }, { byteSize: 0 },
  ])("rejects incomplete, invalid or withdrawn proof %o", (mutation) => {
    expect(cleanDelegation({ ...clean, ...mutation }, now)).toBe(false);
  });

  it("requires matching raw bytes and size", () => {
    expect(cleanDelegation(clean, now)).toBe(true);
    expect(matchesDelegationBytes(clean, bytes)).toBe(true);
    expect(matchesDelegationBytes({ ...clean, byteSize: bytes.length + 1 }, bytes)).toBe(false);
    expect(matchesDelegationBytes(clean, Buffer.alloc(bytes.length))).toBe(false);
  });
});
