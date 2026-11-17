import { describe, expect, it } from "vitest";
import { configuredMalwareScanner } from "../apps/api/src/malware-scanner-config.js";
import { ClamAvScanner } from "../apps/api/src/clamav-scanner.js";
import { DisabledMalwareScanner } from "../apps/api/src/document-malware-scanner.js";

describe("ClamAV configuration", () => {
  it("is disabled by default", () => {
    expect(configuredMalwareScanner({})).toBeInstanceOf(DisabledMalwareScanner);
  });
  it("requires an explicit enabled flag", () => {
    expect(configuredMalwareScanner({
      STAYLINK_CLAMAV_ENABLED: "false", STAYLINK_CLAMAV_HOST: "clamav.internal",
    })).toBeInstanceOf(DisabledMalwareScanner);
  });
  it("rejects missing host and invalid port", () => {
    expect(() => configuredMalwareScanner({ STAYLINK_CLAMAV_ENABLED: "true" })).toThrow();
    expect(() => configuredMalwareScanner({
      STAYLINK_CLAMAV_ENABLED: "true",
      STAYLINK_CLAMAV_HOST: "clamav.internal",
      STAYLINK_CLAMAV_PORT: "0",
    })).toThrow();
  });
  it("constructs adapter only with explicit valid configuration", () => {
    expect(configuredMalwareScanner({
      STAYLINK_CLAMAV_ENABLED: "true",
      STAYLINK_CLAMAV_HOST: "clamav.internal",
      STAYLINK_CLAMAV_PORT: "3310",
    })).toBeInstanceOf(ClamAvScanner);
  });
  it("rejects empty scan payload before network connection", async () => {
    await expect(new ClamAvScanner("127.0.0.1").scan(Buffer.alloc(0))).rejects.toThrow();
  });
});
