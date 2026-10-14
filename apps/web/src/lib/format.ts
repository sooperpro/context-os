const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormatter.format(date);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

/** "2026-03-04" (from an <input type="date">) → ISO datetime at UTC midnight, or undefined. */
export function dateInputToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

/** Up to two initials from a display name, for avatars. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const DAY_MS = 86_400_000;

/** A `YYYY-MM-DD` date as local midnight (`new Date("2026-10-16")` would be UTC and can show the day before). */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

const toDate = (value: string | Date) =>
  value instanceof Date
    ? value
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? parseDateOnly(value)
      : new Date(value);

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole days from today to `value` (negative in the past). */
export function daysFromToday(value: string | Date, now = new Date()): number {
  return Math.round((startOfDay(toDate(value)) - startOfDay(now)) / DAY_MS);
}

/** "Oct 16". */
export function formatShortDate(value: string | Date): string {
  return toDate(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Fri". */
export function formatWeekday(value: string | Date): string {
  return toDate(value).toLocaleDateString(undefined, { weekday: "short" });
}

/** "Fri, Oct 16". */
export function formatDayDate(value: string | Date): string {
  return toDate(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Wednesday, October 14", the dashboards' kicker. */
export function formatLongDate(value: string | Date = new Date()): string {
  return toDate(value).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** "2:00 PM". */
export function formatTime(value: string | Date): string {
  return toDate(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Just now", "3h ago", "Yesterday", "Oct 9": how recent a change is. */
export function formatRelativeTime(value: string | Date, now = new Date()): string {
  const date = toDate(value);
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const days = -daysFromToday(date, now);
  if (days === 0) return `${Math.round(minutes / 60)}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatShortDate(date);
}

/** "Today", "Tomorrow", "In 3 days", "Yesterday", "5 days ago". */
export function formatDayDistance(value: string | Date, now = new Date()): string {
  const days = daysFromToday(value, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** "1m 12s", "48s"; "—" for zero. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

/** 0.873 → "87%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** "Good morning" until noon, "Good afternoon" until 6 PM, then "Good evening". */
export function greetingFor(now = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** "GMT+1" for an IANA zone such as "Europe/London", at the current date. */
export function formatTimeZone(timeZone: string, now = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((entry) => entry.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** "Starts Oct 19", "Joined Oct 5, 2026" (recent) or "Joined Feb 2022". */
export function formatJoined(joinedOn: string, now = new Date()): string {
  const days = daysFromToday(joinedOn, now);
  if (days > 0) return `Starts ${formatShortDate(joinedOn)}`;
  const date = parseDateOnly(joinedOn);
  return -days <= 120
    ? `Joined ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    : `Joined ${date.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
}

/** First name, for greetings and "What does Sana work on?". */
export function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

