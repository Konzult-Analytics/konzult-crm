import { NextResponse } from "next/server";
import { readWebsiteLead } from "@/lib/inbound/messages";
import { doorResponse, parseJson, readBody } from "@/lib/inbound/route";
import { KEY_PATTERN, websiteSignatureValid } from "@/lib/inbound/signatures";
import { createClient } from "@/lib/supabase/server";

/**
 * Public: website enquiries (Framer's form webhook now; the new Vercel site
 * later, signing the same way from its server). Signed with the connection
 * key; each enquiry waits in the CRM's inbox for Zander to add or bin.
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!KEY_PATTERN.test(key)) return NextResponse.json({ status: "not_found" }, { status: 404 });
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;

  const submissionId = request.headers.get("framer-webhook-submission-id");
  const lead = websiteSignatureValid(key, body, submissionId, request.headers.get("framer-signature"))
    ? readWebsiteLead(parseJson(body), submissionId!)
    : { event: "bad_signature" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inbound_website", { p_key: key, p_lead: lead });
  if (error) console.error("inbound website failed", error);
  return doorResponse(error ? null : data);
}
