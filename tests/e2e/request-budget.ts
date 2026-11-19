import { expect, type APIRequestContext } from "@playwright/test";

export async function awaitDraftRequestBudget(
  request: APIRequestContext,
  minimum = 50,
) {
  await expect
    .poll(
      async () => {
        const response = await request.get("/api/health");
        return Number(response.headers()["x-ratelimit-remaining"] || 0);
      },
      {
        timeout: 90000,
        intervals: [1000, 5000, 10000],
        message: "Waiting for the development API request budget to reset",
      },
    )
    .toBeGreaterThanOrEqual(minimum);
}
