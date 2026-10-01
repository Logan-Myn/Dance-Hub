// Turns stored rich-text HTML into plain text for short previews. The result
// is meant to be rendered as a React text node, so it never needs to be safe
// as HTML. Plain string work, no DOM, so it gives the same result on the
// server and in the browser (no hydration mismatch).

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function htmlToPlainText(html: string): string {
  if (typeof html !== 'string' || !html) return '';
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    // Block ends and line breaks become new lines so words don't run together.
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|div|ul|ol)\s*>|<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}
