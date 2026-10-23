import { NextResponse } from "next/server";
import { MAX_BODY_BYTES } from "./signatures";

/** The raw body (signatures cover the exact bytes), refusing anything over 64 KB unread. */
export async function readBody(request: Request): Promise<Uint8Array | NextResponse> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ status: "too_large" }, { status: 413 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES) return NextResponse.json({ status: "too_large" }, { status: 413 });
  return body;
}

export function parseJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}

/**
 * Maps a door function's answer to HTTP. Unknown or switched-off keys look like
 * a missing page; busy asks the sender to retry later; everything else is 200
 * so senders don't keep retrying an event that was handled or ignored.
 */
export function doorResponse(result: string | null): NextResponse {
  if (result === null) return NextResponse.json({ status: "error" }, { status: 500 });
  if (result === "unknown") return NextResponse.json({ status: "not_found" }, { status: 404 });
  if (result === "busy") return NextResponse.json({ status: "busy" }, { status: 429 });
  if (result === "bad_signature") return NextResponse.json({ status: "bad_signature" }, { status: 401 });
  return NextResponse.json({ status: result });
}
