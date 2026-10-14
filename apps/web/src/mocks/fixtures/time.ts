/** Fixture dates relative to today, so preview data always looks current. */
const DAY = 86_400_000;

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/** `YYYY-MM-DD` in local time, `days` from today (negative for the past). */
export function dateFromToday(days: number): string {
  const date = new Date(startOfToday().getTime() + days * DAY);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** ISO timestamp `days` from today at a local wall-clock time. */
export function atFromToday(days: number, hours = 9, minutes = 0): string {
  const date = new Date(startOfToday().getTime() + days * DAY);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

/** ISO timestamp `hours` before now. */
export function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}
