import { PostgrestError } from "@supabase/supabase-js";
import { describe, it, expect } from "vitest";
import { PAGE_SIZE, fetchAll } from "@/lib/supabase/fetch-all";

const table = (rows: number) => Array.from({ length: rows }, (_, i) => i);

describe("fetchAll", () => {
  it("reads past the 1,000-row limit, page by page", async () => {
    const all = table(PAGE_SIZE * 2 + 500);
    const asked: [number, number][] = [];
    const { data, error } = await fetchAll(async (from, to) => {
      asked.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(error).toBeNull();
    expect(data).toEqual(all);
    expect(asked).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("asks once more when the last page is exactly full", async () => {
    const all = table(PAGE_SIZE);
    let calls = 0;
    const { data } = await fetchAll(async (from, to) => {
      calls++;
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(data).toHaveLength(PAGE_SIZE);
    expect(calls).toBe(2);
  });

  it("stops at the first error", async () => {
    const failure = new PostgrestError({ message: "boom", details: "", hint: "", code: "500" });
    const { data, error } = await fetchAll(async (from) =>
      from === 0 ? { data: table(PAGE_SIZE), error: null } : { data: null, error: failure }
    );
    expect(data).toHaveLength(PAGE_SIZE);
    expect(error).toBe(failure);
  });
});
