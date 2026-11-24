// Month and day Historia shows when opened again (kept outside the component so it survives navigation).
export const historyView: { last: { year: number; month: number; day: number | null } | null } = { last: null };

/** Opens Historia on a given day next time (used by the yearly calendar for days with several workouts). */
export function openHistoryDay(year: number, month: number, day: number): void {
  historyView.last = { year, month, day };
}
