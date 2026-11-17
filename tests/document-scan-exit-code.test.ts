import { describe, expect, it } from "vitest";
import { documentScanBatchExitCode } from "../apps/api/src/document-scan-exit-code.js";

describe("document scan batch exit code", () => {
  it("returns success for an empty batch", () => {
    expect(documentScanBatchExitCode({
      examined: 0, clean: 0, infected: 0, failed: 0, skipped: 0,
    })).toBe(0);
  });
  it("does not treat malware detection as scanner failure", () => {
    expect(documentScanBatchExitCode({
      examined: 3, clean: 1, infected: 1, failed: 0, skipped: 1,
    })).toBe(0);
  });
  it("returns failure when any scan failed", () => {
    expect(documentScanBatchExitCode({
      examined: 3, clean: 1, infected: 1, failed: 1, skipped: 0,
    })).toBe(1);
  });
  it("rejects inconsistent or negative counters", () => {
    expect(() => documentScanBatchExitCode({
      examined: 2, clean: 1, infected: 0, failed: 0, skipped: 0,
    })).toThrow("tidak sepadan");
    expect(() => documentScanBatchExitCode({
      examined: 0, clean: -1, infected: 0, failed: 0, skipped: 1,
    })).toThrow("tidak sah");
  });
});
