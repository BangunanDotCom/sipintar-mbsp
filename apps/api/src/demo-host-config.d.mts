export function inspectDemoHost(
  env?: NodeJS.ProcessEnv,
  options?: { requireKit?: boolean },
): { failures: string[]; database: string | null; origin: string | null };
export function isPersonalDemoDatabase(value: unknown): boolean;
export function personalDistrictAssignments(env: NodeJS.ProcessEnv): readonly {
  district: "SPU" | "SPT" | "SPS";
  id: string | undefined;
}[];
