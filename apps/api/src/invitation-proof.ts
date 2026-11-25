import { timingSafeEqual } from "node:crypto";
import { hash } from "./core.js";
import type { DelegationMetadata } from "./delegation-evidence.js";

export type InvitationProof = Pick<
  DelegationMetadata,
  "id" | "version" | "sha256" | "scanValidUntil" | "validUntil"
>;

// Only the token hash is persisted. The suffix commits to the company, issuer
// membership, recipient and the mandate or scan verdict used at issuance.
export function boundToken(
  nonce: string,
  rep: { id: string; companyId: string; authorityType: string },
  recipientId: string,
  proof: InvitationProof | null,
) {
  const context = proof
    ? [
        "DELEGATION",
        proof.id,
        proof.version,
        proof.sha256,
        proof.scanValidUntil,
      ]
    : ["DIRECT"];
  return (
    nonce +
    hash(
      JSON.stringify([
        "staylink-invitation-v2",
        nonce,
        rep.id,
        rep.companyId,
        rep.authorityType,
        recipientId,
        context,
      ]),
    ).slice(0, 32)
  );
}

export function matchesInvitationToken(
  raw: string,
  rep: Parameters<typeof boundToken>[1],
  recipientId: string,
  proof: InvitationProof | null,
) {
  const expected = boundToken(raw.slice(0, 32), rep, recipientId, proof);
  return timingSafeEqual(Buffer.from(raw, "hex"), Buffer.from(expected, "hex"));
}

export function invitationProofCurrent(
  proof: InvitationProof | null,
  now: Date,
) {
  return (
    !proof ||
    (!!proof.scanValidUntil &&
      proof.scanValidUntil > now &&
      (!proof.validUntil || proof.validUntil > now))
  );
}

export const acceptanceNotice = {
  type: "COMPANY",
  title: "Perwakilan syarikat diterima",
  message:
    "Anda kini boleh mengurus profil syarikat yang diwakili. Pengesahan rasmi dokumen menunggu semakan pegawai MBSP.",
};
