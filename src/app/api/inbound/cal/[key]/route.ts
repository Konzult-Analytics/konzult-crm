import { NextResponse } from "next/server";
import { readCalEvent } from "@/lib/inbound/messages";
import { doorResponse, parseJson, readBody } from "@/lib/inbound/route";
import { KEY_PATTERN, calSignatureValid } from "@/lib/inbound/signatures";
import { createClient } from "@/lib/supabase/server";

/**
 * Public: Cal.com's booking webhook. The key in the address must match an open
 * connection (checked in the database), and the body must carry Cal.com's
 * signature made with that key. Raw errors never go back to the sender.
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!KEY_PATTERN.test(key)) return NextResponse.json({ status: "not_found" }, { status: 404 });
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;

  const supabase = await createClient();
  const event = calSignatureValid(key, body, request.headers.get("x-cal-signature-256"))
    ? readCalEvent(parseJson(body))
    : { event: "bad_signature" };

  const { data, error } = await supabase.rpc("inbound_cal", { p_key: key, p_event: event });
  if (error) console.error("inbound cal failed", error);
  return doorResponse(error ? null : data);
}
