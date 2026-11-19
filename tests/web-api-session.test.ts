import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("sends autosave with the token returned by a pending session refresh", async () => {
  let finishRefresh!: (response: Response) => void;
  const refreshResponse = new Promise<Response>((resolve) => {
    finishRefresh = resolve;
  });
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockReturnValueOnce(refreshResponse)
    .mockResolvedValueOnce(Response.json({ saved: true }));
  vi.stubGlobal("fetch", fetch);
  const { api } = await import("../apps/web/src/api");

  const refresh = api("/auth/me");
  const save = api("/application-drafts/test", "PATCH", {});
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

  finishRefresh(Response.json({ csrf: "refreshed-token" }));
  await refresh;
  await expect(save).resolves.toEqual({ saved: true });
  const [url, options] = fetch.mock.calls[1];
  expect(url).toBe("/api/application-drafts/test");
  expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe(
    "refreshed-token",
  );
});

it("waits for an in-flight mutation and does not replay a rejected write", async () => {
  let finishSave!: (response: Response) => void;
  const saveResponse = new Promise<Response>((resolve) => {
    finishSave = resolve;
  });
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ csrf: "login-token" }))
    .mockReturnValueOnce(saveResponse)
    .mockResolvedValueOnce(Response.json({ csrf: "next-token" }));
  vi.stubGlobal("fetch", fetch);
  const { api } = await import("../apps/web/src/api");

  await api("/auth/login", "POST", {});
  const save = api("/application-drafts/test", "PATCH", {});
  const rejected = expect(save).rejects.toMatchObject({ status: 403 });
  const refresh = api("/auth/me");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const [, options] = fetch.mock.calls[1];
  expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe("login-token");

  finishSave(Response.json({ message: "Forbidden" }, { status: 403 }));
  await rejected;
  await expect(refresh).resolves.toEqual({ csrf: "next-token" });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[2][0]).toBe("/api/auth/me");
});
