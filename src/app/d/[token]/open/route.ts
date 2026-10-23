import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/**
 * Public: records an open and returns where the document is. The token is the
 * secret (32 random characters); share_open throttles each link to 30 opens an
 * hour. Zander's own opens while logged in aren't counted.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ state: "unknown" }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("share_open", { p_token: token, p_count: !user });
  if (error) {
    console.error("share open failed", error);
    return NextResponse.json({ state: "error" }, { status: 500 });
  }

  const row = data?.[0];
  if (!row) return NextResponse.json({ state: "unknown" }, { status: 404 });
  if (row.state !== "ok" || !row.target_url) {
    return NextResponse.json({ state: row.state }, { status: row.state === "busy" ? 429 : 410 });
  }
  return NextResponse.json({ url: row.target_url }, { headers: { "Cache-Control": "no-store" } });
}
