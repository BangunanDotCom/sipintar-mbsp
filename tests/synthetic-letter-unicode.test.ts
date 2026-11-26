import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  trainingPdfDigest,
  unicodeTrainingPdf,
  UnsupportedTrainingGlyph,
} from "../apps/api/src/synthetic-letter-pdf";
const now = Date.UTC(2026, 10, 26);
it("embeds Unicode fonts and produces repeatable fixed-version bytes", async () => {
  const text = "STAYLink LATIHAN\nEncik Łukasz · Nguyễn · Reykjavík · Αθήνα";
  const first = await unicodeTrainingPdf(text, now, "test-version");
  const second = await unicodeTrainingPdf(text, now, "test-version");
  expect(first).toEqual(second);
  expect((await PDFDocument.load(first)).getPageCount()).toBe(1);
  expect(trainingPdfDigest(first)).toBe(trainingPdfDigest(second));
  await expect(
    unicodeTrainingPdf("漢字", now, "test-version"),
  ).rejects.toBeInstanceOf(UnsupportedTrainingGlyph);
});
