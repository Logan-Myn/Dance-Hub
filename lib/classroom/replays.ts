/** Live-class recordings land in this course (see the recording webhooks). */
export const REPLAYS_COURSE_SLUG = "live-class-replays";

/** "Floorwork, week 3 — Replay" to "Floorwork, week 3". */
export function replayTitle(title: string): string {
  return title.replace(/\s*[—–-]\s*Replay$/i, "").trim() || title;
}
