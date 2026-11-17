// Structural checks only; they do not replace antivirus scanning or file parsing.
export function matchesDeclaredFileSignature(content: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf")
    return content.length >= 8 && content.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/jpeg")
    return content.length >= 4 && content[0] === 0xff && content[1] === 0xd8 &&
      content[2] === 0xff && content[content.length - 2] === 0xff &&
      content[content.length - 1] === 0xd9;
  if (mimeType === "image/png") {
    if (content.length < 33 ||
        !content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        content.readUInt32BE(8) !== 13 ||
        content.subarray(12, 16).toString("ascii") !== "IHDR") return false;
    return content.readUInt32BE(16) > 0 && content.readUInt32BE(20) > 0;
  }
  return false;
}
