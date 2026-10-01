import { sanitizeEmailHtml } from '@/lib/sanitize-html';

// Builds the srcdoc for showing a stored broadcast on the archive page. The
// page renders it in an iframe sandboxed without allow-scripts or
// allow-same-origin, so owner-written HTML never runs in our origin. The CSP
// below is a second lock (no scripts, no requests except https images), and
// the HTML is sanitized again in case the row predates write-time sanitizing.
const CSP = "default-src 'none'; img-src https:; style-src 'unsafe-inline'";

const STYLES = `
  body { margin: 0; padding: 48px; background: #fff; color: #1f2937;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px; line-height: 1.6; overflow-wrap: anywhere; }
  h1, h2, h3 { line-height: 1.2; color: #111827; }
  a { color: #4f46e5; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  @media (max-width: 640px) { body { padding: 24px; } }
`;

export function buildBroadcastPreviewDocument(html: unknown): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    // Links open in a new tab instead of inside the frame.
    '<base target="_blank">' +
    `<style>${STYLES}</style>` +
    `</head><body>${sanitizeEmailHtml(html)}</body></html>`
  );
}
