import { describe, expect, it } from "vitest";
import { delegationLimitMiB, validateDelegationPdf } from "../apps/api/src/upload-policy.js";

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
  it("accepts a valid PDF signature within the configured limit", () => {
    const data = Buffer.from("%PDF-1.7\n%%EOF\n").toString("base64");
    expect(validateDelegationPdf(data, 1).subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("rejects malformed base64 and non-PDF content", () => {
    expect(() => validateDelegationPdf("%%%!", 1)).toThrow();
    expect(() => validateDelegationPdf(Buffer.from("not a pdf").toString("base64"), 1)).toThrow();
  });
  it("rejects a file exceeding the administrator limit", () => {
    const data = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(1024 * 1024)]).toString("base64");
    expect(() => validateDelegationPdf(data, 1)).toThrow("melebihi had");
  });
});
