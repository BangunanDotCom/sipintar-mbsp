import { describe, expect, it } from "vitest";
import { configuredDocumentStore } from "../apps/api/src/document-store-config.js";
import { DisabledDocumentStore } from "../apps/api/src/private-document-store.js";
import { LocalQuarantineDocumentStore } from "../apps/api/src/local-quarantine-document-store.js";

describe("document storage configuration", () => {
  it("disables document storage by default", () => {
    expect(configuredDocumentStore({})).toBeInstanceOf(DisabledDocumentStore);
  });
  it("rejects unknown storage providers", () => {
    expect(() => configuredDocumentStore({ STAYLINK_DOCUMENT_STORE: "s3" })).toThrow();
  });
  it("rejects local storage in production even if explicitly enabled", () => {
    expect(() => configuredDocumentStore({
      NODE_ENV: "production",
      STAYLINK_DOCUMENT_STORE: "local",
      STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED: "true",
      STAYLINK_LOCAL_DOCUMENT_ROOT: "/tmp/staylink",
    })).toThrow("pembangunan atau ujian");
  });
  it.each([undefined, "", "Production", "staging", "preview"])(
    "fails closed for unsupported NODE_ENV %s",
    (nodeEnv) => {
      expect(() => configuredDocumentStore({
        NODE_ENV: nodeEnv,
        STAYLINK_DOCUMENT_STORE: "local",
        STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED: "true",
        STAYLINK_LOCAL_DOCUMENT_ROOT: "/tmp/staylink",
      })).toThrow("pembangunan atau ujian");
    },
  );
  it("requires explicit opt-in and directory", () => {
    expect(() => configuredDocumentStore({
      NODE_ENV: "test", STAYLINK_DOCUMENT_STORE: "local",
      STAYLINK_LOCAL_DOCUMENT_ROOT: "/tmp/staylink",
    })).toThrow();
    expect(() => configuredDocumentStore({
      NODE_ENV: "test", STAYLINK_DOCUMENT_STORE: "local",
      STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED: "true",
    })).toThrow();
  });
  it("permits local adapter only in non-production with explicit configuration", () => {
    expect(configuredDocumentStore({
      NODE_ENV: "test", STAYLINK_DOCUMENT_STORE: "local",
      STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED: "true",
      STAYLINK_LOCAL_DOCUMENT_ROOT: "/tmp/staylink",
    })).toBeInstanceOf(LocalQuarantineDocumentStore);
  });
});
