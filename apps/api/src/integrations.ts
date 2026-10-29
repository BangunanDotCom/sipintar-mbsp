/** Contracts only. No official integration is enabled in Phase 1. */
export interface IdentityProvider {
  authenticate(
    input: unknown,
  ): Promise<{ subject: string; provider: "local" | "mbsp-sso" }>;
}
export interface AiPreCheck {
  review(
    applicationId: string,
  ): Promise<{ findings: unknown[]; requiresHumanReview: true }>;
}
export interface PaymentGateway {
  createBill(
    applicationId: string,
    unitCount: number,
  ): Promise<{ billId: string; amount: number }>;
  verifyWebhook(rawBody: Uint8Array, signature: string): Promise<boolean>;
}
export interface GisResolver {
  resolveArea(
    latitude: number,
    longitude: number,
  ): Promise<{ areaId: string } | { status: "PERLU PENENTUAN PPSK" }>;
}
export interface DigitalSignature {
  sign(
    documentVersionId: string,
    signerUserId: string,
  ): Promise<{ artifactId: string; verificationUrl: string }>;
}
export interface WhatsAppChannel {
  send(
    recipient: string,
    template: string,
    parameters: Record<string, string>,
  ): Promise<void>;
}
export class IntegrationUnavailableError extends Error {
  constructor(name: string) {
    super(`${name}: belum dikonfigurasi / menunggu kelulusan ICT MBSP.`);
  }
}
