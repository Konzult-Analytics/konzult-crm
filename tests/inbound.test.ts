import { describe, it, expect } from "vitest";
import { readCalEvent, readWebsiteLead } from "@/lib/inbound/messages";
import {
  KEY_PATTERN,
  calSignatureValid,
  keyFingerprint,
  newConnectionKey,
  websiteSignatureValid,
} from "@/lib/inbound/signatures";

const KEY = "k".repeat(48);
const bytes = (s: string) => new TextEncoder().encode(s);

describe("signatures", () => {
  // Fixed vectors, worked out independently with Node's crypto.
  it("accepts Cal.com's HMAC-SHA256 of the raw body, hex or base64", () => {
    const body = bytes('{"triggerEvent":"PING"}');
    expect(calSignatureValid(KEY, body, "bc465adb6a7d36745da2127b051d128b384e92397b3d0b3141f1099b9d6f6053")).toBe(true);
    expect(calSignatureValid(KEY, body, "BC465ADB6A7D36745DA2127B051D128B384E92397B3D0B3141F1099B9D6F6053")).toBe(true);
    expect(calSignatureValid(KEY, body, "vEZa22p9NnRdohJ7BR0SizhOkjl7PQsxQfEJm51vYFM=")).toBe(true);
    expect(calSignatureValid(KEY, bytes('{"triggerEvent":"PING" }'), "bc465adb6a7d36745da2127b051d128b384e92397b3d0b3141f1099b9d6f6053")).toBe(false);
    expect(calSignatureValid("x".repeat(48), body, "bc465adb6a7d36745da2127b051d128b384e92397b3d0b3141f1099b9d6f6053")).toBe(false);
    expect(calSignatureValid(KEY, body, null)).toBe(false);
  });

  it("accepts the website's sha256= signature over body plus submission ID", () => {
    const body = bytes('{"email":"a@b.test"}');
    const sig = "sha256=2d402d3461a6d59cd49ed90c0b9042fb053bd58772712f6417f7ae7d8d839f35";
    expect(websiteSignatureValid(KEY, body, "sub-9", sig)).toBe(true);
    expect(websiteSignatureValid(KEY, body, "sub-8", sig)).toBe(false);
    expect(websiteSignatureValid(KEY, body, null, sig)).toBe(false);
  });

  it("makes 48-character keys and stores only their fingerprint", () => {
    const key = newConnectionKey();
    expect(key).toMatch(KEY_PATTERN);
    expect(newConnectionKey()).not.toBe(key);
    expect(keyFingerprint(KEY)).toBe("ff316804f1ed3e15138f78daadd4b3e7b1a2bcf235c9ff6220f3468ba7495024");
  });
});

describe("reading Cal.com events", () => {
  const created = {
    triggerEvent: "BOOKING_CREATED",
    payload: {
      uid: "abc123",
      type: "discovery-call",
      title: "Discovery call between Zander and Bongani",
      startTime: "2026-11-03T08:00:00Z",
      endTime: "2026-11-03T08:45:00Z",
      attendees: [{ name: "Bongani Booker", email: "Bongani@Example.test", timeZone: "Africa/Johannesburg" }],
      responses: {
        name: { label: "Your name", value: "Bongani Booker" },
        attendeePhoneNumber: { label: "Cell", value: "+27825550101" },
        business: { label: "Business name", value: "Booker Brands" },
        notes: { label: "Notes", value: "Cash flow" },
        location: { value: { optionValue: "", value: "integrations:google:meet" } },
      },
    },
  };

  it("flattens a booking into what the database needs", () => {
    expect(readCalEvent(created)).toEqual({
      event: "created",
      uid: "abc123",
      previous_uid: null,
      slug: "discovery-call",
      title: "Discovery call between Zander and Bongani",
      starts_at: "2026-11-03T08:00:00.000Z",
      ends_at: "2026-11-03T08:45:00.000Z",
      name: "Bongani Booker",
      email: "bongani@example.test",
      phone: "+27825550101",
      business: "Booker Brands",
      notes: "Cash flow",
    });
  });

  it("keeps the original booking for a reschedule, and just the ID for a cancellation", () => {
    const moved = readCalEvent({ ...created, triggerEvent: "BOOKING_RESCHEDULED", payload: { ...created.payload, uid: "new1", rescheduleUid: "abc123" } });
    expect(moved).toMatchObject({ event: "rescheduled", uid: "new1", previous_uid: "abc123" });
    expect(readCalEvent({ triggerEvent: "BOOKING_CANCELLED", payload: { uid: "abc123" } })).toEqual({ event: "cancelled", uid: "abc123" });
  });

  it("ignores pings, other events and broken bookings", () => {
    expect(readCalEvent({ triggerEvent: "PING", payload: {} })).toEqual({ event: "ping" });
    expect(readCalEvent({ triggerEvent: "MEETING_ENDED", payload: { uid: "x" } })).toEqual({ event: "ignored" });
    expect(readCalEvent({ triggerEvent: "BOOKING_CREATED", payload: { uid: "x", startTime: "not a date" } })).toEqual({ event: "ignored" });
    expect(readCalEvent("nonsense")).toEqual({ event: "ignored" });
    expect(readCalEvent({ ...created, payload: { ...created.payload, attendees: [{ email: "not-an-email" }] } }).email).toBeNull();
  });
});

describe("reading website enquiries", () => {
  it("maps the form fields, including consent ticks", () => {
    expect(
      readWebsiteLead(
        { Name: "Wendy Web", Email: "Wendy@Example.test", Cell: "082 555 0202", Company: "Web Works", Message: "Pricing help?", marketing_consent: "on" },
        "sub-1"
      )
    ).toEqual({
      event: "lead",
      id: "sub-1",
      name: "Wendy Web",
      email: "wendy@example.test",
      phone: "082 555 0202",
      business: "Web Works",
      message: "Pricing help?",
      marketing_consent: true,
    });
    expect(readWebsiteLead({ email: "a@b.test" }, "s").marketing_consent).toBe(false);
  });

  it("treats a filled-in hidden field as spam, and drops enquiries with no way to reply", () => {
    expect(readWebsiteLead({ email: "a@b.test", website: "http://spam.test" }, "s")).toEqual({ event: "spam" });
    expect(readWebsiteLead({ name: "No Contact", message: "hi" }, "s")).toEqual({ event: "ignored" });
  });
});
