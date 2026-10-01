const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

/** "October 31, 2026" in the runtime's time zone, or in `timeZone` when given. */
export function formatDate(value: string | number | Date, timeZone?: string): string {
  return new Date(value).toLocaleDateString(
    "en-US",
    timeZone ? { ...DATE_FORMAT, timeZone } : DATE_FORMAT
  );
}
