import { inspectDemoHost } from "./demo-host-config.mjs";

export function syntheticPortalDatabase(env = process.env) {
  if (env.STAYLINK_DEMO_HOST === "true") {
    const result = inspectDemoHost(env, { requireKit: false });
    return result.failures.length ? null : result.database;
  }
  if (
    env.STAYLINK_SYNTHETIC_PORTAL !== "true" ||
    !["test", "development"].includes(env.NODE_ENV ?? "") ||
    !env.DATABASE_URL ||
    env.DATABASE_URL !== env.TEST_DATABASE_URL
  )
    return null;
  try {
    const url = new URL(env.DATABASE_URL);
    if (
      url.protocol !== "postgresql:" ||
      url.hostname !== "127.0.0.1" ||
      url.port !== "5432" ||
      url.search ||
      url.hash ||
      !/^\/staylink_issue(31|36|40|45|49|54|58)_[a-z0-9_]+_test$/.test(
        url.pathname,
      )
    )
      return null;
    return url.pathname.slice(1);
  } catch {
    return null;
  }
}
