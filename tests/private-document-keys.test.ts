import { describe, expect, it } from "vitest";
import { createPrivateDocumentKey, isPrivateDocumentKeyForDraft } from "../apps/api/src/private-document-keys.js";

const draftId = "550e8400-e29b-41d4-a716-446655440000";
const otherDraftId = "550e8400-e29b-41d4-a716-446655440001";

describe("private document object keys", () => {
  it("generates unique opaque object keys scoped to a draft", () => {
    const first = createPrivateDocumentKey(draftId, "premises_plan");
    const second = createPrivateDocumentKey(draftId, "premises_plan");
    expect(first).not.toBe(second);
    expect(isPrivateDocumentKeyForDraft(first, draftId)).toBe(true);
    expect(isPrivateDocumentKeyForDraft(first, otherDraftId)).toBe(false);
  });
  it("rejects traversal, arbitrary categories and malformed identifiers", () => {
    expect(() => createPrivateDocumentKey(draftId, "../private")).toThrow();
    expect(() => createPrivateDocumentKey("invalid", "premises_plan")).toThrow();
    expect(isPrivateDocumentKeyForDraft("application-documents/../secrets", draftId)).toBe(false);
    expect(isPrivateDocumentKeyForDraft("application-documents/" + draftId + "/premises_plan/../../secrets", draftId)).toBe(false);
  });
});
