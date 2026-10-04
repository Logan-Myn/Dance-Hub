// Server side of the About page model: cleaning untrusted blocks and
// converting older pages. Shared types and helpers live in ./blocks.

import { sanitizeRichText } from "@/lib/sanitize-html";
import { isAuto, isWritten, newBlockId, type AboutBlock, type AboutPage, type BlockContent, type FaqItem } from "./blocks";

export * from "./blocks";

const PLACEHOLDERS = new Set(["add a title", "add a subtitle", "add a heading"]);
const clean = (s: unknown, max = 300): string => {
  if (typeof s !== "string") return "";
  const t = s.trim();
  return PLACEHOLDERS.has(t.toLowerCase()) ? "" : t.slice(0, max);
};
const safeUrl = (s: unknown): string => {
  if (typeof s !== "string") return "";
  const t = s.trim();
  if (!t) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
};
const textHtml = (s: unknown) => sanitizeRichText(typeof s === "string" ? s : "");
const plainToHtml = (s: string) => (s ? `<p>${s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</p>` : "");

interface LegacySection {
  id?: string;
  type?: string;
  content?: Record<string, unknown>;
}

/** Older section shapes to v2 blocks (and the join call to action). */
function fromLegacy(sections: LegacySection[]): { blocks: AboutBlock[]; finalCta: AboutPage["finalCta"] } {
  const blocks: AboutBlock[] = [];
  let finalCta: AboutPage["finalCta"] = null;
  for (const s of sections) {
    const c = s.content ?? {};
    const id = typeof s.id === "string" && s.id ? s.id : newBlockId();
    switch (s.type) {
      case "hero": {
        const heading = clean(c.title);
        const sub = clean(c.subtitle, 600);
        if (heading || sub) blocks.push({ id, type: "text", title: null, content: { heading, text: plainToHtml(sub) } });
        if (typeof c.imageUrl === "string" && safeUrl(c.imageUrl)) {
          blocks.push({ id: `${id}-img`, type: "image", title: null, content: { imageUrl: safeUrl(c.imageUrl), caption: "", altText: "" } });
        }
        break;
      }
      case "text":
        blocks.push({ id, type: "text", title: null, content: { heading: clean(c.heading ?? c.title), text: textHtml(c.text) } });
        break;
      case "image":
        blocks.push({ id, type: "image", title: null, content: { imageUrl: safeUrl(c.imageUrl), caption: clean(c.caption), altText: clean(c.altText) } });
        break;
      case "video":
        blocks.push({
          id,
          type: "video",
          title: null,
          content: {
            videoId: typeof c.videoId === "string" ? c.videoId : "",
            videoAssetId: typeof c.videoAssetId === "string" ? c.videoAssetId : "",
            title: clean(c.title),
            description: clean(c.description, 600),
          },
        });
        break;
      case "cta":
        if (c.buttonType === "link" && safeUrl(c.ctaLink)) {
          blocks.push({ id, type: "button", title: clean(c.title) || null, content: { ctaText: clean(c.ctaText, 60), ctaLink: safeUrl(c.ctaLink), text: clean(c.subtitle, 600) } });
        } else if (!finalCta) {
          finalCta = { title: clean(c.title), text: clean(c.subtitle, 600) };
        }
        break;
      default:
        break;
    }
  }
  return { blocks, finalCta };
}

/** One block from untrusted input, cleaned; null when it isn't a known block. */
export function cleanBlock(raw: unknown): AboutBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { id?: unknown; type?: unknown; title?: unknown; content?: Record<string, unknown> };
  const type = typeof r.type === "string" ? r.type : "";
  if (!isAuto(type) && !isWritten(type)) return null;
  const c = r.content ?? {};
  const id = typeof r.id === "string" && r.id.length <= 80 ? r.id : newBlockId();
  const title = clean(r.title, 80) || null;
  const content: BlockContent = {};
  switch (type) {
    case "text":
      content.heading = clean(c.heading, 120);
      content.text = textHtml(c.text);
      break;
    case "image":
      content.imageUrl = safeUrl(c.imageUrl);
      content.caption = clean(c.caption, 200);
      content.altText = clean(c.altText, 200);
      break;
    case "video":
      content.videoId = typeof c.videoId === "string" ? c.videoId.slice(0, 120) : "";
      content.videoAssetId = typeof c.videoAssetId === "string" ? c.videoAssetId.slice(0, 120) : "";
      content.title = clean(c.title, 120);
      content.description = clean(c.description, 600);
      break;
    case "quote":
      content.text = clean(c.text, 600);
      content.who = clean(c.who, 80);
      break;
    case "button":
      content.ctaText = clean(c.ctaText, 60);
      content.ctaLink = safeUrl(c.ctaLink);
      content.text = clean(c.text, 300);
      break;
    case "teacher":
      content.bio = clean(c.bio, 1200);
      break;
    case "faq":
      content.items = (Array.isArray(c.items) ? c.items : [])
        .slice(0, 20)
        .map((i) => ({ q: clean((i as FaqItem)?.q, 200), a: clean((i as FaqItem)?.a, 1200) }))
        .filter((i) => i.q || i.a);
      break;
    default:
      break;
  }
  return { id, type, title, content };
}

export const MAX_BLOCKS = 40;

/**
 * The page to render from whatever is stored: v2 pages are cleaned, older
 * pages converted. Null when there is nothing (the caller shows a template).
 */
export function normalizeAboutPage(raw: unknown): AboutPage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { version?: unknown; sections?: unknown; finalCta?: unknown; meta?: AboutPage["meta"] };
  const sections = Array.isArray(r.sections) ? r.sections : [];
  if (r.version === 2) {
    const blocks = sections.map(cleanBlock).filter((b): b is AboutBlock => !!b).slice(0, MAX_BLOCKS);
    const fc = r.finalCta as { title?: unknown; text?: unknown } | null | undefined;
    const finalCta = fc ? { title: clean(fc.title, 120), text: clean(fc.text, 600) } : null;
    // A saved v2 page stays the owner's, even when they removed every block.
    return { version: 2, sections: blocks, finalCta, meta: r.meta };
  }
  if (sections.length === 0) return null;
  const { blocks, finalCta } = fromLegacy(sections as LegacySection[]);
  return blocks.length || finalCta ? { version: 2, sections: blocks.slice(0, MAX_BLOCKS), finalCta, meta: r.meta } : null;
}

