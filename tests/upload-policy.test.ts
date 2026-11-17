import { describe, expect, it } from "vitest";
import { delegationLimitMiB, validateDelegationPdf, uploadLimitMiB, uploadCategoryForKey } from "../apps/api/src/upload-policy.js";

describe("configurable delegation PDF upload", () => {
  it("uses safe defaults for missing and invalid administrator settings", () => {
    expect(delegationLimitMiB(undefined)).toBe(10);
    expect(delegationLimitMiB("20")).toBe(10);
    expect(delegationLimitMiB(0)).toBe(10);
    expect(delegationLimitMiB(21)).toBe(10);
    expect(delegationLimitMiB(2.5)).toBe(10);
    expect(delegationLimitMiB(20)).toBe(20);
    expect(delegationLimitMiB(1)).toBe(1);
  });
  it("applies per-category ceilings and defaults", () => {
    expect(uploadLimitMiB("plan", undefined)).toBe(50);
    expect(uploadLimitMiB("plan", 100)).toBe(100);
    expect(uploadLimitMiB("plan", 101)).toBe(50);
    expect(uploadLimitMiB("photo", 20)).toBe(20);
    expect(uploadLimitMiB("supporting", 40)).toBe(40);
    expect(uploadCategoryForKey("upload_plan_mib")).toBe("plan");
    expect(uploadCategoryForKey("unrelated_setting")).toBeUndefined();
  });
  it("accepts a valid PDF signature within the configured limit", () => {
    const data = Buffer.from("%PDF-1.7\n%%EOF\n").toString("base64");
    expect(validateDelegationPdf(data, 1).subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("rejects malformed base64 and non-PDF content", () => {
    expect(() => validateDelegationPdf("%%%!", 1)).toThrow();
    expect(() => validateDelegationPdf(Buffer.from("not a pdf").toString("base64"), 1)).toThrow();
  });
  it("rejects noncanonical base64 encoding even when bytes decode correctly", () => {
    const bytes = Buffer.from("%PDF-1.7\\nexample");
    const canonical = bytes.toString("base64");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const last = canonical.indexOf("=") - 1;
    const altered = canonical.slice(0, last) +
      alphabet[alphabet.indexOf(canonical[last]) ^ 1] + canonical.slice(last + 1);
    expect(Buffer.from(altered, "base64").equals(bytes)).toBe(true);
    expect(() => validateDelegationPdf(altered, 1)).toThrow("tidak kanonik");
  });
  it("rejects invalid PDF version headers and empty documents", () => {
    for (const data of ["", "%PDF-x.7\\nexample", "%PDF-1x7\\nexample"]) {
      expect(() => validateDelegationPdf(Buffer.from(data).toString("base64"), 1)).toThrow();
    }
  });
  it("rejects invalid administrative limits", () => {
    const data = Buffer.from("%PDF-1.7\\nexample").toString("base64");
    for (const limit of [0, 21, 1.5, Number.NaN]) {
      expect(() => validateDelegationPdf(data, limit)).toThrow("Had saiz");
    }
  });
  it("rejects a file exceeding the administrator limit", () => {
    const data = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(1024 * 1024)]).toString("base64");
    expect(() => validateDelegationPdf(data, 1)).toThrow("melebihi had");
  });
});
