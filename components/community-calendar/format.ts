import { relativeDayWord } from "@/lib/time/format";

/** "19:00" in `timeZone`. */
export const clock = (iso: string | number | Date, timeZone: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });

/** "Berlin" from "Europe/Berlin", "New York" from "America/New_York". */
export const city = (tz: string) => (tz.split("/").pop() || tz).replace(/_/g, " ");

/** "Today", "Tomorrow" or the weekday. */
export const dayWord = (iso: string, now: Date, timeZone: string) => relativeDayWord(iso, now, timeZone, "en-GB");

export const dateLong = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone });

export const endOf = (startsAt: string, minutes: number) => new Date(new Date(startsAt).getTime() + minutes * 60_000).toISOString();
