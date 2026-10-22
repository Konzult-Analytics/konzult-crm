import { nameKey, organisationKey, phoneKey } from "./normalize";
import type { ParsedRow } from "./types";

export type ExistingPerson = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  organisation: string | null;
};
export type ExistingOrganisation = { id: string; name: string };

export type Match =
  | { status: "new" }
  | { status: "existing"; personId: string; name: string; reason: "email" | "number" | "name" }
  | { status: "existing_business"; organisationId: string; name: string }
  | { status: "repeat"; of: string; row: number };

type Candidate = { key: string; row: number; first: string; email: string | null; phone: string | null; name: string; org: string };

function candidate(r: ParsedRow): Candidate {
  return {
    key: r.key,
    row: r.row,
    first: r.firstName ?? "",
    email: r.email?.toLowerCase() ?? null,
    phone: phoneKey(r.phone),
    name: nameKey(r.firstName, r.lastName),
    org: organisationKey(r.organisation),
  };
}

/** Same email, then same number, then same name at the same business (or a unique name when either has no business). */
function sameContact(a: Candidate, b: Candidate, nameIsUnique: boolean): "email" | "number" | "name" | null {
  if (a.email && b.email && a.email === b.email) return "email";
  if (a.phone && b.phone && a.phone === b.phone) return "number";
  if (a.name && a.name === b.name && a.name.includes(" ")) {
    if (a.org && b.org) return a.org === b.org ? "name" : null;
    return nameIsUnique ? "name" : null;
  }
  return null;
}

/**
 * How each imported row relates to what's already in the CRM, and to earlier
 * rows in the same import (repeats are merged into the first occurrence).
 */
export function matchRows(
  rows: ParsedRow[],
  people: ExistingPerson[],
  organisations: ExistingOrganisation[]
): Record<string, Match> {
  const existing = people.map((p) => ({
    id: p.id,
    label: [p.first_name, p.last_name].filter(Boolean).join(" "),
    c: {
      key: p.id,
      row: 0,
      first: p.first_name,
      email: p.email?.toLowerCase() ?? null,
      phone: phoneKey(p.phone),
      name: nameKey(p.first_name, p.last_name),
      org: organisationKey(p.organisation),
    } satisfies Candidate,
  }));
  const namesInCrm = new Map<string, number>();
  for (const e of existing) namesInCrm.set(e.c.name, (namesInCrm.get(e.c.name) ?? 0) + 1);
  const orgsByKey = new Map(organisations.map((o) => [organisationKey(o.name), o]));

  const result: Record<string, Match> = {};
  const seen: Candidate[] = [];
  const seenOrgs = new Map<string, Candidate>();

  for (const row of rows) {
    const c = candidate(row);

    if (!row.firstName) {
      const earlier = seenOrgs.get(c.org);
      const known = orgsByKey.get(c.org);
      result[row.key] = earlier
        ? { status: "repeat", of: earlier.key, row: earlier.row }
        : known
          ? { status: "existing_business", organisationId: known.id, name: known.name }
          : { status: "new" };
      if (!earlier) seenOrgs.set(c.org, c);
      continue;
    }

    const repeatOf = seen.find((s) => sameContact(c, s, true));
    if (repeatOf) {
      result[row.key] = { status: "repeat", of: repeatOf.key, row: repeatOf.row };
      continue;
    }
    seen.push(c);

    let match: Match = { status: "new" };
    for (const e of existing) {
      const reason = sameContact(c, e.c, namesInCrm.get(e.c.name) === 1);
      if (reason) {
        match = { status: "existing", personId: e.id, name: e.label, reason };
        break;
      }
    }
    result[row.key] = match;
  }
  return result;
}

/** An inviter's name matched to exactly one existing person, if there is one. */
export function findPersonByName(name: string, people: ExistingPerson[]): ExistingPerson | null {
  const key = nameKey(name);
  const hits = people.filter((p) => nameKey(p.first_name, p.last_name) === key);
  return hits.length === 1 ? hits[0] : null;
}
