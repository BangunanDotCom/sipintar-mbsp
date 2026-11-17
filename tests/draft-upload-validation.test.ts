import { describe, expect, it } from "vitest";
import { validateDraftUpload } from "../apps/api/src/draft-upload-validation.js";

const pdf = Buffer.from("%PDF-1.7\nexample");
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from([0, 0, 0, 13]),
  Buffer.from("IHDR"),
  Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
  Buffer.alloc(4), // IHDR CRC placeholder: signature-only fixture, not a decoded image.
]);

describe("draft upload validation", () => {
  it("accepts PDF content only in PDF categories", () => {
    expect(validateDraftUpload(pdf.toString("base64"), "supporting", "application/pdf", 1).mimeType)
      .toBe("application/pdf");
    expect(() => validateDraftUpload(pdf.toString("base64"), "photo", "application/pdf", 1))
      .toThrow();
  });
  it("rejects mismatched MIME claims and invalid base64", () => {
    expect(() => validateDraftUpload(pdf.toString("base64"), "supporting", "image/png", 1)).toThrow();
    expect(() => validateDraftUpload("%%%", "supporting", "application/pdf", 1)).toThrow();
  });
  it("accepts PNG signature for photo category only", () => {
    expect(validateDraftUpload(png.toString("base64"), "photo", "image/png", 1).mimeType)
      .toBe("image/png");
    expect(() => validateDraftUpload(png.toString("base64"), "plan", "image/png", 1)).toThrow();
  });
  it("rejects truncated PNG headers and zero image dimensions", () => {
    const truncated = png.subarray(0, 24);
    expect(() => validateDraftUpload(truncated.toString("base64"), "photo", "image/png", 1)).toThrow();
    const zeroWidth = Buffer.from(png);
    zeroWidth.writeUInt32BE(0, 16);
    expect(() => validateDraftUpload(zeroWidth.toString("base64"), "photo", "image/png", 1)).toThrow();
  });
  it("rejects empty files and oversized content", () => {
    expect(() => validateDraftUpload("", "supporting", "application/pdf", 1)).toThrow();
    const oversized = Buffer.concat([pdf, Buffer.alloc(1024 * 1024)]);
    expect(() => validateDraftUpload(oversized.toString("base64"), "supporting", "application/pdf", 1)).toThrow();
  });
  it("enforces the hard category ceiling", () => {
    expect(() => validateDraftUpload(pdf.toString("base64"), "supporting", "application/pdf", 51)).toThrow();
  });
});
