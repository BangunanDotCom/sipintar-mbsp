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
  it("rejects PDF magic prefixes with malformed version numbers", () => {
    for (const header of ["%PDF-x.7", "%PDF-1x7", "%PDF-1.x", "%PDF-"]) {
      const malformed = Buffer.from(header + "\\nexample");
      expect(() => validateDraftUpload(malformed.toString("base64"), "supporting", "application/pdf", 1))
        .toThrow("Jenis fail");
    }
  });
  it("rejects mismatched MIME claims and invalid base64", () => {
    expect(() => validateDraftUpload(pdf.toString("base64"), "supporting", "image/png", 1)).toThrow();
    expect(() => validateDraftUpload("%%%", "supporting", "application/pdf", 1)).toThrow();
  });
  it("rejects noncanonical base64 padding bits", () => {
    const canonical = pdf.toString("base64");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const paddingIndex = canonical.indexOf("=");
    expect(paddingIndex).toBeGreaterThan(0);
    const lastDataIndex = paddingIndex - 1;
    const original = alphabet.indexOf(canonical[lastDataIndex]);
    const noncanonical = canonical.slice(0, lastDataIndex) +
      alphabet[original ^ 1] + canonical.slice(lastDataIndex + 1);
    expect(Buffer.from(noncanonical, "base64").equals(pdf)).toBe(true);
    expect(() => validateDraftUpload(noncanonical, "supporting", "application/pdf", 1))
      .toThrow("tidak kanonik");
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
  it("rejects PNG dimensions outside the 31-bit specification limit", () => {
    for (const offset of [16, 20]) {
      const malformed = Buffer.from(png);
      malformed.writeUInt32BE(0x80000000, offset);
      expect(() => validateDraftUpload(malformed.toString("base64"), "photo", "image/png", 1))
        .toThrow("Jenis fail");
    }
  });
  it("rejects unsupported PNG IHDR bit depth, color type and compression settings", () => {
    const cases: Array<[number, number]> = [
      [24, 4],  // Truecolor cannot use four-bit samples.
      [25, 5],  // Reserved PNG color type.
      [26, 1],  // Compression method must be zero.
      [27, 1],  // Filter method must be zero.
      [28, 2],  // Interlace method must be zero or one.
    ];
    for (const [offset, value] of cases) {
      const malformed = Buffer.from(png);
      malformed[offset] = value;
      expect(() => validateDraftUpload(malformed.toString("base64"), "photo", "image/png", 1))
        .toThrow("Jenis fail");
    }
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
