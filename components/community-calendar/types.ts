import type { CalendarClass, CalendarItem, CalendarLesson } from "@/lib/calendar/data";
import type { ClassState } from "@/lib/calendar/status";

export type { CalendarClass, CalendarItem, CalendarLesson, ClassState };

export interface CalendarCtx {
  slug: string;
  isOwner: boolean;
  teacherName: string;
  now: Date;
  /** The zone times are shown in. */
  timeZone: string;
  /** The other zone worth mentioning (class time for the viewer, or the viewer's own), if it differs. */
  otherZone: string | null;
}
