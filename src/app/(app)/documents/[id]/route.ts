import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { signedFileUrl } from "@/lib/supabase/storage";

/** Opens a document for the signed-in user: a five-minute signed URL, or the link itself. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMfaSession();
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });

  const { data: doc } = await supabase.from("documents").select("storage_path, url").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const target = doc.url ?? (doc.storage_path ? await signedFileUrl(supabase, doc.storage_path, 300) : null);
  if (!target) return new NextResponse("Couldn't open this document. Try again.", { status: 502 });
  return NextResponse.redirect(target, 303);
}
