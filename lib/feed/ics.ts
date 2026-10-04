// One calendar event as an iCalendar (RFC 5545) file, for "Add to calendar".

export interface IcsEventInput {
  uid: string;
  title: string;
  description?: string | null;
  url?: string | null;
  start: Date | string;
  durationMinutes: number;
  /** DTSTAMP; pass it in so output is testable. */
  now: Date;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escape a TEXT value: backslash, semicolon, comma, newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** UTF-8 length of one code point. */
const utf8Length = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
};

/** Fold lines longer than 75 octets (continuation lines start with a space). */
export function foldIcsLine(line: string): string {
  if (Array.from(line).reduce((n, ch) => n + utf8Length(ch), 0) <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = utf8Length(ch);
    const limit = out.length === 0 ? 75 : 74; // continuation lines lose one octet to the leading space
    if (size + n > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcsEvent(input: IcsEventInput): string {
  const start = new Date(input.start);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const description = [input.description?.trim(), input.url].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dance-Hub//Live class//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${stamp(input.now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    ...(description ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** "salsa-night-2026-10-05.ics" */
export function icsFileName(title: string, start: Date | string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "class";
  return `${slug}-${new Date(start).toISOString().slice(0, 10)}.ics`;
}
