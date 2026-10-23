// Plain-HTML chart pieces for the Insights page. Marks carry the colour; every
// number is also printed as text, so nothing relies on colour alone.

/** A thin horizontal bar, square at the baseline and rounded at the tip. */
export function Bar({ value, max, title, muted = false }: { value: number; max: number; title: string; muted?: boolean }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div className="h-4 w-full" title={title}>
      <div
        className={`h-4 rounded-r ${muted ? "bg-ink-soft/50" : "bg-accent"}`}
        style={{ width: `${width}%` }}
        role="presentation"
      />
    </div>
  );
}

/** Our side (accent) against their side (grey), with a 2px gap between the two. */
export function SplitBar({ ours, theirs, max, title }: { ours: number; theirs: number; max: number; title: string }) {
  const scale = (n: number) => (max > 0 ? (n / max) * 100 : 0);
  return (
    <div className="flex h-4 w-full gap-[2px]" title={title}>
      {ours > 0 && <div className="h-4 bg-accent" style={{ width: `${scale(ours)}%` }} />}
      {theirs > 0 && <div className="h-4 rounded-r bg-ink-soft/50" style={{ width: `${scale(theirs)}%` }} />}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card space-y-1">
      <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

/** A headline number inside a section, without a card of its own. */
export function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-soft">{children}</p>;
}
