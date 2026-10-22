"use client";

import { useActionState } from "react";
import { addTask } from "@/app/(app)/tasks/actions";
import SubmitButton from "@/components/SubmitButton";
import { addDays, saDate } from "@/lib/crm/dates";

export default function AddTaskForm({ personId, journeyId }: { personId?: string; journeyId?: string }) {
  const [state, action] = useActionState(addTask, null);
  return (
    <form action={action} className="space-y-2">
      {personId && <input type="hidden" name="person_id" value={personId} />}
      {journeyId && <input type="hidden" name="journey_id" value={journeyId} />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="task-title">
          Task
        </label>
        <input id="task-title" name="title" placeholder="e.g. Send the one-pager" maxLength={200} required />
        <label className="sr-only" htmlFor="task-due">
          Due
        </label>
        <input
          id="task-due"
          name="due_on"
          type="date"
          required
          defaultValue={addDays(saDate(), 1)}
          className="sm:max-w-44"
        />
        <SubmitButton pending="Adding…" className="btn btn-ghost whitespace-nowrap">
          Add task
        </SubmitButton>
      </div>
      {state?.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
