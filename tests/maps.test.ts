import { describe, it, expect, vi, afterEach } from "vitest";
import { readMapConfig, OSM_URL } from "../apps/web/src/map-config";
import {
  createBasemapController,
  type BasemapEvents,
  type BasemapState,
} from "../apps/web/src/basemap-controller";
afterEach(() => vi.useRealTimers());
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
describe("basemap configuration and bounded fallback", () => {
  it("uses correct HTTPS OSM and an independent attributed alternative", () => {
    const c = readMapConfig({});
    expect(c.primaryUrl).toBe(OSM_URL);
    expect(c.fallback).toBe("openfreemap");
    expect(c.issue).toBeUndefined();
    expect(c.primaryAttribution).toContain("openstreetmap.org/copyright");
  });
  it("requires a valid HTTPS XYZ custom source and its attribution", () => {
    for (const value of [
      "http://example.test/{z}/{x}/{y}.png",
      "javascript:alert(1)",
      "https://example.test/no-tiles",
      "https://a:b@example.test/{z}/{x}/{y}.png",
    ])
      expect(
        readMapConfig({
          VITE_MAP_PRIMARY_URL: value,
          VITE_MAP_PRIMARY_ATTRIBUTION: "Example",
        }).issue,
      ).toBeTruthy();
    expect(
      readMapConfig({
        VITE_MAP_PRIMARY_URL: "https://example.test/{z}/{x}/{y}.png",
      }).issue,
    ).toBeTruthy();
    expect(readMapConfig({ VITE_MAP_FALLBACK: "unknown" }).issue).toBeTruthy();
  });
  it("escapes attribution configuration and can disable the alternative", () => {
    const c = readMapConfig({
      VITE_MAP_PRIMARY_URL: "https://example.test/{z}/{x}/{y}.png",
      VITE_MAP_PRIMARY_ATTRIBUTION: "<img src=x onerror=alert(1)>",
      VITE_MAP_FALLBACK: "none",
    });
    expect(c.issue).toBeUndefined();
    expect(c.primaryAttribution).not.toContain("<img");
    expect(c.fallback).toBe("none");
  });
  it("switches once after failure and ignores late events from the old layer", async () => {
    const events: BasemapEvents[] = [],
      removed = [vi.fn(), vi.fn()],
      states: BasemapState[] = [];
    const c = createBasemapController(
      async (_, e) => {
        const i = events.push(e) - 1;
        return removed[i];
      },
      (s) => states.push(s),
      true,
    );
    await settle();
    events[0].failed();
    await settle();
    expect(removed[0]).toHaveBeenCalledTimes(1);
    events[1].ready();
    events[0].ready();
    expect(states.at(-1)).toMatchObject({
      phase: "ready",
      provider: "openfreemap",
    });
    events[1].failed();
    await settle();
    expect(states.at(-1)?.phase).toBe("unavailable");
    expect(events).toHaveLength(2);
    c.dispose();
  });
  it("recovers after explicit retry without retaining sticky errors", async () => {
    const events: BasemapEvents[] = [],
      states: BasemapState[] = [];
    const c = createBasemapController(
      async (_, e) => {
        events.push(e);
        return () => {};
      },
      (s) => states.push(s),
      false,
    );
    await settle();
    events[0].failed();
    expect(states.at(-1)?.phase).toBe("unavailable");
    c.retry();
    await settle();
    events[1].ready();
    expect(states.at(-1)).toMatchObject({
      phase: "ready",
      provider: "primary",
    });
    c.dispose();
  });
  it("bounds both provider timeouts and never enters an automatic retry loop", async () => {
    vi.useFakeTimers();
    const calls = vi.fn(async () => () => {}),
      states: BasemapState[] = [];
    const c = createBasemapController(calls, (s) => states.push(s), true, 100);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toMatchObject({
      phase: "unavailable",
      reason: "timeout",
    });
    c.dispose();
  });
  it("cleans up a late asynchronous mount after unmount", async () => {
    const remove = vi.fn();
    let resolve!: (remove: () => void) => void;
    const update = vi.fn();
    const c = createBasemapController(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
      update,
      true,
    );
    c.dispose();
    resolve(remove);
    await settle();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it("allows a newly loaded viewport to recover and disposes timers/listeners", async () => {
    vi.useFakeTimers();
    let events!: BasemapEvents;
    const remove = vi.fn(),
      update = vi.fn();
    const c = createBasemapController(
      async (_, e) => {
        events = e;
        return remove;
      },
      update,
      true,
      100,
    );
    await settle();
    events.ready();
    await vi.advanceTimersByTimeAsync(500);
    expect(update.mock.calls.at(-1)?.[0].phase).toBe("ready");
    events.loading();
    events.ready();
    c.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
