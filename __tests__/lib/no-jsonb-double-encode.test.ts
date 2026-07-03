import fs from 'fs';
import path from 'path';

/**
 * Regression guard for the postgres.js jsonb double-encoding bug.
 *
 * `${JSON.stringify(x)}::jsonb` makes postgres.js re-serialize the already-
 * stringified value, storing a jsonb *string* instead of an object/array (the
 * About-page incident, 2026-07-03). The correct form is `${sql.json(x)}`,
 * which serializes exactly once (a trailing `::jsonb` cast is harmless but
 * redundant, so we drop it).
 *
 * This test fails if the forbidden pattern reappears in `app/` or `lib/`. The
 * regex matches only a `JSON.stringify` call *inside* the same `${ ... }`
 * interpolation that is cast `::jsonb`, so an unrelated `JSON.stringify` used
 * for logging near a jsonb write does not trip it.
 */
const FORBIDDEN =
  /\$\{(?:[^{}]|\{[^{}]*\})*?JSON\.stringify(?:[^{}]|\{[^{}]*\})*?\}::jsonb/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('no double-encoded jsonb writes', () => {
  const roots = ['app', 'lib'].map((d) => path.join(process.cwd(), d));
  const files = roots.filter(fs.existsSync).flatMap(walk);

  it('finds a non-trivial number of source files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('never casts a JSON.stringify(...) interpolation to ::jsonb (use sql.json instead)', () => {
    const violations: string[] = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (FORBIDDEN.test(line)) {
            violations.push(`${path.relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`);
          }
        });
    }
    expect(violations).toEqual([]);
  });
});
