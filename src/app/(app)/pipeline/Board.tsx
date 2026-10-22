"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import ExitForm, { type ExitStatus } from "@/components/ExitForm";
import { daysAgo, daysBetween, dueLabel, saDate } from "@/lib/crm/dates";
import type { ExitReason } from "@/lib/crm/lookups";
import { moveStage } from "./actions";

export type BoardCard = {
  id: string;
  personId: string | null;
  organisationId: string | null;
  name: string;
  organisation: string | null;
  stage: string;
  source: string | null;
  lastTouchAt: string | null;
  stageChangedAt: string | null;
  nextTaskOn: string | null;
};

type Column = { key: string; label: string };

export default function Board({
  columns,
  cards,
  reasons,
}: {
  columns: readonly Column[];
  cards: BoardCard[];
  reasons: ExitReason[];
}) {
  const [closing, setClosing] = useState<{ card: BoardCard; status: ExitStatus } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const today = saDate();

  useEffect(() => {
    if (closing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [closing]);

  const closeDialog = useCallback(() => setClosing(null), []);

  const move = (card: BoardCard, target: string) => {
    if (target === "lost" || target === "parked") {
      setClosing({ card, status: target });
      return;
    }
    if (target === card.stage) return;
    setPendingId(card.id);
    startTransition(async () => {
      const result = await moveStage(card.id, target);
      setError(result?.error ?? null);
      setPendingId(null);
    });
  };

  return (
    <>
      {error && (
        <p className="mb-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {/* relative: the cards' visually-hidden labels are absolutely positioned and
          would otherwise escape this scroller and widen the whole page on phones. */}
      <div className="relative -mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex gap-3">
          {columns.map((col) => {
            const colCards = cards.filter((c) => c.stage === col.key);
            return (
              <section
                key={col.key}
                aria-label={col.label}
                className={`flex w-60 shrink-0 flex-col rounded-xl border bg-paper p-2 lg:w-auto lg:min-w-0 lg:flex-1 lg:shrink ${
                  overColumn === col.key ? "border-accent" : "border-line"
                }`}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setOverColumn(col.key);
                }}
                onDragLeave={() => setOverColumn((c) => (c === col.key ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverColumn(null);
                  const card = cards.find((c) => c.id === dragging);
                  setDragging(null);
                  if (card) move(card, col.key);
                }}
              >
                <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
                  {col.label}
                  <span className="badge">{colCards.length}</span>
                </h2>
                <ul className="flex flex-1 flex-col gap-2">
                  {colCards.map((card) => (
                    <li
                      key={card.id}
                      draggable
                      onDragStart={() => setDragging(card.id)}
                      onDragEnd={() => setDragging(null)}
                      className={`card space-y-2 p-3 ${pendingId === card.id ? "opacity-50" : ""} ${
                        dragging === card.id ? "opacity-60" : ""
                      } cursor-grab active:cursor-grabbing`}
                    >
                      <div className="min-w-0">
                        <Link
                          href={card.personId ? `/people/${card.personId}` : `/organisations/${card.organisationId}`}
                          className="block break-words font-medium hover:underline"
                        >
                          {card.name}
                        </Link>
                        {card.organisation && card.organisation !== card.name && (
                          <p className="break-words text-xs text-ink-soft">{card.organisation}</p>
                        )}
                      </div>
                      <p className="text-xs text-ink-soft">
                        {card.stageChangedAt && `${daysBetween(saDate(new Date(card.stageChangedAt)), today)}d in stage · `}
                        {card.lastTouchAt ? `touched ${daysAgo(card.lastTouchAt, today)}` : "no touches yet"}
                      </p>
                      {card.nextTaskOn && (
                        <p className={`text-xs ${card.nextTaskOn < today ? "text-danger" : "text-ink-soft"}`}>
                          Next task {dueLabel(card.nextTaskOn, today)}
                        </p>
                      )}
                      <label className="sr-only" htmlFor={`move-${card.id}`}>
                        Move {card.name}
                      </label>
                      <select
                        id={`move-${card.id}`}
                        className="py-1.5 sm:text-sm"
                        value={card.stage}
                        disabled={pendingId === card.id}
                        onChange={(e) => move(card, e.target.value)}
                      >
                        {columns.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                        <option value="parked">Park…</option>
                        <option value="lost">Lost…</option>
                      </select>
                    </li>
                  ))}
                  {colCards.length === 0 && (
                    <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-soft">
                      Drag a card here
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <dialog
        ref={dialog}
        onClose={closeDialog}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-panel p-5 text-ink backdrop:bg-black/40"
      >
        {closing && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              {closing.status === "lost" ? "Mark as lost" : "Park"}: {closing.card.name}
            </h2>
            <ExitForm
              journeyId={closing.card.id}
              status={closing.status}
              reasons={reasons}
              onDone={closeDialog}
              onCancel={closeDialog}
            />
          </div>
        )}
      </dialog>
    </>
  );
}
