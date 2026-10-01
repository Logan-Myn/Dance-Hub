/**
 * Server-side HTML sanitizing for user-written rich text (thread bodies and
 * broadcast emails). The allowlists follow what the two Tiptap editors
 * produce (components/Editor.tsx and components/emails/EmailEditor.tsx), so
 * editor output passes through and anything else is stripped.
 *
 * @jest-environment node
 */
import { sanitizeEmailHtml, sanitizeRichText } from '@/lib/sanitize-html';

describe('sanitizeRichText (thread bodies)', () => {
  // sanitize-html re-serializes style attributes without the space after the
  // colon ("text-align:center"); Tiptap reads both forms the same way.
  const normalizeStyles = (html: string) => html.replace(/style="([a-z-]+): /g, 'style="$1:');

  it('keeps what the thread editor produces', () => {
    const html =
      '<p style="text-align: center">Hello <strong>bold</strong> <em>it</em> <s>gone</s> <code>x</code></p>' +
      '<ul class="list-disc list-inside"><li class="marker:text-current"><p>one</p></li></ul>' +
      '<ol class="list-decimal list-inside" start="3"><li class="marker:text-current"><p>two</p></li></ol>' +
      '<blockquote><p>quote</p></blockquote>' +
      '<pre><code>code block</code></pre>' +
      '<h2 style="text-align: right">Heading</h2>' +
      '<p>line<br />break</p><hr />' +
      '<p><span style="font-size: 2.25rem">big</span></p>';
    expect(sanitizeRichText(html)).toBe(normalizeStyles(html));
  });

  it('removes images, so an onerror payload cannot run', () => {
    expect(sanitizeRichText('<p>hi<img src=x onerror="alert(1)"></p>')).toBe('<p>hi</p>');
  });

  it('removes script, style, iframe, svg and form markup', () => {
    const out = sanitizeRichText(
      '<script>alert(1)</script><style>p{}</style><iframe src="https://x"></iframe>' +
        '<svg onload="alert(1)"><circle /></svg><form><input value="x" /></form><p>ok</p>'
    );
    expect(out).toBe('<p>ok</p>');
  });

  it('removes event handler attributes', () => {
    expect(sanitizeRichText('<p onclick="alert(1)" onmouseover="x">hi</p>')).toBe('<p>hi</p>');
  });

  it('drops javascript: and data: links but keeps the text', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a rel="noopener noreferrer nofollow">x</a>'
    );
    expect(sanitizeRichText('<a href="data:text/html,hi">x</a>')).toBe(
      '<a rel="noopener noreferrer nofollow">x</a>'
    );
    expect(sanitizeRichText('<a href="//evil.example">x</a>')).toBe(
      '<a rel="noopener noreferrer nofollow">x</a>'
    );
  });

  it('keeps safe links and forces a safe rel', () => {
    expect(sanitizeRichText('<a href="https://dance-hub.io" target="_blank" rel="opener">x</a>')).toBe(
      '<a href="https://dance-hub.io" target="_blank" rel="noopener noreferrer nofollow">x</a>'
    );
    expect(sanitizeRichText('<a href="https://x.example" target="_top">x</a>')).toBe(
      '<a href="https://x.example" rel="noopener noreferrer nofollow">x</a>'
    );
  });

  it('only keeps the editor classes, so posts cannot restyle the page', () => {
    expect(sanitizeRichText('<p class="fixed inset-0 z-50">x</p>')).toBe('<p>x</p>');
    expect(sanitizeRichText('<ul class="list-disc fixed"><li>x</li></ul>')).toBe(
      '<ul class="list-disc"><li>x</li></ul>'
    );
  });

  it('only keeps text-align and font-size styles with plain values', () => {
    expect(sanitizeRichText('<p style="position: fixed; text-align: left">x</p>')).toBe(
      '<p style="text-align:left">x</p>'
    );
    expect(sanitizeRichText('<p style="text-align: url(javascript:alert(1))">x</p>')).toBe('<p>x</p>');
    expect(sanitizeRichText('<span style="font-size: expression(alert(1))">x</span>')).toBe(
      '<span>x</span>'
    );
  });

  it('only keeps the font sizes the editor offers', () => {
    for (const size of ['2.25rem', '1.875rem', '1.5rem']) {
      expect(sanitizeRichText(`<span style="font-size: ${size}">x</span>`)).toBe(
        `<span style="font-size:${size}">x</span>`
      );
    }
    for (const size of ['9999px', '50rem', '1em', '100%']) {
      expect(sanitizeRichText(`<span style="font-size: ${size}">x</span>`)).toBe('<span>x</span>');
    }
  });

  it('returns an empty string for anything that is not a string', () => {
    expect(sanitizeRichText(undefined)).toBe('');
    expect(sanitizeRichText(null)).toBe('');
    expect(sanitizeRichText({ html: '<p>x</p>' })).toBe('');
  });
});

describe('sanitizeEmailHtml (broadcasts)', () => {
  const normalizeStyles = (html: string) => html.replace(/style="([a-z-]+): /g, 'style="$1:');

  it('keeps what the email editor produces, including https images and links', () => {
    const html =
      '<h1 style="text-align: center">News</h1>' +
      '<p>Read <a target="_blank" rel="noopener noreferrer nofollow" class="text-indigo-600 underline" href="https://dance-hub.io/salsa">this</a>' +
      ' or <a href="mailto:hello@dance-hub.io" rel="noopener noreferrer nofollow">mail</a></p>' +
      '<img class="max-w-full rounded" src="https://cdn.example.com/a.png" alt="poster" />';
    expect(sanitizeEmailHtml(html)).toBe(normalizeStyles(html));
  });

  it('removes images that are not absolute https URLs, and onerror handlers', () => {
    expect(sanitizeEmailHtml('<p>a</p><img src="http://x.example/a.png" />')).toBe('<p>a</p>');
    expect(sanitizeEmailHtml('<img src="data:image/png;base64,AAAA" />')).toBe('');
    expect(sanitizeEmailHtml('<img src="/api/some/route" />')).toBe('');
    expect(sanitizeEmailHtml('<img src="//x.example/a.png" />')).toBe('');
    expect(sanitizeEmailHtml('<img src="https://x.example/a.png" onerror="alert(1)" />')).toBe(
      '<img src="https://x.example/a.png" />'
    );
  });

  it('removes scripts and javascript: links', () => {
    expect(
      sanitizeEmailHtml('<p>hi<script>alert(1)</script><a href="javascript:alert(1)">x</a></p>')
    ).toBe('<p>hi<a rel="noopener noreferrer nofollow">x</a></p>');
  });
});
