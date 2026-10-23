import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { readBookingTypes, type BookingType } from "./booking-links";

export type BookingSettings = { page: string | null; types: BookingType[] };

/** The Cal.com booking page and its event types. Without a page there are no Book buttons or QR codes. */
export async function bookingSettings(supabase: SupabaseClient<Database>): Promise<BookingSettings> {
  const { data, error } = await supabase.from("workspace_settings").select("booking_page_url, booking_types").maybeSingle();
  if (error) console.error("booking settings failed", error);
  const page = data?.booking_page_url ?? null;
  return { page, types: page ? readBookingTypes(data?.booking_types) : [] };
}
