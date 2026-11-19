import { expect, it } from "vitest";
import { syntheticPortalDatabase } from "../apps/api/src/synthetic-portal-gate";

const url = "postgresql://fixture@127.0.0.1:5432/staylink_issue31_api_test";
const eligible = {
  NODE_ENV: "test",
  STAYLINK_SYNTHETIC_PORTAL: "true",
  DATABASE_URL: url,
  TEST_DATABASE_URL: url,
};

it("requires an explicit opt-in and a dedicated local test database", () => {
  expect(syntheticPortalDatabase(eligible)).toBe("staylink_issue31_api_test");
  const uat = url.replace("issue31_api", "issue36_browser");
  expect(
    syntheticPortalDatabase({
      ...eligible,
      DATABASE_URL: uat,
      TEST_DATABASE_URL: uat,
    }),
  ).toBe("staylink_issue36_browser_test");
  const acceptance = url.replace("issue31_api", "issue40_browser");
  expect(
    syntheticPortalDatabase({
      ...eligible,
      DATABASE_URL: acceptance,
      TEST_DATABASE_URL: acceptance,
    }),
  ).toBe("staylink_issue40_browser_test");
  for (const override of [
    { STAYLINK_SYNTHETIC_PORTAL: "false" },
    { NODE_ENV: "production" },
    { TEST_DATABASE_URL: "postgresql://localhost/staylink_test" },
  ])
    expect(syntheticPortalDatabase({ ...eligible, ...override })).toBeNull();
  for (const unsafe of [
    "bad URL",
    url.replace("127.0.0.1", "db.example.test"),
    url.replace("staylink_issue31_api_test", "staylink"),
    url + "?host=example.test",
  ])
    expect(
      syntheticPortalDatabase({
        ...eligible,
        DATABASE_URL: unsafe,
        TEST_DATABASE_URL: unsafe,
      }),
    ).toBeNull();
});
