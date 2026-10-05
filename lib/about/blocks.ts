// About page v2: blocks the owner arranges. Automatic blocks fill themselves
// from what the community offers; written blocks are the owner's own.
// Stored in communities.about_page as { version: 2, sections, finalCta?, meta }.
// Older pages (hero / text / image / cta / video sections) are converted on
// read by normalizeAboutPage; nothing is rewritten in the database until the
// owner saves.

export const AUTO_TYPES = ["included", "schedule", "course", "lessons", "activity", "faq"] as const;
export const WRITTEN_TYPES = ["text", "image", "video", "quote", "button", "teacher"] as const;
export type AutoType = (typeof AUTO_TYPES)[number];
export type WrittenType = (typeof WRITTEN_TYPES)[number];
export type BlockType = AutoType | WrittenType;

export interface FaqItem {
  q: string;
  a: string;
}

export interface BlockContent {
  heading?: string;
  text?: string;
  imageUrl?: string;
  caption?: string;
  altText?: string;
  videoId?: string;
  videoAssetId?: string;
  title?: string;
  description?: string;
  who?: string;
  ctaText?: string;
  ctaLink?: string;
  bio?: string;
  items?: FaqItem[];
}

export interface AboutBlock {
  id: string;
  type: BlockType;
  /** The owner's own name for the block (rename). */
  title?: string | null;
  content: BlockContent;
}

export interface AboutPage {
  version: 2;
  sections: AboutBlock[];
  finalCta?: { title?: string; text?: string } | null;
  meta?: { last_updated?: string; published_version?: string };
}

export interface Offered {
  liveClasses: boolean;
  courses: boolean;
  privateLessons: boolean;
}

/** Most blocks a page can hold; the server drops any past this. */
export const MAX_BLOCKS = 40;

/** Whether removing this block would throw away something the owner wrote. */
export function holdsOwnContent(b: AboutBlock): boolean {
  if (b.type === "faq") return !!b.content.items?.some((i) => i.q.trim() || i.a.trim());
  if (b.type === "teacher") return !!b.content.bio?.trim();
  return isWritten(b.type) && hasContent(b);
}

export const isAuto = (t: string): t is AutoType => (AUTO_TYPES as readonly string[]).includes(t);
export const isWritten = (t: string): t is WrittenType => (WRITTEN_TYPES as readonly string[]).includes(t);

export const AUTO_INFO: Record<AutoType, { name: string; hint: string; needs?: keyof Offered; missing?: string }> = {
  included: { name: "What you get", hint: "Built from what you offer" },
  schedule: { name: "Upcoming live classes", hint: "Next dates, in each visitor's time zone", needs: "liveClasses", missing: "Turn on live classes and schedule one first" },
  course: { name: "Course preview", hint: "Chapters and a free preview lesson", needs: "courses", missing: "Turn on courses and publish one first" },
  lessons: { name: "Private lessons", hint: "Lesson types, prices and the next free time", needs: "privateLessons", missing: "Turn on private lessons and add a lesson type first" },
  activity: { name: "Community activity", hint: "Posts, replies and topics" },
  faq: { name: "Questions", hint: "Answers about joining, plus your own" },
};

export const WRITTEN_INFO: Record<WrittenType, { name: string; hint: string }> = {
  text: { name: "Text", hint: "A heading and a paragraph" },
  image: { name: "Image", hint: "A photo with a caption" },
  video: { name: "Video", hint: "A welcome video or a sample class" },
  quote: { name: "Testimonial", hint: "What a member says about you" },
  button: { name: "Button", hint: "A link to your site, socials or a booking page" },
  teacher: { name: "Teacher bio", hint: "Your photo, name and how you teach" },
};

export type TemplateKey = "live" | "courses" | "coaching" | "blank";
export const TEMPLATES: Record<TemplateKey, { name: string; text: string; order: BlockType[] }> = {
  live: { name: "Live classes first", text: "For teachers with a weekly class", order: ["included", "video", "teacher", "schedule", "course", "lessons", "activity", "faq"] },
  courses: { name: "Courses first", text: "For teachers who mostly record", order: ["included", "video", "course", "teacher", "activity", "faq"] },
  coaching: { name: "Private coaching", text: "For one on one teachers", order: ["lessons", "teacher", "video", "included", "activity", "faq"] },
  blank: { name: "Blank page", text: "Start from a single text block", order: ["text"] },
};

/** The template that fits what the community offers. */
export function suggestedTemplate(o: Offered): TemplateKey {
  if (o.liveClasses) return "live";
  if (o.courses) return "courses";
  if (o.privateLessons) return "coaching";
  return "blank";
}

/** Whether an automatic block can be on the page for these offerings. */
export function autoAvailable(type: AutoType, o: Offered): boolean {
  const needs = AUTO_INFO[type].needs;
  return !needs || o[needs];
}

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `b-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makeBlock(type: BlockType, id = newBlockId()): AboutBlock {
  return { id, type, title: null, content: type === "faq" ? { items: [] } : {} };
}

/** A template's blocks, skipping automatic ones the community can't show. */
export function templateBlocks(key: TemplateKey, o: Offered): AboutBlock[] {
  return TEMPLATES[key].order.filter((t) => !isAuto(t) || autoAvailable(t, o)).map((t) => makeBlock(t));
}

/** Whether a written block has anything a visitor would see. */
export function hasContent(b: AboutBlock): boolean {
  const c = b.content;
  switch (b.type) {
    case "text":
      return !!(c.heading || (c.text && c.text.replace(/<[^>]*>/g, "").trim()));
    case "image":
      return !!c.imageUrl;
    case "video":
      return !!c.videoId;
    case "quote":
      return !!c.text;
    case "button":
      return !!(c.ctaLink && c.ctaText);
    case "teacher":
      return true;
    default:
      return true;
  }
}
