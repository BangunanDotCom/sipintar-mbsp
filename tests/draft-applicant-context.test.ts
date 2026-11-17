import { describe, expect, it } from "vitest";
import { validDraftApplicantContext } from "../apps/api/src/draft-applicant-context.js";

const user = "550e8400-e29b-41d4-a716-446655440000";
const other = "550e8400-e29b-41d4-a716-446655440001";
const company = "550e8400-e29b-41d4-a716-446655440002";

describe("draft applicant context consistency", () => {
  it("allows a matching individual draft without company", () => {
    expect(validDraftApplicantContext("INDIVIDUAL", null, user, user)).toBe(true);
  });
  it("blocks individual drafts pointing to another user or company", () => {
    expect(validDraftApplicantContext("INDIVIDUAL", null, other, user)).toBe(false);
    expect(validDraftApplicantContext("INDIVIDUAL", company, user, user)).toBe(false);
    expect(validDraftApplicantContext("INDIVIDUAL", null, null, user)).toBe(false);
  });
  it("allows a company draft with a company and no individual applicant", () => {
    expect(validDraftApplicantContext("COMPANY", company, null, user)).toBe(true);
  });
  it("blocks company drafts without company or with conflicting individual", () => {
    expect(validDraftApplicantContext("COMPANY", null, null, user)).toBe(false);
    expect(validDraftApplicantContext("COMPANY", "", null, user)).toBe(false);
    expect(validDraftApplicantContext("COMPANY", company, user, user)).toBe(false);
  });
  it("rejects malformed or whitespace-only persisted identities", () => {
    expect(validDraftApplicantContext("INDIVIDUAL", null, "not-a-uuid", "not-a-uuid")).toBe(false);
    expect(validDraftApplicantContext("COMPANY", "   ", null, user)).toBe(false);
    expect(validDraftApplicantContext("COMPANY", "not-a-uuid", null, user)).toBe(false);
    expect(validDraftApplicantContext("COMPANY", company, null, "bad-user")).toBe(false);
  });
  it("rejects unknown capacity", () => {
    expect(validDraftApplicantContext("OTHER", company, null, user)).toBe(false);
  });
});
