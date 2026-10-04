import { feedVisitBaseline, isNewPost } from "@/lib/feed/visits";
import { timeAgo } from "@/lib/feed/time-ago";
import { buildIcsEvent, escapeIcsText, foldIcsLine, icsFileName } from "@/lib/feed/ics";
import { highlightParts, htmlToText, searchPosts, sortPosts, topScore } from "@/lib/feed/posts";

const NOW = new Date("2026-10-05T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("feedVisitBaseline", () => {
  it("has no baseline on a first visit", () => {
    expect(feedVisitBaseline(null, null, NOW)).toBeNull();
  });
  it("uses the last visit when it was in an earlier session", () => {
    expect(feedVisitBaseline(minutesAgo(120), minutesAgo(3000), NOW)).toBe(minutesAgo(120));
  });
  it("keeps the previous visit inside the same session", () => {
    expect(feedVisitBaseline(minutesAgo(5), minutesAgo(300), NOW)).toBe(minutesAgo(300));
  });
  it("has no baseline when the only visit is this session", () => {
    expect(feedVisitBaseline(minutesAgo(5), null, NOW)).toBeNull();
  });
});

describe("isNewPost", () => {
  const base = minutesAgo(60);
  it("marks others' posts after the baseline", () => {
    expect(isNewPost({ createdAt: minutesAgo(10), userId: "b" }, base, "a")).toBe(true);
  });
  it("never marks your own posts, older posts, or without a baseline", () => {
    expect(isNewPost({ createdAt: minutesAgo(10), userId: "a" }, base, "a")).toBe(false);
    expect(isNewPost({ createdAt: minutesAgo(90), userId: "b" }, base, "a")).toBe(false);
    expect(isNewPost({ createdAt: minutesAgo(10), userId: "b" }, null, "a")).toBe(false);
  });
});

describe("timeAgo", () => {
  it.each([
    [0.5, "just now"],
    [5, "5 min ago"],
    [180, "3 h ago"],
    [60 * 30, "yesterday"],
    [60 * 24 * 4, "4 days ago"],
  ])("%s minutes ago reads %s", (m, expected) => {
    expect(timeAgo(minutesAgo(m), NOW, "Europe/Tallinn")).toBe(expected);
  });
  it("shows a date after a week, with the year only when it differs", () => {
    expect(timeAgo("2026-09-12T10:00:00Z", NOW, "Europe/Tallinn")).toBe("12 Sep");
    expect(timeAgo("2025-09-12T10:00:00Z", NOW, "Europe/Tallinn")).toBe("12 Sep 2025");
  });
});

describe("ics", () => {
  it("builds a single event in UTC with escaped text and CRLF lines", () => {
    const ics = buildIcsEvent({
      uid: "class-1@dance-hub.io",
      title: "Bachata; footwork, week 3",
      description: "Bring water\nand shoes",
      url: "https://dance-hub.io/bachataflow/calendar",
      start: "2026-10-05T17:00:00Z",
      durationMinutes: 60,
      now: NOW,
    });
    expect(ics).toContain("DTSTART:20261005T170000Z\r\n");
    expect(ics).toContain("DTEND:20261005T180000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261005T120000Z\r\n");
    expect(ics).toContain("SUMMARY:Bachata\\; footwork\\, week 3\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("escapes backslashes and folds long lines at 75 octets", () => {
    expect(escapeIcsText("a\\b")).toBe("a\\\\b");
    const folded = foldIcsLine("SUMMARY:" + "é".repeat(60));
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });
  it("names the file after the class and date", () => {
    expect(icsFileName("Salsa Night: Cuban style!", "2026-10-05T17:00:00Z")).toBe("salsa-night-cuban-style-2026-10-05.ics");
  });
});

describe("posts", () => {
  const post = (id: string, title: string, content: string, createdAt: string, likesCount = 0, commentsCount = 0, name = "Ana") => ({
    id, title, content, createdAt, likesCount, commentsCount, author: { name },
  });
  const posts = [
    post("1", "Shoulder drill", "<p>Keep the frame</p>", minutesAgo(30), 1, 0),
    post("2", "Footwork", "<p>Try the <strong>shoulder</strong> isolation</p>", minutesAgo(10), 0, 3, "Kofi"),
    post("3", "Música para practicar", "<p>Playlist</p>", minutesAgo(60), 5, 0),
  ];

  it("ranks top by likes plus twice the replies, newer first on ties", () => {
    expect(topScore(posts[1])).toBe(6);
    expect(sortPosts(posts, "top").map((p) => p.id)).toEqual(["2", "3", "1"]);
    expect(sortPosts(posts, "latest").map((p) => p.id)).toEqual(["2", "1", "3"]);
  });

  it("turns post HTML into one line of text", () => {
    expect(htmlToText("<p>Hi &amp; welcome</p><p>Line&nbsp;two&#39;s</p><script>x</script>")).toBe("Hi & welcome Line two's x");
  });

  it("searches title, author and body, ignoring accents, title matches first", () => {
    expect(searchPosts(posts, "shoulder").map((m) => [m.post.id, m.field])).toEqual([["1", "title"], ["2", "body"]]);
    expect(searchPosts(posts, "musica")[0].post.id).toBe("3");
    expect(searchPosts(posts, "kofi")[0].field).toBe("author");
    expect(searchPosts(posts, "  ")).toEqual([]);
  });

  it("marks matching parts for highlighting", () => {
    expect(highlightParts("Música para", "musica")).toEqual([
      { text: "Música", match: true },
      { text: " para", match: false },
    ]);
  });
});
