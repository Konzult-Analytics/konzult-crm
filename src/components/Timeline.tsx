import { formatDateTime } from "@/lib/crm/dates";
import { labelOf, MEETING_PURPOSES, MEETING_SETTINGS, OUTCOMES, TOUCH_TYPES } from "@/lib/crm/labels";

export type TimelineTouch = {
  id: string;
  type: string;
  direction: string | null;
  occurred_at: string;
  summary: string | null;
  outcome: string | null;
  meeting_purpose: string | null;
  meeting_setting: string | null;
  next_step: string | null;
};

function heading(t: TimelineTouch): string {
  const type = labelOf(TOUCH_TYPES, t.type);
  if (t.type === "meeting") {
    const setting = labelOf(MEETING_SETTINGS, t.meeting_setting);
    const purpose = labelOf(MEETING_PURPOSES, t.meeting_purpose);
    return [setting || type, purpose && `${purpose.toLowerCase()} meeting`].filter(Boolean).join(" · ");
  }
  if (t.type === "note") return type;
  return `${type} ${t.direction === "in" ? "received" : "sent"}`;
}

export default function Timeline({ touches }: { touches: TimelineTouch[] }) {
  if (touches.length === 0) {
    return <p className="text-sm text-ink-soft">No touches logged yet.</p>;
  }
  return (
    <ol className="space-y-4 border-l-2 border-line pl-4">
      {touches.map((t) => (
        <li key={t.id} className="relative">
          <span className="absolute top-1.5 -left-[1.4rem] h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">{heading(t)}</span>{" "}
            <span className="text-ink-soft">· {formatDateTime(t.occurred_at)}</span>
            {t.outcome && <span className="badge ml-2">{labelOf(OUTCOMES, t.outcome)}</span>}
          </p>
          {t.summary && <p className="mt-1 whitespace-pre-line break-words text-sm">{t.summary}</p>}
          {t.next_step && <p className="mt-1 text-sm text-ink-soft">Next: {t.next_step}</p>}
        </li>
      ))}
    </ol>
  );
}
