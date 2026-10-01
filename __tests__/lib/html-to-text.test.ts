/**
 * Plain-text previews of thread HTML (the feed card shows 3 lines of it).
 * The result is rendered as a React text node, never as HTML.
 */
import { htmlToPlainText } from '@/lib/html-to-text';

describe('htmlToPlainText', () => {
  it('keeps the text and puts block elements on their own lines', () => {
    expect(
      htmlToPlainText('<h2>Title</h2><p>Hello <strong>there</strong></p><ul><li><p>one</p></li><li><p>two</p></li></ul><p>a<br>b</p>')
    ).toBe('Title\nHello there\none\ntwo\na\nb');
  });

  it('decodes entities so the text reads as written', () => {
    expect(htmlToPlainText('<p>Salsa &amp; bachata &lt;3 &quot;now&quot; it&#39;s &#x2764; &nbsp;ok</p>')).toBe(
      'Salsa & bachata <3 "now" it\'s ❤  ok'
    );
  });

  it('drops markup entirely, including attributes that carry script', () => {
    const text = htmlToPlainText('<p>hi<img src=x onerror="alert(1)"></p><script>alert(2)</script>');
    expect(text).toBe('hi');
    expect(text).not.toContain('<');
  });

  it('collapses empty paragraphs and trims', () => {
    expect(htmlToPlainText('<p></p><p>  one  </p><p></p><p></p><p>two</p>')).toBe('one\ntwo');
  });

  it('handles empty and non-string input', () => {
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText(undefined as unknown as string)).toBe('');
  });
});
