export function inspectDemoHost(
  env?: NodeJS.ProcessEnv,
  options?: { requireKit?: boolean },
): { failures: string[]; database: string | null; origin: string | null };
