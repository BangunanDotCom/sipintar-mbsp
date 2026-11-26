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
