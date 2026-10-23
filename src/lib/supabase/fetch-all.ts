import type { PostgrestError } from "@supabase/supabase-js";

/** Matches `[api] max_rows` in supabase/config.toml: the most rows one request returns. */
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/**
 * Every row of a query, read a page at a time. Without this the API silently stops at 1,000 rows.
 * Order the query by a unique column (add `.order("id")` last) so pages don't overlap or skip rows.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => Page<T>
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const data: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await page(from, from + PAGE_SIZE - 1);
    if (result.error) return { data, error: result.error };
    const rows = result.data ?? [];
    data.push(...rows);
    if (rows.length < PAGE_SIZE) return { data, error: null };
  }
}
