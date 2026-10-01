import sanitizeHtml from 'sanitize-html';

// Server-side allowlists for user-written rich text. Tiptap only limits what
// its own editor produces; the API accepts any string, so everything that
// stores or returns thread or broadcast HTML runs it through one of these.
//
// The lists follow the editor schemas: components/Editor.tsx (threads: Tiptap
// StarterKit, TextAlign, a font-size TextStyle) and
// components/emails/EmailEditor.tsx (broadcasts: StarterKit, TextAlign, Link,
// Image). Keep them in sync when an editor gains an extension.

const LINK_REL = 'noopener noreferrer nofollow';

const TEXT_ALIGN = [/^(left|center|right|justify)$/];
const FONT_SIZE = [/^\d+(\.\d+)?(rem|em|px|%)$/];

const baseOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3',
    'strong', 'b', 'em', 'i', 's', 'strike', 'del', 'u', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'span', 'a',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'class'],
    ol: ['start', 'type', 'class'],
    ul: ['class'],
    li: ['class'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    span: ['style'],
  },
  // Only the classes the editors add. Anything else could restyle the page
  // around the post (e.g. "fixed inset-0" to draw a fake login over the feed).
  allowedClasses: {
    ul: ['list-disc', 'list-inside'],
    ol: ['list-decimal', 'list-inside'],
    li: ['marker:text-current'],
    a: ['text-indigo-600', 'underline'],
  },
  allowedStyles: {
    p: { 'text-align': TEXT_ALIGN },
    h1: { 'text-align': TEXT_ALIGN },
    h2: { 'text-align': TEXT_ALIGN },
    h3: { 'text-align': TEXT_ALIGN },
    span: { 'font-size': FONT_SIZE },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    // Links may only open a new tab, and never with access to window.opener.
    a: (tagName, attribs) => {
      const out: sanitizeHtml.Attributes = { ...attribs, rel: LINK_REL };
      if (out.target !== '_blank') delete out.target;
      return { tagName, attribs: out };
    },
  },
};

const emailOptions: sanitizeHtml.IOptions = {
  ...baseOptions,
  allowedTags: [...(baseOptions.allowedTags as string[]), 'img'],
  allowedAttributes: {
    ...baseOptions.allowedAttributes,
    img: ['src', 'alt', 'title', 'class'],
  },
  allowedClasses: {
    ...baseOptions.allowedClasses,
    img: ['max-w-full', 'rounded'],
  },
  // Uploaded broadcast images are absolute https URLs; nothing else is needed.
  // Relative and protocol-relative sources are dropped too, and so is any
  // image left without a source.
  allowedSchemesByTag: { img: ['https'] },
  transformTags: {
    ...baseOptions.transformTags,
    img: (tagName, attribs) => {
      const out: sanitizeHtml.Attributes = { ...attribs };
      if (!/^https:\/\//i.test(out.src ?? '')) delete out.src;
      return { tagName, attribs: out };
    },
  },
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
};

/** Thread bodies (components/Editor.tsx). Non-strings become ''. */
export function sanitizeRichText(html: unknown): string {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, baseOptions);
}

/** Broadcast emails (components/emails/EmailEditor.tsx). Non-strings become ''. */
export function sanitizeEmailHtml(html: unknown): string {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, emailOptions);
}
