import postgres, { type Sql } from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql: Sql = postgres(databaseUrl);

/**
 * Execute a typed SQL query using tagged template literals
 * @example
 * const users = await query<User>`SELECT * FROM profiles WHERE id = ${userId}`;
 */
export async function query<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return sql(strings, ...(values as unknown as readonly never[])) as unknown as Promise<T[]>;
}

/**
 * Execute a typed SQL query expecting a single result
 * Returns the first row or null if no results
 * @example
 * const user = await queryOne<User>`SELECT * FROM profiles WHERE id = ${userId}`;
 */
export async function queryOne<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T | null> {
  const results = (await sql(strings, ...(values as unknown as readonly never[]))) as unknown as T[];
  return results[0] ?? null;
}

/**
 * Execute a typed SQL query expecting exactly one result
 * Throws an error if no results found
 * @example
 * const user = await queryFirst<User>`SELECT * FROM profiles WHERE id = ${userId}`;
 */
export async function queryFirst<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  const results = (await sql(strings, ...(values as unknown as readonly never[]))) as unknown as T[];
  if (results.length === 0) {
    throw new Error('Query returned no results');
  }
  return results[0];
}
