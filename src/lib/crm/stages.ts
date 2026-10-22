export const TRACKS = ["client", "partner"] as const;
export type Track = (typeof TRACKS)[number];

export const TRACK_LABEL: Record<Track, string> = { client: "Client", partner: "Partner" };

// Mirrors the journeys_stage_fits_track constraint in 20261022140000_crm_core.sql.
export const STAGES: Record<Track, readonly { key: string; label: string }[]> = {
  client: [
    { key: "prospect", label: "Prospect" },
    { key: "contacted", label: "Contacted" },
    { key: "meeting", label: "Meeting" },
    { key: "proposal", label: "Proposal" },
    { key: "client", label: "Client" },
  ],
  partner: [
    { key: "prospect", label: "Prospect partner" },
    { key: "contacted", label: "Contacted" },
    { key: "one_to_one", label: "One-to-one held" },
    { key: "active", label: "Active partner" },
  ],
};

export function isTrack(value: unknown): value is Track {
  return value === "client" || value === "partner";
}

export function isStage(track: Track, stage: string): boolean {
  return STAGES[track].some((s) => s.key === stage);
}

export function stageLabel(track: string, stage: string): string {
  if (!isTrack(track)) return stage;
  return STAGES[track].find((s) => s.key === stage)?.label ?? stage;
}

function stageIndex(track: Track, stage: string): number {
  return STAGES[track].findIndex((s) => s.key === stage);
}

/** Stages where a relationship can go quiet: contact has started but isn't settled. */
export function isInProgress(track: string, stage: string): boolean {
  if (!isTrack(track)) return false;
  const i = stageIndex(track, stage);
  return i > 0 && i < STAGES[track].length - 1;
}

type Touch = { type: string; direction: string | null; outcome: string | null };

/**
 * The stage a logged touch moves a journey to, per the spec's entry rules:
 * the first outreach makes a prospect Contacted; a booked or held meeting
 * moves it to Meeting (One-to-one held for partners). Never moves backwards.
 */
export function advanceFor(track: Track, stage: string, touch: Touch): string | null {
  const meetingStage = track === "client" ? "meeting" : "one_to_one";
  const target =
    touch.type === "meeting" || touch.outcome === "meeting_booked"
      ? meetingStage
      : touch.direction === "out" && touch.type !== "note"
        ? "contacted"
        : null;
  if (!target) return null;
  return stageIndex(track, target) > stageIndex(track, stage) ? target : null;
}
