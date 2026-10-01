/**
 * One-off: re-sanitize rich-text HTML stored before write-time sanitizing.
 *
 * Thread bodies (threads.content), lesson text (lessons.content) and broadcast
 * emails (email_broadcasts.html_content) are now sanitized when they are
 * written and again when they are read, so old rows are already harmless in
 * the app. This
 * cleans the stored copies too, so nothing else that reads the table later
 * (exports, new features) picks up unsafe markup.
 *
 * Comments are not touched: they are plain text, rendered as text.
 *
 * Dry run by default: prints the rows that would change. Pass --apply to write.
 *
 * Usage:
 *   DATABASE_URL=... bun run scripts/resanitize-rich-text.ts           # dry run
 *   DATABASE_URL=... bun run scripts/resanitize-rich-text.ts --apply   # write
 *
 * Take a backup (pg_dump of the three tables) before running with --apply.
 * The dry run also shows whether any lesson held markup the current editor
 * cannot produce (e.g. images from an older editor), which would be dropped.
 */

import postgres from 'postgres';
import { sanitizeEmailHtml, sanitizeRichText } from '../lib/sanitize-html';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const sql = postgres(DATABASE_URL);

async function resanitize(
  label: string,
  rows: { id: string; html: string | null }[],
  clean: (html: string) => string,
  write: (id: string, html: string) => Promise<unknown>
) {
  let changed = 0;
  for (const row of rows) {
    if (row.html == null) continue;
    const cleaned = clean(row.html);
    if (cleaned === row.html) continue;
    changed++;
    console.log(`${label} ${row.id}: ${row.html.length} -> ${cleaned.length} chars`);
    if (apply) await write(row.id, cleaned);
  }
  console.log(`${label}: ${changed} of ${rows.length} rows ${apply ? 'updated' : 'would change'}\n`);
}

async function main() {
  console.log(apply ? 'APPLY mode: rows will be updated.\n' : 'Dry run: nothing is written.\n');

  const threads = await sql<{ id: string; html: string | null }[]>`
    SELECT id, content AS html FROM threads
  `;
  await resanitize('thread', threads, sanitizeRichText, (id, html) =>
    sql`UPDATE threads SET content = ${html} WHERE id = ${id}`
  );

  const lessons = await sql<{ id: string; html: string | null }[]>`
    SELECT id, content AS html FROM lessons
  `;
  await resanitize('lesson', lessons, sanitizeRichText, (id, html) =>
    sql`UPDATE lessons SET content = ${html} WHERE id = ${id}`
  );

  const broadcasts = await sql<{ id: string; html: string | null }[]>`
    SELECT id, html_content AS html FROM email_broadcasts
  `;
  await resanitize('broadcast', broadcasts, sanitizeEmailHtml, (id, html) =>
    sql`UPDATE email_broadcasts SET html_content = ${html} WHERE id = ${id}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
