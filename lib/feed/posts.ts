// Sorting, plain-text previews and search for the community feed.

export type FeedSort = "latest" | "top";

export interface RankablePost {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  author: { name: string };
}

/** Top = likes + 2 × replies; ties go to the newer post. */
export function topScore(p: Pick<RankablePost, "likesCount" | "commentsCount">): number {
  return (p.likesCount || 0) + 2 * (p.commentsCount || 0);
}

export function sortPosts<T extends RankablePost>(posts: T[], sort: FeedSort): T[] {
  const byDate = (a: T, b: T) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  return posts.slice().sort((a, b) => (sort === "top" ? topScore(b) - topScore(a) || byDate(a, b) : byDate(a, b)));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Sanitized post HTML to one line of text. String-only, never touches the DOM. */
export function htmlToText(html: string): string {
  return (html || "")
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/blockquote|\/div)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      const c = code.toLowerCase();
      if (c in ENTITIES) return ENTITIES[c];
      if (c.startsWith("#x")) return String.fromCodePoint(parseInt(c.slice(2), 16));
      if (c.startsWith("#")) return String.fromCodePoint(parseInt(c.slice(1), 10));
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface PostMatch<T> {
  post: T;
  /** Where the match is: title beats author beats body. */
  field: "title" | "author" | "body";
  /** Body text around the match, for the result line. */
  snippet: string;
}

/**
 * Posts matching every word of `query` (accents and case ignored), best
 * first: title matches, then author, then body; newer first inside a group.
 */
export function searchPosts<T extends RankablePost>(posts: T[], query: string, limit = 8): PostMatch<T>[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const rank = { title: 0, author: 1, body: 2 } as const;
  const results: PostMatch<T>[] = [];
  for (const post of posts) {
    const title = fold(post.title);
    const author = fold(post.author.name);
    const text = htmlToText(post.content);
    const body = fold(text);
    const all = `${title} ${author} ${body}`;
    if (!words.every((w) => all.includes(w))) continue;
    const field = words.some((w) => title.includes(w)) ? "title" : words.some((w) => author.includes(w)) ? "author" : "body";
    const at = Math.max(0, body.indexOf(words[0]));
    const from = Math.max(0, at - 40);
    const snippet = (from > 0 ? "…" : "") + text.slice(from, from + 120).trim() + (from + 120 < text.length ? "…" : "");
    results.push({ post, field, snippet });
  }
  return results
    .sort((a, b) => rank[a.field] - rank[b.field] || new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())
    .slice(0, limit);
}

/** Split `text` into parts, marking those that match a query word (for <mark>). */
export function highlightParts(text: string, query: string): Array<{ text: string; match: boolean }> {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0 || !text) return [{ text, match: false }];
  // Fold char by char so each match maps back to the original characters.
  const chars = Array.from(text);
  const folded = chars.map((c) => fold(c) || c);
  const flat = folded.join("");
  const marks = new Array(chars.length).fill(false);
  const starts: number[] = [];
  let pos = 0;
  for (const piece of folded) {
    starts.push(pos);
    pos += piece.length;
  }
  for (const w of words) {
    let i = flat.indexOf(w);
    while (i !== -1) {
      for (let k = 0; k < chars.length; k++) {
        const s = starts[k];
        if (s < i + w.length && s + folded[k].length > i) marks[k] = true;
      }
      i = flat.indexOf(w, i + w.length);
    }
  }
  const parts: Array<{ text: string; match: boolean }> = [];
  chars.forEach((c, k) => {
    const last = parts[parts.length - 1];
    if (last && last.match === marks[k]) last.text += c;
    else parts.push({ text: c, match: marks[k] });
  });
  return parts;
}
