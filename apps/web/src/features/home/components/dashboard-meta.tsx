
/** Shared, non-component pieces of the Home dashboards (kept apart from components for fast refresh). */

const SPAN = {
  12: "col-span-12",
  8: "col-span-12 @min-[940px]:col-span-8",
  7: "col-span-12 @min-[940px]:col-span-7",
  5: "col-span-12 @min-[940px]:col-span-5",
  4: "col-span-12 @min-[940px]:col-span-4",
} as const;

export function span(columns: keyof typeof SPAN): string {
  return SPAN[columns];
}



/** "Oct 12–16", or "Oct 30 – Nov 3" across months. */
export function formatDateRange(from: Date, to: Date): string {
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const start = from.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return sameMonth
    ? `${start}–${to.getDate()}`
    : `${start} – ${to.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
