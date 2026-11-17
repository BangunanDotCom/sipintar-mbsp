import { describe, expect, it } from "vitest";
import { draftDocumentUploadPolicy } from "../apps/api/src/draft-document-upload-policy.js";
import { documentChecklistRows, documentChecklistSummary, isDocumentStatusRecord, isDocumentUploadPolicy, unambiguousDocumentUploadPolicies, validatedDocumentResponse, isDocumentApiRecord, documentNextStepLabels, filterDocumentChecklistRows, documentReviewQueue, documentReviewQueueSummary, filterDocumentReviewQueue, documentReviewNextAction, documentReviewNextActionLabels } from "../packages/shared/src/document-checklist-status.js";

const doc = (version: number, scanStatus: string, verificationStatus: string, supersededAt: string | null = null) => ({
  category: "premises_plan", version, fileName: `plan-v${version}.pdf`,
  scanStatus, verificationStatus, supersededAt,
});
const state = (documents: ReturnType<typeof doc>[]) =>
  documentChecklistRows("INDIVIDUAL", documents).find((row) => row.category === "premises_plan");

describe("document checklist statuses", () => {
  it("accepts the actual API upload guidance contract for each applicant capacity", () => {
    const draftId = "11111111-1111-4111-8111-111111111111";
    for (const capacity of ["INDIVIDUAL", "COMPANY"] as const) {
      const uploadPolicy = draftDocumentUploadPolicy(capacity);
      const parsed = validatedDocumentResponse({
        draftId, capacity, documents: [], uploadPolicy,
        uploadEnabled: false, submissionEnabled: false,
      }, draftId, capacity);
      expect(parsed).not.toBeNull();
      expect(parsed?.uploadPolicy).toEqual(uploadPolicy);
      expect(parsed?.uploadPolicy.length).toBe(documentChecklistRows(capacity, []).length);
    }
  });
  it("validates upload policy rows before displaying file guidance", () => {
    const policy = {
      category: "premises_plan", label: "Pelan premis",
      mimeTypes: ["application/pdf"], defaultMaxMiB: 10, hardCeilingMiB: 25,
    };
    expect(isDocumentUploadPolicy(policy)).toBe(true);
    expect(isDocumentUploadPolicy(null)).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, mimeTypes: [] })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, mimeTypes: [null] })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, mimeTypes: ["pdf"] })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, mimeTypes: ["application/pdf", "application/pdf"] })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, mimeTypes: ["image/jpeg", "application/pdf"] })).toBe(true);
    expect(isDocumentUploadPolicy({ ...policy, label: "  " })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, category: " premises_plan " })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, defaultMaxMiB: Infinity })).toBe(false);
    expect(isDocumentUploadPolicy({ ...policy, hardCeilingMiB: 5 })).toBe(false);
  });
  it("does not select an arbitrary policy when duplicate categories conflict", () => {
    const policy = {
      category: "premises_plan", label: "Pelan premis",
      mimeTypes: ["application/pdf"], defaultMaxMiB: 10, hardCeilingMiB: 25,
    };
    expect(unambiguousDocumentUploadPolicies(null)).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([policy])).toEqual([policy]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { ...policy, defaultMaxMiB: 5 },
    ])).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { ...policy, defaultMaxMiB: -1 },
    ])).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { category: "premises_plan", mimeTypes: null },
    ])).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { ...policy, category: " premises_plan " },
    ])).toEqual([]);
    expect(unambiguousDocumentUploadPolicies([
      policy, { ...policy, category: "company_authority" }, null,
    ])).toHaveLength(2);
  });
  it("requires a complete document API response before displaying statuses", () => {
    const response = {
      draftId: "11111111-1111-4111-8111-111111111111",
      capacity: "INDIVIDUAL",
      documents: [{ ...doc(1, "CLEAN", "VERIFIED"), uploadedAt: "2026-11-17T00:00:00Z", byteSize: 1024, mimeType: "application/pdf" }],
      uploadPolicy: [],
      uploadEnabled: false,
      submissionEnabled: false,
    };
    expect(validatedDocumentResponse(response)?.documents).toHaveLength(1);
    const draftId = "11111111-1111-4111-8111-111111111111";
    expect(validatedDocumentResponse({ ...response, draftId }, draftId)?.documents).toHaveLength(1);
    expect(validatedDocumentResponse({ ...response, draftId: "not-a-uuid" })).toBeNull();
    expect(validatedDocumentResponse({ ...response, capacity: "UNKNOWN" })).toBeNull();
    expect(validatedDocumentResponse({ ...response, capacity: undefined })).toBeNull();
    expect(validatedDocumentResponse({ ...response, draftId, capacity: "COMPANY" }, draftId, "COMPANY")?.documents).toHaveLength(1);
    expect(validatedDocumentResponse({ ...response, draftId, capacity: "COMPANY" }, draftId, "INDIVIDUAL")).toBeNull();
    expect(validatedDocumentResponse({ ...response, draftId, capacity: "INDIVIDUAL" }, draftId, "COMPANY")).toBeNull();
    expect(validatedDocumentResponse({ ...response, draftId }, draftId, "COMPANY")).toBeNull();
    expect(validatedDocumentResponse({ ...response, draftId: "22222222-2222-4222-8222-222222222222" }, draftId)).toBeNull();
    expect(validatedDocumentResponse({ ...response, draftId: undefined }, draftId)).toBeNull();
    expect(validatedDocumentResponse({ ...response, draftId: null }, draftId)).toBeNull();
    expect(isDocumentApiRecord(response.documents[0])).toBe(true);
    expect(isDocumentApiRecord({ ...response.documents[0], supersededAt: "2026-11-16T23:59:59Z" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], supersededAt: "2026-11-17T00:00:00Z" })).toBe(true);
    expect(isDocumentApiRecord({ ...response.documents[0], supersededAt: "2026-11-17T01:00:00+01:00" })).toBe(true);
    expect(isDocumentApiRecord({ ...response.documents[0], byteSize: -1 })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], byteSize: 0 })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], byteSize: 1.5 })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], mimeType: " " })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], mimeType: "not-a-mime" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: null })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "yesterday" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "2026-11-17" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "2026-02-30T12:00:00Z" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "2025-02-29T12:00:00Z" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "2024-02-29T12:00:00Z" })).toBe(true);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "2026-11-17T25:00:00Z" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "2026-11-17T12:00:00+08:99" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "2026-11-17T12:00:00+15:00" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "2026-11-17T12:00:00-14:01" })).toBe(false);
    expect(isDocumentApiRecord({ ...response.documents[0], uploadedAt: "2026-11-17T12:00:00+14:00" })).toBe(true);

    expect(validatedDocumentResponse({ ...response, documents: [doc(1, "CLEAN", "VERIFIED")] })).toBeNull();
    expect(validatedDocumentResponse(null)).toBeNull();
    expect(validatedDocumentResponse({ ...response, documents: null })).toBeNull();
    expect(validatedDocumentResponse({ ...response, documents: [null] })).toBeNull();
    expect(validatedDocumentResponse({ ...response, uploadPolicy: null })).toBeNull();
    expect(validatedDocumentResponse({ ...response, uploadEnabled: "false" })).toBeNull();
    expect(validatedDocumentResponse({ ...response, uploadEnabled: true })).toBeNull();
    expect(validatedDocumentResponse({ ...response, submissionEnabled: true })).toBeNull();
    expect(validatedDocumentResponse({ ...response, uploadEnabled: true, submissionEnabled: true })).toBeNull();
    expect(validatedDocumentResponse({ ...response, submissionEnabled: undefined })).toBeNull();
  });
  it("rejects malformed API document records", () => {
    expect(isDocumentStatusRecord(doc(1, "CLEAN", "VERIFIED"))).toBe(true);
    expect(isDocumentStatusRecord(null)).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), scanStatus: null })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), version: "1" })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), supersededAt: false })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), supersededAt: "" })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), supersededAt: "yesterday" })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), supersededAt: "2026-02-30T00:00:00Z" })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), supersededAt: "2026-11-17T00:00:00Z" })).toBe(true);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), category: "  " })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), category: " premises_plan " })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), fileName: "" })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), scanStatus: " " })).toBe(false);
    expect(isDocumentStatusRecord({ ...doc(1, "CLEAN", "VERIFIED"), verificationStatus: "" })).toBe(false);
  });
  it("provides safe next-step guidance for every document state", () => {
    for (const status of ["MISSING", "PENDING_SCAN", "CONFLICT", "UNSAFE", "PENDING_REVIEW", "REJECTED", "VERIFIED"] as const) {
      expect(documentNextStepLabels[status].length).toBeGreaterThan(10);
      expect(documentNextStepLabels[status].toLowerCase()).not.toContain("hantar permohonan");
    }
  });
  it("summarizes priority categories without counting optional items as mandatory", () => {
    const empty = documentChecklistSummary(documentChecklistRows("INDIVIDUAL", []));
    expect(empty.total).toBeGreaterThan(0);
    expect(empty.recorded).toBe(0);
    expect(empty.verified).toBe(0);
    expect(empty.pendingScan).toBe(0);
    expect(empty.unsafe).toBe(0);
    expect(empty.missing).toHaveLength(empty.total);
    const records = [
      doc(1, "CLEAN", "VERIFIED"),
      { ...doc(1, "CLEAN", "REJECTED"), category: "floor_layout" },
      { ...doc(1, "CLEAN", "VERIFIED"), category: "fire_safety" },
    ];
    const summary = documentChecklistSummary(documentChecklistRows("INDIVIDUAL", records));
    expect(summary.recorded).toBe(2);
    expect(summary.verified).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.attentionRows.map((row) => row.category)).toEqual(["floor_layout"]);
    expect(summary.pendingReviewRows).toEqual([]);
    expect(summary.total).toBe(empty.total);
    expect(summary.missing).toHaveLength(empty.total - 2);
    expect(summary.optionalTotal).toBeGreaterThan(0);
    expect(summary.optionalRecorded).toBe(1);
    expect(empty.optionalRecorded).toBe(0);
    expect(summary.optionalAttention).toBe(0);
    const unsafeOptional = documentChecklistSummary(documentChecklistRows("INDIVIDUAL", [
      { ...doc(1, "INFECTED", "VERIFIED"), category: "fire_safety" },
      { ...doc(1, "CLEAN", "REJECTED"), category: "building_certificate" },
    ]));
    expect(unsafeOptional.optionalRecorded).toBe(2);
    expect(unsafeOptional.optionalAttention).toBe(2);
    expect(unsafeOptional.optionalAttentionRows.map((row) => row.category)).toEqual(["building_certificate", "fire_safety"]);
    expect(summary.optionalAttentionRows).toEqual([]);
    expect(unsafeOptional.unsafe).toBe(0);
    expect(unsafeOptional.pendingScan).toBe(0);
  });
  it("separates documents awaiting officer review from corrective action", () => {
    const summary = documentChecklistSummary(documentChecklistRows("INDIVIDUAL", [
      doc(1, "CLEAN", "UNVERIFIED"),
      { ...doc(1, "CLEAN", "UNVERIFIED"), category: "fire_safety" },
      { ...doc(1, "CLEAN", "REJECTED"), category: "floor_layout" },
    ]));
    expect(summary.pendingReviewRows.map((row) => row.category)).toEqual(["premises_plan"]);
    expect(summary.optionalPendingReviewRows.map((row) => row.category)).toEqual(["fire_safety"]);
    expect(summary.attentionRows.map((row) => row.category)).toEqual(["floor_layout"]);
    expect(summary.optionalAttentionRows).toEqual([]);
  });
  it("separates pending security scans from corrections and officer review", () => {
    const summary = documentChecklistSummary(documentChecklistRows("INDIVIDUAL", [
      doc(1, "PENDING", "VERIFIED"),
      { ...doc(1, "SCANNING", "UNVERIFIED"), category: "fire_safety" },
      { ...doc(1, "INFECTED", "VERIFIED"), category: "floor_layout" },
    ]));
    expect(summary.pendingScanRows.map((row) => row.category)).toEqual(["premises_plan", "fire_safety"]);
    expect(summary.attentionRows.map((row) => row.category)).toEqual(["floor_layout"]);
    expect(summary.optionalAttentionRows).toEqual([]);
    expect(summary.optionalAttention).toBe(summary.optionalAttentionRows.length);
    expect(summary.optionalAttentionRows.some((row) => row.state === "PENDING_SCAN")).toBe(false);
    expect(summary.pendingReviewRows).toEqual([]);
    expect(summary.verified).toBe(0);
    expect(summary.pendingScan).toBe(1);
    expect(summary.unsafe).toBe(1);
  });
  it("filters document statuses without changing the underlying advisory checklist", () => {
    const rows = documentChecklistRows("INDIVIDUAL", [
      doc(1, "CLEAN", "VERIFIED"),
      { ...doc(1, "INFECTED", "UNVERIFIED"), category: "floor_layout" },
      { ...doc(1, "SCANNING", "UNVERIFIED"), category: "fire_safety" },
      { ...doc(1, "CLEAN", "UNVERIFIED"), category: "premises_photos" },
      { ...doc(1, "CLEAN", "REJECTED"), category: "building_certificate" },
    ]);
    const categories = (filter: "ALL" | "ATTENTION" | "PENDING" | "VERIFIED" | "MISSING") =>
      filterDocumentChecklistRows(rows, filter).map((row) => row.category);
    expect(categories("ALL")).toHaveLength(rows.length);
    expect(categories("ATTENTION")).toEqual(["floor_layout", "building_certificate"]);
    expect(categories("PENDING")).toEqual(["fire_safety", "premises_photos"]);
    expect(categories("VERIFIED")).toEqual(["premises_plan"]);
    expect(categories("MISSING")).toEqual(["ownership_or_tenancy"]);
    expect(documentChecklistSummary(rows).verified).toBe(1);
    expect(rows).toHaveLength(categories("ALL").length);
  });
  it("combines keyword search with status filtering without mutating the checklist", () => {
    const rows = documentChecklistRows("COMPANY", [
      { ...doc(1, "INFECTED", "UNVERIFIED"), category: "floor_layout" },
      { ...doc(1, "CLEAN", "VERIFIED"), category: "company_authority" },
    ]);
    expect(filterDocumentChecklistRows(rows, "ATTENTION", "PELAN").map((row) => row.category)).toEqual(["floor_layout"]);
    expect(filterDocumentChecklistRows(rows, "VERIFIED", "surat kuasa").map((row) => row.category)).toEqual(["company_authority"]);
    expect(filterDocumentChecklistRows(rows, "ALL", "  premis  ").length).toBeGreaterThan(0);
    expect(filterDocumentChecklistRows(rows, "ALL", "tiada padanan")).toEqual([]);
    expect(filterDocumentChecklistRows(rows, "ALL")).toHaveLength(rows.length);
  });
  it("filters main and optional documents independently of status and search", () => {
    const rows = documentChecklistRows("COMPANY", [
      { ...doc(1, "CLEAN", "VERIFIED"), category: "premises_plan" },
      { ...doc(1, "INFECTED", "UNVERIFIED"), category: "fire_safety" },
      { ...doc(1, "CLEAN", "UNVERIFIED"), category: "company_authority" },
    ]);
    const main = filterDocumentChecklistRows(rows, "ALL", "", "PRIORITY");
    const optional = filterDocumentChecklistRows(rows, "ALL", "", "OPTIONAL");
    expect(main.every((row) => row.applicability !== "IF_AVAILABLE")).toBe(true);
    expect(optional.every((row) => row.applicability === "IF_AVAILABLE")).toBe(true);
    expect(main.length + optional.length).toBe(rows.length);
    expect(filterDocumentChecklistRows(rows, "ATTENTION", "", "OPTIONAL").map((row) => row.category)).toEqual(["fire_safety"]);
    expect(filterDocumentChecklistRows(rows, "PENDING", "kuasa", "PRIORITY").map((row) => row.category)).toEqual(["company_authority"]);
    expect(filterDocumentChecklistRows(rows, "VERIFIED", "", "OPTIONAL")).toEqual([]);
  });
  it("keeps status option counts consistent with scope and keyword results", () => {
    const rows = documentChecklistRows("COMPANY", [
      { ...doc(1, "CLEAN", "VERIFIED"), category: "premises_plan" },
      { ...doc(1, "INFECTED", "UNVERIFIED"), category: "fire_safety" },
      { ...doc(1, "CLEAN", "UNVERIFIED"), category: "company_authority" },
    ]);
    const count = (status: "ALL" | "ATTENTION" | "PENDING" | "VERIFIED" | "MISSING", search: string, scope: "ALL" | "PRIORITY" | "OPTIONAL") =>
      filterDocumentChecklistRows(rows, status, search, scope).length;
    expect(count("ALL", "", "OPTIONAL")).toBe(2);
    expect(count("ATTENTION", "", "OPTIONAL")).toBe(1);
    expect(count("VERIFIED", "", "OPTIONAL")).toBe(0);
    expect(count("ALL", "kuasa", "PRIORITY")).toBe(1);
    expect(count("PENDING", "kuasa", "PRIORITY")).toBe(1);
    expect(count("ATTENTION", "kuasa", "PRIORITY")).toBe(0);
  });
  it("offers safe next actions without treating verification or missing files as officer tasks", () => {
    expect(documentReviewNextAction("CONFLICT")).toBe("RESOLVE_CONFLICT");
    expect(documentReviewNextAction("UNSAFE")).toBe("SECURITY_REVIEW");
    expect(documentReviewNextAction("PENDING_REVIEW")).toBe("REVIEW_DOCUMENT");
    expect(documentReviewNextAction("PENDING_SCAN")).toBe("AWAIT_SCAN");
    expect(documentReviewNextAction("REJECTED")).toBe("APPLICANT_CORRECTION");
    expect(documentReviewNextAction("VERIFIED")).toBeNull();
    expect(documentReviewNextAction("MISSING")).toBeNull();
    expect(Object.values(documentReviewNextActionLabels)).toHaveLength(5);
  });
  it("builds a read-only officer triage preview ordered by urgency", () => {
    const rows = documentChecklistRows("COMPANY", [
      { ...doc(1, "CLEAN", "UNVERIFIED"), category: "premises_plan" },
      { ...doc(1, "INFECTED", "VERIFIED"), category: "floor_layout" },
      { ...doc(1, "PENDING", "UNVERIFIED"), category: "fire_safety" },
      { ...doc(1, "CLEAN", "REJECTED"), category: "company_authority" },
      { ...doc(1, "CLEAN", "VERIFIED"), category: "premises_photos" },
    ]);
    const queue = documentReviewQueue(rows);
    expect(queue.map((item) => item.priority)).toEqual(["CRITICAL", "ACTION", "ACTION", "WAITING"]);
    expect(queue.map((item) => item.category)).toEqual(["floor_layout", "company_authority", "premises_plan", "fire_safety"]);
    expect(queue.find((item) => item.category === "floor_layout")?.version).toBe(1);
    expect(queue.find((item) => item.category === "floor_layout")?.nextAction).toBe("SECURITY_REVIEW");
    expect(queue.find((item) => item.category === "premises_plan")?.nextAction).toBe("REVIEW_DOCUMENT");
    expect(queue.some((item) => item.category === "premises_photos")).toBe(false);
    expect(documentReviewQueue(rows)).toEqual(queue);
    expect(rows.find((row) => row.category === "premises_photos")?.state).toBe("VERIFIED");
  });
  it("summarizes officer triage by priority and document applicability", () => {
    const rows = documentChecklistRows("COMPANY", [
      { ...doc(1, "INFECTED", "UNVERIFIED"), category: "floor_layout" },
      { ...doc(1, "CLEAN", "UNVERIFIED"), category: "premises_plan" },
      { ...doc(1, "PENDING", "UNVERIFIED"), category: "fire_safety" },
      { ...doc(1, "CLEAN", "VERIFIED"), category: "premises_photos" },
    ]);
    const queue = documentReviewQueue(rows);
    expect(documentReviewQueueSummary(queue)).toEqual({
      total: 3, critical: 1, action: 1, waiting: 1, main: 2, optional: 1,
    });
    expect(documentReviewQueueSummary([])).toEqual({
      total: 0, critical: 0, action: 0, waiting: 0, main: 0, optional: 0,
    });
    expect(rows.find((row) => row.category === "premises_photos")?.state).toBe("VERIFIED");
  });
  it("filters officer triage without changing priority or source records", () => {
    const rows = documentChecklistRows("COMPANY", [
      { ...doc(1, "INFECTED", "UNVERIFIED"), category: "floor_layout" },
      { ...doc(1, "CLEAN", "UNVERIFIED"), category: "company_authority" },
      { ...doc(1, "SCANNING", "UNVERIFIED"), category: "fire_safety" },
    ]);
    const queue = documentReviewQueue(rows);
    expect(filterDocumentReviewQueue(queue, "CRITICAL").map((item) => item.category)).toEqual(["floor_layout"]);
    expect(filterDocumentReviewQueue(queue, "ACTION", "PRIORITY", "kuasa").map((item) => item.category)).toEqual(["company_authority"]);
    expect(filterDocumentReviewQueue(queue, "WAITING", "OPTIONAL").map((item) => item.category)).toEqual(["fire_safety"]);
    expect(filterDocumentReviewQueue(queue, "CRITICAL", "OPTIONAL")).toEqual([]);
    expect(filterDocumentReviewQueue(queue)).toEqual(queue);
    expect(documentReviewQueueSummary(queue).total).toBe(3);
  });
  it("shows missing documents as missing", () => {
    expect(state([])?.state).toBe("MISSING");
  });
  it("does not accept officer VERIFIED when malware scan is pending", () => {
    expect(state([doc(1, "PENDING", "VERIFIED")])?.state).toBe("PENDING_SCAN");
  });
  it("fails closed on infected or failed scan", () => {
    expect(state([doc(1, "INFECTED", "VERIFIED")])?.state).toBe("UNSAFE");
    expect(state([doc(1, "FAILED", "VERIFIED")])?.state).toBe("UNSAFE");
  });
  it("fails closed on unknown or malformed scan statuses", () => {
    expect(state([doc(1, "UNKNOWN", "VERIFIED")])?.state).toBe("UNSAFE");
    expect(state([doc(1, "", "VERIFIED")])?.state).toBe("UNSAFE");
    expect(state([doc(1, "clean", "VERIFIED")])?.state).toBe("UNSAFE");
    expect(state([doc(1, "SCANNING", "VERIFIED")])?.state).toBe("PENDING_SCAN");
  });
  it("distinguishes clean but unverified and rejected records", () => {
    expect(state([doc(1, "CLEAN", "UNVERIFIED")])?.state).toBe("PENDING_REVIEW");
    expect(state([doc(1, "CLEAN", "REJECTED")])?.state).toBe("REJECTED");
  });
  it("requires both clean scan and officer verification", () => {
    expect(state([doc(1, "CLEAN", "VERIFIED")])?.state).toBe("VERIFIED");
  });
  it("selects latest active version but flags an older active version as a conflict", () => {
    const row = state([doc(1, "CLEAN", "VERIFIED"), doc(2, "PENDING", "UNVERIFIED")]);
    expect(row?.current?.version).toBe(2);
    expect(row?.state).toBe("CONFLICT");
    const superseded = state([doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z")]);
    expect(superseded?.state).toBe("MISSING");
  });
  it("does not treat duplicate active versions as verified", () => {
    const row = state([doc(2, "CLEAN", "VERIFIED"), doc(2, "CLEAN", "VERIFIED")]);
    expect(row?.state).toBe("CONFLICT");
  });
  it("fails closed when different versions remain active simultaneously", () => {
    const row = state([doc(1, "CLEAN", "VERIFIED"), doc(2, "CLEAN", "VERIFIED")]);
    expect(row?.current?.version).toBe(2);
    expect(row?.state).toBe("CONFLICT");
  });
  it("accepts a verified replacement after the previous version is superseded", () => {
    const row = state([
      doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
      doc(2, "CLEAN", "VERIFIED"),
    ]);
    expect(row?.current?.version).toBe(2);
    expect(row?.state).toBe("VERIFIED");
  });
  it("flags a superseded version newer than or equal to the active version", () => {
    expect(state([
      doc(1, "CLEAN", "VERIFIED"),
      doc(2, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
    ])?.state).toBe("CONFLICT");
    expect(state([
      doc(2, "CLEAN", "VERIFIED"),
      doc(2, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
    ])?.state).toBe("CONFLICT");
    expect(state([
      doc(2, "CLEAN", "VERIFIED"),
      doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
    ])?.state).toBe("VERIFIED");
  });
  it("flags duplicate historical version numbers even when the active version is newer", () => {
    expect(state([
      doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
      doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
      doc(2, "CLEAN", "VERIFIED"),
    ])?.state).toBe("CONFLICT");
    expect(state([
      doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
      doc(2, "CLEAN", "VERIFIED"),
    ])?.state).toBe("VERIFIED");
  });
  it("reports duplicate superseded-only history as a conflict, not a missing category", () => {
    const rows = documentChecklistRows("INDIVIDUAL", [
      doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
      doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z"),
    ]);
    const row = rows.find((item) => item.category === "premises_plan");
    expect(row?.current).toBeNull();
    expect(row?.state).toBe("CONFLICT");
    const summary = documentChecklistSummary(rows);
    expect(summary.conflicts).toBe(1);
    expect(summary.attentionRows.map((item) => item.category)).toEqual(["premises_plan"]);
    expect(summary.missing.some((item) => item.category === "premises_plan")).toBe(false);
  });
  it("ignores invalid version numbers and superseded records", () => {
    expect(state([doc(0, "CLEAN", "VERIFIED")])?.state).toBe("MISSING");
    expect(state([doc(-1, "CLEAN", "VERIFIED")])?.state).toBe("MISSING");
    expect(state([doc(1.5, "CLEAN", "VERIFIED")])?.state).toBe("MISSING");
    expect(state([doc(1, "CLEAN", "VERIFIED", "2026-11-17T00:00:00Z")])?.state).toBe("MISSING");
  });
  it("hides company authority category for individual applicants", () => {
    expect(documentChecklistRows("INDIVIDUAL", []).some((row) => row.category === "company_authority")).toBe(false);
    expect(documentChecklistRows("COMPANY", []).some((row) => row.category === "company_authority")).toBe(true);
  });
});
