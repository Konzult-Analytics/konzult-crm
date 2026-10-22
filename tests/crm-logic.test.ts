import { describe, it, expect } from "vitest";
import { addDays, daysUntilBirthday, dueLabel, saDate, saLocalToIso } from "@/lib/crm/dates";
import { whatsappNumber } from "@/lib/crm/people";
import { advanceFor, isInProgress } from "@/lib/crm/stages";
import { birthdaysSoon, isGoingCold, splitTasks } from "@/lib/crm/today";

describe("South African dates", () => {
  it("rolls over to the next day at midnight in Johannesburg, not UTC", () => {
    expect(saDate(new Date("2026-10-22T21:59:00Z"))).toBe("2026-10-22");
    expect(saDate(new Date("2026-10-22T22:01:00Z"))).toBe("2026-10-23");
  });

  it("reads a typed time as South African time", () => {
    expect(saLocalToIso("2026-10-22T09:30")).toBe("2026-10-22T07:30:00.000Z");
  });

  it("labels due dates", () => {
    expect(dueLabel("2026-10-22", "2026-10-22")).toBe("today");
    expect(dueLabel("2026-10-23", "2026-10-22")).toBe("tomorrow");
    expect(dueLabel("2026-10-20", "2026-10-22")).toBe("2 days overdue");
  });

  it("counts days to the next birthday across the new year and leap years", () => {
    expect(daysUntilBirthday("1990-10-25", "2026-10-22")).toBe(3);
    expect(daysUntilBirthday("1985-01-02", "2026-12-30")).toBe(3);
    expect(daysUntilBirthday("1992-10-22", "2026-10-22")).toBe(0);
    expect(daysUntilBirthday("1996-02-29", "2027-02-27")).toBe(1);
  });
});

describe("WhatsApp numbers", () => {
  it("turns South African numbers as typed into wa.me numbers", () => {
    expect(whatsappNumber("082 123 4567")).toBe("27821234567");
    expect(whatsappNumber("+27 82 123 4567")).toBe("27821234567");
    expect(whatsappNumber("27821234567")).toBe("27821234567");
    expect(whatsappNumber("011 463")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
});

describe("stage moves from a logged touch", () => {
  const out = { type: "whatsapp", direction: "out", outcome: null };
  it("makes a prospect Contacted on the first outreach", () => {
    expect(advanceFor("client", "prospect", out)).toBe("contacted");
    expect(advanceFor("partner", "prospect", out)).toBe("contacted");
  });

  it("doesn't move on an incoming message or a note", () => {
    expect(advanceFor("client", "prospect", { ...out, direction: "in" })).toBeNull();
    expect(advanceFor("client", "prospect", { type: "note", direction: null, outcome: null })).toBeNull();
  });

  it("moves to Meeting (or One-to-one held) when a meeting is booked or held", () => {
    expect(advanceFor("client", "contacted", { ...out, outcome: "meeting_booked" })).toBe("meeting");
    expect(advanceFor("partner", "prospect", { type: "meeting", direction: null, outcome: null })).toBe("one_to_one");
  });

  it("never moves a journey backwards", () => {
    expect(advanceFor("client", "proposal", out)).toBeNull();
    expect(advanceFor("client", "client", { ...out, outcome: "meeting_booked" })).toBeNull();
  });
});

describe("Today", () => {
  const today = "2026-10-22";
  const base = { status: "open", track: "client", stage: "contacted", stage_changed_at: null, opened_at: null, parked_until: null };

  it("calls a started relationship cold after 14 days without a touch", () => {
    expect(isGoingCold({ ...base, last_touch_at: "2026-10-08T10:00:00Z" }, today)).toBe(true);
    expect(isGoingCold({ ...base, last_touch_at: "2026-10-09T10:00:00Z" }, today)).toBe(false);
  });

  it("doesn't call prospects, clients or closed journeys cold", () => {
    const old = "2026-01-01T10:00:00Z";
    expect(isGoingCold({ ...base, stage: "prospect", last_touch_at: old }, today)).toBe(false);
    expect(isGoingCold({ ...base, stage: "client", last_touch_at: old }, today)).toBe(false);
    expect(isGoingCold({ ...base, status: "lost", last_touch_at: old }, today)).toBe(false);
    expect(isInProgress("partner", "one_to_one")).toBe(true);
  });

  it("splits tasks into due and this week", () => {
    const tasks = ["2026-10-20", "2026-10-22", "2026-10-25", "2026-11-05"].map((due_on) => ({ due_on }));
    const { due, upcoming } = splitTasks(tasks, today);
    expect(due.map((t) => t.due_on)).toEqual(["2026-10-20", "2026-10-22"]);
    expect(upcoming.map((t) => t.due_on)).toEqual(["2026-10-25"]);
  });

  it("lists birthdays in the next week, soonest first", () => {
    const people = [
      { name: "A", birthday: "1990-10-28" },
      { name: "B", birthday: "1990-10-23" },
      { name: "C", birthday: "1990-11-30" },
      { name: "D", birthday: null },
    ];
    expect(birthdaysSoon(people, today).map((p) => p.name)).toEqual(["B", "A"]);
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-10-30", 4)).toBe("2026-11-03");
  });
});
