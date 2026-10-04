import {
  courseStatus,
  lessonAfter,
  nextLesson,
  notesForSearch,
  realCoverUrl,
  redactForPreview,
  searchLessons,
} from "@/lib/classroom/model";
import { replayTitle } from "@/lib/classroom/replays";

describe("classroom model", () => {
  it("tells new, in progress and done courses apart", () => {
    expect(courseStatus(0, 5)).toBe("new");
    expect(courseStatus(2, 5)).toBe("progress");
    expect(courseStatus(5, 5)).toBe("done");
    expect(courseStatus(0, 0)).toBe("new");
  });

  it("treats the upload placeholder as no cover", () => {
    expect(realCoverUrl("https://dance-hub.io/images/course-placeholder.svg")).toBeNull();
    expect(realCoverUrl("")).toBeNull();
    expect(realCoverUrl("https://cdn.example.com/c.jpg")).toBe("https://cdn.example.com/c.jpg");
  });

  it("finds the first lesson not done, with its number, even when lessons were done out of order", () => {
    const lessons = [
      { id: "a", title: "A", chapterId: "c1", chapterTitle: "One", completed: true },
      { id: "b", title: "B", chapterId: "c1", chapterTitle: "One", completed: false },
      { id: "c", title: "C", chapterId: "c2", chapterTitle: "Two", completed: true },
    ];
    expect(nextLesson(lessons)).toMatchObject({ id: "b", number: 2 });
    expect(nextLesson(lessons.map((l) => ({ ...l, completed: true })))).toBeNull();
    expect(lessonAfter(lessons, "b")?.id).toBe("c");
    expect(lessonAfter(lessons, "c")).toBeNull();
  });

  it("keeps preview lessons whole and strips everything else for visitors", () => {
    const base = { content: "<p>Notes</p>", playbackId: "pb", videoAssetId: "va", playback_id: "pb", video_asset_id: "va" };
    expect(redactForPreview({ ...base, is_preview: true })).toMatchObject(base);
    expect(redactForPreview({ ...base, is_preview: false })).toMatchObject({
      content: null, playbackId: null, videoAssetId: null, playback_id: null, video_asset_id: null,
    });
  });

  it("searches lessons by title first, then course or chapter, then notes", () => {
    const item = (id: string, title: string, chapterTitle: string, notes: string) => ({
      id, title, courseSlug: "a1", courseTitle: "Bachata A1", chapterTitle, number: 1, notes, completed: false,
    });
    const items = [
      item("1", "Box step", "Basics", "Keep your frame soft"),
      item("2", "Right turn", "Turns", "Spot on 5"),
      item("3", "Frame drills", "Partnerwork", ""),
    ];
    expect(searchLessons(items, "frame").map((i) => i.id)).toEqual(["3", "1"]);
    expect(searchLessons(items, "turns").map((i) => i.id)).toEqual(["2"]);
    expect(searchLessons(items, "")).toEqual([]);
  });

  it("cleans replay titles and lesson notes", () => {
    expect(replayTitle("Floorwork, week 3 — Replay")).toBe("Floorwork, week 3");
    expect(replayTitle("Just a title")).toBe("Just a title");
    expect(notesForSearch("<p>Hold <strong>frame</strong></p>")).toBe("Hold frame");
  });
});
