import { describe, it, expect } from "vitest";
import { OPT_OUT, linkMessage, mergeFields, sendBlock, sendPurpose } from "@/lib/crm/messages";

const ctx = { firstName: "Thandi", fullName: "Thandi Mokoena", business: "Acacia Bakery" };

describe("messages", () => {
  it("fills the merge fields, with a fallback for a missing business", () => {
    expect(mergeFields("Hi {first_name} ({full_name}) of {business}", ctx)).toBe("Hi Thandi (Thandi Mokoena) of Acacia Bakery");
    expect(mergeFields("About {business}.", { ...ctx, business: null })).toBe("About your business.");
    expect(mergeFields("{links}", ctx)).toBe("{links}");
  });

  it("puts the links where {links} is, or at the end, and drops an empty {links} line", () => {
    const links = [
      { title: "The Map", url: "https://crm.test/d/aaa" },
      { title: "One-pager", url: "https://crm.test/d/bbb" },
    ];
    expect(linkMessage("Hi\n\n{links}\n\nZander", links, "personal")).toBe(
      "Hi\n\nThe Map: https://crm.test/d/aaa\nOne-pager: https://crm.test/d/bbb\n\nZander"
    );
    expect(linkMessage("Hi\n\nZander", links.slice(0, 1), "personal")).toBe("Hi\n\nZander\n\nThe Map: https://crm.test/d/aaa");
    expect(linkMessage("Hi\n\n{links}\n\nZander", [], "personal")).toBe("Hi\n\nZander");
  });

  it("adds the opt-out line to marketing only, once", () => {
    expect(linkMessage("Hello", [], "marketing")).toBe(`Hello\n\n${OPT_OUT}`);
    expect(linkMessage("Hello. Reply STOP to stop.", [], "marketing")).toBe("Hello. Reply STOP to stop.");
    expect(linkMessage("Hello", [], "personal")).toBe("Hello");
  });

  it("treats a message with marketing material as marketing", () => {
    expect(sendPurpose("personal", ["proposal"])).toBe("personal");
    expect(sendPurpose("personal", ["marketing"])).toBe("marketing");
    expect(sendPurpose(null, [])).toBe("personal");
    expect(sendPurpose("consent_request", [])).toBe("consent_request");
    expect(sendPurpose("consent_request", ["marketing"])).toBe("marketing");
  });

  it("applies POPIA s69: refusals, consent for marketing, one consent request", () => {
    const unknown = { consent: "unknown", isClient: false, consentRequestSent: false };
    expect(sendBlock("personal", unknown)).toBeNull();
    expect(sendBlock("marketing", unknown)).toMatch(/consent/);
    expect(sendBlock("marketing", { ...unknown, isClient: true })).toBeNull();
    expect(sendBlock("marketing", { ...unknown, consent: "granted" })).toBeNull();
    expect(sendBlock("consent_request", unknown)).toBeNull();
    expect(sendBlock("consent_request", { ...unknown, consentRequestSent: true })).toMatch(/once/);
    expect(sendBlock("consent_request", { ...unknown, consent: "granted" })).toMatch(/already agreed/);
    expect(sendBlock("personal", { ...unknown, consent: "refused", isClient: true })).toMatch(/asked not to/);
  });
});
