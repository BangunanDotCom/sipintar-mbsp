import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { trainingLetterTemplate } from "../../../packages/shared/src/synthetic-completion-contract.js";

export async function trainingLetterPdf(text: string, signedAt: number) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const date = new Date(signedAt);
  pdf.setTitle("STAYLink MBSP - Surat keputusan latihan");
  pdf.setSubject(trainingLetterTemplate);
  pdf.setCreationDate(date);
  pdf.setModificationDate(date);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const charset = new Set(font.getCharacterSet());
  const fontSize = 10;
  const margin = 45;
  const lineSpacing = 15;
  let page = pdf.addPage();
  let y = page.getHeight() - margin;
  const width = page.getWidth() - 2 * margin;

  function draw(line: string) {
    if (y < margin) {
      page = pdf.addPage();
      y = page.getHeight() - margin;
    }
    page.drawText(line, {
      x: margin,
      y,
      size: fontSize,
      font,
      color: rgb(0.08, 0.14, 0.25),
    });
    y -= lineSpacing;
  }

  for (const paragraph of text.trimEnd().split("\n")) {
    const printable = Array.from(paragraph.normalize("NFC"), (char) =>
      charset.has(char.codePointAt(0)!) ? char : "?",
    ).join("");
    let line = "";
    for (const character of printable) {
      if (font.widthOfTextAtSize(line + character, fontSize) > width) {
        const space = line.lastIndexOf(" ");
        draw(space > 0 ? line.slice(0, space) : line);
        line = space > 0 ? line.slice(space + 1) : "";
      }
      line += character;
    }
    draw(line);
  }
  return Buffer.from(await pdf.save());
}

const resolveFont = createRequire(import.meta.url).resolve;
const subsets = [
  "latin",
  "latin-ext",
  "vietnamese",
  "greek",
  "cyrillic",
  "devanagari",
];
let fontFiles: Promise<Buffer[]> | undefined;

export class UnsupportedTrainingGlyph extends Error {}

export async function unicodeTrainingPdf(
  text: string,
  timestamp: number,
  template: string,
) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(fontkit);
  pdf.setTitle("STAYLink MBSP - Dokumen latihan");
  pdf.setSubject(template);
  pdf.setCreationDate(new Date(timestamp));
  pdf.setModificationDate(new Date(timestamp));
  const fonts = await Promise.all(
    (
      await (fontFiles ??= Promise.all(
        subsets.map((subset) =>
          readFile(
            resolveFont(
              `@fontsource/noto-sans/files/noto-sans-${subset}-400-normal.woff`,
            ),
          ),
        ),
      ))
    ).map((file) => pdf.embedFont(file, { subset: true })),
  );
  const coverage = fonts.map((font) => new Set(font.getCharacterSet()));
  const segmenter = new Intl.Segmenter("ms", { granularity: "grapheme" });
  const size = 10;
  const margin = 45;
  let page = pdf.addPage();
  let y = page.getHeight() - margin;
  const availableWidth = page.getWidth() - 2 * margin;

  for (const paragraph of text.trimEnd().split(/\r?\n/)) {
    let x = margin;
    let line: { text: string; font: (typeof fonts)[number]; width: number }[] =
      [];
    let width = 0;
    const flush = () => {
      if (y < margin) {
        page = pdf.addPage();
        y = page.getHeight() - margin;
      }
      for (const run of line) {
        page.drawText(run.text, {
          x,
          y,
          size,
          font: run.font,
          color: rgb(0.08, 0.14, 0.25),
        });
        x += run.width;
      }
      y -= 15;
      x = margin;
      width = 0;
      line = [];
    };
    for (const { segment } of segmenter.segment(
      paragraph.normalize("NFC").replaceAll("\t", " "),
    )) {
      const characters = [...segment].map((c) => c.codePointAt(0)!);
      const index = coverage.findIndex((set) =>
        characters.every((c) => set.has(c)),
      );
      if (index < 0)
        throw new UnsupportedTrainingGlyph(
          "Aksara di luar sokongan fon PDF latihan.",
        );
      const font = fonts[index];
      let run = line.at(-1);
      let runWidth = font.widthOfTextAtSize(
        run?.font === font ? run.text + segment : segment,
        size,
      );
      if (
        width + runWidth - (run?.font === font ? run.width : 0) >
        availableWidth
      ) {
        flush();
        run = undefined;
        runWidth = font.widthOfTextAtSize(segment, size);
      }
      if (run?.font === font) {
        width += runWidth - run.width;
        run.text += segment;
        run.width = runWidth;
      } else {
        line.push({ text: segment, font, width: runWidth });
        width += runWidth;
      }
    }
    flush();
  }
  return Buffer.from(await pdf.save());
}

export function trainingPdfDigest(bytes: Buffer) {
  return `sha-256=:${createHash("sha256").update(bytes).digest("base64")}:`;
}
