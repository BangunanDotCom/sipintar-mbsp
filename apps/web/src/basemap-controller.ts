import type { MapProvider } from "./map-config";
export type BasemapState = {
  phase: "loading" | "ready" | "unavailable";
  provider: MapProvider;
  reason?: "network-or-provider" | "unsupported" | "configuration" | "timeout";
  fallback: boolean;
};
export type BasemapEvents = {
  active: () => boolean;
  loading: () => void;
  ready: () => void;
  failed: (reason?: BasemapState["reason"]) => void;
};
export type BasemapMount = (
  provider: MapProvider,
  events: BasemapEvents,
) => Promise<() => void>;
/** One primary and at most one alternative per attempt; retries require a user action. */
export function createBasemapController(
  mount: BasemapMount,
  update: (state: BasemapState) => void,
  fallback: boolean,
  timeoutMs = 12000,
) {
  let generation = 0,
    disposed = false,
    cleanup: (() => void) | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    clearTimeout(timer);
    cleanup?.();
    cleanup = undefined;
  }
  function start(provider: MapProvider) {
    const current = ++generation;
    stop();
    const active = () => !disposed && current === generation;
    const emit = (
      phase: BasemapState["phase"],
      reason?: BasemapState["reason"],
    ) => {
      if (active())
        update({ phase, provider, reason, fallback: provider !== "primary" });
    };
    const failed = (reason: BasemapState["reason"] = "network-or-provider") => {
      if (!active()) return;
      clearTimeout(timer);
      if (provider === "primary" && fallback) start("openfreemap");
      else {
        ++generation;
        stop();
        update({
          phase: "unavailable",
          provider,
          reason,
          fallback: provider !== "primary",
        });
      }
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => failed("timeout"), timeoutMs);
    };
    emit("loading");
    arm();
    // Providers may emit synchronous events before their asynchronous mount returns.
    void mount(provider, {
      active,
      loading: () => {
        if (active()) {
          emit("loading");
          arm();
        }
      },
      ready: () => {
        if (active()) {
          clearTimeout(timer);
          emit("ready");
        }
      },
      failed,
    })
      .then((remove) => {
        if (active()) cleanup = remove;
        else remove();
      })
      .catch(() => failed("unsupported"));
  }
  start("primary");
  return {
    retry: () => {
      if (!disposed) start("primary");
    },
    dispose: () => {
      disposed = true;
      ++generation;
      stop();
    },
  };
}
