import { createHmac, createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { identificationSchema } from "../../../packages/shared/src/index.js";
/** Stable independent secret: rotate only with a controlled re-encryption/re-index plan. */
function identityKey() {
  const raw = process.env.IDENTITY_DATA_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw))
    throw Object.assign(
      Error("Pendaftaran belum dikonfigurasi. Hubungi pentadbir."),
      { statusCode: 503, code: "REGISTRATION_NOT_CONFIGURED" },
    );
  return Buffer.from(raw, "hex");
}
export function protectIdentification(input: string) {
  const value = identificationSchema.parse(input),
    key = identityKey();
  const indexKey = Buffer.from(
    hkdfSync("sha256", key, "STAYLink MBSP identity v1", "lookup", 32),
  );
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  return {
    identificationHash: createHmac("sha256", indexKey)
      .update(value)
      .digest("hex"),
    identificationEncrypted: [
      "v1",
      iv.toString("hex"),
      cipher.update(value, "utf8", "hex") + cipher.final("hex"),
      cipher.getAuthTag().toString("hex"),
    ].join("."),
    identificationMasked: "••••" + value.slice(-4),
  };
}
