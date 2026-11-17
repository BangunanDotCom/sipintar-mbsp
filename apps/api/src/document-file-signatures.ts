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
    const width = content.readUInt32BE(16);
    const height = content.readUInt32BE(20);
    const bitDepth = content[24];
    const colorType = content[25];
    const supportedDepths: Record<number, readonly number[]> = {
      0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8],
      4: [8, 16], 6: [8, 16],
    };
    return width > 0 && height > 0 &&
      (supportedDepths[colorType]?.includes(bitDepth) ?? false) &&
      content[26] === 0 && content[27] === 0 &&
      (content[28] === 0 || content[28] === 1);
  }
  return false;
}
