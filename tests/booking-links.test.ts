import { describe, it, expect } from "vitest";
import { bookingChangeUrls, bookingUrl, internationalCell, readBookingTypes } from "@/lib/crm/booking-links";
import { qrPath, qrSvg } from "@/lib/crm/qr";

const PAGE = "https://cal.com/konzult-analytics/";

describe("booking links", () => {
  it("pre-fills a person's details and tags links sent from the CRM", () => {
    expect(
      bookingUrl(PAGE, "discovery-call", {
        source: "crm",
        prefill: { name: "Naledi Dlamini", email: "naledi@example.test", phone: "082 555 0101", business: "Dlamini & Co" },
      })
    ).toBe(
      "https://cal.com/konzult-analytics/discovery-call?name=Naledi+Dlamini&email=naledi%40example.test&attendeePhoneNumber=%2B27825550101&business=Dlamini+%26+Co&metadata%5Bsource%5D=crm"
    );
  });

  it("tags QR links, and leaves the plain booking page link plain", () => {
    expect(bookingUrl(PAGE, "bni-one-to-one", { source: "qr" })).toBe(
      "https://cal.com/konzult-analytics/bni-one-to-one?metadata%5Bsource%5D=qr"
    );
    expect(bookingUrl(PAGE, "bni-one-to-one", { source: "link", prefill: { name: " ", phone: "12345" } })).toBe(
      "https://cal.com/konzult-analytics/bni-one-to-one"
    );
  });

  it("writes South African cell numbers the international way", () => {
    expect(["082 555 0101", "+27 82 555 0101", "27825550101", "+44 20 7946 0000", "12345", null].map(internationalCell)).toEqual([
      "+27825550101",
      "+27825550101",
      "+27825550101",
      "+442079460000",
      null,
      null,
    ]);
  });

  it("reads saved event types, skipping malformed ones", () => {
    expect(readBookingTypes([{ slug: "Discovery-Call", label: " Discovery call " }, { slug: "bad slug", label: "x" }, "nonsense"])).toEqual([
      { slug: "discovery-call", label: "Discovery call" },
    ]);
    expect(readBookingTypes(null)).toEqual([]);
  });

  it("links to Cal.com's reschedule and cancel pages, only for a plain booking ID", () => {
    expect(bookingChangeUrls(PAGE, "oZcDSWnT7RvRc5gJbkpM3G")).toEqual({
      reschedule: "https://cal.com/reschedule/oZcDSWnT7RvRc5gJbkpM3G",
      cancel: "https://cal.com/booking/oZcDSWnT7RvRc5gJbkpM3G?cancel=true",
    });
    expect(bookingChangeUrls(null, "../../evil")).toBeNull();
  });
});

describe("QR codes", () => {
  it("draws the same code for the same link, with the finder square in the corner", () => {
    const a = qrPath("https://cal.com/konzult-analytics/discovery-call?metadata%5Bsource%5D=qr");
    expect(qrPath("https://cal.com/konzult-analytics/discovery-call?metadata%5Bsource%5D=qr")).toEqual(a);
    expect(a.d.startsWith("M4 4h1v1h-1z")).toBe(true);
    expect((a.size - 8 - 17) % 4).toBe(0); // 21, 25, 29… modules plus the margin
    expect(qrPath("https://cal.com/konzult-analytics/bni-one-to-one").d).not.toBe(a.d);
  });

  it("makes a printable SVG file", () => {
    const svg = qrSvg("https://cal.com/konzult-analytics/discovery-call");
    expect(svg).toMatch(/^<\?xml[^>]*>\n<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
    expect(svg).toContain('fill="#ffffff"');
  });
});
