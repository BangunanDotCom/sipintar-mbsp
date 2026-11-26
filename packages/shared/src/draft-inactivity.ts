export const draftInactivityDays = 60;

export function draftInactivity(updatedAt: Date, now: Date) {
  const reviewAt = new Date(
    updatedAt.getTime() + draftInactivityDays * 86_400_000,
  );
  return { reviewAt: reviewAt.toISOString(), reviewDue: now >= reviewAt };
}
